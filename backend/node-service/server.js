/**
 * server.js
 * Serviço Node.js — Backend Multi-Usuário de Alta Concorrência & Segurança Blindada
 * "The Midnight Bat-Tortoise" Edition
 *
 * Recursos de Segurança & Multi-Tenancy:
 * 1. Isolamento Criptográfico de Sessões (UUIDv4) por Usuário com Fallback Unificado
 * 2. Pool Singleton do Puppeteer com Contextos Incógnitos e Anti-SSRF
 * 3. Proteção Canônica contra Path Traversal & Arbitrary Deletion
 * 4. Validação Robusta de Mídias (Imagens & Vídeos) & Quota de Disco
 * 5. Rate Limiting por IP e Sessão (Anti-DDoS / Anti-Brute Force)
 * 6. Coletor Automático de Lixo (Garbage Collection de Sessões Antigas)
 */

const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');
const multer       = require('multer');
const puppeteer    = require('puppeteer');
const path         = require('path');
const fs           = require('fs');
const crypto       = require('crypto');
const { JSDOM }    = require('jsdom');
const createDOMPurify = require('isomorphic-dompurify');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ══════════════════════════════════════════════════════════
   CONSTANTES DE CAMINHO E DIRETÓRIOS
══════════════════════════════════════════════════════════ */
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const MEDIA_ROOT   = path.resolve(__dirname, '../../media-library');
const SESSIONS_DIR = path.join(MEDIA_ROOT, 'sessions');

// Garante existência das pastas raiz e padrão
if (!fs.existsSync(MEDIA_ROOT))   fs.mkdirSync(MEDIA_ROOT, { recursive: true });
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const DEFAULT_SUBFOLDERS = ['Imagens', 'Vídeos', 'Logos'];
DEFAULT_SUBFOLDERS.forEach(sub => {
  const p = path.join(MEDIA_ROOT, sub);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const MAX_SESSION_STORAGE_BYTES = 200 * 1024 * 1024; // 200 MB por sessão

/* ══════════════════════════════════════════════════════════
   MIDDLEWARES GLOBAIS DE SEGURANÇA
══════════════════════════════════════════════════════════ */
app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['x-session-id']
}));

app.use(cookieParser());
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Headers de segurança HTTP
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Rate Limiter Geral (500 req/min por IP)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  message: { error: 'Muitas requisições. Aguarde um momento.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// Rate Limiter para Exportação (Anti-DoS Puppeteer: máx 30/min por IP)
const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Limite de exportações simultâneas atingido. Tente novamente em 1 minuto.' },
});

/* ══════════════════════════════════════════════════════════
   MIDDLEWARE DE SESSÃO MULTI-INQUILINO (Deterministic Session ID)
══════════════════════════════════════════════════════════ */
const _initializedSessions = new Set();
const MAX_SESSION_CACHE = 10000;

function ensureSessionWorkspace(sessionId) {
  if (!sessionId) return;
  // Se já foi inicializado nesta instância do servidor, pula 100% das chamadas de disco
  if (_initializedSessions.has(sessionId)) return;

  const sessionPath = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }
  DEFAULT_SUBFOLDERS.forEach(sub => {
    const subPath = path.join(sessionPath, sub);
    if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true });
  });

  if (_initializedSessions.size >= MAX_SESSION_CACHE) {
    _initializedSessions.clear();
  }
  _initializedSessions.add(sessionId);
}

function sessionMiddleware(req, res, next) {
  let rawSession =
    req.headers['x-session-id'] ||
    req.query?.session_id ||
    req.body?.session_id ||
    req.cookies?.wm_session_id;

  let sessionId = null;
  if (typeof rawSession === 'string' && rawSession.trim()) {
    const sanitized = rawSession.trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64);
    if (sanitized.length >= 6) {
      sessionId = sanitized;
    }
  }

  // Gera UUID dinâmico criptográfico para sessões sem token, impedindo agrupamento compartilhado
  if (!sessionId) {
    sessionId = `sess_${crypto.randomUUID()}`;
  }

  req.sessionId = sessionId;

  res.cookie('wm_session_id', sessionId, {
    httpOnly: false,
    sameSite: 'Lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.setHeader('x-session-id', sessionId);

  ensureSessionWorkspace(req.sessionId);
  next();
}

app.use(sessionMiddleware);

function resolveSafeSessionDir(sessionId, folderName = 'Imagens', autoCreate = true) {
  const safeFolder = (folderName || 'Imagens').replace(/[^a-zA-Z0-9 À-ÿ\-_]/g, '').trim() || 'Imagens';
  const sid = (sessionId && typeof sessionId === 'string' && sessionId.trim()) ? sessionId.trim() : `sess_${crypto.randomUUID()}`;
  const sessionBase = path.resolve(SESSIONS_DIR, sid);
  const targetDir   = path.resolve(sessionBase, safeFolder);

  // Verificação Canônica de Path Traversal
  if (!targetDir.startsWith(sessionBase)) {
    throw new Error('Acesso negado: Tentativa de travessia de diretório detectada.');
  }

  if (autoCreate && !fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  return { targetDir, safeFolder, sessionBase };
}

const _sessionBytesCache = new Map();
const QUOTA_CACHE_TTL_MS = 30 * 1000; // 30 segundos de cache
const MAX_QUOTA_CACHE_SIZE = 10000;

function getSessionUsedBytes(sessionId, forceRecalculate = false) {
  if (!sessionId) return 0;
  const sid = sessionId;
  const now = Date.now();

  if (!forceRecalculate && _sessionBytesCache.has(sid)) {
    const cached = _sessionBytesCache.get(sid);
    if (now - cached.timestamp < QUOTA_CACHE_TTL_MS) {
      return cached.bytes;
    }
  }

  const sessionBase = path.join(SESSIONS_DIR, sid);
  if (!fs.existsSync(sessionBase)) {
    _sessionBytesCache.set(sid, { bytes: 0, timestamp: now });
    return 0;
  }

  let total = 0;
  const scan = dir => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) scan(full);
      else if (e.isFile()) total += fs.statSync(full).size;
    }
  };
  scan(sessionBase);

  if (_sessionBytesCache.size >= MAX_QUOTA_CACHE_SIZE) {
    _sessionBytesCache.clear();
  }
  _sessionBytesCache.set(sid, { bytes: total, timestamp: now });

  return total;
}

/* ══════════════════════════════════════════════════════════
   SERVIÇO DE ARQUIVOS ESTÁTICOS
══════════════════════════════════════════════════════════ */
app.use('/media', (req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; media-src 'self'; img-src 'self' data:;");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  express.static(MEDIA_ROOT)(req, res, next);
});

// Serve frontend principal
app.use(express.static(PROJECT_ROOT, { index: 'index.html' }));

/* ══════════════════════════════════════════════════════════
   SANITIZAÇÃO HTML & VALIDACÃO DE MÍDIA
══════════════════════════════════════════════════════════ */
const { window } = new JSDOM('');
const DOMPurify  = createDOMPurify(window);

function sanitize(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1','h2','h3','h4','h5','h6','p','br','strong','b','em','i','u','s','strike',
      'sub','sup','span','ul','ol','li','table','thead','tbody','tfoot','tr','th','td',
      'img','figure','figcaption',
      'a','blockquote','pre','code','hr',
      'div','input','section','article',
    ],
    ALLOWED_ATTR: [
      'href','src','alt','title','class','style','target','rel','width','height',
      'colspan','rowspan','align','type','checked','disabled','data-*'
    ],
    FORBID_SCRIPTS: true,
  });
}

function validateMediaFile(buffer, originalname) {
  if (!buffer || buffer.length < 2) return false;

  const ext = path.extname(originalname).toLowerCase();
  const DANGEROUS_EXTS = ['.exe', '.dll', '.bat', '.cmd', '.sh', '.php', '.phtml', '.js', '.vbs', '.scr', '.msi', '.com', '.bin', '.jar', '.py'];
  if (DANGEROUS_EXTS.includes(ext)) return false;

  const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.mp4', '.webm', '.mov', '.ico', '.jfif', '.heic', '.avif', '.tif', '.tiff'];
  if (ALLOWED_EXTS.includes(ext)) return true;

  const hex = buffer.toString('hex', 0, 16).toUpperCase();
  if (hex.startsWith('FFD8') || hex.startsWith('89504E47') || hex.startsWith('47494638') || hex.startsWith('424D') || hex.startsWith('52494646')) {
    return true;
  }

  return false;
}

/* ══════════════════════════════════════════════════════════
   MULTER — UPLOAD
══════════════════════════════════════════════════════════ */
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // Máx 50 MB por arquivo
});

/* ══════════════════════════════════════════════════════════
   PUPPETEER POOL COM ANTI-SSRF
══════════════════════════════════════════════════════════ */
let _masterBrowser = null;
let _activeRenderCount = 0;
const MAX_CONCURRENT_RENDERS = 4;

async function getMasterBrowser() {
  if (!_masterBrowser || !_masterBrowser.isConnected()) {
    _masterBrowser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    });
  }
  return _masterBrowser;
}

function isForbiddenUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (!['http:', 'https:', 'data:'].includes(parsed.protocol)) return true;

    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '169.254.169.254' || host === '::1') {
      if (parsed.port === String(PORT) && parsed.pathname.startsWith('/media/')) {
        return false;
      }
      return true;
    }

    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(host)) return true;

    return false;
  } catch {
    return true;
  }
}

async function renderWithPuppeteer(fullHtml, options = {}) {
  if (_activeRenderCount >= MAX_CONCURRENT_RENDERS) {
    throw new Error('Servidor de exportação ocupado. Tente novamente em alguns segundos.');
  }

  _activeRenderCount++;
  const browser = await getMasterBrowser();
  let context = null;

  try {
    context = await browser.createIncognitoBrowserContext();
    const page = await context.newPage();

    page.setDefaultNavigationTimeout(15000);
    page.setDefaultTimeout(15000);

    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url();
      if (isForbiddenUrl(url)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (options.viewport) {
      await page.setViewport(options.viewport);
    }

    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 15000 });

    if (options.type === 'png') {
      return await page.screenshot({ type: 'png', fullPage: true });
    } else {
      return await page.pdf(options.pdfOptions);
    }
  } finally {
    _activeRenderCount = Math.max(0, _activeRenderCount - 1);
    if (context) await context.close().catch(() => {});
  }
}

/* ══════════════════════════════════════════════════════════
   UTILITÁRIO: EMBUTIR IMAGENS LOCAIS COMO BASE64 PARA PDF/PNG
══════════════════════════════════════════════════════════ */
function inlineLocalImages(html) {
  if (!html) return html;
  return html.replace(/<img\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, before, src, after) => {
    try {
      if (src.startsWith('data:')) return match;

      let localPath = null;
      if (src.includes('/media/')) {
        const mediaSub = src.substring(src.indexOf('/media/') + '/media/'.length);
        const decoded = decodeURIComponent(mediaSub.split('?')[0]);
        localPath = path.join(MEDIA_ROOT, decoded);
      }

      if (localPath && fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
        const buffer = fs.readFileSync(localPath);
        const mime = _guessMime(localPath);
        const b64 = `data:${mime};base64,${buffer.toString('base64')}`;
        return `<img ${before}src="${b64}"${after}>`;
      }
    } catch (err) {
      console.warn('[inlineLocalImages] Erro ao embutir imagem:', err.message);
    }
    return match;
  });
}

/* ══════════════════════════════════════════════════════════
   ROTAS DE EXPORTAÇÃO (PDF / PNG)
══════════════════════════════════════════════════════════ */
app.post('/api/export/pdf', exportLimiter, async (req, res) => {
  const { html = '', pageWidth = 210, pageHeight = 297, landscape = false } = req.body;
  const inlinedHtml = inlineLocalImages(html);
  const cleanHtml   = sanitize(inlinedHtml);

  const numW = Math.max(10, parseFloat(pageWidth) || 210);
  const numH = Math.max(10, parseFloat(pageHeight) || 297);

  // Margens seguras e proporcionais para formatos grandes e pequenos (ex: 85x55mm)
  const padV = Math.min(25, Math.max(4, Math.round(numH * 0.08)));
  const padH = Math.min(20, Math.max(4, Math.round(numW * 0.08)));

  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Bangers&family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:ital,wght@0,400;0,600;1,400&family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400&family=Montserrat:ital,wght@0,400;0,600;0,700;1,400&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400&family=Special+Elite&display=swap');
  @page { size: ${numW}mm ${numH}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${numW}mm; min-height: ${numH}mm; margin: 0; padding: 0; }
  body {
    font-family: 'Merriweather', Georgia, serif;
    font-size: 11pt; line-height: 1.75; color: #111111; background-color: #FFFDF5;
    width: ${numW}mm; min-height: ${numH}mm; padding: ${padV}mm ${padH}mm; position: relative; overflow: hidden;
  }
  h1 { font-family: 'Bangers', cursive; font-size: 28pt; font-weight: 400; letter-spacing: 0.04em; margin: 12pt 0 8pt; color: #111111; text-transform: uppercase; }
  h2 { font-family: 'Bangers', cursive; font-size: 20pt; font-weight: 400; letter-spacing: 0.03em; margin: 16pt 0 8pt; border-bottom: 2px solid #111111; padding-bottom: 4pt; color: #111111; }
  h3 { font-family: 'Bangers', cursive; font-size: 15pt; font-weight: 400; letter-spacing: 0.03em; margin: 12pt 0 6pt; color: #D95D39; }
  h4 { font-family: 'Special Elite', serif; font-size: 12pt; font-weight: 700; margin: 10pt 0 4pt; color: #3F5E4D; }
  p  { margin-bottom: 8pt; orphans: 3; widows: 3; }
  ul, ol { margin: 6pt 0 8pt 24pt; }
  li { margin-bottom: 4pt; }
  .todo-list { list-style: none; padding-left: 0; }
  .todo-list li { display: flex; align-items: flex-start; gap: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 14pt 0; font-size: 10.5pt; border: 2px solid #111111; }
  th, td { border: 1px solid #111111; padding: 7pt 10pt; }
  th { background: #111111; color: #F3E9D2; font-family: 'Bangers', cursive; font-size: 11pt; letter-spacing: 0.04em; }
  tr:nth-child(even) td { background: rgba(243, 233, 210, 0.4); }
  
  figure.image { box-sizing: border-box; max-width: 100%; margin: 12pt auto; display: table; }
  figure.image[style*="absolute"] { display: block !important; margin: 0 !important; }
  figure.image img { width: 100%; height: auto; display: block; border: 2px solid #111111; }
  img { max-width: 100%; height: auto; border: 2px solid #111111; display: block; }
  
  #editor, .ck-content, .ck-editor__editable, .ck.ck-editor {
    background: transparent !important;
    padding: 0 !important;
    margin: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    border: none !important;
    box-shadow: none !important;
  }

  .image-style-align-left  { float: left !important; margin: 8pt 16pt 12pt 0 !important; }
  .image-style-align-right { float: right !important; margin: 8pt 0 12pt 16pt !important; }
  .image-style-align-center { margin-left: auto !important; margin-right: auto !important; display: table !important; }
  .image-style-block { display: block !important; margin-left: auto !important; margin-right: auto !important; }

  blockquote { border-left: 5px solid #D95D39; margin: 14pt 0; padding: 10pt 16pt; color: #2c2013; background: rgba(217,93,57,0.08); font-style: italic; }
  a { color: #D95D39; text-decoration: underline; }
  pre { background: #1a1714; color: #f8f4e9; border: 2px solid #111111; border-radius: 3px; padding: 12pt 14pt; font-family: 'JetBrains Mono', monospace; font-size: 9.5pt; margin: 12pt 0; }
  code { font-family: 'JetBrains Mono', monospace; background: rgba(17,17,17,0.08); color: #D95D39; padding: 1px 5px; border-radius: 2px; }
  hr { border: none; height: 3px; background: #111111; margin: 20pt 0; }
</style>
</head><body>${cleanHtml}</body></html>`;

  try {
    const MM_TO_PX = 3.7795275591;
    const vpW = Math.round(numW * MM_TO_PX);
    const vpH = Math.round(numH * MM_TO_PX);

    const pdf = await renderWithPuppeteer(fullHtml, {
      type: 'pdf',
      viewport: { width: vpW, height: vpH, deviceScaleFactor: 2 },
      pdfOptions: {
        width: `${numW}mm`,
        height: `${numH}mm`,
        landscape: false, // As dimensões já refletem com precisão a largura e altura da página
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      },
    });

    const safeDoc = String(req.body.docName || req.body.doc_name || 'documento')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[×✕✖*]/g, 'x').replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 40) || 'documento';
    const safeFmt = String(req.body.formatName || req.body.format_name || `${numW}x${numH}mm`)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[×✕✖*]/g, 'x').replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 20) || 'formato';
    const downloadFilename = `${safeDoc}_${safeFmt}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${downloadFilename}"`,
      'Access-Control-Expose-Headers': 'Content-Disposition, Content-Type',
    });
    res.send(pdf);
  } catch (err) {
    console.error('[PDF] Erro de exportação:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/export/img', exportLimiter, async (req, res) => {
  const { html = '', pageWidth = 210, pageHeight = 297 } = req.body;
  const inlinedHtml = inlineLocalImages(html);
  const cleanHtml   = sanitize(inlinedHtml);
  const numW = Math.max(10, parseFloat(pageWidth) || 210);
  const numH = Math.max(10, parseFloat(pageHeight) || 297);
  const MM_TO_PX    = 3.7795275591;
  const vpW = Math.round(numW * MM_TO_PX);
  const vpH = Math.round(numH * MM_TO_PX);
  const padV = Math.round(Math.min(25, Math.max(4, numH * 0.08)) * MM_TO_PX);
  const padH = Math.round(Math.min(20, Math.max(4, numW * 0.08)) * MM_TO_PX);

  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Bangers&family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:ital,wght@0,400;0,600;1,400&family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400&family=Montserrat:ital,wght@0,400;0,600;0,700;1,400&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400&family=Special+Elite&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${vpW}px; min-height: ${vpH}px; margin: 0; padding: 0; }
  body {
    font-family: 'Merriweather', Georgia, serif; font-size: 11pt; line-height: 1.75; color: #111111;
    width: ${vpW}px; min-height: ${vpH}px; padding: ${padV}px ${padH}px;
    background: #FFFDF5; position: relative; overflow: hidden;
  }
  h1 { font-family: 'Bangers', cursive; font-size: 28pt; margin-bottom: 12pt; text-transform: uppercase; }
  h2 { font-family: 'Bangers', cursive; font-size: 20pt; border-bottom: 2px solid #111; padding-bottom: 4pt; margin: 14pt 0 7pt; }
  p  { margin-bottom: 8pt; }
  table { width: 100%; border-collapse: collapse; margin: 14pt 0; border: 2px solid #111; }
  th, td { border: 1px solid #111; padding: 7pt 10pt; }
  th { background: #111; color: #F3E9D2; }
  
  figure.image { box-sizing: border-box; max-width: 100%; margin: 12px auto; display: table; }
  figure.image[style*="absolute"] { display: block !important; margin: 0 !important; }
  figure.image img { width: 100%; height: auto; display: block; border: 2px solid #111; }
  img { max-width: 100%; height: auto; border: 2px solid #111; display: block; }
  
  #editor, .ck-content, .ck-editor__editable, .ck.ck-editor {
    background: transparent !important;
    padding: 0 !important;
    margin: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    border: none !important;
    box-shadow: none !important;
  }

  .image-style-align-left  { float: left !important; margin: 8px 16px 12px 0 !important; }
  .image-style-align-right { float: right !important; margin: 8px 0 12px 16px !important; }
  .image-style-align-center { margin-left: auto !important; margin-right: auto !important; display: table !important; }
  .image-style-block { display: block !important; margin-left: auto !important; margin-right: auto !important; }

  blockquote { border-left: 5px solid #D95D39; padding: 10pt 16pt; background: rgba(217,93,57,0.08); font-style: italic; }
</style>
</head><body>${cleanHtml}</body></html>`;

  try {
    const png = await renderWithPuppeteer(fullHtml, {
      type: 'png',
      viewport: { width: vpW, height: vpH, deviceScaleFactor: 2 },
    });

    const safeDoc = String(req.body.docName || req.body.doc_name || 'documento')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[×✕✖*]/g, 'x').replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 40) || 'documento';
    const safeFmt = String(req.body.formatName || req.body.format_name || `${numW}x${numH}mm`)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[×✕✖*]/g, 'x').replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 20) || 'formato';
    const downloadFilename = `${safeDoc}_${safeFmt}.png`;

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${downloadFilename}"`,
      'Access-Control-Expose-Headers': 'Content-Disposition, Content-Type',
    });
    res.send(png);
  } catch (err) {
    console.error('[IMG] Erro de exportação:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   ROTAS DE MÍDIA ISOLADAS POR SESSÃO (Com Suporte Amplo)
══════════════════════════════════════════════════════════ */

// GET /api/media/session — Retorna o Session ID ativo
app.get('/api/media/session', (req, res) => {
  res.json({
    sessionId: req.sessionId,
    usedBytes: getSessionUsedBytes(req.sessionId),
    maxBytes:  MAX_SESSION_STORAGE_BYTES,
  });
});

// GET /api/media/folders — Lista pastas
app.get('/api/media/folders', (req, res) => {
  try {
    const sessionDir = path.join(SESSIONS_DIR, req.sessionId);
    ensureSessionWorkspace(req.sessionId);

    const entries = fs.readdirSync(sessionDir, { withFileTypes: true });
    const folders = entries
      .filter(e => e.isDirectory())
      .map(e => {
        const dir = path.join(sessionDir, e.name);
        const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
        let count = files.length;
        if (count === 0) {
          const globalDir = path.join(MEDIA_ROOT, e.name);
          if (fs.existsSync(globalDir)) {
            const gFiles = fs.readdirSync(globalDir).filter(f => !f.startsWith('.') && fs.statSync(path.join(globalDir, f)).isFile());
            count = gFiles.length;
          }
        }
        return { name: e.name, count };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    res.json({ folders, sessionId: req.sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/media/folder — Cria pasta
app.post('/api/media/folder', (req, res) => {
  try {
    const { targetDir, safeFolder } = resolveSafeSessionDir(req.sessionId, req.body.name, false);
    if (fs.existsSync(targetDir)) return res.status(409).json({ error: 'Pasta já existe.' });

    fs.mkdirSync(targetDir, { recursive: true });
    res.json({ ok: true, name: safeFolder });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/media/folder — Renomeia pasta
app.patch('/api/media/folder', (req, res) => {
  try {
    const { targetDir: oldDir } = resolveSafeSessionDir(req.sessionId, req.body.old);
    const { targetDir: newDir } = resolveSafeSessionDir(req.sessionId, req.body.new);

    if (!fs.existsSync(oldDir)) return res.status(404).json({ error: 'Pasta não encontrada.' });
    if (fs.existsSync(newDir))  return res.status(409).json({ error: 'Já existe uma pasta com esse nome.' });

    fs.renameSync(oldDir, newDir);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/media/folder — Remove pasta
app.delete('/api/media/folder', (req, res) => {
  try {
    const { targetDir } = resolveSafeSessionDir(req.sessionId, req.body.name);
    if (!fs.existsSync(targetDir)) return res.status(404).json({ error: 'Pasta não encontrada.' });

    fs.rmSync(targetDir, { recursive: true, force: true });
    _sessionBytesCache.delete(req.sessionId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/media/files?folder=Nome
app.get('/api/media/files', (req, res) => {
  try {
    const { targetDir, safeFolder } = resolveSafeSessionDir(req.sessionId, req.query.folder);
    let entries = fs.readdirSync(targetDir).filter(f => !f.startsWith('.'));

    let files = entries.map(name => {
      const stat = fs.statSync(path.join(targetDir, name));
      return {
        name,
        url:      `http://localhost:${PORT}/media/sessions/${encodeURIComponent(req.sessionId)}/${encodeURIComponent(safeFolder)}/${encodeURIComponent(name)}`,
        size:     stat.size,
        modified: stat.mtime.toISOString(),
        mimetype: _guessMime(name),
      };
    });

    // Se o diretório da sessão estiver vazio, verifica se há arquivos na pasta global padrão
    if (files.length === 0) {
      const globalDir = path.join(MEDIA_ROOT, safeFolder);
      if (fs.existsSync(globalDir)) {
        const globalEntries = fs.readdirSync(globalDir).filter(f => !f.startsWith('.') && fs.statSync(path.join(globalDir, f)).isFile());
        if (globalEntries.length > 0) {
          files = globalEntries.map(name => {
            const stat = fs.statSync(path.join(globalDir, name));
            return {
              name,
              url:      `http://localhost:${PORT}/media/${encodeURIComponent(safeFolder)}/${encodeURIComponent(name)}`,
              size:     stat.size,
              modified: stat.mtime.toISOString(),
              mimetype: _guessMime(name),
            };
          });
        }
      }
    }

    res.json({ files, folder: safeFolder, sessionId: req.sessionId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/media/upload — Upload seguro
app.post('/api/media/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo recebido.' });

  try {
    // Sincroniza Session ID do body ou headers
    const bodySessionId = req.body?.session_id || req.headers['x-session-id'] || req.query?.session_id;
    if (bodySessionId && typeof bodySessionId === 'string') {
      req.sessionId = bodySessionId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64) || 'default_session';
    }
    ensureSessionWorkspace(req.sessionId);

    // 1. Validação de Mídia
    if (!validateMediaFile(req.file.buffer, req.file.originalname)) {
      return res.status(400).json({ error: 'Arquivo inválido ou formato não permitido.' });
    }

    // 2. Verificação de Quota
    const currentBytes = getSessionUsedBytes(req.sessionId);
    if (currentBytes + req.file.size > MAX_SESSION_STORAGE_BYTES) {
      return res.status(413).json({ error: 'Limite de armazenamento da sua sessão excedido.' });
    }

    // 3. Resolução segura do diretório da sessão
    const folderParam = req.query.folder || req.headers['x-folder'] || req.body?.folder || 'Imagens';
    const { targetDir, safeFolder } = resolveSafeSessionDir(req.sessionId, folderParam);

    // 4. Nome seguro e gravação
    const safeBaseName = req.file.originalname.replace(/[^a-zA-Z0-9._\-]/g, '_').substring(0, 80);
    const filename = `${Date.now()}_${safeBaseName}`;
    const destinationPath = path.join(targetDir, filename);

    fs.writeFileSync(destinationPath, req.file.buffer);

    // Atualiza cache de cota incrementalmente sem re-varrer o disco
    if (_sessionBytesCache.has(req.sessionId)) {
      const cached = _sessionBytesCache.get(req.sessionId);
      cached.bytes += req.file.size;
      cached.timestamp = Date.now();
    } else {
      _sessionBytesCache.set(req.sessionId, { bytes: req.file.size, timestamp: Date.now() });
    }

    const fileUrl = `http://localhost:${PORT}/media/sessions/${encodeURIComponent(req.sessionId)}/${encodeURIComponent(safeFolder)}/${encodeURIComponent(filename)}`;

    res.json({
      ok:        true,
      url:       fileUrl,
      filename:  filename,
      folder:    safeFolder,
      sessionId: req.sessionId,
      size:      req.file.size,
      mimetype:  req.file.mimetype,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/media/file
app.delete('/api/media/file', (req, res) => {
  try {
    const { targetDir } = resolveSafeSessionDir(req.sessionId, req.body.folder);
    const safeFilename = path.basename(req.body.filename || '');
    const filePath = path.join(targetDir, safeFilename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      _sessionBytesCache.delete(req.sessionId);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function _guessMime(filename) {
  const ext = path.extname(filename).toLowerCase();
  const MAP = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jfif': 'image/jpeg',
    '.png': 'image/png',  '.gif': 'image/gif',   '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
    '.mp4': 'video/mp4',  '.webm': 'video/webm',  '.mov': 'video/quicktime',
  };
  return MAP[ext] || 'application/octet-stream';
}

/* ══════════════════════════════════════════════════════════
   SESSION GARBAGE COLLECTOR (Limpeza Inteligente de Sessões Abandonadas)
══════════════════════════════════════════════════════════ */
const SESSION_MAX_AGE_MS = 15 * 24 * 60 * 60 * 1000; // 15 dias de inatividade

function _getSessionLatestMtime(sessionPath) {
  let latest = 0;
  try {
    const rootStat = fs.statSync(sessionPath);
    latest = rootStat.mtimeMs;

    const scan = dir => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          const s = fs.statSync(full);
          if (s.mtimeMs > latest) latest = s.mtimeMs;
          scan(full);
        } else if (e.isFile()) {
          const s = fs.statSync(full);
          if (s.mtimeMs > latest) latest = s.mtimeMs;
        }
      }
    };
    scan(sessionPath);
  } catch {}
  return latest;
}

function runSessionGarbageCollector(maxAgeMs = SESSION_MAX_AGE_MS) {
  let cleanedCount = 0;
  let freedBytes   = 0;
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return { cleanedCount, freedBytes };
    const now = Date.now();
    const sessions = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });

    for (const s of sessions) {
      if (s.isDirectory() && s.name !== 'default_session') {
        const sessionPath = path.join(SESSIONS_DIR, s.name);
        const lastActive = _getSessionLatestMtime(sessionPath);

        if (now - lastActive > maxAgeMs) {
          const bytes = getSessionUsedBytes(s.name, true);
          fs.rmSync(sessionPath, { recursive: true, force: true });
          _initializedSessions.delete(s.name);
          _sessionBytesCache.delete(s.name);
          cleanedCount++;
          freedBytes += bytes;
          console.log(`🧹 [GarbageCollector] Sessão inativa removida: ${s.name} (${(bytes / 1024).toFixed(1)} KB liberados)`);
        }
      }
    }
    if (cleanedCount > 0) {
      console.log(`🧹 [GarbageCollector] Limpeza concluída: ${cleanedCount} sessões removidas, ${(freedBytes / (1024 * 1024)).toFixed(2)} MB liberados.`);
    }
  } catch (gcErr) {
    console.error('[GarbageCollector] Erro durante limpeza:', gcErr.message);
  }
  return { cleanedCount, freedBytes };
}

// Executa limpeza 3s após ligar o servidor e depois a cada 6h
setTimeout(() => runSessionGarbageCollector(), 3000).unref();
const gcInterval = setInterval(runSessionGarbageCollector, 6 * 60 * 60 * 1000);
gcInterval.unref();

/* ══════════════════════════════════════════════════════════
   INICIALIZAÇÃO DO SERVIDOR
══════════════════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n🛡️  WebDoc — Servidor Multi-Usuário Seguro rodando em http://localhost:${PORT}`);
  console.log(`   🌐 Frontend:            http://localhost:${PORT}`);
  console.log(`   📁 Sessões de Mídia:    ${SESSIONS_DIR}`);
  console.log(`   🔒 Modo de Segurança:   Ativo\n`);
});
