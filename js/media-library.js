/**
 * media-library.js
 * Gaveta de Mídia — gerenciamento de pastas, upload, preview e inserção no editor
 * "The Midnight Bat-Tortoise" Edition
 */

const MediaLibrary = (() => {

  // Resolve dinamicamente a URL base da API
  const API = (window.location.origin && window.location.origin.startsWith('http'))
    ? window.location.origin
    : 'http://localhost:3000';

  const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|svg|bmp)$/i;
  const VIDEO_EXTS = /\.(mp4|webm|ogv|mov)$/i;

  /* ──────────────────────────────────────────────────────────
     Estado interno
  ────────────────────────────────────────────────────────── */
  let _editor       = null;      // Instância do CKEditor
  let _folder       = 'Imagens'; // Pasta ativa padrão
  let _allFiles     = [];        // Cache da listagem de arquivos
  let _isOpen       = false;     // Estado da gaveta lateral

  /* ──────────────────────────────────────────────────────────
     Inicialização
  ────────────────────────────────────────────────────────── */
  function init(editorInstance) {
    if (editorInstance) _editor = editorInstance;
    _setupDragDrop();
    _setupSearch();
    loadFolders();
  }

  /* ══════════════════════════════════════════════════════════
     DRAWER (Abrir / Fechar)
  ══════════════════════════════════════════════════════════ */
  function openDrawer() {
    const drawer = document.getElementById('media-drawer');
    const ws     = document.getElementById('workspace');
    const btn    = document.getElementById('media-library-btn');

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
    ws?.classList.remove('drawer-open');
    btn?.classList.remove('active');
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
      const res = await fetch(`${API}/api/media/folders`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const folders = data.folders || [];
      _renderFolders(folders);

      // Garante uma pasta selecionada
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
      const res = await fetch(`${API}/api/media/folder`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`${API}/api/media/folder`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`${API}/api/media/folder`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
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
      <input type="text" placeholder="Nome da pasta..." maxlength="60" />
      <button class="folder-confirm-btn" title="Confirmar">✓</button>
      <button class="folder-cancel-btn"  title="Cancelar">✕</button>`;

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

    try {
      const res = await fetch(`${API}/api/media/files?folder=${encodeURIComponent(targetFolder)}`);
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
      grid.innerHTML = '<div class="files-empty"><span class="files-empty-icon">📂</span>Nenhum arquivo nesta pasta.<br/>Clique na área acima para enviar!</div>';
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
    if (!confirm(`Excluir o arquivo "${filename}" do servidor?`)) return;
    try {
      const res = await fetch(`${API}/api/media/file`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ folder: folder || _folder, filename }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadFiles(folder || _folder);
      _toast('Arquivo excluído com sucesso!', 'success');
    } catch {
      _toast('Erro ao excluir arquivo', 'error');
    }
  }

  /* ══════════════════════════════════════════════════════════
     UPLOAD (Drag & Drop + File Input Direto)
  ══════════════════════════════════════════════════════════ */
  function triggerFileInput() {
    const fileInput = document.getElementById('media-file-input');
    if (fileInput) {
      fileInput.click();
    } else {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = true;
      inp.accept = 'image/*,video/*';
      inp.onchange = e => {
        const files = Array.from(e.target.files || []);
        files.forEach(uploadFile);
      };
      inp.click();
    }
  }

  function _setupDragDrop() {
    const zone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('media-file-input');

    if (fileInput) {
      fileInput.onchange = e => {
        const files = Array.from(e.target.files || []);
        files.forEach(uploadFile);
        fileInput.value = '';
      };
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

      zone.ondrop = e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length > 0) {
          files.forEach(uploadFile);
        }
      };

      zone.onclick = e => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
          triggerFileInput();
        }
      };
    }
  }

  async function uploadFile(file) {
    if (!file) return;

    const targetFolder = _folder || 'Imagens';

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
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
      fd.append('file', file);

      if (pb) pb.style.width = '70%';

      const res = await fetch(`${API}/api/media/upload?folder=${encodeURIComponent(targetFolder)}`, {
        method:  'POST',
        headers: { 'x-folder': encodeURIComponent(targetFolder) },
        body:    fd,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (pb) pb.style.width = '100%';
      setTimeout(() => {
        if (wrap) wrap.style.display = 'none';
        if (pb)   pb.style.width = '0%';
      }, 500);

      await loadFiles(targetFolder);
      _toast(`"${file.name}" salva no servidor!`, 'success');

      return data;
    } catch (err) {
      if (wrap) wrap.style.display = 'none';
      _toast(`Falha no upload de "${file.name}"`, 'error');
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

      // 1. Tenta método nativo do CKEditor 5
      if (editor && editor.model) {
        try {
          editor.editing?.view?.focus();

          // Tenta comando insertImage
          if (editor.commands?.get('insertImage')?.isEnabled !== false) {
            try {
              editor.execute('insertImage', { source: url });
              inserted = true;
            } catch (e1) {
              console.warn('[MediaLibrary] execute(insertImage) falhou:', e1);
            }
          }

          // Se comando não executou, insere direto no Model
          if (!inserted) {
            editor.model.change(writer => {
              const imageElement = writer.createElement('imageBlock', { src: url });
              editor.model.insertContent(imageElement, editor.model.document.selection);
              inserted = true;
            });
          }
        } catch (ckErr) {
          console.warn('[MediaLibrary] CKEditor model insert falhou:', ckErr);
        }
      }

      // 2. Fallback direto no DOM (HTML nativo ou se CKEditor estiver indisponível)
      if (!inserted) {
        const editableEl = document.querySelector('.ck-editor__editable') || document.getElementById('editor');
        if (editableEl) {
          editableEl.focus();
          const img = document.createElement('img');
          img.src = url;
          img.alt = 'Imagem inserida';
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          img.style.margin = '10px 0';
          img.style.display = 'block';

          // Insere na seleção atual do usuário se houver, ou no final do editor
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0 && editableEl.contains(sel.anchorNode)) {
            const range = sel.getRangeAt(0);
            range.collapse(false);
            range.insertNode(img);
            range.collapse(false);
          } else {
            editableEl.appendChild(img);
          }
          inserted = true;
        }
      }

      if (inserted) {
        _toast('✅ Imagem inserida no documento!', 'success');
      } else {
        _toast('Erro ao inserir imagem no documento', 'error');
      }

    } else {
      // Inserção de link/vídeo
      let inserted = false;
      if (editor && editor.model) {
        try {
          editor.editing?.view?.focus();
          editor.model.change(writer => {
            const pos = editor.model.document.selection.getFirstPosition();
            writer.insertText(` [Vídeo: ${url}] `, pos);
            inserted = true;
          });
        } catch (e) {
          console.warn(e);
        }
      }

      if (!inserted) {
        const editableEl = document.querySelector('.ck-editor__editable') || document.getElementById('editor');
        if (editableEl) {
          const p = document.createElement('p');
          p.innerHTML = `🎥 <a href="${url}" target="_blank" style="color:var(--burnt-orange)">Vídeo: ${url}</a>`;
          editableEl.appendChild(p);
          inserted = true;
        }
      }

      if (inserted) _toast('Referência de vídeo inserida!', 'info');
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
      debounce = setTimeout(() => filterFiles(inp.value), 180);
    });
  }

  /* ──────────────────────────────────────────────────────────
     Modo Offline / Feedback
  ────────────────────────────────────────────────────────── */
  function _showOfflineNotice() {
    const body = document.querySelector('.drawer-body');
    if (!body) return;
    const existing = body.querySelector('.drawer-offline-notice');
    if (existing) return;

    const notice = document.createElement('div');
    notice.className = 'drawer-offline-notice';
    notice.innerHTML = `⚠️ <strong>Serviço de Mídia Desconectado.</strong><br/>Certifique-se de que o servidor Node.js está rodando em <code>http://localhost:3000</code>.`;
    body.prepend(notice);
  }

  /* ──────────────────────────────────────────────────────────
     Utilitários
  ────────────────────────────────────────────────────────── */
  function _esc(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function _escAttr(str) {
    return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
    triggerFileInput,
    uploadFile,
    deleteFile,
    filterFiles,
    insertIntoEditor,
  };

})();

// Auto-inicializa os listeners do DOM assim que carregado
document.addEventListener('DOMContentLoaded', () => {
  MediaLibrary.init(null);
});
