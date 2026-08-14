/**
 * image-resizer.js
 * Sistema Avançado de Mídia: Move Tool, Controle de Camadas (Z-Index / Frente & Trás),
 * Exclusão Precisa via Teclado (Delete / Backspace), Drag & Scale Interativo & Confinamento Estrito
 * "The Midnight Bat-Tortoise" Edition
 */

const ImageResizer = (() => {

  let _activeImg       = null;
  let _overlay         = null;
  let _isResizing      = false;
  let _isMoving        = false;
  let _dragHandle      = null;
  let _startX          = 0;
  let _startY          = 0;
  let _startWidth      = 0;
  let _startLeft       = 0;
  let _startTop        = 0;
  let _aspectRatio     = 1;
  let _dropTarget      = null;
  let _dropPosition    = 'before'; // 'before' | 'after'
  let _dropIndicator   = null;

  /* ──────────────────────────────────────────────────────────
     Inicialização
  ────────────────────────────────────────────────────────── */
  function init() {
    _createOverlay();
    _createDropIndicator();
    _attachDocumentListeners();
  }

  /* ──────────────────────────────────────────────────────────
     Cria o overlay de redimensionamento e barra de controles
  ────────────────────────────────────────────────────────── */
  function _createOverlay() {
    if (document.getElementById('img-resizer-overlay')) return;

    _overlay = document.createElement('div');
    _overlay.id = 'img-resizer-overlay';
    _overlay.className = 'img-resizer-overlay hidden';

    _overlay.innerHTML = `
      <div class="resizer-border"></div>

      <!-- Alças de canto para redimensionar (Drag & Scale) -->
      <div class="resizer-handle handle-tl" data-handle="tl" title="Arrastar para redimensionar"></div>
      <div class="resizer-handle handle-tr" data-handle="tr" title="Arrastar para redimensionar"></div>
      <div class="resizer-handle handle-bl" data-handle="bl" title="Arrastar para redimensionar"></div>
      <div class="resizer-handle handle-br" data-handle="br" title="Arrastar para redimensionar"></div>
      
      <!-- Alça Central de Movimentação (Move Tool) -->
      <div class="resizer-move-handle" id="resizer-move-handle" title="Clique e arraste para mover a imagem (mantida 100% dentro da folha)">
        <span>✥</span> ARRASTAR & MOVER
      </div>

      <!-- Toolbar flutuante de layout, camadas e movimentação -->
      <div class="resizer-toolbar" id="resizer-toolbar">
        <button type="button" class="resizer-btn btn-mode" data-action="toggle-free" id="btn-toggle-free" title="Alternar entre posicionamento livre e no fluxo de texto">
          📍 Modo Livre
        </button>
        <div class="resizer-divider"></div>
        <button type="button" class="resizer-btn" data-action="move-up" id="btn-move-up" title="Subir posição no documento ou trazer camada para frente">▲ Subir</button>
        <button type="button" class="resizer-btn" data-action="move-down" id="btn-move-down" title="Descer posição no documento ou enviar camada para trás">▼ Descer</button>
        <div class="resizer-divider"></div>
        <button type="button" class="resizer-btn" data-action="align-left" title="Alinhar à Esquerda">⬅</button>
        <button type="button" class="resizer-btn" data-action="align-center" title="Centralizar">⏺</button>
        <button type="button" class="resizer-btn" data-action="align-right" title="Alinhar à Direita">➡</button>
        <button type="button" class="resizer-btn" data-action="size-50" title="50% da largura">50%</button>
        <button type="button" class="resizer-btn" data-action="size-100" title="Largura Total">100%</button>
        <button type="button" class="resizer-btn danger" data-action="delete" title="Excluir Imagem (ou aperte Delete no teclado)">🗑</button>
      </div>

      <!-- Badge de tamanho, camada e modo -->
      <div class="resizer-dim-badge" id="resizer-dim-badge">0 × 0 px</div>
    `;

    document.body.appendChild(_overlay);

    // Eventos nas alças de escala
    _overlay.querySelectorAll('.resizer-handle').forEach(handle => {
      handle.addEventListener('mousedown', _onResizeHandleMouseDown);
    });

    // Evento na alça central de mover
    const moveHandle = _overlay.querySelector('#resizer-move-handle');
    moveHandle?.addEventListener('mousedown', _onMoveHandleMouseDown);

    // Eventos na toolbar flutuante
    _overlay.querySelector('#resizer-toolbar').addEventListener('click', _onToolbarClick);
  }

  /* ──────────────────────────────────────────────────────────
     Indicador visual de soltar no texto (Drop Indicator)
  ────────────────────────────────────────────────────────── */
  function _createDropIndicator() {
    if (document.getElementById('img-drop-indicator')) return;
    _dropIndicator = document.createElement('div');
    _dropIndicator.id = 'img-drop-indicator';
    _dropIndicator.className = 'img-drop-indicator hidden';
    _dropIndicator.innerHTML = '<span>━━━ Soltar Imagem Aqui ━━━</span>';
    document.body.appendChild(_dropIndicator);
  }

  /* ──────────────────────────────────────────────────────────
     Listeners no Documento
  ────────────────────────────────────────────────────────── */
  function _attachDocumentListeners() {
    const workspace = document.getElementById('workspace');

    // Clique para selecionar imagem
    document.addEventListener('click', e => {
      const img = e.target.closest('#workspace img, #page-sheet img, .ck-content img');
      if (img && !img.closest('#media-drawer')) {
        e.stopPropagation();
        selectImage(img);
      } else if (!_isResizing && !_isMoving && !e.target.closest('#img-resizer-overlay')) {
        hideOverlay();
      }
    });

    // Reposiciona overlay no scroll/resize
    window.addEventListener('resize', _updateOverlayPosition);
    workspace?.addEventListener('scroll', _updateOverlayPosition);

    // Movimento do mouse para redimensionar ou mover
    window.addEventListener('mousemove', _onMouseMove);
    window.addEventListener('mouseup', _onMouseUp);

    // Teclado (Delete / Backspace / Esc) - Captura em fase primária para impedir exclusão de caracteres
    window.addEventListener('keydown', e => {
      if (_activeImg) {
        const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
        if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
          e.preventDefault();
          e.stopPropagation();
          _deleteActiveImage();
        } else if (e.key === 'Escape') {
          hideOverlay();
        }
      }
    }, true);
  }

  /* ──────────────────────────────────────────────────────────
     Selecionar Imagem & Configurar Estado
  ────────────────────────────────────────────────────────── */
  function selectImage(img) {
    if (!img) return;
    _activeImg = img;

    _activeImg.style.maxWidth = '100%';
    _activeImg.style.boxSizing = 'border-box';
    _aspectRatio = _imgNaturalRatio(img) || 1;

    _updateModeButtonText();
    _updateOverlayPosition();
    _overlay.classList.remove('hidden');
    _updateBadge();
  }

  function hideOverlay() {
    _activeImg = null;
    _overlay?.classList.add('hidden');
    _hideDropIndicator();
  }

  function _updateOverlayPosition() {
    if (!_activeImg || !_overlay) return;

    const rect = _activeImg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      hideOverlay();
      return;
    }

    _overlay.style.top    = `${rect.top}px`;
    _overlay.style.left   = `${rect.left}px`;
    _overlay.style.width  = `${rect.width}px`;
    _overlay.style.height = `${rect.height}px`;

    _updateBadge();
  }

  function _updateBadge() {
    if (!_activeImg) return;
    const badge = document.getElementById('resizer-dim-badge');
    if (badge) {
      const w = Math.round(_activeImg.getBoundingClientRect().width);
      const h = Math.round(_activeImg.getBoundingClientRect().height);
      const isFree = _isFreeFloating(_activeImg);
      const targetEl = _activeImg.closest('figure.image') || _activeImg;
      const zIndex = targetEl.style.zIndex || (isFree ? '10' : 'auto');
      const modeLabel = isFree ? `📍 Camada: ${zIndex}` : '📄 No Texto';
      badge.textContent = `${w} × ${h} px · ${modeLabel}`;
    }
  }

  function _isFreeFloating(img) {
    const el = img.closest('figure.image') || img;
    return el.style.position === 'absolute';
  }

  function _updateModeButtonText() {
    const btnMode   = document.getElementById('btn-toggle-free');
    const btnUp     = document.getElementById('btn-move-up');
    const btnDown   = document.getElementById('btn-move-down');
    if (!_activeImg) return;

    const isFree = _isFreeFloating(_activeImg);
    if (btnMode) {
      btnMode.textContent = isFree ? '📄 Modo Texto' : '📍 Modo Livre';
      btnMode.classList.toggle('active', isFree);
    }

    if (btnUp && btnDown) {
      if (isFree) {
        btnUp.textContent   = '⤉ Frente';
        btnUp.title         = 'Trazer camada para frente (aumentar z-index)';
        btnDown.textContent = '⤈ Trás';
        btnDown.title       = 'Enviar camada para trás (diminuir z-index)';
      } else {
        btnUp.textContent   = '▲ Subir';
        btnUp.title         = 'Mover para cima do parágrafo anterior no texto';
        btnDown.textContent = '▼ Descer';
        btnDown.title       = 'Mover para baixo do próximo parágrafo no texto';
      }
    }
  }

  function _imgNaturalRatio(img) {
    if (img.naturalWidth && img.naturalHeight) {
      return img.naturalWidth / img.naturalHeight;
    }
    const r = img.getBoundingClientRect();
    return r.height > 0 ? r.width / r.height : 1;
  }

  /* ══════════════════════════════════════════════════════════
     SCALE (Arrastar Cantos para Redimensionar dentro dos limites)
  ══════════════════════════════════════════════════════════ */
  function _onResizeHandleMouseDown(e) {
    if (!_activeImg) return;
    e.preventDefault();
    e.stopPropagation();

    _isResizing  = true;
    _dragHandle  = e.target.dataset.handle;
    _startX      = e.clientX;
    _startWidth  = _activeImg.getBoundingClientRect().width;
    _aspectRatio = _imgNaturalRatio(_activeImg);

    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
  }

  /* ══════════════════════════════════════════════════════════
     MOVE (Arrastar Alça Central para Mover Imagem)
  ══════════════════════════════════════════════════════════ */
  function _onMoveHandleMouseDown(e) {
    if (!_activeImg) return;
    e.preventDefault();
    e.stopPropagation();

    _isMoving = true;
    _startX   = e.clientX;
    _startY   = e.clientY;

    const targetEl  = _activeImg.closest('figure.image') || _activeImg;
    const sheet     = document.getElementById('page-sheet');
    const sheetRect = sheet.getBoundingClientRect();
    const elRect    = targetEl.getBoundingClientRect();

    _startLeft = elRect.left - sheetRect.left;
    _startTop  = elRect.top - sheetRect.top;

    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    _overlay.classList.add('is-moving');
  }

  /* ══════════════════════════════════════════════════════════
     MOUSE MOVE (Executa Escala ou Movimentação com Limites Rígidos)
  ══════════════════════════════════════════════════════════ */
  function _onMouseMove(e) {
    const sheet = document.getElementById('page-sheet');
    if (!sheet || !_activeImg) return;

    // 1. Redimensionamento
    if (_isResizing) {
      e.preventDefault();
      const dx = e.clientX - _startX;
      let newWidth = _startWidth;

      if (_dragHandle === 'br' || _dragHandle === 'tr') {
        newWidth = _startWidth + dx;
      } else if (_dragHandle === 'bl' || _dragHandle === 'tl') {
        newWidth = _startWidth - dx;
      }

      const targetEl = _activeImg.closest('figure.image') || _activeImg;
      const sheetWidth = sheet.clientWidth;
      let maxWidth = sheetWidth;

      if (_isFreeFloating(_activeImg)) {
        const currentLeft = parseFloat(targetEl.style.left) || 0;
        maxWidth = Math.max(60, sheetWidth - currentLeft);
      }

      newWidth = Math.max(60, Math.min(newWidth, maxWidth));

      _activeImg.style.width  = `${Math.round(newWidth)}px`;
      _activeImg.style.height = 'auto';

      if (targetEl && targetEl !== _activeImg && !_isFreeFloating(_activeImg)) {
        targetEl.style.width = `${Math.round(newWidth)}px`;
      }

      _updateOverlayPosition();
      return;
    }

    // 2. Movimentação
    if (_isMoving) {
      e.preventDefault();
      const targetEl = _activeImg.closest('figure.image') || _activeImg;
      const isFree   = _isFreeFloating(_activeImg);
      const sheetRect = sheet.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      if (isFree) {
        // Modo Livre: arrasto 100% restrito dentro das 4 margens da folha do documento
        const dx = e.clientX - _startX;
        const dy = e.clientY - _startY;

        let newLeft = _startLeft + dx;
        let newTop  = _startTop + dy;

        const maxLeft = Math.max(0, sheet.clientWidth - targetRect.width);
        const maxTop  = Math.max(0, sheet.clientHeight - targetRect.height);

        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop  = Math.max(0, Math.min(newTop, maxTop));

        targetEl.style.left = `${Math.round(newLeft)}px`;
        targetEl.style.top  = `${Math.round(newTop)}px`;

        _updateOverlayPosition();

      } else {
        // Modo No Texto: detecta bloco sob o cursor dentro da folha
        _overlay.style.top  = `${e.clientY - 20}px`;
        _overlay.style.left = `${e.clientX - 100}px`;

        if (e.clientX >= sheetRect.left && e.clientX <= sheetRect.right &&
            e.clientY >= sheetRect.top && e.clientY <= sheetRect.bottom) {
          _detectDropTarget(e.clientX, e.clientY);
        } else {
          _hideDropIndicator();
          _dropTarget = null;
        }
      }
    }
  }

  /* ──────────────────────────────────────────────────────────
     Detecta bloco de texto para soltar a imagem
  ────────────────────────────────────────────────────────── */
  function _detectDropTarget(x, y) {
    _hideDropIndicator();

    const elements = document.elementsFromPoint(x, y);
    const targetEl = _activeImg.closest('figure.image') || _activeImg;

    const block = elements.find(el => {
      return el.closest('#editor, .ck-content') &&
             el !== targetEl &&
             !targetEl.contains(el) &&
             ['P', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'TABLE', 'UL', 'OL', 'FIGURE'].includes(el.tagName);
    });

    if (block) {
      _dropTarget = block;
      const rect = block.getBoundingClientRect();
      const isTopHalf = (y - rect.top) < (rect.height / 2);
      _dropPosition = isTopHalf ? 'before' : 'after';

      _dropIndicator.classList.remove('hidden');
      _dropIndicator.style.width = `${rect.width}px`;
      _dropIndicator.style.left  = `${rect.left}px`;
      _dropIndicator.style.top   = `${isTopHalf ? rect.top - 4 : rect.bottom - 4}px`;
    } else {
      _dropTarget = null;
    }
  }

  function _hideDropIndicator() {
    _dropIndicator?.classList.add('hidden');
  }

  /* ══════════════════════════════════════════════════════════
     MOUSE UP (Finaliza Escala ou Movimentação)
  ══════════════════════════════════════════════════════════ */
  function _onMouseUp() {
    if (_isResizing) {
      _isResizing = false;
      _dragHandle = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      _updateOverlayPosition();
    }

    if (_isMoving) {
      _isMoving = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      _overlay.classList.remove('is-moving');

      const targetEl = _activeImg.closest('figure.image') || _activeImg;

      // Se soltou sobre um parágrafo/bloco no modo de texto dentro do documento
      if (!_isFreeFloating(_activeImg) && _dropTarget && _dropTarget.parentNode) {
        if (_dropPosition === 'before') {
          _dropTarget.parentNode.insertBefore(targetEl, _dropTarget);
        } else {
          _dropTarget.parentNode.insertBefore(targetEl, _dropTarget.nextSibling);
        }
        window.showToast?.('Imagem reposicionada no texto!', 'success');
      }

      _hideDropIndicator();
      _dropTarget = null;

      setTimeout(_updateOverlayPosition, 50);
    }
  }

  /* ══════════════════════════════════════════════════════════
     TOOLBAR FLUTUANTE (Ações Rápidas)
  ══════════════════════════════════════════════════════════ */
  function _onToolbarClick(e) {
    const btn = e.target.closest('.resizer-btn');
    if (!btn || !_activeImg) return;
    e.stopPropagation();

    const action   = btn.dataset.action;
    const targetEl = _activeImg.closest('figure.image') || _activeImg;

    switch (action) {
      case 'toggle-free':
        _toggleFreeFloating();
        break;

      case 'move-up':
        _moveItemUp();
        break;

      case 'move-down':
        _moveItemDown();
        break;

      case 'align-left':
        _applyAlignment('left');
        break;

      case 'align-center':
        _applyAlignment('center');
        break;

      case 'align-right':
        _applyAlignment('right');
        break;

      case 'size-50':
        _activeImg.style.width = '50%';
        _activeImg.style.height = 'auto';
        if (targetEl !== _activeImg) targetEl.style.width = '50%';
        break;

      case 'size-100':
        _activeImg.style.width = '100%';
        _activeImg.style.height = 'auto';
        if (targetEl !== _activeImg) targetEl.style.width = '100%';
        break;

      case 'delete':
        _deleteActiveImage();
        return;
    }

    setTimeout(_updateOverlayPosition, 60);
  }

  /* ──────────────────────────────────────────────────────────
     Alterna entre Modo Livre e Modo No Texto
  ────────────────────────────────────────────────────────── */
  function _toggleFreeFloating() {
    if (!_activeImg) return;
    const targetEl = _activeImg.closest('figure.image') || _activeImg;
    const sheet    = document.getElementById('page-sheet');
    const isFree   = _isFreeFloating(_activeImg);

    if (isFree) {
      // Volta para o fluxo do texto
      targetEl.style.position = '';
      targetEl.style.left     = '';
      targetEl.style.top      = '';
      targetEl.style.zIndex   = '';
      _applyAlignment('center');
      window.showToast?.('Modo de fluxo de texto ativado', 'info');
    } else {
      // Ativa modo livre absoluto dentro da folha
      const sheetRect  = sheet.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      let left = targetRect.left - sheetRect.left;
      let top  = targetRect.top - sheetRect.top;

      sheet.style.position = 'relative';

      const maxLeft = Math.max(0, sheet.clientWidth - targetRect.width);
      const maxTop  = Math.max(0, sheet.clientHeight - targetRect.height);

      left = Math.max(0, Math.min(left, maxLeft));
      top  = Math.max(0, Math.min(top, maxTop));

      targetEl.style.position = 'absolute';
      targetEl.style.left     = `${Math.round(left)}px`;
      targetEl.style.top      = `${Math.round(top)}px`;
      targetEl.style.zIndex   = '10';
      targetEl.style.float    = 'none';
      targetEl.style.margin   = '0';

      window.showToast?.('Modo Livre ativado! Ajuste posição e camadas livremente.', 'success');
    }

    _updateModeButtonText();
    setTimeout(_updateOverlayPosition, 50);
  }

  /* ──────────────────────────────────────────────────────────
     SUBIR (▲ Mover p/ Cima no Texto OU Trazer Camada p/ Frente)
  ────────────────────────────────────────────────────────── */
  function _moveItemUp() {
    if (!_activeImg) return;
    const targetEl = _activeImg.closest('figure.image') || _activeImg;

    if (_isFreeFloating(_activeImg)) {
      // MODO LIVRE: Aumenta Z-Index (Traz para frente de outras camadas)
      const currentZ = parseInt(targetEl.style.zIndex || '10', 10);
      const newZ = Math.min(999, currentZ + 5);
      targetEl.style.zIndex = newZ.toString();
      _updateBadge();
      window.showToast?.(`Camada trazida para a frente (Nível: ${newZ})`, 'success');
    } else {
      // MODO TEXTO: Move a imagem para CIMA do parágrafo anterior
      const parent = targetEl.parentNode;
      if (!parent) return;
      const prev = targetEl.previousElementSibling;
      if (prev) {
        parent.insertBefore(targetEl, prev);
        window.showToast?.('Imagem movida para cima no texto', 'info');
      }
    }

    setTimeout(_updateOverlayPosition, 50);
  }

  /* ──────────────────────────────────────────────────────────
     DESCER (▼ Mover p/ Baixo no Texto OU Enviar Camada p/ Trás)
  ────────────────────────────────────────────────────────── */
  function _moveItemDown() {
    if (!_activeImg) return;
    const targetEl = _activeImg.closest('figure.image') || _activeImg;

    if (_isFreeFloating(_activeImg)) {
      // MODO LIVRE: Diminui Z-Index (Envia para trás de outras camadas)
      const currentZ = parseInt(targetEl.style.zIndex || '10', 10);
      const newZ = Math.max(1, currentZ - 5);
      targetEl.style.zIndex = newZ.toString();
      _updateBadge();
      window.showToast?.(`Camada enviada para trás (Nível: ${newZ})`, 'info');
    } else {
      // MODO TEXTO: Move a imagem para BAIXO do próximo parágrafo
      const parent = targetEl.parentNode;
      if (!parent) return;
      const next = targetEl.nextElementSibling;
      if (next) {
        parent.insertBefore(targetEl, next.nextSibling);
        window.showToast?.('Imagem movida para baixo no texto', 'info');
      }
    }

    setTimeout(_updateOverlayPosition, 50);
  }

  function _applyAlignment(align) {
    if (!_activeImg) return;
    const targetEl = _activeImg.closest('figure.image') || _activeImg;

    if (targetEl.style.position === 'absolute') {
      targetEl.style.position = '';
      targetEl.style.left     = '';
      targetEl.style.top      = '';
      _updateModeButtonText();
    }

    targetEl.classList.remove('image-style-side', 'image-style-align-left', 'image-style-align-center', 'image-style-align-right', 'image-style-block');

    if (align === 'left') {
      targetEl.classList.add('image-style-align-left');
      targetEl.style.float   = 'left';
      targetEl.style.margin  = '10px 20px 14px 0';
      targetEl.style.display = 'block';
    } else if (align === 'right') {
      targetEl.classList.add('image-style-align-right');
      targetEl.style.float   = 'right';
      targetEl.style.margin  = '10px 0 14px 20px';
      targetEl.style.display = 'block';
    } else {
      targetEl.classList.add('image-style-align-center');
      targetEl.style.float   = 'none';
      targetEl.style.margin  = '16px auto';
      targetEl.style.display = 'table';
    }
  }

  /* ──────────────────────────────────────────────────────────
     EXCLUIR IMAGEM SELECIONADA
  ────────────────────────────────────────────────────────── */
  function _deleteActiveImage() {
    if (!_activeImg) return;
    const toRemove = _activeImg.closest('figure.image') || _activeImg;

    // Se CKEditor estiver gerenciando o elemento, sincroniza remoção no Model
    const editor = window.EditorApp?.getInstance();
    if (editor && editor.model) {
      try {
        const modelElement = editor.editing?.mapper?.toModelElement(toRemove);
        if (modelElement) {
          editor.model.change(writer => {
            writer.remove(modelElement);
          });
        }
      } catch {}
    }

    toRemove.remove();
    hideOverlay();
    window.showToast?.('🗑️ Imagem excluída do documento', 'info');
  }

  return { init, selectImage, hideOverlay, updatePosition: _updateOverlayPosition };

})();

// Inicializa quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
  ImageResizer.init();
});
