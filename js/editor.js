/**
 * editor.js
 * Inicialização Robusta do CKEditor 5 + Toolbar Rica Resiliente
 * Dropdown Popover de Hiperlink Integrado + Mini Preview Bar com Acesso Clicável aos Links
 * "The Midnight Bat-Tortoise" Edition
 */

const EditorApp = (() => {

  const STORAGE_KEY    = 'wm_editor_content';
  const AUTOSAVE_DELAY = 1200;

  let _instance        = null;
  let _autoTimer       = null;
  let _wcTimer         = null;
  let _savedRange      = null;
  let _activeLinkNode  = null;
  let _balloonHoverEl  = null;

  function _getStorageKey() {
    const sid = window.MediaLibrary?.getSessionId() || localStorage.getItem('wm_session_id') || 'default';
    const params = new URLSearchParams(window.location.search);
    const docId = params.get('doc') || 'main';
    return `wm_doc_${sid}_${docId}`;
  }

  /* ══════════════════════════════════════════════════════════
     PALETA DE CORES TEMÁTICA
  ══════════════════════════════════════════════════════════ */
  const COLOR_PALETTE = [
    { color: '#111111', label: 'Ink Black' },
    { color: '#333333', label: 'Carvão' },
    { color: '#555555', label: 'Cinza Médio' },
    { color: '#888888', label: 'Cinza Suave' },
    { color: '#D95D39', label: 'Burnt Orange' },
    { color: '#B8441E', label: 'Laranja Escuro' },
    { color: '#E8764F', label: 'Laranja Claro' },
    { color: '#3F5E4D', label: 'Moss Green' },
    { color: '#2E4538', label: 'Verde Floresta' },
    { color: '#557A66', label: 'Verde Sálvia' },
    { color: '#6B3E75', label: 'Psychedelic Purple' },
    { color: '#4D2D5A', label: 'Roxo Profundo' },
    { color: '#8B5A96', label: 'Lilás' },
    { color: '#C0392B', label: 'Vermelho Tijolo' },
    { color: '#2980B9', label: 'Azul Petróleo' },
    { color: '#D4AC0D', label: 'Ouro Queimado' },
    { color: '#F3E9D2', label: 'Aged Paper' },
    { color: '#FFFFFF', label: 'Branco' },
  ];

  /* ══════════════════════════════════════════════════════════
     INICIALIZAÇÃO PRINCIPAL
  ══════════════════════════════════════════════════════════ */
  async function init() {
    const editorEl = document.getElementById('editor');
    if (!editorEl) return;

    // Restaura conteúdo salvo da sessão atual
    const storageKey = _getStorageKey();
    const saved = localStorage.getItem(storageKey) || localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      editorEl.innerHTML = saved;
    }

    _attachGlobalLinkListeners();

    // Procura construtor CKEditor 5
    const EditorFactory =
      window.CKEDITOR?.DecoupledEditor ||
      window.CKSource?.Editor?.DecoupledEditor ||
      window.DecoupledEditor;

    if (EditorFactory) {
      try {
        _instance = await EditorFactory.create(editorEl, {
          removePlugins: [
            'CKBox', 'CKFinder', 'EasyImage', 'RealTimeCollaborativeComments',
            'RealTimeCollaborativeTrackChanges', 'RealTimeCollaborativeRevisionHistory',
            'PresenceList', 'Comments', 'TrackChanges', 'TrackChangesData',
            'RevisionHistory', 'Pagination', 'WProofreader', 'MathType',
            'SlashCommand', 'Template', 'DocumentOutline', 'FormatPainter',
            'TableOfContents', 'PasteFromOfficeEnhanced', 'CaseChange',
            'AITextAdapter', 'OpenAITextAdapter', 'AIChat', 'MultiLevelList'
          ],

          toolbar: {
            items: [
              'heading', '|',
              'fontFamily', 'fontSize', '|',
              'bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript', 'code', '|',
              'fontColor', 'fontBackgroundColor', 'highlight', '|',
              'alignment', '|',
              'numberedList', 'bulletedList', 'todoList', 'outdent', 'indent', '|',
              'link', 'imageUpload', 'insertTable', 'blockQuote', 'codeBlock', 'horizontalLine', 'specialCharacters', '|',
              'undo', 'redo'
            ],
            shouldNotGroupWhenFull: false,
          },

          heading: {
            options: [
              { model: 'paragraph', title: 'Parágrafo', class: 'ck-heading_paragraph' },
              { model: 'heading1',  view: 'h1', title: 'Título 1 (H1)', class: 'ck-heading_heading1' },
              { model: 'heading2',  view: 'h2', title: 'Seção (H2)', class: 'ck-heading_heading2' },
              { model: 'heading3',  view: 'h3', title: 'Subseção (H3)', class: 'ck-heading_heading3' },
              { model: 'heading4',  view: 'h4', title: 'Tópico (H4)', class: 'ck-heading_heading4' },
            ],
          },

          fontFamily: {
            options: [
              'default',
              'Merriweather, Georgia, serif',
              'Playfair Display, Georgia, serif',
              'EB Garamond, Garamond, serif',
              'Inter, Arial, sans-serif',
              'Montserrat, Arial, sans-serif',
              'Roboto, Arial, sans-serif',
              'Special Elite, Courier New, serif',
              'Courier Prime, Courier New, monospace',
              'JetBrains Mono, Courier New, monospace',
              'Bangers, Impact, cursive',
              'Arial, Helvetica, sans-serif',
              'Times New Roman, Times, serif',
            ],
            supportAllValues: true,
          },

          fontSize: {
            options: [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72],
            supportAllValues: true,
          },

          fontColor: { colors: COLOR_PALETTE, columns: 6 },
          fontBackgroundColor: { colors: COLOR_PALETTE, columns: 6 },

          alignment: {
            options: ['left', 'center', 'right', 'justify'],
          },

          table: {
            contentToolbar: [
              'tableColumn', 'tableRow', 'mergeTableCells',
              'tableProperties', 'tableCellProperties',
            ],
          },
        });

        // Monta a toolbar do CKEditor no container do topo
        const toolbarContainer = document.getElementById('toolbar-bar');
        if (toolbarContainer && _instance.ui?.view?.toolbar?.element) {
          toolbarContainer.innerHTML = '';
          toolbarContainer.appendChild(_instance.ui.view.toolbar.element);
        }

        // Intercepta o comando de link do CKEditor para abrir o nosso Dropdown Popover!
        if (_instance.commands?.has('link')) {
          const origLinkCmd = _instance.commands.get('link');
          origLinkCmd.execute = () => {
            openLinkDropdown();
          };
        }

        if (_instance.plugins?.has('FileRepository')) {
          _instance.plugins.get('FileRepository').createUploadAdapter = loader => new UploadAdapter(loader);
        }

        _instance.model.document.on('change:data', () => {
          _scheduleWordCount();
          _scheduleAutosave();
        });

        window.MediaLibrary?.init(_instance);
        _scheduleWordCount();

        console.log('✅ [EditorApp] CKEditor 5 montado com link popover e preview interativo!');
        return _instance;

      } catch (ckErr) {
        console.warn('[EditorApp] Inicializando toolbar nativa vintage:', ckErr);
      }
    }

    _mountNativeRichToolbar(editorEl);
  }

  /* ══════════════════════════════════════════════════════════
     LISTENERS GLOBAIS DE LINK & INTERAÇÃO
  ══════════════════════════════════════════════════════════ */
  function _attachGlobalLinkListeners() {
    // Atalho global Ctrl+K para abrir o dropdown de link
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openLinkDropdown();
      } else if (e.key === 'Escape') {
        closeLinkDropdown();
        _hideLinkBalloon();
      }
    });

    // Enter no campo URL aplica o link diretamente
    document.getElementById('popover-link-url')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyLinkFromDropdown();
      }
    });

    // Intercepta cliques na barra de ferramentas ou no documento
    document.addEventListener('click', e => {
      // 1. Clique em botão de link
      const btn = e.target.closest('button, .ck-button, .tb-btn');
      if (btn) {
        const isLink =
          btn.id === 'tb-link-btn' ||
          btn.dataset.action === 'link' ||
          btn.getAttribute('data-cke-tooltip-text')?.toLowerCase().includes('link') ||
          btn.getAttribute('title')?.toLowerCase().includes('link') ||
          btn.innerText?.toLowerCase().includes('link');

        if (isLink) {
          e.preventDefault();
          e.stopPropagation();
          toggleLinkDropdown(btn);
          return;
        }
      }

      // 2. Clique em um Link dentro do documento (Permite abrir / Preview)
      const linkEl = e.target.closest('#editor a, .ck-content a, #page-sheet a');
      if (linkEl && !linkEl.closest('#link-preview-balloon')) {
        // Se segurou Ctrl ou Cmd, abre imediatamente em nova aba
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const href = linkEl.getAttribute('href');
          if (href) window.open(href, linkEl.target || '_blank');
          return;
        }

        // Caso contrário, mostra o balão flutuante de ações do link
        _showLinkBalloon(linkEl);
        return;
      }

      // 3. Clique fora do dropdown de link fecha o popover
      const popover = document.getElementById('toolbar-link-popover');
      if (popover && !popover.classList.contains('hidden')) {
        const isClickInside = popover.contains(e.target);
        if (!isClickInside) closeLinkDropdown();
      }

      // 4. Clique fora do balão de preview fecha o balão
      const balloon = document.getElementById('link-preview-balloon');
      if (balloon && !balloon.classList.contains('hidden')) {
        const isInsideBalloon = balloon.contains(e.target);
        if (!isInsideBalloon) _hideLinkBalloon();
      }
    }, true);

    // Hover sobre links no documento exibe o balão
    document.addEventListener('mouseover', e => {
      const linkEl = e.target.closest('#editor a, .ck-content a, #page-sheet a');
      if (linkEl && !linkEl.closest('#link-preview-balloon') && linkEl !== _balloonHoverEl) {
        _showLinkBalloon(linkEl);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     FLOATING LINK PREVIEW BALLOON (Acessar / Copiar / Editar)
  ══════════════════════════════════════════════════════════ */
  function _showLinkBalloon(linkEl) {
    if (!linkEl) return;
    _balloonHoverEl = linkEl;

    const balloon   = document.getElementById('link-preview-balloon');
    const hrefLink  = document.getElementById('balloon-link-href');
    const textSpan  = document.getElementById('balloon-link-text');
    if (!balloon || !hrefLink || !textSpan) return;

    const href = linkEl.getAttribute('href') || '#';
    hrefLink.setAttribute('href', href);
    textSpan.textContent = href.replace(/^https?:\/\//i, '').substring(0, 32) + (href.length > 35 ? '...' : '');

    const rect = linkEl.getBoundingClientRect();
    balloon.style.top  = `${Math.round(rect.bottom + 4)}px`;
    balloon.style.left = `${Math.max(10, Math.min(Math.round(rect.left), window.innerWidth - 360))}px`;

    balloon.classList.remove('hidden');
  }

  function _hideLinkBalloon() {
    _balloonHoverEl = null;
    const balloon = document.getElementById('link-preview-balloon');
    balloon?.classList.add('hidden');
  }

  function copyActiveLink() {
    if (_balloonHoverEl) {
      const href = _balloonHoverEl.getAttribute('href') || '';
      if (href && navigator.clipboard) {
        navigator.clipboard.writeText(href);
        window.showToast?.('📋 Link copiado para a área de transferência!', 'success');
      }
    }
    _hideLinkBalloon();
  }

  function editActiveLink() {
    if (_balloonHoverEl) {
      const targetLink = _balloonHoverEl;
      _hideLinkBalloon();
      openLinkDropdown(targetLink);
    }
  }

  function removeActiveLink() {
    if (_balloonHoverEl) {
      const text = _balloonHoverEl.textContent;
      const textNode = document.createTextNode(text);
      _balloonHoverEl.parentNode?.replaceChild(textNode, _balloonHoverEl);
      window.showToast?.('🗑️ Link desvinculado do texto', 'info');
      _scheduleAutosave();
    }
    _hideLinkBalloon();
  }

  /* ══════════════════════════════════════════════════════════
     TOOLBAR RICA NATIVA (Design System 1970s Underground Comix)
  ══════════════════════════════════════════════════════════ */
  function _mountNativeRichToolbar(editorEl) {
    editorEl.setAttribute('contenteditable', 'true');
    editorEl.style.outline = 'none';
    editorEl.style.cursor = 'text';

    const toolbarContainer = document.getElementById('toolbar-bar');
    if (!toolbarContainer) return;

    toolbarContainer.innerHTML = `
      <div class="rich-toolbar-native">
        <!-- Estilo de Parágrafo -->
        <select class="tb-select" id="tb-heading" onchange="document.execCommand('formatBlock', false, this.value)" title="Estilo de Parágrafo">
          <option value="p">Parágrafo</option>
          <option value="h1">Título 1 (H1)</option>
          <option value="h2">Título 2 (H2)</option>
          <option value="h3">Título 3 (H3)</option>
          <option value="h4">Título 4 (H4)</option>
          <option value="blockquote">Citação</option>
          <option value="pre">Bloco de Código</option>
        </select>

        <!-- Família da Fonte -->
        <select class="tb-select" id="tb-font" onchange="document.execCommand('fontName', false, this.value)" title="Família da Fonte">
          <option value="Merriweather, Georgia, serif">Merriweather (Serif)</option>
          <option value="Playfair Display, Georgia, serif">Playfair Display</option>
          <option value="EB Garamond, Garamond, serif">EB Garamond</option>
          <option value="Inter, Arial, sans-serif">Inter (Sans)</option>
          <option value="Montserrat, Arial, sans-serif">Montserrat</option>
          <option value="Roboto, Arial, sans-serif">Roboto</option>
          <option value="Special Elite, Courier New, serif">Special Elite</option>
          <option value="Courier Prime, monospace">Courier Prime</option>
          <option value="JetBrains Mono, monospace">JetBrains Mono</option>
          <option value="Bangers, Impact, cursive">Bangers (Comix)</option>
        </select>

        <!-- Tamanho -->
        <select class="tb-select tb-size" id="tb-size" onchange="document.execCommand('fontSize', false, this.value)" title="Tamanho">
          <option value="2">10pt</option>
          <option value="3" selected>11pt</option>
          <option value="4">14pt</option>
          <option value="5">18pt</option>
          <option value="6">24pt</option>
          <option value="7">36pt</option>
        </select>

        <div class="tb-sep"></div>

        <!-- Formatações Básicas -->
        <button type="button" class="tb-btn" onclick="document.execCommand('bold', false, null)" title="Negrito (Ctrl+B)"><b>B</b></button>
        <button type="button" class="tb-btn" onclick="document.execCommand('italic', false, null)" title="Itálico (Ctrl+I)"><i>I</i></button>
        <button type="button" class="tb-btn" onclick="document.execCommand('underline', false, null)" title="Sublinhado (Ctrl+U)"><u>U</u></button>
        <button type="button" class="tb-btn" onclick="document.execCommand('strikeThrough', false, null)" title="Tachado"><s>S</s></button>
        <button type="button" class="tb-btn" onclick="document.execCommand('subscript', false, null)" title="Subscrito">X₂</button>
        <button type="button" class="tb-btn" onclick="document.execCommand('superscript', false, null)" title="Sobrescrito">X²</button>

        <div class="tb-sep"></div>

        <!-- Cores -->
        <div class="tb-color-wrap" title="Cor do Texto">
          <label for="tb-color-picker" class="tb-color-label">A<span class="tb-color-bar" id="tb-color-bar"></span></label>
          <input type="color" id="tb-color-picker" value="#111111" onchange="document.execCommand('foreColor', false, this.value); document.getElementById('tb-color-bar').style.backgroundColor=this.value;" />
        </div>

        <div class="tb-color-wrap" title="Marca-Texto / Destaque">
          <label for="tb-bg-picker" class="tb-color-label">🖍️<span class="tb-color-bar" id="tb-bg-bar"></span></label>
          <input type="color" id="tb-bg-picker" value="#F4D03F" onchange="document.execCommand('hiliteColor', false, this.value); document.getElementById('tb-bg-bar').style.backgroundColor=this.value;" />
        </div>

        <div class="tb-sep"></div>

        <!-- Alinhamento -->
        <button type="button" class="tb-btn" onclick="document.execCommand('justifyLeft', false, null)" title="Alinhar à Esquerda">⬅</button>
        <button type="button" class="tb-btn" onclick="document.execCommand('justifyCenter', false, null)" title="Centralizar">⏺</button>
        <button type="button" class="tb-btn" onclick="document.execCommand('justifyRight', false, null)" title="Alinhar à Direita">➡</button>
        <button type="button" class="tb-btn" onclick="document.execCommand('justifyFull', false, null)" title="Justificar">☰</button>

        <div class="tb-sep"></div>

        <!-- Listas e Recuo -->
        <button type="button" class="tb-btn" onclick="document.execCommand('insertUnorderedList', false, null)" title="Lista com Marcadores">• Lista</button>
        <button type="button" class="tb-btn" onclick="document.execCommand('insertOrderedList', false, null)" title="Lista Numerada">1. Lista</button>
        <button type="button" class="tb-btn" onclick="document.execCommand('outdent', false, null)" title="Diminuir Recuo">⇤</button>
        <button type="button" class="tb-btn" onclick="document.execCommand('indent', false, null)" title="Aumentar Recuo">⇥</button>

        <div class="tb-sep"></div>

        <!-- Inserções: Link abre o Dropdown Popover Temático -->
        <button type="button" class="tb-btn" id="tb-link-btn" onclick="EditorApp.toggleLinkDropdown(this)" title="Inserir Hiperlink">🔗 Link</button>
        <button type="button" class="tb-btn" onclick="document.execCommand('insertHorizontalRule', false, null)" title="Linha Divisória">― Divisor</button>
        <button type="button" class="tb-btn" onclick="MediaLibrary.openDrawer()" title="Abrir Galeria de Mídias">🖼️ Mídia</button>

        <div class="tb-sep"></div>

        <!-- Desfazer / Refazer -->
        <button type="button" class="tb-btn" onclick="document.execCommand('undo', false, null)" title="Desfazer (Ctrl+Z)">↩</button>
        <button type="button" class="tb-btn" onclick="document.execCommand('redo', false, null)" title="Refazer (Ctrl+Y)">↪</button>
      </div>
    `;

    editorEl.addEventListener('input', () => {
      _scheduleWordCount();
      _scheduleAutosave();
    });

    window.MediaLibrary?.init(null);
    _scheduleWordCount();
    console.log('✅ [EditorApp] Toolbar Nativa montada com sucesso!');
  }

  /* ══════════════════════════════════════════════════════════
     DROPDOWN POPOVER DE HIPERLINK (Interface Direta na Toolbar)
  ══════════════════════════════════════════════════════════ */
  function toggleLinkDropdown(triggerBtn) {
    const popover = document.getElementById('toolbar-link-popover');
    if (!popover) return;

    if (!popover.classList.contains('hidden')) {
      closeLinkDropdown();
      return;
    }
    openLinkDropdown(triggerBtn);
  }

  function openLinkDropdown(triggerBtn) {
    const popover = document.getElementById('toolbar-link-popover');
    if (!popover) return;

    let selectedText = '';
    let currentHref = '';
    _savedRange = null;
    _activeLinkNode = null;

    if (_instance) {
      try {
        const selection = _instance.model.document.selection;
        if (!selection.isCollapsed) {
          const range = selection.getFirstRange();
          for (const item of range.getItems()) {
            if (item.textNode) selectedText += item.textNode.data;
          }
        }
        currentHref = _instance.commands.get('link')?.value || '';
      } catch {}
    }

    if (!selectedText) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        _savedRange = sel.getRangeAt(0).cloneRange();
        selectedText = sel.toString();

        let node = sel.anchorNode;
        while (node && node !== document.getElementById('editor')) {
          if (node.tagName === 'A') {
            _activeLinkNode = node;
            currentHref = node.getAttribute('href') || '';
            break;
          }
          node = node.parentNode;
        }
      }
    }

    if (triggerBtn && triggerBtn.tagName === 'A') {
      _activeLinkNode = triggerBtn;
      currentHref = triggerBtn.getAttribute('href') || '';
      selectedText = triggerBtn.innerText || selectedText;
    }

    const textInput  = document.getElementById('popover-link-text');
    const urlInput   = document.getElementById('popover-link-url');
    const blankCheck = document.getElementById('popover-link-blank');
    const removeBtn  = document.getElementById('popover-link-remove');

    if (textInput) textInput.value = selectedText || '';
    if (urlInput)  urlInput.value  = currentHref || 'https://';
    if (blankCheck) blankCheck.checked = true;
    if (removeBtn) removeBtn.style.display = currentHref ? 'inline-block' : 'none';

    // Posiciona logo abaixo do botão acionador ou da toolbar
    const btn = (triggerBtn && triggerBtn.tagName !== 'A') ? triggerBtn : (document.getElementById('tb-link-btn') || document.querySelector('[data-cke-tooltip-text*="link"]') || document.querySelector('.tb-btn[title*="Link"]'));
    if (btn) {
      const rect = btn.getBoundingClientRect();
      popover.style.top  = `${Math.round(rect.bottom + 6)}px`;
      popover.style.left = `${Math.max(10, Math.min(Math.round(rect.left - 40), window.innerWidth - 340))}px`;
    } else {
      popover.style.top  = `115px`;
      popover.style.left = `240px`;
    }

    popover.classList.remove('hidden');

    setTimeout(() => {
      if (textInput?.value) urlInput?.focus();
      else textInput?.focus();
    }, 60);
  }

  function closeLinkDropdown() {
    const popover = document.getElementById('toolbar-link-popover');
    if (popover) {
      popover.classList.add('hidden');
    }
  }

  function applyLinkFromDropdown() {
    const textInput  = document.getElementById('popover-link-text');
    const urlInput   = document.getElementById('popover-link-url');
    const blankCheck = document.getElementById('popover-link-blank');

    let text = textInput?.value?.trim() || '';
    let url  = urlInput?.value?.trim() || '';

    if (!url || url === 'https://' || url === 'http://') {
      window.showToast?.('⚠️ Digite uma URL válida para o link.', 'warning');
      urlInput?.focus();
      return;
    }

    if (!text) text = url;

    // Se o usuário não digitou http/https/mailto, adiciona https://
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url) && !url.startsWith('#')) {
      url = `https://${url}`;
    }

    const isBlank = blankCheck?.checked;

    // 1. Se CKEditor 5 estiver ativo
    if (_instance) {
      try {
        _instance.editing.view.focus();
        const selection = _instance.model.document.selection;
        if (selection.isCollapsed && text) {
          _instance.model.change(writer => {
            const linkedText = writer.createText(text, { linkHref: url });
            _instance.model.insertContent(linkedText);
          });
        } else {
          _instance.execute('link', url);
        }
        closeLinkDropdown();
        _scheduleAutosave();
        window.showToast?.('🔗 Link adicionado ao documento!', 'success');
        return;
      } catch (ckErr) {
        console.warn('[EditorApp] Inserção de link CKEditor fallback:', ckErr);
      }
    }

    // 2. Se modo nativo / DOM fallback
    if (_activeLinkNode) {
      _activeLinkNode.setAttribute('href', url);
      _activeLinkNode.textContent = text;
      if (isBlank) _activeLinkNode.setAttribute('target', '_blank');
      else _activeLinkNode.removeAttribute('target');
    } else {
      const editorEl = document.getElementById('editor');
      editorEl?.focus();

      if (_savedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(_savedRange);
      }

      const a = document.createElement('a');
      a.href = url;
      a.textContent = text;
      if (isBlank) a.target = '_blank';
      a.style.color = 'var(--burnt-orange)';
      a.style.textDecoration = 'underline';

      if (_savedRange && !_savedRange.collapsed) {
        _savedRange.deleteContents();
        _savedRange.insertNode(a);
      } else {
        document.execCommand('insertHTML', false, a.outerHTML);
      }
    }

    closeLinkDropdown();
    _scheduleAutosave();
    window.showToast?.('🔗 Link adicionado ao documento!', 'success');
  }

  function removeCurrentLink() {
    if (_instance) {
      try {
        _instance.execute('unlink');
      } catch {}
    }
    if (_activeLinkNode) {
      const textNode = document.createTextNode(_activeLinkNode.textContent);
      _activeLinkNode.parentNode?.replaceChild(textNode, _activeLinkNode);
    }
    closeLinkDropdown();
    _scheduleAutosave();
    window.showToast?.('🗑️ Link removido', 'info');
  }

  /* ══════════════════════════════════════════════════════════
     CONTAGEM DE PALAVRAS E ESTATÍSTICAS
  ══════════════════════════════════════════════════════════ */
  function _scheduleWordCount() {
    clearTimeout(_wcTimer);
    _wcTimer = setTimeout(_updateWordCount, 200);
  }

  function _updateWordCount() {
    const html  = getData() || '';
    const text  = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.replace(/\s/g, '').length;
    const readTime = Math.max(1, Math.ceil(words / 200));

    const wEl = document.getElementById('word-count');
    const cEl = document.getElementById('char-count');
    if (wEl) wEl.textContent = `${words} palavra${words !== 1 ? 's' : ''} (~${readTime} min)`;
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
        const storageKey = _getStorageKey();
        localStorage.setItem(storageKey, content);
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
    const sheet = document.getElementById('page-sheet');
    const editorEl = document.querySelector('.ck-editor__editable') || document.getElementById('editor');

    // Se houver imagens em modo livre no page-sheet, captura o conjunto completo unificado
    if (sheet) {
      const freeImgs = sheet.querySelectorAll(':scope > figure.image, :scope > img');
      if (freeImgs.length > 0) {
        const clone = sheet.cloneNode(true);
        clone.querySelectorAll('#img-resizer-overlay, .img-resizer-overlay, #img-drop-indicator, .img-drop-indicator, .resizer-toolbar, .resizer-handle').forEach(el => el.remove());
        return clone.innerHTML;
      }
    }

    if (_instance) {
      try {
        const data = _instance.getData();
        if (data && data.trim()) return data;
      } catch {}
    }

    if (editorEl && editorEl.innerHTML && editorEl.innerHTML.trim()) {
      return editorEl.innerHTML;
    }

    return sheet ? sheet.innerHTML : '';
  }

  function getInstance() {
    return _instance;
  }

  return {
    init,
    getData,
    getInstance,
    toggleLinkDropdown,
    openLinkDropdown,
    closeLinkDropdown,
    applyLinkFromDropdown,
    removeCurrentLink,
    copyActiveLink,
    editActiveLink,
    removeActiveLink
  };

})();
