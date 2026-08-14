/**
 * media-library.js
 * Gaveta de Mídia — gerenciamento de pastas, upload, preview e inserção no editor
 * Editor Web de Documentos
 */

const MediaLibrary = (() => {

  const API = 'http://localhost:3000';
  const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|svg|bmp)$/i;
  const VIDEO_EXTS = /\.(mp4|webm|ogv|mov)$/i;

  /* ──────────────────────────────────────────────────────────
     Estado interno
  ────────────────────────────────────────────────────────── */
  let _editor       = null;   // CKEditor instance
  let _folder       = null;   // pasta ativa
  let _allFiles     = [];     // cache da listagem
  let _isOpen       = false;

  /* ──────────────────────────────────────────────────────────
     Inicialização
  ────────────────────────────────────────────────────────── */
  function init(editorInstance) {
    _editor = editorInstance;
    _setupDragDrop();
    _setupSearch();
    loadFolders();
  }

  /* ══════════════════════════════════════════════════════════
     DRAWER (Abrir / Fechar)
  ══════════════════════════════════════════════════════════ */
  function openDrawer() {
    document.getElementById('media-drawer')?.classList.add('open');
    document.getElementById('workspace')?.classList.add('drawer-open');
    document.getElementById('media-library-btn')?.classList.add('active');
    _isOpen = true;
    if (!_folder) loadFolders();
  }

  function closeDrawer() {
    document.getElementById('media-drawer')?.classList.remove('open');
    document.getElementById('workspace')?.classList.remove('drawer-open');
    document.getElementById('media-library-btn')?.classList.remove('active');
    _isOpen = false;
  }

  function toggleDrawer() {
    _isOpen ? closeDrawer() : openDrawer();
  }

  /* ══════════════════════════════════════════════════════════
     PASTAS
  ══════════════════════════════════════════════════════════ */
  async function loadFolders() {
    try {
      const res  = await fetch(`${API}/api/media/folders`);
      const data = await res.json();
      _renderFolders(data.folders || []);

      // Seleciona automaticamente a primeira pasta
      if ((data.folders || []).length > 0 && !_folder) {
        selectFolder(data.folders[0].name);
      }
    } catch {
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
    _folder = name;
    document.querySelectorAll('.folder-item').forEach(el => {
      el.classList.toggle('active', el.dataset.name === name);
    });
    loadFiles(name);
  }

  async function createFolder(name) {
    const n = (name || '').trim();
    if (!n) return;
    try {
      await fetch(`${API}/api/media/folder`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: n }),
      });
      await loadFolders();
      selectFolder(n);
      _toast(`Pasta "${n}" criada!`, 'success');
    } catch { _toast('Erro ao criar pasta', 'error'); }
  }

  async function promptRename(oldName) {
    const newName = prompt(`Novo nome para "${oldName}":`, oldName);
    if (!newName || newName.trim() === oldName) return;
    try {
      await fetch(`${API}/api/media/folder`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ old: oldName, new: newName.trim() }),
      });
      if (_folder === oldName) _folder = newName.trim();
      await loadFolders();
      _toast('Pasta renomeada!', 'success');
    } catch { _toast('Erro ao renomear', 'error'); }
  }

  async function promptDelete(name) {
    if (!confirm(`Excluir a pasta "${name}" e todos os arquivos dentro dela?`)) return;
    try {
      await fetch(`${API}/api/media/folder`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name }),
      });
      if (_folder === name) _folder = null;
      await loadFolders();
      _toast('Pasta excluída', 'success');
    } catch { _toast('Erro ao excluir pasta', 'error'); }
  }

  function showCreateFolderInput() {
    const list = document.getElementById('folder-list');
    if (!list) return;
    if (list.querySelector('.folder-input-row')) {
      list.querySelector('.folder-input-row input')?.focus(); return;
    }

    const li = document.createElement('li');
    li.className = 'folder-input-row';
    li.innerHTML = `
      <input type="text" placeholder="Nome da pasta..." maxlength="60" />
      <button class="folder-confirm-btn" title="Confirmar">✓</button>
      <button class="folder-cancel-btn"  title="Cancelar">✕</button>`;

    list.appendChild(li);
    const inp = li.querySelector('input');
    inp.focus();

    const confirm_ = () => { createFolder(inp.value); li.remove(); };
    li.querySelector('.folder-confirm-btn').addEventListener('click', confirm_);
    li.querySelector('.folder-cancel-btn').addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  confirm_();
      if (e.key === 'Escape') li.remove();
    });
  }

  /* ══════════════════════════════════════════════════════════
     ARQUIVOS
  ══════════════════════════════════════════════════════════ */
  async function loadFiles(folder) {
    const grid = document.getElementById('files-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="files-empty"><span class="files-empty-icon">⏳</span>Carregando...</div>';

    try {
      const res  = await fetch(`${API}/api/media/files?folder=${encodeURIComponent(folder)}`);
      const data = await res.json();
      _allFiles = data.files || [];
      _renderFiles(_allFiles);
      const countEl = document.getElementById('files-count');
      if (countEl) countEl.textContent = `${_allFiles.length} arquivo${_allFiles.length !== 1 ? 's' : ''}`;
    } catch {
      grid.innerHTML = '<div class="files-empty"><span class="files-empty-icon">❌</span>Erro ao carregar arquivos.</div>';
    }
  }

  function _renderFiles(files) {
    const grid = document.getElementById('files-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!files.length) {
      grid.innerHTML = '<div class="files-empty"><span class="files-empty-icon">📂</span>Nenhum arquivo aqui.<br/>Arraste ou clique na zona de upload.</div>';
      return;
    }

    files.forEach(file => {
      const isVideo = VIDEO_EXTS.test(file.name);
      const div = document.createElement('div');
      div.className = `file-thumb${isVideo ? ' video' : ''}`;
      div.title = file.name;

      if (isVideo) {
        div.innerHTML = `
          <div class="thumb-icon-wrap">
            <span class="thumb-play-icon">▶️</span>
            <span class="video-filename">${_esc(file.name)}</span>
          </div>
          <div class="file-thumb-overlay">
            <button class="thumb-insert-btn" onclick="MediaLibrary.insertIntoEditor('${_escAttr(file.url)}', 'video')">▶ Inserir</button>
            <button class="thumb-delete-btn" onclick="MediaLibrary.deleteFile('${_escAttr(_folder)}','${_escAttr(file.name)}')">Excluir</button>
          </div>
          <div class="file-name-label">${_esc(file.name)}</div>`;
      } else {
        div.innerHTML = `
          <img src="${_escAttr(file.url)}" alt="${_escAttr(file.name)}" loading="lazy" />
          <div class="file-thumb-overlay">
            <button class="thumb-insert-btn" onclick="MediaLibrary.insertIntoEditor('${_escAttr(file.url)}', 'image')">+ Inserir</button>
            <button class="thumb-delete-btn" onclick="MediaLibrary.deleteFile('${_escAttr(_folder)}','${_escAttr(file.name)}')">Excluir</button>
          </div>
          <div class="file-name-label">${_esc(file.name)}</div>`;
      }

      grid.appendChild(div);
    });
  }

  function filterFiles(query) {
    if (!query) { _renderFiles(_allFiles); return; }
    const q = query.toLowerCase();
    _renderFiles(_allFiles.filter(f => f.name.toLowerCase().includes(q)));
  }

  async function deleteFile(folder, filename) {
    if (!confirm(`Excluir "${filename}"?`)) return;
    try {
      await fetch(`${API}/api/media/file`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ folder, filename }),
      });
      await loadFiles(folder);
      _toast('Arquivo excluído', 'success');
    } catch { _toast('Erro ao excluir arquivo', 'error'); }
  }

  /* ══════════════════════════════════════════════════════════
     UPLOAD
  ══════════════════════════════════════════════════════════ */
  function _setupDragDrop() {
    const zone = document.getElementById('upload-zone');
    if (!zone) return;

    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      [...e.dataTransfer.files].forEach(uploadFile);
    });

    zone.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = true;
      inp.accept = 'image/*,video/*';
      inp.onchange = e => [...e.target.files].forEach(uploadFile);
      inp.click();
    });
  }

  async function uploadFile(file) {
    if (!_folder) { _toast('Selecione uma pasta antes de fazer upload.', 'warning'); return; }
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      _toast(`Tipo não suportado: ${file.type}`, 'error'); return;
    }

    const pb   = document.getElementById('upload-progress-bar');
    const wrap = document.getElementById('upload-progress');
    if (wrap) wrap.style.display = 'block';
    if (pb)   pb.style.width = '30%';

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', _folder);

      if (pb) pb.style.width = '70%';
      const res = await fetch(`${API}/api/media/upload`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (pb) pb.style.width = '100%';
      setTimeout(() => {
        if (wrap) wrap.style.display = 'none';
        if (pb)   pb.style.width = '0%';
      }, 600);

      await loadFiles(_folder);
      _toast(`"${file.name}" enviado com sucesso!`, 'success');
    } catch (err) {
      if (wrap) wrap.style.display = 'none';
      _toast(`Falha ao enviar "${file.name}"`, 'error');
      console.error('[MediaLibrary] Upload error:', err);
    }
  }

  /* ══════════════════════════════════════════════════════════
     INSERIR NO EDITOR
  ══════════════════════════════════════════════════════════ */
  function insertIntoEditor(url, type = 'image') {
    if (!_editor) { _toast('Editor não iniciado', 'error'); return; }

    if (type === 'image') {
      _editor.model.change(writer => {
        const img = writer.createElement('imageBlock', { src: url });
        _editor.model.insertContent(img, _editor.model.document.selection);
      });
      _toast('Imagem inserida no documento!', 'success');
    } else {
      // Vídeo: insere como link anotado
      const text = `[Vídeo] ${url}`;
      _editor.model.change(writer => {
        const pos = _editor.model.document.selection.getFirstPosition();
        writer.insertText(text, pos);
      });
      _toast('Referência de vídeo inserida!', 'info');
    }
  }

  /* ──────────────────────────────────────────────────────────
     Busca
  ────────────────────────────────────────────────────────── */
  function _setupSearch() {
    const inp = document.getElementById('media-search-input');
    if (!inp) return;
    let debounce;
    inp.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => filterFiles(inp.value), 200);
    });
  }

  /* ──────────────────────────────────────────────────────────
     Modo offline
  ────────────────────────────────────────────────────────── */
  function _showOfflineNotice() {
    const body = document.querySelector('.drawer-body');
    if (!body) return;
    const existing = body.querySelector('.drawer-offline-notice');
    if (existing) return;

    const notice = document.createElement('div');
    notice.className = 'drawer-offline-notice';
    notice.innerHTML = `⚠️ <strong>Serviço offline.</strong><br/>Inicie o backend Node.js para usar a biblioteca de mídia.`;
    body.prepend(notice);
  }

  /* ──────────────────────────────────────────────────────────
     Utilitários
  ────────────────────────────────────────────────────────── */
  function _esc(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function _escAttr(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function _toast(msg, type) {
    window.showToast?.(msg, type);
  }

  /* ══════════════════════════════════════════════════════════
     API PÚBLICA
  ══════════════════════════════════════════════════════════ */
  return {
    init,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    loadFolders,
    loadFiles,
    selectFolder,
    createFolder,
    showCreateFolderInput,
    promptRename,
    promptDelete,
    uploadFile,
    deleteFile,
    filterFiles,
    insertIntoEditor,
  };

})();
