/**
 * page-formats.js
 * Sistema central de formatos de página — presets ISO/Norte-Americano + tamanhos customizados
 * Gerenciador de Margens com Margens Independentes para Cada Folha (Top/Bottom/Left/Right)
 * Motor de Paginação Visual Multi-Folhas com Vão de Mesa e Margens por Folha (O(1) RAM)
 * Editor Web de Documentos — "The Midnight Bat-Tortoise" Edition
 */

const PageFormats = (() => {

  /* ──────────────────────────────────────────────────────────
     PRESETS DE PÁGINA (todas as medidas em mm)
  ────────────────────────────────────────────────────────── */
  const PRESETS = {
    'A3':      { width: 297, height: 420 },
    'A4':      { width: 210, height: 297 },
    'A5':      { width: 148, height: 210 },
    'A6':      { width: 105, height: 148 },
    'B4':      { width: 250, height: 353 },
    'B5':      { width: 176, height: 250 },
    'Letter':  { width: 216, height: 279 },
    'Legal':   { width: 216, height: 356 },
    'Tabloid': { width: 279, height: 432 },
    'Ofício':  { width: 216, height: 330 },
  };

  const GROUPS = {
    'Série ISO A':     ['A3', 'A4', 'A5', 'A6'],
    'Série ISO B':     ['B4', 'B5'],
    'Norte-Americano': ['Letter', 'Legal', 'Tabloid'],
    'Especial':        ['Ofício'],
  };

  /* ──────────────────────────────────────────────────────────
     PRESETS DE MARGEM (todas as medidas em mm)
  ────────────────────────────────────────────────────────── */
  const MARGIN_PRESETS = {
    'normal':   { name: 'Normal', top: 25, bottom: 25, left: 20, right: 20 },
    'narrow':   { name: 'Estreita', top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 },
    'moderate': { name: 'Moderada', top: 25.4, bottom: 25.4, left: 19.0, right: 19.0 },
    'wide':     { name: 'Larga', top: 25.4, bottom: 25.4, left: 50.8, right: 50.8 },
    'zero':     { name: 'Sem Margem', top: 0, bottom: 0, left: 0, right: 0 },
  };

  /* ──────────────────────────────────────────────────────────
     Configurações de armazenamento
  ────────────────────────────────────────────────────────── */
  const KEYS = {
    FORMAT:           'wm_page_format',
    LANDSCAPE:        'wm_landscape',
    CUSTOMS:          'wm_custom_formats',
    MARGINS:          'wm_page_margins',
    PAGE_MARGINS_MAP: 'wm_page_margins_map',
    SHOW_GUIDES:      'wm_show_margin_guides',
  };

  /* ──────────────────────────────────────────────────────────
     Estado interno
  ────────────────────────────────────────────────────────── */
  let _currentName     = 'A4';
  let _isLandscape     = false;
  let _margins         = { top: 25, bottom: 25, left: 20, right: 20, name: 'Normal' };
  let _pageMarginsMap  = { 1: { top: 25, bottom: 25, left: 20, right: 20, name: 'Normal' } };
  let _showGuides      = false;
  let _pageHeightMm    = 297;
  let _pageWidthMm     = 210;
  let _totalPages      = 1;
  let _debounceTimer   = null;

  /* ──────────────────────────────────────────────────────────
     Helpers de conversão de unidades → mm
  ────────────────────────────────────────────────────────── */
  const UNIT_TO_MM = { mm: 1, cm: 10, px: 0.264583, in: 25.4 };

  function toMm(value, unit = 'mm') {
    return parseFloat(value) * (UNIT_TO_MM[unit] ?? 1);
  }

  /* ──────────────────────────────────────────────────────────
     Formatos customizados (localStorage)
  ────────────────────────────────────────────────────────── */
  function _getCustoms() {
    try { return JSON.parse(localStorage.getItem(KEYS.CUSTOMS) || '{}'); }
    catch { return {}; }
  }

  function _saveCustoms(obj) {
    localStorage.setItem(KEYS.CUSTOMS, JSON.stringify(obj));
  }

  /* ──────────────────────────────────────────────────────────
     Resolver dimensões de um formato por nome ou padrão
  ────────────────────────────────────────────────────────── */
  function _resolve(name) {
    if (!name) return null;
    const clean = String(name).trim();

    // 1. Presets padrão
    if (PRESETS[clean]) return { ...PRESETS[clean] };

    // 2. Formatos personalizados salvos
    const c = _getCustoms();
    if (c[clean]) return { ...c[clean] };

    // 3. Resolução automática de strings de dimensão: ex: "150×200mm", "150x200", "85×55mm"
    const match = clean.match(/^(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)(?:mm)?$/i);
    if (match) {
      const w = parseFloat(match[1]);
      const h = parseFloat(match[2]);
      if (w >= 10 && h >= 10) {
        return { width: w, height: h };
      }
    }

    return null;
  }

  /* ──────────────────────────────────────────────────────────
     Aplicar CSS custom properties na raiz do documento
  ────────────────────────────────────────────────────────── */
  function _applyCSS(widthMm, heightMm) {
    const root = document.documentElement;
    _pageWidthMm  = widthMm;
    _pageHeightMm = heightMm;

    root.style.setProperty('--page-width',  `${widthMm}mm`);
    root.style.setProperty('--page-height', `${heightMm}mm`);

    _applyMarginCSS();
    updatePageBoundaries();
  }

  function _applyMarginCSS() {
    const root = document.documentElement;
    const p1Margins = getPageMargins(1);
    root.style.setProperty('--page-margin-top',    `${p1Margins.top}mm`);
    root.style.setProperty('--page-margin-bottom', `${p1Margins.bottom}mm`);
    root.style.setProperty('--page-margin-left',   `${p1Margins.left}mm`);
    root.style.setProperty('--page-margin-right',  `${p1Margins.right}mm`);
    // Aliases para compatibilidade retroativa
    root.style.setProperty('--page-pad-v', `${p1Margins.top}mm`);
    root.style.setProperty('--page-pad-h', `${p1Margins.left}mm`);

    const sheet = document.getElementById('page-sheet');
    if (sheet) {
      sheet.classList.toggle('show-guides', _showGuides);
    }
  }

  /* ──────────────────────────────────────────────────────────
     Emitir eventos globais
  ────────────────────────────────────────────────────────── */
  function _emit(name, width, height) {
    window.dispatchEvent(new CustomEvent('pageFormatChanged', {
      detail: {
        name,
        width,
        height,
        landscape: _isLandscape,
        margins: { ..._margins },
        pageMarginsMap: { ..._pageMarginsMap },
        totalPages: _totalPages
      }
    }));
  }

  function _emitMargins() {
    window.dispatchEvent(new CustomEvent('pageMarginsChanged', {
      detail: {
        margins: { ..._margins },
        pageMarginsMap: { ..._pageMarginsMap }
      }
    }));
  }

  /* ══════════════════════════════════════════════════════════
     MOTOR DE PAGINAÇÃO VISUAL COM MARGENS INDEPENDENTES POR FOLHA
  ══════════════════════════════════════════════════════════ */
  function updatePageBoundaries() {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(_calculateAndRenderPages, 50);
  }

  function _getOverlaysLayer() {
    let layer = document.getElementById('sheet-overlays');
    if (!layer) {
      const sheet = document.getElementById('page-sheet');
      if (sheet) {
        layer = document.createElement('div');
        layer.id = 'sheet-overlays';
        layer.className = 'sheet-overlays';
        layer.setAttribute('aria-hidden', 'true');
        sheet.insertBefore(layer, sheet.firstChild);
      }
    }
    return layer;
  }

  function _calculateAndRenderPages() {
    const sheet = document.getElementById('page-sheet');
    const editor = document.getElementById('editor') || document.querySelector('.ck-editor__editable');
    if (!sheet || !editor) return;

    const MM_TO_PX = 3.7795275591;
    const pageHeightPx = _pageHeightMm * MM_TO_PX;
    if (pageHeightPx < 50) return;

    const overlaysLayer = _getOverlaysLayer();
    const targetHost = overlaysLayer || sheet;

    // Limpeza atômica e limpa das overlays visuais (sem encostar no conteúdo do documento)
    if (overlaysLayer) {
      overlaysLayer.replaceChildren();
    } else {
      sheet.querySelectorAll('.multi-page-break, .page-guide-box').forEach(el => el.remove());
    }

    const children = Array.from(editor.children);
    const targetFirstElements = new Map();

    let currentPage = 1;
    let currentMargins = getPageMargins(currentPage);
    let usableHeightMm = Math.max(20, _pageHeightMm - (currentMargins.top + currentMargins.bottom));
    let usableHeightPx = usableHeightMm * MM_TO_PX;

    let currentAccumHeightPx = 0;
    const breaks = [];
    const baseMargins = getPageMargins(1);

    // Itera pelos blocos de conteúdo para detectar quebras manuais e overflow natural de folhas
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.classList.contains('multi-page-break') || child.classList.contains('page-boundary-marker') || child.id === 'img-resizer-overlay') continue;

      const isExplicitBreak = child.classList.contains('page-break') || 
                              child.classList.contains('ck-page-break') || 
                              Boolean(child.querySelector && child.querySelector('.page-break, .ck-page-break'));

      if (isExplicitBreak) {
        const prevPage = currentPage;
        const prevMargins = currentMargins;
        currentPage++;
        currentMargins = getPageMargins(currentPage);
        usableHeightMm = Math.max(20, _pageHeightMm - (currentMargins.top + currentMargins.bottom));
        usableHeightPx = usableHeightMm * MM_TO_PX;

        // O próximo elemento recebe o cabeçalho e espaçamento da nova folha
        const nextTarget = children[i + 1] || child;
        const marginTopVal = `calc(${prevMargins.bottom}mm + 36px + ${currentMargins.top}mm)`;
        let marginLeftVal = '';
        let marginRightVal = '';

        if (currentMargins.left !== baseMargins.left || currentMargins.right !== baseMargins.right) {
          const deltaLeft = currentMargins.left - baseMargins.left;
          const deltaRight = currentMargins.right - baseMargins.right;
          marginLeftVal = `${deltaLeft}mm`;
          marginRightVal = `${deltaRight}mm`;
        }

        targetFirstElements.set(nextTarget, { marginTop: marginTopVal, marginLeft: marginLeftVal, marginRight: marginRightVal });
        breaks.push({ page: currentPage, targetEl: nextTarget, prevMargins, currMargins: currentMargins });
        currentAccumHeightPx = 0;
        continue;
      }

      const childTag = child.tagName ? child.tagName.toLowerCase() : '';
      const isHeading = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(childTag);
      const isIndivisible = ['table', 'figure', 'pre', 'blockquote'].includes(childTag) || 
                            child.classList.contains('todo-list') || 
                            child.classList.contains('image');

      const childHeight = child.offsetHeight || 24;

      // Regra Determinística: Keep-With-Next para títulos e Break-Inside Avoid para blocos indivisíveis
      let shouldBreakBefore = false;
      if (currentAccumHeightPx > 0) {
        if (isHeading && i < children.length - 1) {
          // Garante que o título não fique órfão no rodapé: avalia o título + a altura do próximo bloco
          const nextChild = children[i + 1];
          const nextMinHeight = Math.min(nextChild?.offsetHeight || 36, 60);
          if ((currentAccumHeightPx + childHeight + nextMinHeight) > (usableHeightPx + 4)) {
            shouldBreakBefore = true;
          }
        } else if (isIndivisible) {
          // Bloco indivisível que não cabe por inteiro na folha atual vai inteiro para a próxima
          if ((currentAccumHeightPx + childHeight) > (usableHeightPx + 4)) {
            shouldBreakBefore = true;
          }
        } else if ((currentAccumHeightPx + childHeight) > (usableHeightPx + 4)) {
          shouldBreakBefore = true;
        }
      }

      // Se este elemento faz o conteúdo ultrapassar a área útil da página atual:
      if (shouldBreakBefore) {
        const prevPage = currentPage;
        const prevMargins = currentMargins;
        currentPage++;
        currentMargins = getPageMargins(currentPage);
        usableHeightMm = Math.max(20, _pageHeightMm - (currentMargins.top + currentMargins.bottom));
        usableHeightPx = usableHeightMm * MM_TO_PX;

        const marginTopVal = `calc(${prevMargins.bottom}mm + 36px + ${currentMargins.top}mm)`;
        let marginLeftVal = '';
        let marginRightVal = '';

        if (currentMargins.left !== baseMargins.left || currentMargins.right !== baseMargins.right) {
          const deltaLeft = currentMargins.left - baseMargins.left;
          const deltaRight = currentMargins.right - baseMargins.right;
          marginLeftVal = `${deltaLeft}mm`;
          marginRightVal = `${deltaRight}mm`;
        }

        targetFirstElements.set(child, { marginTop: marginTopVal, marginLeft: marginLeftVal, marginRight: marginRightVal });
        breaks.push({ page: currentPage, targetEl: child, prevMargins, currMargins: currentMargins });
        currentAccumHeightPx = childHeight;
      } else {
        if (currentPage > 1 && (currentMargins.left !== baseMargins.left || currentMargins.right !== baseMargins.right)) {
          const deltaLeft = currentMargins.left - baseMargins.left;
          const deltaRight = currentMargins.right - baseMargins.right;
          child.style.marginLeft = `${deltaLeft}mm`;
          child.style.marginRight = `${deltaRight}mm`;
        } else {
          child.style.removeProperty('margin-left');
          child.style.removeProperty('margin-right');
        }
        currentAccumHeightPx += childHeight;
      }
    }

    // Aplica classes e estilos apenas nos nós pertinentes sem desarmar o layout
    children.forEach(el => {
      if (targetFirstElements.has(el)) {
        const cfg = targetFirstElements.get(el);
        el.classList.add('page-first-element');
        el.style.marginTop = cfg.marginTop;
        if (cfg.marginLeft) el.style.marginLeft = cfg.marginLeft;
        if (cfg.marginRight) el.style.marginRight = cfg.marginRight;
      } else {
        el.classList.remove('page-first-element');
        el.style.removeProperty('margin-top');
      }
    });

    _totalPages = currentPage;

    // Renderiza divisores visuais após o browser reprocessar o layout (evita offsetTop errado)
    if (currentPage > 1) {
      const DESK_GAP_PX = 36;
      const DESK_GAP_MM = DESK_GAP_PX / MM_TO_PX;
      const totalSheetHeightMm = currentPage * _pageHeightMm + (currentPage - 1) * DESK_GAP_MM;
      sheet.style.minHeight = `${totalSheetHeightMm}mm`;

      // Captura referências antes do rAF para evitar closures obsoletas
      const breakSnapshot = breaks.slice();
      const totalPagesSnap = currentPage;
      const pageWidthSnap = _pageWidthMm;
      const pageHeightSnap = _pageHeightMm;

      requestAnimationFrame(() => {
        // Remove divisores remanescentes exclusivamente no host de overlays
        if (overlaysLayer) {
          overlaysLayer.querySelectorAll('.multi-page-break').forEach(el => el.remove());
        } else {
          sheet.querySelectorAll('.multi-page-break').forEach(el => el.remove());
        }

        breakSnapshot.forEach(({ page, targetEl, prevMargins, currMargins }) => {
          const breakEl = document.createElement('div');
          breakEl.className = 'multi-page-break';
          breakEl.innerHTML = `
            <!-- Rodapé com Margem Inferior da Folha Anterior -->
            <div class="page-break-margin-bottom" style="height: ${prevMargins.bottom}mm;">
              <span class="page-margin-tag">Margem Inferior (${prevMargins.bottom}mm) · Fim da Folha ${page - 1}</span>
            </div>

            <!-- Vão Físico da Mesa de Trabalho com Botão de Configuração Rápida de Margem -->
            <div class="page-break-desk-gap">
              <div class="multi-page-break-label">
                <span>📄 Folha ${page} de ${totalPagesSnap}</span>
              </div>
              <button type="button" class="page-break-margin-btn" onclick="App.openMarginsModal(${page})" title="Configurar margens da Folha ${page}">
                ⚙️ Margens da Folha ${page} (${currMargins.name || 'Personalizada'})
              </button>
              <span class="multi-page-break-tag">✂️ Início da Folha ${page} (${pageWidthSnap}×${pageHeightSnap}mm)</span>
            </div>

            <!-- Cabeçalho com Margem Superior da Nova Folha -->
            <div class="page-break-margin-top" style="height: ${currMargins.top}mm;">
              <span class="page-margin-tag">Margem Superior (${currMargins.top}mm) · Área Útil da Folha ${page}</span>
            </div>
          `;
          const elTop = targetEl.offsetTop;
          const breakHeightPx = (prevMargins.bottom + currMargins.top) * MM_TO_PX + DESK_GAP_PX;
          breakEl.style.top = `${elTop - breakHeightPx}px`;
          breakEl.style.height = `${breakHeightPx}px`;
          targetHost.appendChild(breakEl);
        });

        // Adiciona classe has-guide-boxes se houver guias JS (suprime ::before duplicado)
        if (_showGuides) {
          sheet.classList.add('has-guide-boxes');
        } else {
          sheet.classList.remove('has-guide-boxes');
        }
      });
    } else {
      sheet.style.minHeight = `${_pageHeightMm}mm`;
      sheet.classList.remove('has-guide-boxes');
    }

    // Se as linhas-guia estiverem ativadas, desenha a moldura de cada folha independente no container de overlays
    if (_showGuides) {
      const DESK_GAP_MM = 36 / MM_TO_PX;
      for (let p = 1; p <= _totalPages; p++) {
        const pMargins = getPageMargins(p);
        const pUsableHeightMm = Math.max(20, _pageHeightMm - (pMargins.top + pMargins.bottom));
        const pageTopMm = (p - 1) * (_pageHeightMm + DESK_GAP_MM);
        const guideBox = document.createElement('div');
        guideBox.className = 'page-guide-box';
        guideBox.style.top    = `${pageTopMm + pMargins.top}mm`;
        guideBox.style.height = `${pUsableHeightMm}mm`;
        guideBox.style.left   = `${pMargins.left}mm`;
        guideBox.style.right  = `${pMargins.right}mm`;
        targetHost.appendChild(guideBox);
      }
    }

    // Atualiza contador de páginas na barra de status
    const statusPageEl = document.getElementById('page-count-status') || document.getElementById('page-dimensions');
    if (statusPageEl) {
      const cur = getCurrent();
      const dimsText = `${Math.round(cur.width)} × ${Math.round(cur.height)} mm`;
      const pagesText = _totalPages > 1 ? ` · ${_totalPages} páginas` : ' · 1 página';
      statusPageEl.textContent = `${dimsText}${pagesText}`;
    }

    // Atualiza chip de formato no header
    const chip = document.getElementById('format-chip');
    if (chip) {
      const cur = getCurrent();
      const w = Math.round(cur.width);
      const h = Math.round(cur.height);
      const mName = _margins.name || 'Normal';
      const pText = _totalPages > 1 ? ` · ${_totalPages} págs` : '';
      chip.textContent = `${cur.name} · ${w}×${h}mm · ${mName}${pText}`;
    }
  }

  /* ══════════════════════════════════════════════════════════
     API PÚBLICA
  ══════════════════════════════════════════════════════════ */

  /**
   * Inicializa o sistema — restaura o último formato e margens usados.
   */
  function init() {
    const savedName      = localStorage.getItem(KEYS.FORMAT)    || 'A4';
    const savedLandscape = localStorage.getItem(KEYS.LANDSCAPE) === 'true';
    _isLandscape = savedLandscape;

    try {
      const savedMargins = JSON.parse(localStorage.getItem(KEYS.MARGINS) || 'null');
      if (savedMargins && typeof savedMargins.top === 'number') {
        _margins = savedMargins;
      }
      const savedMap = JSON.parse(localStorage.getItem(KEYS.PAGE_MARGINS_MAP) || 'null');
      if (savedMap && typeof savedMap === 'object') {
        _pageMarginsMap = savedMap;
      } else {
        _pageMarginsMap = { 1: { ..._margins } };
      }
    } catch {}

    _showGuides = localStorage.getItem(KEYS.SHOW_GUIDES) === 'true';

    applyFormat(savedName, false);
    _applyMarginCSS();

    // Observador inteligente com ResizeObserver para atualizar divisores de página em tempo real
    const editorEl = document.getElementById('editor');
    if (editorEl && window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        updatePageBoundaries();
      });
      ro.observe(editorEl);
    }
  }

  /**
   * Aplica um formato pré-definido ou customizado pelo nome.
   */
  function applyFormat(name, emit = true) {
    const fmt = _resolve(name);
    if (!fmt) {
      console.warn(`[PageFormats] Formato "${name}" não encontrado. Usando A4.`);
      applyFormat('A4', emit);
      return;
    }

    _currentName = name;
    let { width, height } = fmt;
    if (_isLandscape) [width, height] = [height, width];

    _applyCSS(width, height);
    localStorage.setItem(KEYS.FORMAT, name);

    if (emit) _emit(name, width, height);
    return { name, width, height };
  }

  /**
   * Aplica um tamanho customizado sem salvar como formato permanente.
   */
  function previewCustom(widthVal, heightVal, unit = 'mm') {
    const w = toMm(widthVal, unit);
    const h = toMm(heightVal, unit);
    if (!w || !h || w < 10 || h < 10) return;
    _applyCSS(w, h);
  }

  /**
   * Aplica e registra um tamanho customizado.
   */
  function applyCustom(widthVal, heightVal, unit = 'mm', customName = null) {
    const w = Math.round(toMm(widthVal, unit));
    const h = Math.round(toMm(heightVal, unit));
    if (!w || !h || w < 10 || h < 10) throw new Error('Dimensões inválidas (mínimo 10mm).');

    let name = (customName || '').trim();
    if (!name) {
      name = `${w}×${h}mm`;
    }

    const customs = _getCustoms();
    customs[name] = { width: w, height: h };
    _saveCustoms(customs);

    _currentName = name;
    let finalW = w;
    let finalH = h;
    if (_isLandscape) [finalW, finalH] = [h, w];

    _applyCSS(finalW, finalH);
    localStorage.setItem(KEYS.FORMAT, name);

    window.dispatchEvent(new CustomEvent('customFormatsUpdated'));
    _emit(name, finalW, finalH);

    return { name, width: finalW, height: finalH };
  }

  function saveAndApplyCustom(name, widthVal, heightVal, unit = 'mm') {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error('Informe um nome para o formato.');
    if (PRESETS[trimmed]) throw new Error('Esse nome já pertence a um formato padrão.');
    return applyCustom(widthVal, heightVal, unit, trimmed);
  }

  function deleteCustomFormat(name) {
    const customs = _getCustoms();
    delete customs[name];
    _saveCustoms(customs);
    window.dispatchEvent(new CustomEvent('customFormatsUpdated'));
    if (_currentName === name) applyFormat('A4');
  }

  function toggleOrientation() {
    _isLandscape = !_isLandscape;
    localStorage.setItem(KEYS.LANDSCAPE, _isLandscape);
    applyFormat(_currentName);
    return _isLandscape;
  }

  /* ══════════════════════════════════════════════════════════
     GERENCIAMENTO DE MARGENS (Global e por Folha Individual)
  ══════════════════════════════════════════════════════════ */
  function getMargins(pageIndex = 1) {
    return getPageMargins(pageIndex);
  }

  function getPageMargins(pageIndex = 1) {
    const idx = parseInt(pageIndex, 10) || 1;
    if (_pageMarginsMap && _pageMarginsMap[idx] && typeof _pageMarginsMap[idx].top === 'number') {
      return { ..._pageMarginsMap[idx] };
    }
    return { ..._margins };
  }

  function getPageMarginsMap() {
    return { ..._pageMarginsMap };
  }

  function applyMargins(top, bottom, left, right, name = 'Personalizada', save = true, targetPage = 'all') {
    const numTop    = Math.max(0, parseFloat(top) || 0);
    const numBottom = Math.max(0, parseFloat(bottom) || 0);
    const numLeft   = Math.max(0, parseFloat(left) || 0);
    const numRight  = Math.max(0, parseFloat(right) || 0);

    const newMargin = {
      top: numTop,
      bottom: numBottom,
      left: numLeft,
      right: numRight,
      name: name || 'Personalizada'
    };

    if (targetPage === 'all' || targetPage === 'Todas' || !targetPage) {
      // Aplica em TODAS as folhas já mapeadas, preservando suas chaves.
      // Se o usuário quiser margem uniforme, todas as folhas recebem o mesmo valor.
      _margins = { ...newMargin };
      const existingKeys = Object.keys(_pageMarginsMap).map(k => parseInt(k, 10)).filter(k => !isNaN(k) && k > 0);
      if (existingKeys.length === 0) existingKeys.push(1);
      const updatedMap = {};
      existingKeys.forEach(k => { updatedMap[k] = { ...newMargin }; });
      _pageMarginsMap = updatedMap;
    } else {
      const pageNum = parseInt(targetPage, 10) || 1;
      _pageMarginsMap[pageNum] = { ...newMargin };
      if (pageNum === 1) {
        _margins = { ...newMargin };
      }
    }

    _applyMarginCSS();
    updatePageBoundaries();

    if (save) {
      try {
        localStorage.setItem(KEYS.MARGINS, JSON.stringify(_margins));
        localStorage.setItem(KEYS.PAGE_MARGINS_MAP, JSON.stringify(_pageMarginsMap));
      } catch {}
    }

    _emitMargins();
    return { ...newMargin };
  }

  function applyMarginPreset(presetKey, targetPage = 'all') {
    const preset = MARGIN_PRESETS[presetKey];
    if (!preset) return;
    return applyMargins(preset.top, preset.bottom, preset.left, preset.right, preset.name, true, targetPage);
  }

  function setPageMargins(pageNum, marginsObj, save = true) {
    if (!marginsObj) return;
    return applyMargins(
      marginsObj.top,
      marginsObj.bottom,
      marginsObj.left,
      marginsObj.right,
      marginsObj.name || 'Personalizada',
      save,
      pageNum
    );
  }

  function toggleMarginGuides() {
    _showGuides = !_showGuides;
    try { localStorage.setItem(KEYS.SHOW_GUIDES, _showGuides ? 'true' : 'false'); } catch {}
    _applyMarginCSS();
    updatePageBoundaries();
    return _showGuides;
  }

  function isShowingGuides() {
    return _showGuides;
  }

  function getAllFormats() {
    return {
      presets: PRESETS,
      groups:  GROUPS,
      custom:  _getCustoms(),
    };
  }

  function getCurrent() {
    const fmt = _resolve(_currentName) || PRESETS['A4'];
    let { width, height } = fmt;
    if (_isLandscape) [width, height] = [height, width];
    return {
      name: _currentName,
      width: Math.round(width * 10) / 10,
      height: Math.round(height * 10) / 10,
      landscape: _isLandscape,
      margins: { ..._margins },
      pageMarginsMap: { ..._pageMarginsMap },
      totalPages: _totalPages
    };
  }

  function getLabel(name) {
    const fmt = _resolve(name);
    if (!fmt) return name;
    return `${name} · ${fmt.width}×${fmt.height}mm`;
  }

  function updatePageBoundariesSync() {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _calculateAndRenderPages();
    return _totalPages;
  }

  function getTotalPages() {
    return updatePageBoundariesSync();
  }

  function setFormatAndOrientation(name, isLandscape = false, customMargins = null, pageMarginsMap = null) {
    _isLandscape = !!isLandscape;
    localStorage.setItem(KEYS.LANDSCAPE, _isLandscape);
    if (customMargins && typeof customMargins.top === 'number') {
      _margins = { ...customMargins };
      _pageMarginsMap = (pageMarginsMap && typeof pageMarginsMap === 'object')
        ? { ...pageMarginsMap }
        : { 1: { ...customMargins } };
      _applyMarginCSS();
    } else if (pageMarginsMap && typeof pageMarginsMap === 'object') {
      _pageMarginsMap = { ...pageMarginsMap };
      if (_pageMarginsMap[1]) _margins = { ..._pageMarginsMap[1] };
      _applyMarginCSS();
    }
    applyFormat(name || 'A4', true);
    const btn = document.getElementById('orientation-btn');
    if (btn) btn.classList.toggle('landscape', _isLandscape);
  }

  /* ── Expõe a API ── */
  return {
    init,
    applyFormat,
    applyCustom,
    setFormatAndOrientation,
    previewCustom,
    saveAndApplyCustom,
    deleteCustomFormat,
    toggleOrientation,
    getMargins,
    getPageMargins,
    getPageMarginsMap,
    setPageMargins,
    applyMargins,
    applyMarginPreset,
    toggleMarginGuides,
    isShowingGuides,
    updatePageBoundaries,
    updatePageBoundariesSync,
    getTotalPages,
    getAllFormats,
    getCurrent,
    getLabel,
    PRESETS,
    GROUPS,
    MARGIN_PRESETS,
    toMm,
  };

})();
