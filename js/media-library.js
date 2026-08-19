/**
 * media-library.js
 * Gaveta de Mídia Multi-Usuário — gerenciamento de pastas, upload, preview e inserção no editor
 * "The Midnight Bat-Tortoise" Edition (100% compatível com Navegação Normal e Abas Anônimas)
 */

const MediaLibrary = (() => {

  const API = (window.location.origin && window.location.origin.startsWith('http'))
    ? window.location.origin
    : 'http://localhost:3000';

  const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|svg|bmp|ico|jfif|tiff?|avif|heic)$/i;
  const VIDEO_EXTS = /\.(mp4|webm|ogv|mov|mkv)$/i;

  /* ──────────────────────────────────────────────────────────
     Gerenciamento de Sessão Determinística
  ────────────────────────────────────────────────────────── */
  let _sessionId = _initSession();

  function _generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  function _initSession() {
    let sid = '';
    try {
      sid = localStorage.getItem('wm_session_id') || '';
    } catch {}

    if (!sid) {
      const match = document.cookie.match(/wm_session_id=([a-zA-Z0-9_-]+)/i);
      if (match) sid = match[1];
    }

    if (!sid) {
      sid = _generateUUID();
      try {
        localStorage.setItem('wm_session_id', sid);
      } catch {}
    }
    return sid;
  }

  function getSessionId() {
    if (!_sessionId) _sessionId = _initSession();
    return _sessionId;
  }

  function setSessionId(id) {
    if (id && typeof id === 'string') {
      _sessionId = id;
      try {
        localStorage.setItem('wm_session_id', id);
      } catch {}
    }
  }

  function getHeaders(custom = {}) {
    const headers = { ...custom };
    const sid = getSessionId();
    if (sid) headers['x-session-id'] = sid;
    return headers;
  }

  /* ──────────────────────────────────────────────────────────
     Estado interno
  ────────────────────────────────────────────────────────── */
  let _editor       = null;      // Instância do CKEditor
  let _folder       = 'Imagens'; // Pasta ativa padrão
  let _allFiles     = [];        // Cache da listagem de arquivos
  let _isOpen       = false;     // Estado da gaveta lateral
  let _viewMode     = localStorage.getItem('wm_media_view_mode') || 'grid-md'; // 'grid-lg' | 'grid-md' | 'grid-sm' | 'list'
  let _drawerWidth  = parseInt(localStorage.getItem('wm_media_drawer_width') || '320', 10);
  let _isCollapsed  = localStorage.getItem('wm_media_folders_collapsed') === 'true';

  /* ──────────────────────────────────────────────────────────
     Inicialização
  ────────────────────────────────────────────────────────── */
  function init(editorInstance) {
    if (editorInstance) _editor = editorInstance;
    _setupDragDrop();
    _setupSearch();
    _setupResizer();
    _applyInitialLayout();
    loadFolders();
  }

  function _applyInitialLayout() {
    setDrawerWidth(_drawerWidth, false);
    setViewMode(_viewMode, false);
    if (_isCollapsed) {
      document.getElementById('folder-panel')?.classList.add('collapsed');
    }
  }

  /* ══════════════════════════════════════════════════════════
     CONTROLE DE LAYOUT & REDIMENSIONAMENTO DINÂMICO
  ══════════════════════════════════════════════════════════ */
  function setDrawerWidth(width, save = true) {
    const drawer = document.getElementById('media-drawer');
    const ws     = document.getElementById('workspace');
    if (!drawer) return;

    drawer.classList.remove('fullscreen');
    ws?.classList.remove('drawer-fullscreen');

    let w = typeof width === 'number' ? width : parseInt(width, 10);
    if (isNaN(w) || w < 300) w = 320;
    const maxW = Math.min(window.innerWidth - 60, 1100);
    w = Math.min(w, maxW);

    _drawerWidth = w;
    document.documentElement.style.setProperty('--drawer-width', `${w}px`);
    drawer.style.width = `${w}px`;

    // Ativa modo 2 colunas se largura >= 500px
    if (w >= 500) {
      drawer.classList.add('wide');
    } else {
      drawer.classList.remove('wide');
    }

    // Atualiza botões de preset ativos
    document.querySelectorAll('.drawer-size-btn').forEach(btn => {
      const bw = parseInt(btn.dataset.width, 10);
      btn.classList.toggle('active', Math.abs(bw - w) < 30);
    });

    if (save) {
      try { localStorage.setItem('wm_media_drawer_width', w.toString()); } catch {}
    }
  }

  function toggleFullscreen() {
    const drawer = document.getElementById('media-drawer');
    const ws     = document.getElementById('workspace');
    if (!drawer) return;

    const isFull = drawer.classList.toggle('fullscreen');
    ws?.classList.toggle('drawer-fullscreen', isFull);

    if (isFull) {
      drawer.classList.add('wide');
      document.querySelectorAll('.drawer-size-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.width === 'fullscreen');
      });
    } else {
      setDrawerWidth(_drawerWidth);
    }
  }

  function toggleFoldersCollapse() {
    const panel = document.getElementById('folder-panel');
    if (!panel) return;
    const collapsed = panel.classList.toggle('collapsed');
    _isCollapsed = collapsed;
    try { localStorage.setItem('wm_media_folders_collapsed', collapsed ? 'true' : 'false'); } catch {}
  }

  function setViewMode(mode, save = true) {
    _viewMode = mode || 'grid-md';
    const grid = document.getElementById('files-grid');
    if (grid) {
      grid.className = `files-grid view-${_viewMode}`;
    }

    // Atualiza botões do switcher
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === _viewMode);
    });

    if (save) {
      try { localStorage.setItem('wm_media_view_mode', _viewMode); } catch {}
    }

    if (_allFiles.length > 0) {
      _renderFiles(_allFiles);
    }
  }

  function _setupResizer() {
    const resizer = document.getElementById('media-drawer-resizer');
    const drawer  = document.getElementById('media-drawer');
    if (!resizer || !drawer) return;

    let startX = 0;
    let startW = 0;

    const onMouseMove = (e) => {
      const dx = startX - e.clientX;
      let newW = startW + dx;
      const minW = 300;
      const maxW = Math.min(window.innerWidth - 50, 1100);
      newW = Math.max(minW, Math.min(newW, maxW));
      setDrawerWidth(newW, false);
    };

    const onMouseUp = () => {
      drawer.classList.remove('is-resizing');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      try { localStorage.setItem('wm_media_drawer_width', _drawerWidth.toString()); } catch {}
    };

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startW = drawer.getBoundingClientRect().width;
      drawer.classList.add('is-resizing');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Duplo clique na alça alterna entre 320px e 720px
    resizer.addEventListener('dblclick', () => {
      if (_drawerWidth > 450) {
        setDrawerWidth(320);
      } else {
        setDrawerWidth(720);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     DRAWER (Abrir / Fechar)
  ══════════════════════════════════════════════════════════ */
  function openDrawer() {
    const drawer = document.getElementById('media-drawer');
    const ws     = document.getElementById('workspace');
    const btn    = document.getElementById('media-library-btn');

    _applyInitialLayout();

    drawer?.classList.add('open');
    ws?.classList.add('drawer-open');
    btn?.classList.add('active');
    _isOpen = true;

    loadFolders();
  }

  function closeDrawer() {
    const drawer = document.getElementById('media-drawer');
    const ws     = document.getElementById('workspace');
    const btn    = document.getElementById('media-library-btn');

    drawer?.classList.remove('open');
    drawer?.classList.remove('fullscreen');
    ws?.classList.remove('drawer-open');
    ws?.classList.remove('drawer-fullscreen');
    btn?.classList.remove('active');
    _isOpen = false;
  }

  function toggleDrawer() {
    _isOpen ? closeDrawer() : openDrawer();
  }

  /* ══════════════════════════════════════════════════════════
     PASTAS (Isoladas por Sessão)
  ══════════════════════════════════════════════════════════ */
  async function loadFolders() {
    try {
      const sid = getSessionId();
      const res = await fetch(`${API}/api/media/folders?session_id=${encodeURIComponent(sid)}`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.sessionId) setSessionId(data.sessionId);

      const folders = data.folders || [];
      _renderFolders(folders);

      if (folders.length > 0) {
        const found = folders.find(f => f.name === _folder);
        selectFolder(found ? found.name : folders[0].name);
      } else {
        selectFolder('Imagens');
      }
    } catch (err) {
      console.warn('[MediaLibrary] Falha ao carregar pastas:', err);
      _showOfflineNotice();
    }
  }

  function _renderFolders(folders) {
    const list = document.getElementById('folder-list');
    if (!list) return;
    list.innerHTML = '';

    folders.forEach(f => {
      const li = document.createElement('li');
      li.className = `folder-item${f.name === _folder ? ' active' : ''}`;
      li.dataset.name = f.name;

      li.innerHTML = `
        <span class="folder-item-icon">📁</span>
        <span class="folder-item-name">${_esc(f.name)}</span>
        <span class="folder-item-count">${f.count ?? 0}</span>
        <div class="folder-item-actions">
          <button class="folder-action-btn" title="Renomear" onclick="event.stopPropagation(); MediaLibrary.promptRename('${_escAttr(f.name)}')">✏️</button>
          <button class="folder-action-btn danger" title="Excluir" onclick="event.stopPropagation(); MediaLibrary.promptDelete('${_escAttr(f.name)}')">🗑</button>
        </div>`;

      li.addEventListener('click', () => selectFolder(f.name));
      list.appendChild(li);
    });
  }

  function selectFolder(name) {
    _folder = name || 'Imagens';
    document.querySelectorAll('.folder-item').forEach(el => {
      el.classList.toggle('active', el.dataset.name === _folder);
    });
    loadFiles(_folder);
  }

  async function createFolder(name) {
    const n = (name || '').trim();
    if (!n) return;
    try {
      const sid = getSessionId();
      const res = await fetch(`${API}/api/media/folder?session_id=${encodeURIComponent(sid)}`, {
        method:  'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body:    JSON.stringify({ name: n }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadFolders();
      selectFolder(n);
      _toast(`Pasta "${n}" criada com sucesso!`, 'success');
    } catch {
      _toast('Erro ao criar pasta no servidor', 'error');
    }
  }

  async function promptRename(oldName) {
    const newName = prompt(`Novo nome para a pasta "${oldName}":`, oldName);
    if (!newName || newName.trim() === oldName) return;
    try {
      const sid = getSessionId();
      const res = await fetch(`${API}/api/media/folder?session_id=${encodeURIComponent(sid)}`, {
        method:  'PATCH',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body:    JSON.stringify({ old: oldName, new: newName.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (_folder === oldName) _folder = newName.trim();
      await loadFolders();
      _toast('Pasta renomeada!', 'success');
    } catch {
      _toast('Erro ao renomear pasta', 'error');
    }
  }

  async function promptDelete(name) {
    if (!confirm(`Excluir a pasta "${name}" e todos os arquivos dentro dela?`)) return;
    try {
      const sid = getSessionId();
      const res = await fetch(`${API}/api/media/folder?session_id=${encodeURIComponent(sid)}`, {
        method:  'DELETE',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body:    JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (_folder === name) _folder = 'Imagens';
      await loadFolders();
      _toast('Pasta excluída!', 'success');
    } catch {
      _toast('Erro ao excluir pasta', 'error');
    }
  }

  function showCreateFolderInput() {
    const list = document.getElementById('folder-list');
    if (!list) return;
    if (list.querySelector('.folder-input-row')) {
      list.querySelector('.folder-input-row input')?.focus();
      return;
    }

    const li = document.createElement('li');
    li.className = 'folder-input-row';
    li.innerHTML = `
      <span style="font-size:14px;">📁</span>
      <input type="text" placeholder="Nome da pasta..." maxlength="30" />
      <button class="folder-confirm-btn" title="Criar">✓</button>
      <button class="folder-cancel-btn" title="Cancelar">✕</button>`;

    list.appendChild(li);
    const inp = li.querySelector('input');
    inp.focus();

    const confirm_ = () => {
      const val = inp.value.trim();
      if (val) createFolder(val);
      li.remove();
    };

    li.querySelector('.folder-confirm-btn').addEventListener('click', confirm_);
    li.querySelector('.folder-cancel-btn').addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  confirm_();
      if (e.key === 'Escape') li.remove();
    });
  }

  /* ══════════════════════════════════════════════════════════
     ARQUIVOS (Listagem & Ações)
  ══════════════════════════════════════════════════════════ */
  async function loadFiles(folder) {
    const grid = document.getElementById('files-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="files-empty"><span class="files-empty-icon">⏳</span>Carregando...</div>';

    const targetFolder = folder || _folder || 'Imagens';
    const sid = getSessionId();

    try {
      const res = await fetch(`${API}/api/media/files?folder=${encodeURIComponent(targetFolder)}&session_id=${encodeURIComponent(sid)}`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _allFiles = data.files || [];
      _renderFiles(_allFiles);

      const countEl = document.getElementById('files-count');
      if (countEl) {
        countEl.textContent = `${_allFiles.length} arquivo${_allFiles.length !== 1 ? 's' : ''}`;
      }
    } catch {
      grid.innerHTML = '<div class="files-empty"><span class="files-empty-icon">❌</span>Não foi possível carregar arquivos.</div>';
    }
  }

  function _renderFiles(files) {
    const grid = document.getElementById('files-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!files.length) {
      grid.innerHTML = '<div class="files-empty"><span class="files-empty-icon">📂</span>Nenhum arquivo nesta pasta.<br/>Arraste uma foto aqui para enviar!</div>';
      return;
    }

    files.forEach(file => {
      const isVideo = VIDEO_EXTS.test(file.name);
      const div = document.createElement('div');
      div.className = `file-thumb${isVideo ? ' video' : ''}`;
      div.title = file.name;

      if (_viewMode === 'list') {
        div.innerHTML = `
          ${isVideo ? `<video src="${_escAttr(file.url)}" muted preload="metadata"></video>` : `<img src="${_escAttr(file.url)}" alt="${_escAttr(file.name)}" loading="lazy" />`}
          <div class="file-thumb-footer">
            <span class="file-thumb-name">${_esc(file.name)}</span>
          </div>
          <div class="file-thumb-overlay">
            <button class="thumb-btn insert" title="Inserir no documento" onclick="event.stopPropagation(); MediaLibrary.insertIntoEditor('${_escAttr(file.url)}', '${isVideo ? 'video' : 'image'}')">
              <span class="btn-icon">➕</span>
              <span class="btn-txt">Inserir</span>
            </button>
            <button class="thumb-btn danger" title="Excluir do servidor" onclick="event.stopPropagation(); MediaLibrary.deleteFile('${_escAttr(file.name)}')">
              <span class="btn-icon">🗑️</span>
              <span class="btn-txt">Excluir</span>
            </button>
          </div>
        `;
      } else if (isVideo) {
        div.innerHTML = `
          <video src="${_escAttr(file.url)}" muted preload="metadata"></video>
          <div class="video-badge">▶ VÍDEO</div>
          <div class="file-thumb-overlay">
            <button class="thumb-btn insert" title="Inserir no documento" onclick="event.stopPropagation(); MediaLibrary.insertIntoEditor('${_escAttr(file.url)}', 'video')">
              <span class="btn-icon">➕</span>
              <span class="btn-txt">Inserir</span>
            </button>
            <button class="thumb-btn danger" title="Excluir do servidor" onclick="event.stopPropagation(); MediaLibrary.deleteFile('${_escAttr(file.name)}')">
              <span class="btn-icon">🗑️</span>
              <span class="btn-txt">Excluir</span>
            </button>
          </div>
          <div class="file-thumb-footer" title="${_escAttr(file.name)}">
            <span class="file-thumb-name">${_esc(file.name)}</span>
          </div>`;
      } else {
        div.innerHTML = `
          <img src="${_escAttr(file.url)}" alt="${_escAttr(file.name)}" loading="lazy" />
          <div class="file-thumb-overlay">
            <button class="thumb-btn insert" title="Inserir no documento" onclick="event.stopPropagation(); MediaLibrary.insertIntoEditor('${_escAttr(file.url)}', 'image')">
              <span class="btn-icon">➕</span>
              <span class="btn-txt">Inserir</span>
            </button>
            <button class="thumb-btn danger" title="Excluir do servidor" onclick="event.stopPropagation(); MediaLibrary.deleteFile('${_escAttr(file.name)}')">
              <span class="btn-icon">🗑️</span>
              <span class="btn-txt">Excluir</span>
            </button>
          </div>
          <div class="file-thumb-footer" title="${_escAttr(file.name)}">
            <span class="file-thumb-name">${_esc(file.name)}</span>
          </div>`;
      }

      div.addEventListener('click', () => {
        insertIntoEditor(file.url, isVideo ? 'video' : 'image');
      });

      grid.appendChild(div);
    });
  }

  async function deleteFile(filename, folder) {
    if (!confirm(`Excluir "${filename}" permanentemente do servidor?`)) return;
    try {
      const sid = getSessionId();
      const res = await fetch(`${API}/api/media/file?session_id=${encodeURIComponent(sid)}`, {
        method:  'DELETE',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body:    JSON.stringify({ folder: folder || _folder, filename }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadFiles(folder || _folder);
      await loadFolders();
      _toast('Arquivo excluído com sucesso!', 'success');
    } catch {
      _toast('Erro ao excluir arquivo', 'error');
    }
  }

  /* ══════════════════════════════════════════════════════════
     UPLOAD (Seguro, Multi-Tenant com Drag & Drop e Suporte Anônimo)
  ══════════════════════════════════════════════════════════ */
  async function handleFileSelect(e) {
    const files = Array.from(e.target?.files || e.dataTransfer?.files || []);
    if (!files.length) return;
    for (const file of files) {
      await uploadFile(file);
    }
    if (e.target && e.target.tagName === 'INPUT') {
      e.target.value = '';
    }
  }

  function triggerFileInput() {
    const fileInput = document.getElementById('media-file-input');
    if (fileInput) {
      fileInput.click();
    } else {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = true;
      inp.accept = 'image/*,video/*,.jfif,.heic,.avif,.webp,.svg,.png,.jpg,.jpeg';
      inp.onchange = async e => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
          await uploadFile(file);
        }
      };
      inp.click();
    }
  }

  function _setupDragDrop() {
    const zone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('media-file-input');

    if (fileInput) {
      fileInput.onchange = handleFileSelect;
    }

    if (zone) {
      zone.ondragover = e => {
        e.preventDefault();
        zone.classList.add('drag-over');
      };

      zone.ondragleave = e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
      };

      zone.ondrop = async e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        await handleFileSelect(e);
      };

      zone.onclick = e => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL' && e.target.tagName !== 'BUTTON') {
          triggerFileInput();
        }
      };
    }
  }

  async function uploadFile(file) {
    if (!file) return;

    const targetFolder = _folder || 'Imagens';
    const sid = getSessionId();

    const isAllowed =
      (file.type && (file.type.startsWith('image/') || file.type.startsWith('video/'))) ||
      IMAGE_EXTS.test(file.name) ||
      VIDEO_EXTS.test(file.name);

    if (!isAllowed) {
      _toast(`Formato não suportado: ${file.name}`, 'error');
      return;
    }

    const pb   = document.getElementById('upload-progress-bar');
    const wrap = document.getElementById('upload-progress');
    if (wrap) wrap.style.display = 'block';
    if (pb)   pb.style.width = '30%';

    try {
      const fd = new FormData();
      fd.append('folder', targetFolder);
      fd.append('session_id', sid);
      fd.append('file', file);

      if (pb) pb.style.width = '70%';

      const res = await fetch(`${API}/api/media/upload?folder=${encodeURIComponent(targetFolder)}&session_id=${encodeURIComponent(sid)}`, {
        method:      'POST',
        headers:     getHeaders({ 'x-folder': encodeURIComponent(targetFolder) }),
        credentials: 'include',
        body:        fd,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const data = await res.json();

      if (data.sessionId) setSessionId(data.sessionId);

      if (pb) pb.style.width = '100%';
      setTimeout(() => {
        if (wrap) wrap.style.display = 'none';
        if (pb)   pb.style.width = '0%';
      }, 400);

      await loadFiles(targetFolder);
      await loadFolders();
      _toast(`"${file.name}" salva com segurança!`, 'success');

      return data;
    } catch (err) {
      if (wrap) wrap.style.display = 'none';
      _toast(`Falha no upload: ${err.message}`, 'error');
      console.error('[MediaLibrary] Erro de upload:', err);
    }
  }

  /* ══════════════════════════════════════════════════════════
     INSERIR NO DOCUMENTO (Multi-engine: CKEditor 5 + Fallback)
  ══════════════════════════════════════════════════════════ */
  function insertIntoEditor(url, type = 'image') {
    const editor = _editor || window.EditorApp?.getInstance();

    if (type === 'image') {
      let inserted = false;

      // 1. Tenta comando oficial de imagem do CKEditor 5
      if (editor && typeof editor.execute === 'function') {
        try {
          editor.editing.view.focus();
          editor.execute('insertImage', { source: url });
          inserted = true;
        } catch {
          try {
            editor.model.change(writer => {
              const imageElement = writer.createElement('imageBlock', { src: url });
              editor.model.insertContent(imageElement, editor.model.document.selection);
            });
            inserted = true;
          } catch {}
        }
      }

      // 2. Fallback robusto no DOM (Editor Nativo Vintage)
      if (!inserted) {
        const editorEl = document.querySelector('.ck-editor__editable') || document.getElementById('editor');
        if (editorEl) {
          editorEl.focus();

          const figure = document.createElement('figure');
          figure.className = 'image image-style-align-center';
          figure.style.margin = '16px auto';
          figure.style.display = 'table';
          figure.style.maxWidth = '100%';

          const img = document.createElement('img');
          img.src = url;
          img.alt = 'Imagem inserida';
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          img.style.display = 'block';

          figure.appendChild(img);

          // Tenta inserir na posição da seleção do usuário
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0 && editorEl.contains(sel.anchorNode)) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(figure);
          } else {
            editorEl.appendChild(figure);
          }

          editorEl.dispatchEvent(new Event('input', { bubbles: true }));
          inserted = true;
        }
      }

      if (inserted) {
        _toast('Imagem inserida na folha!', 'success');
        setTimeout(() => {
          const addedImg = document.querySelector(`img[src="${url}"]`);
          if (addedImg && window.ImageResizer) {
            window.ImageResizer.selectImage(addedImg);
          }
        }, 150);
      } else {
        _toast('Clique na folha para posicionar o cursor antes de inserir.', 'warning');
      }

    } else {
      // Inserção de Vídeo
      const editorEl = document.querySelector('.ck-editor__editable') || document.getElementById('editor');
      if (editorEl) {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.style.maxWidth = '100%';
        video.style.margin = '10px 0';
        editorEl.appendChild(video);
        editorEl.dispatchEvent(new Event('input', { bubbles: true }));
        _toast('Vídeo inserido no documento!', 'success');
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     BUSCA EM TEMPO REAL
  ══════════════════════════════════════════════════════════ */
  function _setupSearch() {
    const input = document.getElementById('media-search-input') || document.getElementById('media-search');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        _renderFiles(_allFiles);
        return;
      }
      const filtered = _allFiles.filter(f => f.name.toLowerCase().includes(q));
      _renderFiles(filtered);
    });
  }

  function _showOfflineNotice() {
    const grid = document.getElementById('files-grid');
    if (grid) {
      grid.innerHTML = '<div class="files-empty"><span class="files-empty-icon">🔌</span>Servidor local desconectado.<br/><small>Inicie com node server.js</small></div>';
    }
  }

  function _toast(msg, type) {
    window.showToast?.(msg, type);
  }

  function _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _escAttr(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Auto-inicialização caso o DOM já esteja pronto
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        _setupDragDrop();
        _setupSearch();
        loadFolders();
      });
    } else {
      setTimeout(() => {
        _setupDragDrop();
        _setupSearch();
        loadFolders();
      }, 50);
    }
  }

  return {
    init,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    setDrawerWidth,
    toggleFullscreen,
    setViewMode,
    toggleFoldersCollapse,
    loadFolders,
    selectFolder,
    createFolder,
    showCreateFolderInput,
    promptRename,
    promptDelete,
    loadFiles,
    uploadFile,
    deleteFile,
    triggerFileInput,
    handleFileSelect,
    insertIntoEditor,
    getSessionId,
  };

})();
