/**
 * editor.js
 * Inicialização robusta do CKEditor 5 (DecoupledEditor), auto-save e contagem de palavras
 * "The Midnight Bat-Tortoise" Edition
 */

const EditorApp = (() => {

  const STORAGE_KEY    = 'wm_editor_content';
  const AUTOSAVE_DELAY = 1500;  // ms após parar de digitar

  let _instance  = null;
  let _autoTimer = null;
  let _wcTimer   = null;

  /* ══════════════════════════════════════════════════════════
     INICIALIZAÇÃO
  ══════════════════════════════════════════════════════════ */
  async function init() {
    const editorEl = document.getElementById('editor');
    if (!editorEl) {
      console.error('[EditorApp] Elemento #editor não foi encontrado no DOM.');
      return;
    }

    // Restaura conteúdo salvo se houver
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      editorEl.innerHTML = saved;
    }

    // Identifica o construtor correto do CKEditor 5 Superbuild
    const EditorFactory =
      window.CKEDITOR?.DecoupledEditor ||
      window.CKSource?.Editor?.DecoupledEditor ||
      window.CKEDITOR?.ClassicEditor ||
      window.CKSource?.Editor?.ClassicEditor ||
      window.DecoupledEditor ||
      window.ClassicEditor;

    if (!EditorFactory) {
      console.warn('[EditorApp] CKEditor 5 não encontrado. Ativando modo de digitação nativo.');
      _enableNativeFallback(editorEl);
      return;
    }

    try {
      _instance = await EditorFactory.create(editorEl, {
        toolbar: {
          items: [
            'heading', '|',
            'fontFamily', 'fontSize', '|',
            'bold', 'italic', 'underline', 'strikethrough', '|',
            'fontColor', 'fontBackgroundColor', 'highlight', '|',
            'alignment', '|',
            'numberedList', 'bulletedList', 'outdent', 'indent', '|',
            'link', 'uploadImage', 'insertImage', 'insertTable', 'blockQuote', '|',
            'undo', 'redo'
          ],
          shouldNotGroupWhenFull: false,
        },

        heading: {
          options: [
            { model: 'paragraph', title: 'Parágrafo', class: 'ck-heading_paragraph' },
            { model: 'heading1',  view: 'h1', title: 'Título 1', class: 'ck-heading_heading1' },
            { model: 'heading2',  view: 'h2', title: 'Título 2', class: 'ck-heading_heading2' },
            { model: 'heading3',  view: 'h3', title: 'Título 3', class: 'ck-heading_heading3' },
            { model: 'heading4',  view: 'h4', title: 'Título 4', class: 'ck-heading_heading4' },
          ],
        },

        fontFamily: {
          options: [
            'default',
            'Merriweather, Georgia, serif',
            'Bangers, Impact, cursive',
            'Special Elite, Courier New, serif',
            'Courier Prime, Courier New, monospace',
            'Arial, Helvetica, sans-serif',
            'Times New Roman, Times, serif',
          ],
          supportAllValues: true,
        },

        fontSize: {
          options: [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72],
          supportAllValues: true,
        },

        alignment: {
          options: ['left', 'center', 'right', 'justify'],
        },

        image: {
          toolbar: [
            'imageStyle:inline',
            'imageStyle:block',
            'imageStyle:side',
            '|',
            'imageStyle:alignLeft',
            'imageStyle:alignCenter',
            'imageStyle:alignRight',
            '|',
            'resizeImage',
            '|',
            'toggleImageCaption',
            'imageTextAlternative'
          ],
        },

        table: {
          contentToolbar: [
            'tableColumn', 'tableRow', 'mergeTableCells',
            '|', 'tableProperties', 'tableCellProperties',
          ],
        },
      });

      // Monta a toolbar no container superior do app
      const toolbarContainer = document.getElementById('toolbar-bar');
      if (toolbarContainer && _instance.ui?.view?.toolbar?.element) {
        toolbarContainer.innerHTML = '';
        toolbarContainer.appendChild(_instance.ui.view.toolbar.element);
      }

      // Configura adaptador de upload customizado
      if (_instance.plugins?.has('FileRepository')) {
        _instance.plugins.get('FileRepository').createUploadAdapter = loader => new UploadAdapter(loader);
      }

      // Monitora alterações de conteúdo
      _instance.model.document.on('change:data', () => {
        _scheduleWordCount();
        _scheduleAutosave();
      });

      // Passa a instância para a biblioteca de mídia
      window.MediaLibrary?.init(_instance);

      // Atualiza contadores iniciais
      _scheduleWordCount();

      console.log('✅ [EditorApp] CKEditor 5 inicializado com sucesso!');
      return _instance;

    } catch (err) {
      console.error('[EditorApp] Erro na inicialização do CKEditor 5:', err);
      _enableNativeFallback(editorEl);
    }
  }

  /* ──────────────────────────────────────────────────────────
     Fallback Nativo (contenteditable)
  ────────────────────────────────────────────────────────── */
  function _enableNativeFallback(el) {
    el.setAttribute('contenteditable', 'true');
    el.style.outline = 'none';
    el.style.minHeight = '300px';
    el.style.cursor = 'text';

    el.addEventListener('input', () => {
      _scheduleWordCount();
      _scheduleAutosave();
    });

    _scheduleWordCount();
  }

  /* ══════════════════════════════════════════════════════════
     CONTAGEM DE PALAVRAS
  ══════════════════════════════════════════════════════════ */
  function _scheduleWordCount() {
    clearTimeout(_wcTimer);
    _wcTimer = setTimeout(_updateWordCount, 250);
  }

  function _updateWordCount() {
    const html  = getData() || '';
    const text  = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    const words = text ? text.split(' ').filter(Boolean).length : 0;
    const chars = text.replace(/\s/g, '').length;

    const wEl = document.getElementById('word-count');
    const cEl = document.getElementById('char-count');
    if (wEl) wEl.textContent = `${words} palavra${words !== 1 ? 's' : ''}`;
    if (cEl) cEl.textContent = `${chars} caracteres`;
  }

  /* ══════════════════════════════════════════════════════════
     AUTO-SAVE (localStorage)
  ══════════════════════════════════════════════════════════ */
  function _scheduleAutosave() {
    clearTimeout(_autoTimer);

    const ind = document.getElementById('save-indicator');
    if (ind) {
      ind.textContent = '✏️ Gravando...';
      ind.className = 'status-item saving';
    }

    _autoTimer = setTimeout(() => {
      const content = getData();
      if (content !== undefined && content.trim()) {
        localStorage.setItem(STORAGE_KEY, content);
        const now = new Date();
        const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (ind) {
          ind.textContent = `💾 Salvo às ${time}`;
          ind.className = 'status-item saved';
        }
      }
    }, AUTOSAVE_DELAY);
  }

  /* ══════════════════════════════════════════════════════════
     API PÚBLICA
  ══════════════════════════════════════════════════════════ */
  function getData() {
    // 1. Tenta pegar via CKEditor Model
    if (_instance) {
      try {
        const data = _instance.getData();
        if (data && data.trim()) return data;
      } catch {}
    }

    // 2. Tenta pegar o elemento editável do CKEditor
    const ckEditable = document.querySelector('.ck-editor__editable');
    if (ckEditable && ckEditable.innerHTML && ckEditable.innerHTML.trim()) {
      return ckEditable.innerHTML;
    }

    // 3. Fallback no elemento #editor
    const el = document.getElementById('editor');
    if (el && el.innerHTML && el.innerHTML.trim()) {
      return el.innerHTML;
    }

    // 4. Fallback no #page-sheet
    const pageSheet = document.getElementById('page-sheet');
    return pageSheet ? pageSheet.innerHTML : '';
  }

  function getInstance() {
    return _instance;
  }

  return { init, getData, getInstance };

})();
