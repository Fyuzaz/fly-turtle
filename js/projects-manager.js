/**
 * projects-manager.js
 * Gerenciador de Múltiplos Projetos e Abas (Footer Tabs)
 * "The Midnight Bat-Tortoise" Edition
 */

const ProjectsManager = (() => {

  const STORAGE_PROJECTS_KEY = 'wm_user_projects';
  const STORAGE_ACTIVE_ID_KEY = 'wm_active_project_id';

  let _projects = [];
  let _activeProjectId = null;
  let _isSwitching = false;

  const DEFAULT_CONTENT = `
    <h2>Novo Documento</h2>
    <p>Comece a redigir seu projeto aqui. Use a barra de ferramentas para formatar o texto ou adicione imagens e mídias.</p>
  `.trim();

  /* ══════════════════════════════════════════════════════════
     INICIALIZAÇÃO E CARREGAMENTO
  ══════════════════════════════════════════════════════════ */
  function init() {
    _loadFromStorage();
    _renderTabs();
    _attachEventListeners();
    return getActiveProject();
  }

  function _sanitizeContent(raw) {
    if (!raw || typeof raw !== 'string') return DEFAULT_CONTENT;
    const temp = document.createElement('div');
    temp.innerHTML = raw.trim();
    temp.querySelectorAll('#img-resizer-overlay, .img-resizer-overlay, #img-drop-indicator, .img-drop-indicator, .resizer-toolbar, .resizer-handle, .resizer-move-handle, .resizer-badge, .link-preview-balloon, .toolbar-link-popover').forEach(el => el.remove());

    let changed = true;
    let guard = 0;
    while (changed && guard < 10) {
      guard++;
      changed = false;
      const nested = temp.querySelector('#editor, .ck-editor__editable, .ck-content');
      if (nested) {
        if (nested.parentElement === temp && temp.children.length === 1) {
          temp.innerHTML = nested.innerHTML;
          changed = true;
        } else if (nested.id === 'editor') {
          while (nested.firstChild) {
            nested.parentNode.insertBefore(nested.firstChild, nested);
          }
          nested.remove();
          changed = true;
        }
      }
    }
    return temp.innerHTML.trim() || DEFAULT_CONTENT;
  }

  function _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_PROJECTS_KEY);
      if (raw) {
        _projects = JSON.parse(raw);
        // Sanitiza todos os projetos carregados
        if (Array.isArray(_projects)) {
          _projects.forEach(p => {
            p.content = _sanitizeContent(p.content);
          });
        }
      }
    } catch (e) {
      console.warn('[ProjectsManager] Falha ao carregar projetos salvos:', e);
      _projects = [];
    }

    if (!Array.isArray(_projects) || _projects.length === 0) {
      // Migração suave de documento pré-existente no localStorage se houver
      const legacyContent = localStorage.getItem('wm_editor_content') ||
                            localStorage.getItem('wm_doc_default_main');
      const legacyFormat = localStorage.getItem('wm_page_format') || 'A4';
      const legacyLandscape = localStorage.getItem('wm_landscape') === 'true';

      const initialProject = {
        id: 'proj_' + Date.now(),
        name: 'Projeto Principal',
        content: _sanitizeContent(legacyContent),
        format: legacyFormat,
        landscape: legacyLandscape,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      _projects = [initialProject];
      _activeProjectId = initialProject.id;
      _saveToStorage();
    } else {
      const savedActiveId = localStorage.getItem(STORAGE_ACTIVE_ID_KEY);
      if (savedActiveId && _projects.some(p => p.id === savedActiveId)) {
        _activeProjectId = savedActiveId;
      } else {
        _activeProjectId = _projects[0].id;
      }
    }
  }

  function _saveToStorage() {
    try {
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(_projects));
      if (_activeProjectId) {
        localStorage.setItem(STORAGE_ACTIVE_ID_KEY, _activeProjectId);
      }
    } catch (e) {
      console.warn('[ProjectsManager] Falha ao salvar projetos:', e);
    }
  }

  /* ══════════════════════════════════════════════════════════
     PROJETO ATIVO E PERSISTÊNCIA DE ESTADO
  ══════════════════════════════════════════════════════════ */
  function getActiveProject() {
    return _projects.find(p => p.id === _activeProjectId) || _projects[0] || null;
  }

  function getAllProjects() {
    return [..._projects];
  }

  /**
   * Salva o estado atual do editor na aba ativa
   */
  function saveCurrentState() {
    if (_isSwitching || !_activeProjectId) return;

    const project = getActiveProject();
    if (!project) return;

    const docNameInput = document.getElementById('doc-name-input');
    const currentName = docNameInput?.value?.trim() || project.name || 'Sem título';

    let currentContent = '';
    if (window.EditorApp && typeof window.EditorApp.getData === 'function') {
      currentContent = window.EditorApp.getData();
    } else {
      const editorEl = document.querySelector('.ck-editor__editable') || document.getElementById('editor');
      currentContent = editorEl ? editorEl.innerHTML : (project.content || '');
    }

    const currentFmt = window.PageFormats?.getCurrent() || { name: 'A4', landscape: false };

    project.name = currentName;
    project.content = currentContent;
    project.format = currentFmt.name || 'A4';
    project.landscape = !!currentFmt.landscape;
    project.margins = currentFmt.margins || { top: 25, bottom: 25, left: 20, right: 20, name: 'Normal' };
    project.pageMarginsMap = currentFmt.pageMarginsMap || { 1: { ...project.margins } };
    project.updatedAt = new Date().toISOString();

    _saveToStorage();
  }

  /* ══════════════════════════════════════════════════════════
     OPERAÇÕES DE ABAS / PROJETOS
  ══════════════════════════════════════════════════════════ */

  /**
   * Cria um novo projeto e o torna ativo
   */
  function createProject(name = null, initialContent = null, format = 'A4', landscape = false, margins = null, pageMarginsMap = null) {
    saveCurrentState();

    const count = _projects.length + 1;
    const projName = name || `Projeto ${count}`;

    const newProject = {
      id: 'proj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: projName,
      content: initialContent || `<h2>${projName}</h2><p>Comece a editar seu novo documento aqui...</p>`,
      format: format,
      landscape: landscape,
      margins: margins || window.PageFormats?.getMargins() || { top: 25, bottom: 25, left: 20, right: 20, name: 'Normal' },
      pageMarginsMap: pageMarginsMap || window.PageFormats?.getPageMarginsMap?.() || { 1: { top: 25, bottom: 25, left: 20, right: 20, name: 'Normal' } },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    _projects.push(newProject);
    _saveToStorage();
    switchProject(newProject.id);

    window.showToast?.(`✨ "${projName}" criado com sucesso!`, 'success');
    return newProject;
  }

  /**
   * Duplica um projeto existente
   */
  function duplicateProject(projectId) {
    saveCurrentState();
    const source = _projects.find(p => p.id === projectId) || getActiveProject();
    if (!source) return;

    const copyName = `${source.name} (Cópia)`;
    const newProject = {
      id: 'proj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: copyName,
      content: source.content,
      format: source.format,
      landscape: source.landscape,
      margins: source.margins ? { ...source.margins } : { top: 25, bottom: 25, left: 20, right: 20, name: 'Normal' },
      pageMarginsMap: source.pageMarginsMap ? JSON.parse(JSON.stringify(source.pageMarginsMap)) : { 1: { top: 25, bottom: 25, left: 20, right: 20, name: 'Normal' } },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const index = _projects.findIndex(p => p.id === source.id);
    _projects.splice(index + 1, 0, newProject);
    _saveToStorage();
    switchProject(newProject.id);

    window.showToast?.(`📋 Projeto duplicado como "${copyName}"`, 'info');
  }

  /**
   * Alterna para outro projeto ativo
   */
  function switchProject(targetId) {
    if (!targetId || targetId === _activeProjectId && !_isSwitching) {
      // Se for a mesma aba e já carregada, apenas renderiza visual
      _renderTabs();
      return;
    }

    const targetProject = _projects.find(p => p.id === targetId);
    if (!targetProject) return;

    // Salva o projeto anterior antes de mudar
    if (_activeProjectId && !_isSwitching) {
      saveCurrentState();
    }

    _isSwitching = true;
    _activeProjectId = targetId;
    _saveToStorage();

    // 1. Atualiza Nome do Documento no Header
    const docNameInput = document.getElementById('doc-name-input');
    if (docNameInput) {
      docNameInput.value = targetProject.name || 'Novo Documento';
    }
    document.title = `${targetProject.name || 'Documento'} — WebDoc`;

    // 2. Aplica Formato, Orientação e Margens de Página
    if (window.PageFormats) {
      if (typeof window.PageFormats.setFormatAndOrientation === 'function') {
        window.PageFormats.setFormatAndOrientation(
          targetProject.format || 'A4',
          !!targetProject.landscape,
          targetProject.margins,
          targetProject.pageMarginsMap
        );
      } else {
        window.PageFormats.applyFormat(targetProject.format || 'A4');
      }
    }

    // 3. Atualiza Conteúdo no Editor
    const content = targetProject.content || DEFAULT_CONTENT;
    if (window.EditorApp && typeof window.EditorApp.setContent === 'function') {
      window.EditorApp.setContent(content);
    } else {
      const editorEl = document.getElementById('editor');
      if (editorEl) editorEl.innerHTML = content;
    }

    // 4. Notifica o Image Resizer para atualizar ouvintes de mídias
    if (window.ImageResizer && typeof window.ImageResizer.refresh === 'function') {
      setTimeout(() => window.ImageResizer.refresh(), 100);
    }

    // 5. Renderiza a barra de abas atualizada
    _renderTabs();

    _isSwitching = false;
  }

  /**
   * Fecha / Exclui um projeto
   */
  function closeProject(projectId, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    const targetIndex = _projects.findIndex(p => p.id === projectId);
    if (targetIndex === -1) return;

    const targetProject = _projects[targetIndex];

    if (_projects.length === 1) {
      // Se for o único, cria um novo em branco ou limpa
      if (confirm(`Deseja reiniciar "${targetProject.name}" como um novo documento em branco?`)) {
        targetProject.name = 'Novo Documento';
        targetProject.content = DEFAULT_CONTENT;
        targetProject.format = 'A4';
        targetProject.landscape = false;
        targetProject.updatedAt = new Date().toISOString();
        _saveToStorage();
        switchProject(targetProject.id);
        window.showToast?.('Projeto reiniciado em branco', 'info');
      }
      return;
    }

    const confirmed = confirm(`Deseja realmente fechar o projeto "${targetProject.name}"?`);
    if (!confirmed) return;

    _projects.splice(targetIndex, 1);

    // Se o projeto fechado era o ativo, muda para o adjacente
    if (_activeProjectId === projectId) {
      const newIndex = Math.max(0, targetIndex - 1);
      _activeProjectId = _projects[newIndex].id;
    }

    _saveToStorage();
    switchProject(_activeProjectId);
    window.showToast?.(`🗑️ "${targetProject.name}" fechado`, 'info');
  }

  /**
   * Atualiza o nome da aba ativa quando o usuário edita o input do header
   */
  function updateActiveProjectName(newName) {
    const project = getActiveProject();
    if (!project) return;

    const clean = (newName || '').trim() || 'Sem título';
    project.name = clean;
    project.updatedAt = new Date().toISOString();
    _saveToStorage();

    // Atualiza apenas o texto da aba no DOM para máxima fluidez
    const activeTabEl = document.querySelector(`.project-tab-item[data-id="${project.id}"] .tab-title`);
    if (activeTabEl) {
      activeTabEl.textContent = clean;
    }
  }

  /* ══════════════════════════════════════════════════════════
     RENDERIZAÇÃO DAS ABAS NO FOOTER
  ══════════════════════════════════════════════════════════ */
  function _renderTabs() {
    const listContainer = document.getElementById('project-tabs-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    _projects.forEach((proj, idx) => {
      const isActive = (proj.id === _activeProjectId);
      const tabEl = document.createElement('div');
      tabEl.className = `project-tab-item ${isActive ? 'active' : ''}`;
      tabEl.dataset.id = proj.id;
      tabEl.setAttribute('role', 'tab');
      tabEl.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tabEl.setAttribute('tabindex', '0');
      tabEl.title = `${proj.name} (${proj.format}${proj.landscape ? ' Paisagem' : ''}) — Clique para alternar`;

      tabEl.innerHTML = `
        <span class="tab-icon">📄</span>
        <span class="tab-title">${_escapeHtml(proj.name)}</span>
        <span class="tab-format-tag">${proj.format}</span>
        <button type="button" class="tab-close-btn" title="Fechar projeto" aria-label="Fechar aba ${proj.name}">✕</button>
      `;

      // Evento de clique para alternar
      tabEl.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close-btn')) {
          switchProject(proj.id);
        }
      });

      // Evento de teclado (Enter / Espaço)
      tabEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          switchProject(proj.id);
        }
      });

      // Evento de fechar
      const closeBtn = tabEl.querySelector('.tab-close-btn');
      closeBtn.addEventListener('click', (e) => closeProject(proj.id, e));

      listContainer.appendChild(tabEl);

      // Garante que a aba ativa esteja visível no scroll horizontal
      if (isActive) {
        setTimeout(() => {
          tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }, 50);
      }
    });
  }

  function _escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }

  /* ══════════════════════════════════════════════════════════
     EVENTOS GLOBAIS
  ══════════════════════════════════════════════════════════ */
  function _attachEventListeners() {
    // Sincroniza alteração de nome no header
    const docNameInput = document.getElementById('doc-name-input');
    if (docNameInput) {
      docNameInput.addEventListener('input', (e) => {
        updateActiveProjectName(e.target.value);
      });
    }

    // Botão "+" Nova Aba
    const addTabBtn = document.getElementById('add-project-tab-btn');
    if (addTabBtn) {
      addTabBtn.addEventListener('click', () => {
        createProject();
      });
    }

    // Salva automaticamente antes de fechar/recarregar a aba do navegador
    window.addEventListener('beforeunload', () => {
      saveCurrentState();
    });
  }

  /* ── API Pública ── */
  return {
    init,
    getActiveProject,
    getAllProjects,
    saveCurrentState,
    createProject,
    duplicateProject,
    switchProject,
    closeProject,
    updateActiveProjectName,
    renderTabs: _renderTabs
  };

})();

window.ProjectsManager = ProjectsManager;
