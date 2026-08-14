/**
 * export.js
 * Motor de exportação — PDF, DOCX e PNG com passagem de dimensões de página
 * Editor Web de Documentos
 */

const Exporter = (() => {

  const ENDPOINTS = {
    pdf:  'http://localhost:3000/api/export/pdf',
    docx: 'http://localhost:8000/api/export/docx',
    png:  'http://localhost:3000/api/export/img',
  };

  /* ══════════════════════════════════════════════════════════
     EXPORTAR DOCUMENTO
  ══════════════════════════════════════════════════════════ */
  async function exportDoc(format) {
    const html = window.EditorApp?.getData() || '';

    if (!html.trim()) {
      _toast('O documento está vazio. Adicione conteúdo antes de exportar.', 'info');
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
      const ext  = format === 'png' ? 'png' : format;
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
     Helpers
  ────────────────────────────────────────────────────────── */
  function _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 15_000);
  }

  function _setLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.dataset.orig = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span>';
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
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  }

  function _toast(msg, type) {
    window.showToast?.(msg, type);
  }

  /* ══════════════════════════════════════════════════════════
     API PÚBLICA
  ══════════════════════════════════════════════════════════ */
  return { exportDoc };

})();
