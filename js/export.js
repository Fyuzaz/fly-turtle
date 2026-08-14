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
    // 1. Tenta dados oficiais do CKEditor
    let html = window.EditorApp?.getData() || '';
    if (html && html.trim() && html !== '<p>&nbsp;</p>' && html !== '<p></p>') {
      return html;
    }

    // 2. Tenta capturar o container editável do CKEditor
    const ckEditable = document.querySelector('.ck-editor__editable');
    if (ckEditable && ckEditable.innerHTML && ckEditable.innerHTML.trim()) {
      return ckEditable.innerHTML;
    }

    // 3. Tenta o elemento #editor
    const editorEl = document.getElementById('editor');
    if (editorEl && editorEl.innerHTML && editorEl.innerHTML.trim()) {
      return editorEl.innerHTML;
    }

    // 4. Tenta o elemento da folha #page-sheet
    const sheet = document.getElementById('page-sheet');
    if (sheet && sheet.innerHTML) {
      return sheet.innerHTML;
    }

    return '';
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

    _setLoading(btn, true);

    try {
      const payload = {
        html,
        format,
        pageWidth:  fmt.width,
        pageHeight: fmt.height,
        landscape:  fmt.landscape,
        formatName: fmt.name,
        docName,
      };

      // 1. DOCX (com fallback inteligente caso o serviço Python não esteja rodando)
      if (format === 'docx') {
        try {
          const res = await fetch(ENDPOINTS.docx, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
          });

          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          _downloadBlob(blob, `${_sanitize(docName)}_${fmt.name}_${_timestamp()}.docx`);
          _toast('✅ DOCX (Word) exportado com sucesso!', 'success');
          return;

        } catch (docxErr) {
          console.warn('[Exporter] Serviço Python DOCX offline. Usando gerador HTML-DOCX integrado.');
          _exportHtmlDocx(html, docName, fmt);
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

      const blob = await res.blob();
      const ext  = format === 'png' ? 'png' : 'pdf';
      _downloadBlob(blob, `${_sanitize(docName)}_${fmt.name}_${_timestamp()}.${ext}`);

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
  function _exportHtmlDocx(html, docName, fmt) {
    const header = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${docName}</title>
<style>
  @page { size: ${fmt.width}mm ${fmt.height}mm; margin: 25mm 20mm; }
  body { font-family: 'Merriweather', 'Times New Roman', serif; font-size: 11pt; line-height: 1.6; color: #111111; }
  h1 { font-family: Arial, sans-serif; font-size: 24pt; font-weight: bold; margin-bottom: 12pt; }
  h2 { font-family: Arial, sans-serif; font-size: 18pt; font-weight: bold; margin-top: 14pt; margin-bottom: 6pt; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #333; padding: 6pt; }
  img { max-width: 100%; height: auto; }
</style>
</head><body>${html}</body></html>`;

    const blob = new Blob(['\ufeff' + header], { type: 'application/msword' });
    _downloadBlob(blob, `${_sanitize(docName)}_${fmt.name}_${_timestamp()}.doc`);
  }

  /* ──────────────────────────────────────────────────────────
     Helpers de Download e Loading
  ────────────────────────────────────────────────────────── */
  function _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 15_000);
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
    return (name || 'documento')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\-_\s]/gi, '')
      .replace(/\s+/g, '_')
      .toLowerCase()
      .substring(0, 50) || 'documento';
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
