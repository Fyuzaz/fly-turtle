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

      <!-- Toolbar flutuante de layout com 3 Modos Canônicos de Âncora (Estilo Google Docs) -->
      <div class="resizer-toolbar" id="resizer-toolbar">
        <!-- 3 Modos Canônicos -->
        <button type="button" class="resizer-btn btn-mode" data-action="mode-inline" id="btn-mode-inline" title="Em Linha: O texto fica antes e depois da imagem, sem contornar as laterais">
          📄 Linha
        </button>
        <button type="button" class="resizer-btn btn-mode" data-action="mode-wrap" id="btn-mode-wrap" title="Ajustar Texto: O texto contorna a imagem pelas laterais com margem suave">
          🔲 Ajustar
        </button>
        <button type="button" class="resizer-btn btn-mode" data-action="mode-fixed" id="btn-mode-fixed" title="Posição Fixa: Mover livremente para qualquer coordenada da folha independente do texto">
          📍 Livre
        </button>
        
        <div class="resizer-divider"></div>
        
        <!-- Alinhamentos -->
        <button type="button" class="resizer-btn" data-action="align-left" id="btn-align-left" title="Alinhar à Esquerda (Contorno à Esquerda)">⬅</button>
        <button type="button" class="resizer-btn" data-action="align-center" id="btn-align-center" title="Centralizar (Em Linha)">⏺</button>
        <button type="button" class="resizer-btn" data-action="align-right" id="btn-align-right" title="Alinhar à Direita (Contorno à Direita)">➡</button>
        
        <div class="resizer-divider"></div>
        
        <!-- Camadas / Posição -->
        <button type="button" class="resizer-btn" data-action="move-up" id="btn-move-up" title="Trazer camada para frente ou mover no texto">▲ Subir</button>
        <button type="button" class="resizer-btn" data-action="move-down" id="btn-move-down" title="Enviar camada para trás ou mover no texto">▼ Descer</button>
        
        <div class="resizer-divider"></div>
        
        <!-- Presets de Escala Proporcional -->
        <button type="button" class="resizer-btn" data-action="size-25" title="25% da largura da folha">25%</button>
        <button type="button" class="resizer-btn" data-action="size-50" title="50% da largura da folha">50%</button>
        <button type="button" class="resizer-btn" data-action="size-75" title="75% da largura da folha">75%</button>
        <button type="button" class="resizer-btn" data-action="size-100" title="Largura total da folha">100%</button>
        
        <div class="resizer-divider"></div>
        
        <!-- Excluir -->
        <button type="button" class="resizer-btn danger" data-action="delete" title="Excluir Imagem (Delete)">🗑</button>
      </div>

      <!-- Badge de tamanho, camada e modo -->
      <div class="resizer-dim-badge" id="resizer-dim-badge">0 × 0 px</div>
    `;

    const host = document.getElementById('global-overlays-container') || document.body;
    host.appendChild(_overlay);

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
    const host = document.getElementById('global-overlays-container') || document.body;
    host.appendChild(_dropIndicator);
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

    // Intercepta arrasto nativo do navegador para impedir que estilos sejam apagados
    document.addEventListener('dragstart', e => {
      const img = e.target.closest('#workspace img, #page-sheet img, .ck-content img');
      if (img && !img.closest('#media-drawer')) {
        e.preventDefault();
        selectImage(img);
        _onMoveHandleMouseDown(e);
      }
    });

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

    // Trava as dimensões atuais em pixels fixos para impedir redimensionamento involuntário
    const rect = img.getBoundingClientRect();
    const fixedW = Math.round(rect.width);
    if (fixedW > 0) {
      _activeImg.style.width     = `${fixedW}px`;
      _activeImg.style.height    = 'auto';
      _activeImg.style.maxWidth  = '100%';
      _activeImg.style.boxSizing = 'border-box';
      _activeImg.setAttribute('draggable', 'false');

      const targetEl = _activeImg.closest('figure.image') || _activeImg;
      if (targetEl !== _activeImg) {
        targetEl.style.width  = `${fixedW}px`;
        targetEl.style.height = 'auto';
      }
    }

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
      const targetEl = _activeImg.closest('figure.image') || _activeImg;
      const mode = _getAnchorMode(targetEl);
      const zIndex = targetEl.style.zIndex || '10';
      let modeLabel = '📄 Em Linha';
      if (mode === 'fixed') modeLabel = `📍 Posição Fixa (Z: ${zIndex})`;
      else if (mode === 'wrap') modeLabel = `🔲 Ajustar (${targetEl.dataset.wrapAlign === 'right' ? 'Direita' : 'Esquerda'})`;
      badge.textContent = `${w} × ${h} px · ${modeLabel}`;
    }
  }

  function _getAnchorMode(imgOrFigure) {
    if (!imgOrFigure) return 'inline';
    const el = imgOrFigure.closest('figure.image') || imgOrFigure;
    if (el.style.position === 'absolute' || el.dataset.anchorMode === 'fixed') {
      return 'fixed';
    }
    if (el.style.float === 'left' || el.style.float === 'right' || 
        el.classList.contains('image-style-align-left') || el.classList.contains('image-style-align-right') || 
        el.dataset.anchorMode === 'wrap') {
      return 'wrap';
    }
    return 'inline';
  }

  function _isFreeFloating(img) {
    return _getAnchorMode(img) === 'fixed';
  }

  function _syncMetricData(targetEl) {
    if (!targetEl) return;
    const MM_TO_PX = 3.7795275591;
    const rect = targetEl.getBoundingClientRect();
    if (rect.width > 0) {
      targetEl.dataset.widthMm = (rect.width / MM_TO_PX).toFixed(2);
      targetEl.dataset.heightMm = (rect.height / MM_TO_PX).toFixed(2);
    }
    const mode = _getAnchorMode(targetEl);
    targetEl.dataset.anchorMode = mode;

    if (mode === 'fixed') {
      const sheet = document.getElementById('page-sheet');
      if (sheet) {
        const sheetRect = sheet.getBoundingClientRect();
        const left = Math.max(0, rect.left - sheetRect.left);
        const top = Math.max(0, rect.top - sheetRect.top);
        targetEl.dataset.xMm = (left / MM_TO_PX).toFixed(2);
        targetEl.dataset.yMm = (top / MM_TO_PX).toFixed(2);
      }
    }
  }

  function _updateModeButtonText() {
    if (!_activeImg) return;
    const targetEl = _activeImg.closest('figure.image') || _activeImg;
    const mode = _getAnchorMode(targetEl);

    const btnInline = document.getElementById('btn-mode-inline');
    const btnWrap   = document.getElementById('btn-mode-wrap');
    const btnFixed  = document.getElementById('btn-mode-fixed');
    const btnLeft   = document.getElementById('btn-align-left');
    const btnCenter = document.getElementById('btn-align-center');
    const btnRight  = document.getElementById('btn-align-right');
    const btnUp     = document.getElementById('btn-move-up');
    const btnDown   = document.getElementById('btn-move-down');

    btnInline?.classList.toggle('active', mode === 'inline');
    btnWrap?.classList.toggle('active', mode === 'wrap');
    btnFixed?.classList.toggle('active', mode === 'fixed');

    const isLeft   = targetEl.classList.contains('image-style-align-left') || targetEl.style.float === 'left';
    const isRight  = targetEl.classList.contains('image-style-align-right') || targetEl.style.float === 'right';
    const isCenter = !isLeft && !isRight;

    btnLeft?.classList.toggle('active', isLeft);
    btnCenter?.classList.toggle('active', isCenter && mode !== 'fixed');
    btnRight?.classList.toggle('active', isRight);

    if (btnUp && btnDown) {
      if (mode === 'fixed') {
        btnUp.textContent   = '⤉ Frente';
        btnUp.title         = 'Trazer camada para frente (aumentar z-index)';
        btnDown.textContent = '⤈ Trás';
        btnDown.title       = 'Enviar camada para trás (diminuir z-index)';
      } else {
        btnUp.textContent   = '▲ Subir';
        btnUp.title         = 'Mover para cima no texto';
        btnDown.textContent = '▼ Descer';
        btnDown.title       = 'Mover para baixo no texto';
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

    const targetEl = _activeImg.closest('figure.image') || _activeImg;
    const sheet    = document.getElementById('page-sheet');
    sheet.style.position = 'relative';

    // Se estiver em modo texto mas o usuário clicou para arrastar livremente, ativa modo livre automático
    if (!_isFreeFloating(_activeImg)) {
      _enableFreeMode(targetEl, sheet);
    }

    _isMoving = true;
    _startX   = e.clientX;
    _startY   = e.clientY;

    const sheetRect = sheet.getBoundingClientRect();
    const elRect    = targetEl.getBoundingClientRect();

    // Garante que o tamanho em pixels esteja 100% blindado antes do início do movimento
    const currentW = Math.round(elRect.width || _activeImg.getBoundingClientRect().width);
    if (currentW > 0) {
      _activeImg.style.width  = `${currentW}px`;
      _activeImg.style.height = 'auto';
      if (targetEl !== _activeImg) {
        targetEl.style.width  = `${currentW}px`;
        targetEl.style.height = 'auto';
      }
    }

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
    const targetEl = _activeImg ? (_activeImg.closest('figure.image') || _activeImg) : null;

    if (_isResizing) {
      _isResizing = false;
      _dragHandle = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (targetEl) {
        _syncMetricData(targetEl);
        document.getElementById('editor')?.dispatchEvent(new Event('input', { bubbles: true }));
      }
      _updateOverlayPosition();
    }

    if (_isMoving) {
      _isMoving = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      _overlay.classList.remove('is-moving');

      // Se soltou sobre um parágrafo/bloco no modo de texto dentro do documento
      if (targetEl && !_isFreeFloating(_activeImg) && _dropTarget && _dropTarget.parentNode) {
        if (_dropPosition === 'before') {
          _dropTarget.parentNode.insertBefore(targetEl, _dropTarget);
        } else {
          _dropTarget.parentNode.insertBefore(targetEl, _dropTarget.nextSibling);
        }

        const currentW = Math.round(targetEl.getBoundingClientRect().width || _activeImg.getBoundingClientRect().width);
        if (currentW > 0) {
          _activeImg.style.width  = `${currentW}px`;
          _activeImg.style.height = 'auto';
          if (targetEl !== _activeImg) {
            targetEl.style.width  = `${currentW}px`;
            targetEl.style.height = 'auto';
          }
        }
        window.showToast?.('Imagem reposicionada no texto!', 'success');
      }

      if (targetEl) {
        _syncMetricData(targetEl);
        document.getElementById('editor')?.dispatchEvent(new Event('input', { bubbles: true }));
      }

      _hideDropIndicator();
      _dropTarget = null;
      setTimeout(_updateOverlayPosition, 50);
    }
  }

  /* ══════════════════════════════════════════════════════════
     TOOLBAR FLUTUANTE (Ações Rápidas Estilo Google Docs)
  ══════════════════════════════════════════════════════════ */
  function _onToolbarClick(e) {
    const btn = e.target.closest('.resizer-btn');
    if (!btn || !_activeImg) return;
    e.stopPropagation();

    const action   = btn.dataset.action;
    const targetEl = _activeImg.closest('figure.image') || _activeImg;

    switch (action) {
      case 'mode-inline':
        _setAnchorMode('inline');
        break;

      case 'mode-wrap':
        _setAnchorMode('wrap');
        break;

      case 'mode-fixed':
        _setAnchorMode('fixed');
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

      case 'move-up':
        _moveItemUp();
        break;

      case 'move-down':
        _moveItemDown();
        break;

      case 'size-25':
        _applySizePercent(25);
        break;

      case 'size-50':
        _applySizePercent(50);
        break;

      case 'size-75':
        _applySizePercent(75);
        break;

      case 'size-100':
        _applySizePercent(100);
        break;

      case 'delete':
        _deleteActiveImage();
        return;
    }

    setTimeout(_updateOverlayPosition, 60);
  }

  /* ──────────────────────────────────────────────────────────
     Alternar Modo de Âncora (Inline vs Wrap vs Fixed)
  ────────────────────────────────────────────────────────── */
  function _setAnchorMode(mode) {
    if (!_activeImg) return;
    const targetEl = _activeImg.closest('figure.image') || _activeImg;
    const sheet    = document.getElementById('page-sheet');
    const editorEl = document.querySelector('.ck-editor__editable') || document.getElementById('editor');

    if (mode === 'fixed') {
      targetEl.dataset.anchorMode = 'fixed';
      _enableFreeMode(targetEl, sheet);
      window.showToast?.('📍 Modo Posição Fixa ativado! Arraste livremente pela folha.', 'success');
    } else if (mode === 'wrap') {
      targetEl.dataset.anchorMode = 'wrap';
      if (editorEl && targetEl.parentNode !== editorEl) {
        editorEl.appendChild(targetEl);
      }
      targetEl.style.position = '';
      targetEl.style.left     = '';
      targetEl.style.top      = '';
      targetEl.style.zIndex   = '';
      const currentAlign = targetEl.dataset.wrapAlign || 'left';
      _applyAlignment(currentAlign);
      window.showToast?.('🔲 Modo Ajustar Texto ativado! O texto contorna a imagem.', 'info');
    } else { // inline
      targetEl.dataset.anchorMode = 'inline';
      if (editorEl && targetEl.parentNode !== editorEl) {
        editorEl.appendChild(targetEl);
      }
      targetEl.style.position = '';
      targetEl.style.left     = '';
      targetEl.style.top      = '';
      targetEl.style.zIndex   = '';
      _applyAlignment('center');
      window.showToast?.('📄 Modo Em Linha ativado! A imagem flui com o texto.', 'info');
    }

    _updateModeButtonText();
    _syncMetricData(targetEl);
    _updateBadge();
    document.getElementById('editor')?.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(_updateOverlayPosition, 50);
  }

  function _enableFreeMode(targetEl, sheet) {
    const sheetRect  = sheet.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    let left = targetRect.left - sheetRect.left;
    let top  = targetRect.top - sheetRect.top;

    sheet.style.position = 'relative';

    const maxLeft = Math.max(0, sheet.clientWidth - targetRect.width);
    const maxTop  = Math.max(0, sheet.clientHeight - targetRect.height);

    left = Math.max(0, Math.min(left, maxLeft));
    top  = Math.max(0, Math.min(top, maxTop));

    // Desacopla do fluxo do parágrafo: anexa à folha (fora da camada #sheet-overlays)
    if (targetEl.parentNode !== sheet) {
      sheet.appendChild(targetEl);
    }

    targetEl.dataset.anchorMode = 'fixed';
    targetEl.style.position = 'absolute';
    targetEl.style.left     = `${Math.round(left)}px`;
    targetEl.style.top      = `${Math.round(top)}px`;
    targetEl.style.zIndex   = targetEl.style.zIndex || '10';
    targetEl.style.float    = 'none';
    targetEl.style.margin   = '0';

    _syncMetricData(targetEl);
    _updateModeButtonText();
  }

  function _applySizePercent(pct) {
    if (!_activeImg) return;
    const targetEl = _activeImg.closest('figure.image') || _activeImg;
    const sheet = document.getElementById('page-sheet');
    const maxW = sheet ? (sheet.clientWidth - 60) : 600;
    const targetW = Math.max(80, Math.round(maxW * (pct / 100)));

    _activeImg.style.width  = `${targetW}px`;
    _activeImg.style.height = 'auto';
    if (targetEl !== _activeImg) {
      targetEl.style.width  = `${targetW}px`;
      targetEl.style.height = 'auto';
    }

    _syncMetricData(targetEl);
    _updateBadge();
    document.getElementById('editor')?.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(_updateOverlayPosition, 50);
  }

  function _applyAlignment(align) {
    if (!_activeImg) return;
    const targetEl = _activeImg.closest('figure.image') || _activeImg;

    if (targetEl.style.position === 'absolute') {
      targetEl.style.position = '';
      targetEl.style.left     = '';
      targetEl.style.top      = '';
    }

    targetEl.classList.remove('image-style-side', 'image-style-align-left', 'image-style-align-center', 'image-style-align-right', 'image-style-block');

    if (align === 'left') {
      targetEl.dataset.anchorMode = 'wrap';
      targetEl.dataset.wrapAlign  = 'left';
      targetEl.classList.add('image-style-align-left');
      targetEl.style.float   = 'left';
      targetEl.style.margin  = '10px 20px 14px 0';
      targetEl.style.display = 'block';
    } else if (align === 'right') {
      targetEl.dataset.anchorMode = 'wrap';
      targetEl.dataset.wrapAlign  = 'right';
      targetEl.classList.add('image-style-align-right');
      targetEl.style.float   = 'right';
      targetEl.style.margin  = '10px 0 14px 20px';
      targetEl.style.display = 'block';
    } else {
      targetEl.dataset.anchorMode = 'inline';
      targetEl.classList.add('image-style-align-center');
      targetEl.style.float   = 'none';
      targetEl.style.margin  = '16px auto';
      targetEl.style.display = 'table';
    }

    _syncMetricData(targetEl);
    _updateModeButtonText();
    _updateBadge();
    document.getElementById('editor')?.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ──────────────────────────────────────────────────────────
     SUBIR (▲ Mover p/ Cima no Texto OU Trazer Camada p/ Frente)
  ────────────────────────────────────────────────────────── */
  function _moveItemUp() {
    if (!_activeImg) return;
    const targetEl = _activeImg.closest('figure.image') || _activeImg;

    if (_isFreeFloating(_activeImg)) {
      const currentZ = parseInt(targetEl.style.zIndex || '10', 10);
      const newZ = Math.min(999, currentZ + 5);
      targetEl.style.zIndex = newZ.toString();
      _updateBadge();
      window.showToast?.(`Camada trazida para a frente (Nível: ${newZ})`, 'success');
    } else {
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
      const currentZ = parseInt(targetEl.style.zIndex || '10', 10);
      const newZ = Math.max(1, currentZ - 5);
      targetEl.style.zIndex = newZ.toString();
      _updateBadge();
      window.showToast?.(`Camada enviada para trás (Nível: ${newZ})`, 'info');
    } else {
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

  return { init, selectImage, hideOverlay, updatePosition: _updateOverlayPosition, refresh: hideOverlay };

})();

// Inicializa quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
  ImageResizer.init();
});
