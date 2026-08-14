/**
 * server.js
 * Serviço Node.js — Exportação PDF/PNG e Biblioteca de Mídia
 * WebDoc Editor
 *
 * Porta padrão: 3000
 * Rodar com: node server.js
 */

const express  = require('express');
const cors     = require('cors');
const multer   = require('multer');
const puppeteer = require('puppeteer');
const path     = require('path');
const fs       = require('fs');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('isomorphic-dompurify');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ──────────────────────────────────────────────────────────
   Constantes de caminho
────────────────────────────────────────────────────────── */
// Pasta raiz da biblioteca de mídia (dois níveis acima, na raiz do projeto)
const MEDIA_ROOT   = path.resolve(__dirname, '../../media-library');

// Raiz do projeto (onde está o index.html, css/, js/)
const PROJECT_ROOT = path.resolve(__dirname, '../../');

/* ──────────────────────────────────────────────────────────
   Pastas padrão criadas automaticamente
────────────────────────────────────────────────────────── */
const DEFAULT_FOLDERS = ['Imagens', 'Vídeos', 'Logos'];

function ensureDefaultFolders() {
  if (!fs.existsSync(MEDIA_ROOT)) fs.mkdirSync(MEDIA_ROOT, { recursive: true });
  DEFAULT_FOLDERS.forEach(name => {
    const p = path.join(MEDIA_ROOT, name);
    if (!fs.existsSync(p)) fs.mkdirSync(p);
  });
}

ensureDefaultFolders();

/* ──────────────────────────────────────────────────────────
   Middlewares globais
────────────────────────────────────────────────────────── */
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Serve os arquivos da biblioteca de mídia como assets estáticos
app.use('/media', express.static(MEDIA_ROOT));

// Serve o frontend (index.html, css/, js/) na raiz — http://localhost:3000
app.use(express.static(PROJECT_ROOT, {
  // Não servir pastas do backend como arquivos estáticos
  index: 'index.html',
}));

/* ──────────────────────────────────────────────────────────
   Sanitização HTML (DOMPurify)
────────────────────────────────────────────────────────── */
const { window } = new JSDOM('');
const DOMPurify  = createDOMPurify(window);

function sanitize(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p','br','b','strong','i','em','u','s','del','ins','mark','small','sup','sub',
      'h1','h2','h3','h4','h5','h6',
      'ul','ol','li',
      'table','thead','tbody','tfoot','tr','th','td','caption','colgroup','col',
      'img','figure','figcaption',
      'a','blockquote','pre','code','hr',
      'div','span','section','article',
    ],
    ALLOWED_ATTR: ['href','src','alt','title','class','style','target','rel','width','height','colspan','rowspan','align'],
    FORBID_SCRIPTS: true,
  });
}

/* ──────────────────────────────────────────────────────────
   Multer — Upload de mídia
────────────────────────────────────────────────────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = (req.body.folder || 'Imagens').replace(/[^a-zA-Z0-9 À-ÿ\-_]/g, '');
    const dir    = path.join(MEDIA_ROOT, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._\-]/g, '_');
    const name = `${Date.now()}_${safe}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use imagens ou vídeos.'));
    }
  },
});

/* ══════════════════════════════════════════════════════════
   ROTAS — EXPORTAÇÃO
════════════════════════════════════════════════════════ */

/**
 * POST /api/export/pdf
 * Body: { html, pageWidth, pageHeight, landscape, docName }
 * Resposta: arquivo .pdf
 */
app.post('/api/export/pdf', async (req, res) => {
  const { html = '', pageWidth = 210, pageHeight = 297, landscape = false } = req.body;

  const cleanHtml = sanitize(html);
  const MM_TO_PX  = 3.7795275591;

  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Bangers&family=Special+Elite&family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400&family=Courier+Prime&display=swap');
  @page { size: ${pageWidth}mm ${pageHeight}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Merriweather', Georgia, serif;
    font-size: 11pt;
    line-height: 1.7;
    color: #111111;
    background-color: #FFFDF5;
    width: ${pageWidth}mm;
    min-height: ${pageHeight}mm;
    padding: 25mm 20mm;
  }
  h1 { font-family: 'Bangers', cursive; font-size: 26pt; font-weight: 400; letter-spacing: 0.04em; margin-bottom: 10pt; color: #111111; text-transform: uppercase; }
  h2 { font-family: 'Bangers', cursive; font-size: 18pt; font-weight: 400; letter-spacing: 0.03em; margin: 14pt 0 7pt; border-bottom: 2px solid #111111; padding-bottom: 4pt; color: #111111; }
  h3 { font-family: 'Bangers', cursive; font-size: 13pt; font-weight: 400; letter-spacing: 0.03em; margin: 10pt 0 5pt; color: #111111; }
  p  { margin-bottom: 7pt; orphans: 3; widows: 3; }
  ul, ol { margin: 6pt 0 6pt 20pt; }
  li { margin-bottom: 3pt; }
  table { width: 100%; border-collapse: collapse; margin: 10pt 0; font-size: 10.5pt; }
  th, td { border: 2px solid #111111; padding: 5pt 7pt; }
  th { background: #111111; color: #F3E9D2; font-family: 'Bangers', cursive; font-size: 10pt; letter-spacing: 0.04em; }
  img { max-width: 100%; height: auto; border: 2px solid #111111; }
  blockquote { border-left: 4px solid #D95D39; margin: 10pt 0; padding: 6pt 14pt; color: #3a2e1e; background: rgba(217,93,57,0.06); font-style: italic; }
  a { color: #D95D39; }
  pre, code { font-family: 'Courier Prime', 'Courier New', monospace; background: #E8D9B8; padding: 2pt 5pt; border: 1px solid #111111; font-size: 10pt; }
</style>
</head><body>${cleanHtml}</body></html>`;

  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30_000 });

    const pdf = await page.pdf({
      width:           `${pageWidth}mm`,
      height:          `${pageHeight}mm`,
      landscape:       Boolean(landscape),
      printBackground: true,
    });

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="documento.pdf"`,
    });
    res.send(pdf);
  } catch (err) {
    console.error('[PDF] Erro:', err);
    res.status(500).json({ error: err.message });
  } finally {
    await browser?.close();
  }
});

/**
 * POST /api/export/img
 * Body: { html, pageWidth, pageHeight, docName }
 * Resposta: arquivo .png
 */
app.post('/api/export/img', async (req, res) => {
  const { html = '', pageWidth = 210, pageHeight = 297 } = req.body;

  const cleanHtml = sanitize(html);
  const MM_TO_PX  = 3.7795275591;
  const vpW = Math.round(pageWidth  * MM_TO_PX);
  const vpH = Math.round(pageHeight * MM_TO_PX);

  const fullHtml = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Merriweather', Georgia, serif;
    font-size: 11pt; line-height: 1.7; color: #1a202c;
    width: ${vpW}px; min-height: ${vpH}px;
    padding: ${Math.round(25 * MM_TO_PX)}px ${Math.round(20 * MM_TO_PX)}px;
    background: white;
  }
  h1 { font-size: 24pt; } h2 { font-size: 18pt; } h3 { font-size: 13pt; }
  p { margin-bottom: 7pt; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 5pt 7pt; }
  th { background: #f1f5f9; font-weight: 600; }
  img { max-width: 100%; }
  blockquote { border-left: 3px solid #2563eb; padding: 6pt 14pt; color: #475569; background: #f8fafc; font-style: italic; }
</style>
</head><body>${cleanHtml}</body></html>`;

  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: vpW, height: vpH, deviceScaleFactor: 2 });
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30_000 });

    const png = await page.screenshot({ type: 'png', fullPage: true });

    res.set({
      'Content-Type':        'image/png',
      'Content-Disposition': `attachment; filename="documento.png"`,
    });
    res.send(png);
  } catch (err) {
    console.error('[IMG] Erro:', err);
    res.status(500).json({ error: err.message });
  } finally {
    await browser?.close();
  }
});

/* ══════════════════════════════════════════════════════════
   ROTAS — BIBLIOTECA DE MÍDIA
════════════════════════════════════════════════════════ */

/**
 * GET /api/media/folders
 * Retorna todas as pastas e contagem de arquivos.
 */
app.get('/api/media/folders', (req, res) => {
  try {
    ensureDefaultFolders();
    const entries = fs.readdirSync(MEDIA_ROOT, { withFileTypes: true });
    const folders = entries
      .filter(e => e.isDirectory())
      .map(e => {
        const dir   = path.join(MEDIA_ROOT, e.name);
        const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
        return { name: e.name, count: files.length };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    res.json({ folders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/folder
 * Body: { name }
 * Cria nova pasta.
 */
app.post('/api/media/folder', (req, res) => {
  const name = (req.body.name || '').trim().replace(/[<>:"/\\|?*]/g, '');
  if (!name) return res.status(400).json({ error: 'Nome inválido.' });

  const dir = path.join(MEDIA_ROOT, name);
  if (fs.existsSync(dir)) return res.status(409).json({ error: 'Pasta já existe.' });

  try {
    fs.mkdirSync(dir, { recursive: true });
    res.json({ ok: true, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/media/folder
 * Body: { old, new }
 * Renomeia pasta.
 */
app.patch('/api/media/folder', (req, res) => {
  const oldName = (req.body.old || '').trim();
  const newName = (req.body.new || '').trim().replace(/[<>:"/\\|?*]/g, '');
  if (!oldName || !newName) return res.status(400).json({ error: 'Nomes inválidos.' });

  const oldDir = path.join(MEDIA_ROOT, oldName);
  const newDir = path.join(MEDIA_ROOT, newName);

  if (!fs.existsSync(oldDir)) return res.status(404).json({ error: 'Pasta não encontrada.' });
  if (fs.existsSync(newDir))  return res.status(409).json({ error: 'Já existe uma pasta com esse nome.' });

  try {
    fs.renameSync(oldDir, newDir);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/media/folder
 * Body: { name }
 * Remove pasta e todos os arquivos dentro.
 */
app.delete('/api/media/folder', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome obrigatório.' });

  const dir = path.join(MEDIA_ROOT, name);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Pasta não encontrada.' });

  try {
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/media/files?folder=NomeDaPasta
 * Retorna lista de arquivos com metadados.
 */
app.get('/api/media/files', (req, res) => {
  const folder = (req.query.folder || '').trim();
  if (!folder) return res.status(400).json({ error: 'Parâmetro folder obrigatório.' });

  const dir = path.join(MEDIA_ROOT, folder);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Pasta não encontrada.' });

  try {
    const entries = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
    const files   = entries.map(name => {
      const stat = fs.statSync(path.join(dir, name));
      return {
        name,
        url:      `http://localhost:${PORT}/media/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`,
        size:     stat.size,
        modified: stat.mtime.toISOString(),
        mimetype: _guessMime(name),
      };
    });
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/upload
 * Form-data: file + folder
 * Faz upload de arquivo para a pasta especificada.
 */
app.post('/api/media/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo recebido.' });

  const folder  = (req.body.folder || 'Imagens').replace(/[^a-zA-Z0-9 À-ÿ\-_]/g, '');
  const fileUrl = `http://localhost:${PORT}/media/${encodeURIComponent(folder)}/${encodeURIComponent(req.file.filename)}`;

  res.json({
    ok:       true,
    url:      fileUrl,
    filename: req.file.filename,
    size:     req.file.size,
    mimetype: req.file.mimetype,
  });
});

/**
 * DELETE /api/media/file
 * Body: { folder, filename }
 * Remove um arquivo específico.
 */
app.delete('/api/media/file', (req, res) => {
  const { folder, filename } = req.body;
  if (!folder || !filename) return res.status(400).json({ error: 'folder e filename são obrigatórios.' });

  // Segurança: garante que não há path traversal
  const filePath = path.resolve(MEDIA_ROOT, folder, filename);
  if (!filePath.startsWith(MEDIA_ROOT)) return res.status(403).json({ error: 'Acesso negado.' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado.' });

  try {
    fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ──────────────────────────────────────────────────────────
   Helper: adivinhar MIME pelo nome do arquivo
────────────────────────────────────────────────────────── */
function _guessMime(filename) {
  const ext = path.extname(filename).toLowerCase();
  const MAP = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png',  '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.mp4': 'video/mp4',   '.webm': 'video/webm',
    '.ogv': 'video/ogg',   '.mov': 'video/quicktime',
  };
  return MAP[ext] || 'application/octet-stream';
}

/* ──────────────────────────────────────────────────────────
   Iniciar servidor
────────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n✅ WebDoc — Serviço Node.js rodando em http://localhost:${PORT}`);
  console.log(`\n   🌐 Frontend:      http://localhost:${PORT}`);
  console.log(`   📁 Biblioteca:    http://localhost:${PORT}/api/media/folders`);
  console.log(`   📄 Exportar PDF:  POST http://localhost:${PORT}/api/export/pdf`);
  console.log(`   🖼️  Exportar PNG:  POST http://localhost:${PORT}/api/export/img`);
  console.log(`   📁 Mídia local:   ${MEDIA_ROOT}\n`);
});
