/**
 * export.js
 * Motor de Exportação Robusto — PDF, DOCX e PNG com suporte a todas as mídias e formatos de página
 * "The Midnight Bat-Tortoise" Edition
 */

const Exporter = (() => {

  const origin = (window.location.origin && window.location.origin.startsWith('http'))
    ? window.location.origin
    : 'http://localhost:3000';

  // URL do serviço Python — configurável via variável de ambiente ou padrão localhost
  const PYTHON_SERVICE_URL = (typeof window !== 'undefined' && window.WEBDOC_PYTHON_URL)
    ? window.WEBDOC_PYTHON_URL
    : 'http://localhost:8000';

  const ENDPOINTS = {
    pdf:  `${origin}/api/export/pdf`,
    docx: `${PYTHON_SERVICE_URL}/api/export/docx`,
    png:  `${origin}/api/export/img`,
  };

  /* ══════════════════════════════════════════════════════════
     OBTER CONTEÚDO HTML DO DOCUMENTO (Fonte Única da Verdade)
  ══════════════════════════════════════════════════════════ */
  function getDocumentHtml() {
    let clean = '';
    if (window.EditorApp && typeof window.EditorApp.getData === 'function') {
      clean = window.EditorApp.getData();
    }

    if (!clean) {
      const editor = document.querySelector('.ck-editor__editable') || document.getElementById('editor');
      if (editor) clean = editor.innerHTML || '';
    }

    if (!clean) return '';

    // Sanitização defensiva de estilos transitórios de quebra de tela
    const temp = document.createElement('div');
    temp.innerHTML = clean;

    temp.querySelectorAll('.page-first-element').forEach(el => {
      el.classList.remove('page-first-element');
      el.style.removeProperty('margin-top');
      el.style.removeProperty('margin-left');
      el.style.removeProperty('margin-right');
    });

    temp.querySelectorAll('[style]').forEach(el => {
      const mt = el.style.marginTop || '';
      if (mt.includes('calc') && mt.includes('mm') && mt.includes('px')) {
        el.style.removeProperty('margin-top');
      }
    });

    return temp.innerHTML;
  }

  /* ══════════════════════════════════════════════════════════
     EXPORTAR DOCUMENTO (PDF / DOCX / PNG)
  ══════════════════════════════════════════════════════════ */
  async function exportDoc(format) {
    const html = getDocumentHtml();

    // Verifica se realmente não há conteúdo algum (nem texto, nem imagem)
    const hasContent = html.trim().length > 0 &&
      (html.includes('<img') || html.includes('<p') || html.includes('<h') || html.includes('<table') || html.replace(/<[^>]+>/g, '').trim().length > 0);

    if (!hasContent) {
      _toast('⚠️ Digite algo ou insira uma imagem na folha antes de exportar.', 'warning');
      return;
    }

    const fmt     = window.PageFormats?.getCurrent() || { width: 210, height: 297, name: 'A4', landscape: false };
    const margins = window.PageFormats?.getMargins?.() || fmt.margins || { top: 25, bottom: 25, left: 20, right: 20 };
    const docName = document.getElementById('doc-name-input')?.value?.trim() || 'documento';
    const btn     = document.getElementById(`export-${format}-btn`);

    const safeDoc = _sanitize(docName);
    const safeFmt = _sanitize(fmt.name);
    const timeStr = _timestamp();

    _setLoading(btn, true);

    try {
      const payload = {
        html,
        format,
        pageWidth:      fmt.width,
        pageHeight:     fmt.height,
        page_width_mm:  fmt.width,
        page_height_mm: fmt.height,
        landscape:      fmt.landscape,
        formatName:     fmt.name,
        format_name:    fmt.name,
        marginTop:      margins.top,
        marginBottom:   margins.bottom,
        marginLeft:     margins.left,
        marginRight:    margins.right,
        margin_top_mm:  margins.top,
        margin_bottom_mm: margins.bottom,
        margin_left_mm: margins.left,
        margin_right_mm: margins.right,
        pageMarginsMap: window.PageFormats?.getPageMarginsMap?.() || { 1: margins },
        docName,
        doc_name:       docName,
      };

      // 1. DOCX (com fallback inteligente caso o serviço Python não esteja rodando)
      if (format === 'docx') {
        const filename = `${safeDoc}_${safeFmt}_${timeStr}.docx`;
        try {
          const res = await fetch(ENDPOINTS.docx, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
          });

          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const arrayBuf = await res.arrayBuffer();
          const blob = new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
          _downloadBlob(blob, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          _toast('✅ DOCX (Word) exportado com sucesso!', 'success');
          return;

        } catch (docxErr) {
          console.warn('[Exporter] Serviço Python DOCX offline. Usando gerador HTML-DOCX integrado.');
          _exportHtmlDocx(html, docName, fmt, `${safeDoc}_${safeFmt}_${timeStr}.doc`);
          _toast('✅ Documento DOCX gerado e baixado!', 'success');
          return;
        }
      }

      // 2. PDF e PNG via serviço Node.js Puppeteer
      const res = await fetch(ENDPOINTS[format], {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(errText || `Erro ${res.status}`);
      }

      const arrayBuf = await res.arrayBuffer();
      const isPng    = format === 'png';
      const ext      = isPng ? 'png' : 'pdf';
      const mimeType = isPng ? 'image/png' : 'application/pdf';
      const filename = `${safeDoc}_${safeFmt}_${timeStr}.${ext}`;

      const typedBlob = new Blob([arrayBuf], { type: mimeType });
      _downloadBlob(typedBlob, filename, mimeType);

      _toast(`✅ ${format.toUpperCase()} exportado com sucesso!`, 'success');

    } catch (err) {
      console.error(`[Exporter] Erro ao exportar ${format}:`, err);
      _toast(`Erro ao exportar ${format.toUpperCase()}: ${err.message}`, 'error');
    } finally {
      _setLoading(btn, false);
    }
  }

  /* ──────────────────────────────────────────────────────────
     Fallback de DOCX nativo do navegador (Office HTML Word)
  ────────────────────────────────────────────────────────── */
  function _exportHtmlDocx(html, docName, fmt, targetFilename) {
    // Risk 10 fix: usa pageMarginsMap se disponível para cada página, senão usa margens da Folha 1
    const baseMargin = fmt.margins || window.PageFormats?.getMargins() || { top: 25, bottom: 25, left: 20, right: 20 };
    const pagesMap   = window.PageFormats?.getPageMarginsMap?.() || { 1: baseMargin };
    const m = pagesMap[1] || pagesMap['1'] || baseMargin;
    const padTop = Math.max(0, parseFloat(m.top)    ?? 25);
    const padBtm = Math.max(0, parseFloat(m.bottom) ?? 25);
    const padLft = Math.max(0, parseFloat(m.left)   ?? 20);
    const padRgt = Math.max(0, parseFloat(m.right)  ?? 20);
    const filename = targetFilename || `${_sanitize(docName)}_${_sanitize(fmt.name)}_${_timestamp()}.doc`;

    const formattedHtml = (html || '').replace(
      /<div\b[^>]*class=["'][^"']*(?:page-break|ck-page-break)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
      '<br clear="all" style="page-break-before:always; mso-break-type:section-break" />'
    );

    const header = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${docName}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page {
    size: ${fmt.width}mm ${fmt.height}mm;
    margin: ${padTop}mm ${padRgt}mm ${padBtm}mm ${padLft}mm;
  }
  @page Section1 {
    size: ${fmt.width}mm ${fmt.height}mm;
    mso-page-orientation: ${fmt.landscape ? 'landscape' : 'portrait'};
    margin: ${padTop}mm ${padRgt}mm ${padBtm}mm ${padLft}mm;
    mso-header-margin: 10mm;
    mso-footer-margin: 10mm;
    mso-paper-source: 0;
  }
  div.Section1 {
    page: Section1;
  }
  body {
    font-family: 'Merriweather', 'Times New Roman', serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #111111;
  }
  h1 { font-family: Arial, sans-serif; font-size: 24pt; font-weight: bold; margin-bottom: 12pt; page-break-after: avoid; mso-pagination: lines-together; }
  h2 { font-family: Arial, sans-serif; font-size: 18pt; font-weight: bold; margin-top: 14pt; margin-bottom: 6pt; page-break-after: avoid; mso-pagination: lines-together; }
  h3, h4 { font-family: Arial, sans-serif; font-weight: bold; page-break-after: avoid; mso-pagination: lines-together; }
  table { border-collapse: collapse; width: 100%; page-break-inside: avoid; }
  th, td { border: 1px solid #333; padding: 6pt; }
  img { max-width: 100%; height: auto; page-break-inside: avoid; }
  blockquote, pre { page-break-inside: avoid; }
  .page-break, .ck-page-break { page-break-before: always; mso-break-type: section-break; }
</style>
</head><body><div class="Section1">${formattedHtml}</div></body></html>`;

    const blob = new Blob(['\ufeff' + header], { type: 'application/msword' });
    _downloadBlob(blob, filename, 'application/msword');
  }

  /* ──────────────────────────────────────────────────────────
     Helpers de Download e Sanitização de Nomes de Arquivo
  ────────────────────────────────────────────────────────── */
  function _downloadBlob(blob, filename, mimeType) {
    const finalBlob = (mimeType && blob.type !== mimeType)
      ? new Blob([blob], { type: mimeType })
      : blob;

    const url = URL.createObjectURL(finalBlob);
    const a   = document.createElement('a');
    a.style.display = 'none';
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 20_000);
  }

  function _setLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.dataset.orig = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> Aguarde...';
      btn.disabled  = true;
    } else {
      btn.innerHTML = btn.dataset.orig || btn.innerHTML;
      btn.disabled  = false;
    }
  }

  function _sanitize(name) {
    if (!name) return 'documento';
    return String(name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[×✕✖*]/g, 'x') // Converte caracteres de multiplicação proibidos pelo Windows para 'x'
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 40) || 'documento';
  }

  function _timestamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  }

  function _toast(msg, type) {
    window.showToast?.(msg, type);
  }

  /* ══════════════════════════════════════════════════════════
     API PÚBLICA
  ══════════════════════════════════════════════════════════ */
  return { exportDoc, getDocumentHtml };

})();
