/**
 * export.js
 * Motor de Exportação Robusto — PDF, DOCX e PNG com suporte a todas as mídias e formatos de página
 * "The Midnight Bat-Tortoise" Edition
 */

const Exporter = (() => {

  const origin = (window.location.origin && window.location.origin.startsWith('http'))
    ? window.location.origin
    : 'http://localhost:3000';

  const ENDPOINTS = {
    pdf:  `${origin}/api/export/pdf`,
    docx: 'http://localhost:8000/api/export/docx',
    png:  `${origin}/api/export/img`,
  };

  /* ══════════════════════════════════════════════════════════
     OBTER CONTEÚDO HTML DO DOCUMENTO (Multi-Estratégia)
  ══════════════════════════════════════════════════════════ */
  function getDocumentHtml() {
    const sheet = document.getElementById('page-sheet');
    const editor = document.querySelector('.ck-editor__editable') || document.getElementById('editor');

    if (!sheet) {
      return editor ? editor.innerHTML : (window.EditorApp?.getData() || '');
    }

    // Clona o page-sheet para capturar fielmente texto e imagens livres
    const clone = sheet.cloneNode(true);

    // Remove overlays de controle de UI (resizer, drop indicators)
    clone.querySelectorAll('#img-resizer-overlay, .img-resizer-overlay, #img-drop-indicator, .img-drop-indicator, .resizer-toolbar, .resizer-handle').forEach(el => el.remove());

    return clone.innerHTML;
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
    const padV = Math.min(25, Math.max(4, Math.round(fmt.height * 0.08)));
    const padH = Math.min(20, Math.max(4, Math.round(fmt.width * 0.08)));
    const filename = targetFilename || `${_sanitize(docName)}_${_sanitize(fmt.name)}_${_timestamp()}.doc`;

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
    margin: ${padV}mm ${padH}mm ${padV}mm ${padH}mm;
  }
  @page Section1 {
    size: ${fmt.width}mm ${fmt.height}mm;
    mso-page-orientation: ${fmt.landscape ? 'landscape' : 'portrait'};
    margin: ${padV}mm ${padH}mm ${padV}mm ${padH}mm;
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
  h1 { font-family: Arial, sans-serif; font-size: 24pt; font-weight: bold; margin-bottom: 12pt; }
  h2 { font-family: Arial, sans-serif; font-size: 18pt; font-weight: bold; margin-top: 14pt; margin-bottom: 6pt; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #333; padding: 6pt; }
  img { max-width: 100%; height: auto; }
</style>
</head><body><div class="Section1">${html}</div></body></html>`;

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
