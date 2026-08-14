/**
 * editor.js
 * Inicialização do CKEditor 5 (DecoupledDocumentEditor), auto-save e contagem de palavras
 * Editor Web de Documentos
 */

const EditorApp = (() => {

  const STORAGE_KEY    = 'wm_editor_content';
  const AUTOSAVE_DELAY = 2000;  // ms após parar de digitar

  let _instance  = null;
  let _autoTimer = null;
  let _wcTimer   = null;

  /* ══════════════════════════════════════════════════════════
     INICIALIZAÇÃO
  ══════════════════════════════════════════════════════════ */
  async function init() {
    const editorEl = document.getElementById('editor');
    if (!editorEl) { console.error('[EditorApp] #editor não encontrado'); return; }

    // Restaura conteúdo salvo
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) editorEl.innerHTML = saved;

    try {
      _instance = await CKEDITOR.DecoupledDocumentEditor.create(editorEl, {
        toolbar: {
          items: [
            'heading', '|',
            'fontFamily', 'fontSize', '|',
            'bold', 'italic', 'underline', 'strikethrough', '|',
            'fontColor', 'fontBackgroundColor', 'highlight', '|',
            'alignment', '|',
            'numberedList', 'bulletedList', 'outdent', 'indent', '|',
            'link', 'imageUpload', 'insertTable', 'blockQuote', '|',
            'undo', 'redo'
          ],
          shouldNotGroupWhenFull: false,
        },

        heading: {
          options: [
            { model: 'paragraph', title: 'Parágrafo',  class: 'ck-heading_paragraph' },
            { model: 'heading1',  view: 'h1', title: 'Título 1',   class: 'ck-heading_heading1' },
            { model: 'heading2',  view: 'h2', title: 'Título 2',   class: 'ck-heading_heading2' },
            { model: 'heading3',  view: 'h3', title: 'Título 3',   class: 'ck-heading_heading3' },
            { model: 'heading4',  view: 'h4', title: 'Título 4',   class: 'ck-heading_heading4' },
          ],
        },

        fontFamily: {
          options: [
            'default',
            'Merriweather, Georgia, serif',
            'Inter, Arial, sans-serif',
            'Arial, Helvetica, sans-serif',
            'Courier New, Courier, monospace',
            'Times New Roman, Times, serif',
            'Georgia, serif',
          ],
          supportAllValues: false,
        },

        fontSize: {
          options: [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 48, 72],
          supportAllValues: false,
        },

        alignment: {
          options: ['left', 'right', 'center', 'justify'],
        },

        image: {
          toolbar: [
            'imageStyle:inline',
            'imageStyle:block',
            'imageStyle:side',
            '|',
            'toggleImageCaption',
            'imageTextAlternative',
            '|',
            'resizeImage',
          ],
          resizeOptions: [
            { name: 'resizeImage:original', value: null,  label: 'Original' },
            { name: 'resizeImage:25',  value: '25',  label: '25%' },
            { name: 'resizeImage:50',  value: '50',  label: '50%' },
            { name: 'resizeImage:75',  value: '75',  label: '75%' },
            { name: 'resizeImage:100', value: '100', label: '100%' },
          ],
        },

        table: {
          contentToolbar: [
            'tableColumn', 'tableRow', 'mergeTableCells',
            '|', 'tableProperties', 'tableCellProperties',
          ],
        },

        highlight: {
          options: [
            { model: 'yellowMarker',  class: 'marker-yellow',  title: 'Amarelo',  color: '#fdff00', type: 'marker' },
            { model: 'greenMarker',   class: 'marker-green',   title: 'Verde',    color: '#63f963', type: 'marker' },
            { model: 'pinkMarker',    class: 'marker-pink',    title: 'Rosa',     color: '#fc7999', type: 'marker' },
            { model: 'blueMarker',    class: 'marker-blue',    title: 'Azul',     color: '#72cdfd', type: 'marker' },
            { model: 'redPen',        class: 'pen-red',        title: 'Vermelho', color: '#e91313', type: 'pen' },
          ],
        },

        language: 'pt-br',
      });

      // Monta a toolbar no container do header
      const toolbarContainer = document.getElementById('toolbar-bar');
      if (toolbarContainer) {
        toolbarContainer.appendChild(_instance.ui.view.toolbar.element);
      }

      // Custom upload adapter
      _instance.plugins.get('FileRepository').createUploadAdapter = loader => new UploadAdapter(loader);

      // Listeners de mudança de conteúdo
      _instance.model.document.on('change:data', () => {
        _scheduleWordCount();
        _scheduleAutosave();
      });

      // Inicializa a biblioteca de mídia com a instância do editor
      window.MediaLibrary?.init(_instance);

      // Contagem inicial
      _scheduleWordCount();

      console.log('[EditorApp] Editor iniciado com sucesso!');
      return _instance;

    } catch (err) {
      console.error('[EditorApp] Falha ao iniciar CKEditor:', err);
    }
  }

  /* ══════════════════════════════════════════════════════════
     CONTAGEM DE PALAVRAS
  ══════════════════════════════════════════════════════════ */
  function _scheduleWordCount() {
    clearTimeout(_wcTimer);
    _wcTimer = setTimeout(_updateWordCount, 350);
  }

  function _updateWordCount() {
    const html  = _instance?.getData() || '';
    const text  = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    const words = text ? text.split(' ').filter(Boolean).length : 0;
    const chars = text.replace(/\s/g, '').length;

    const wEl = document.getElementById('word-count');
    const cEl = document.getElementById('char-count');
    if (wEl) wEl.textContent = `${words} palavra${words !== 1 ? 's' : ''}`;
    if (cEl) cEl.textContent = `${chars} char`;
  }

  /* ══════════════════════════════════════════════════════════
     AUTO-SAVE (localStorage)
  ══════════════════════════════════════════════════════════ */
  function _scheduleAutosave() {
    clearTimeout(_autoTimer);

    const ind = document.getElementById('save-indicator');
    if (ind) { ind.textContent = 'Editando...'; ind.className = 'status-item saving'; }

    _autoTimer = setTimeout(() => {
      const content = _instance?.getData();
      if (content !== undefined) {
        localStorage.setItem(STORAGE_KEY, content);
        const now = new Date();
        const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if (ind) { ind.textContent = `Salvo às ${time}`; ind.className = 'status-item saved'; }
      }
    }, AUTOSAVE_DELAY);
  }

  /* ══════════════════════════════════════════════════════════
     API PÚBLICA
  ══════════════════════════════════════════════════════════ */
  function getData()     { return _instance?.getData() || ''; }
  function getInstance() { return _instance; }

  return { init, getData, getInstance };

})();
