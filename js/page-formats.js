/**
 * page-formats.js
 * Sistema central de formatos de página — presets ISO/Norte-Americano + tamanhos customizados
 * Editor Web de Documentos
 */

const PageFormats = (() => {

  /* ──────────────────────────────────────────────────────────
     PRESETS (todas as medidas em mm)
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
     Configurações de armazenamento
  ────────────────────────────────────────────────────────── */
  const KEYS = {
    FORMAT:    'wm_page_format',
    LANDSCAPE: 'wm_landscape',
    CUSTOMS:   'wm_custom_formats',
  };

  /* ──────────────────────────────────────────────────────────
     Estado interno
  ────────────────────────────────────────────────────────── */
  let _currentName = 'A4';
  let _isLandscape = false;

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
     Resolver dimensões de um formato por nome
  ────────────────────────────────────────────────────────── */
  function _resolve(name) {
    if (PRESETS[name]) return { ...PRESETS[name] };
    const c = _getCustoms();
    if (c[name]) return { ...c[name] };
    return null;
  }

  /* ──────────────────────────────────────────────────────────
     Aplicar CSS custom properties na raiz do documento
  ────────────────────────────────────────────────────────── */
  function _applyCSS(widthMm, heightMm) {
    const root = document.documentElement;
    root.style.setProperty('--page-width',  `${widthMm}mm`);
    root.style.setProperty('--page-height', `${heightMm}mm`);
  }

  /* ──────────────────────────────────────────────────────────
     Emitir evento global de mudança de formato
  ────────────────────────────────────────────────────────── */
  function _emit(name, width, height) {
    window.dispatchEvent(new CustomEvent('pageFormatChanged', {
      detail: { name, width, height, landscape: _isLandscape }
    }));
  }

  /* ══════════════════════════════════════════════════════════
     API PÚBLICA
  ══════════════════════════════════════════════════════════ */

  /**
   * Inicializa o sistema — restaura o último formato usado.
   */
  function init() {
    const savedName      = localStorage.getItem(KEYS.FORMAT)    || 'A4';
    const savedLandscape = localStorage.getItem(KEYS.LANDSCAPE) === 'true';
    _isLandscape = savedLandscape;
    applyFormat(savedName, false);
  }

  /**
   * Aplica um formato pré-definido ou customizado pelo nome.
   * @param {string} name  — nome do formato
   * @param {boolean} emit — disparar evento (default: true)
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
   * Aplica um tamanho customizado sem salvar como formato.
   * Útil para preview em tempo real no modal.
   */
  function previewCustom(widthVal, heightVal, unit = 'mm') {
    const w = toMm(widthVal, unit);
    const h = toMm(heightVal, unit);
    if (!w || !h || w < 10 || h < 10) return;
    _applyCSS(w, h);
  }

  /**
   * Aplica e salva um formato customizado.
   * @param {string} name
   * @param {number} widthVal
   * @param {number} heightVal
   * @param {string} unit     — 'mm' | 'cm' | 'px' | 'in'
   */
  function saveAndApplyCustom(name, widthVal, heightVal, unit = 'mm') {
    const trimmed = (name || '').trim();
    if (!trimmed)          throw new Error('Informe um nome para o formato.');
    if (PRESETS[trimmed])  throw new Error('Esse nome já pertence a um formato padrão.');

    const w = toMm(widthVal, unit);
    const h = toMm(heightVal, unit);
    if (!w || w < 10 || !h || h < 10) throw new Error('Dimensões inválidas (mínimo 10mm).');

    const customs = _getCustoms();
    customs[trimmed] = { width: w, height: h };
    _saveCustoms(customs);

    _currentName = trimmed;
    _applyCSS(_isLandscape ? h : w, _isLandscape ? w : h);
    localStorage.setItem(KEYS.FORMAT, trimmed);

    window.dispatchEvent(new CustomEvent('customFormatsUpdated'));
    _emit(trimmed, _isLandscape ? h : w, _isLandscape ? w : h);

    return { name: trimmed, width: w, height: h };
  }

  /**
   * Remove um formato customizado.
   */
  function deleteCustomFormat(name) {
    const customs = _getCustoms();
    delete customs[name];
    _saveCustoms(customs);
    window.dispatchEvent(new CustomEvent('customFormatsUpdated'));
    if (_currentName === name) applyFormat('A4');
  }

  /**
   * Alterna entre orientação Retrato e Paisagem.
   */
  function toggleOrientation() {
    _isLandscape = !_isLandscape;
    localStorage.setItem(KEYS.LANDSCAPE, _isLandscape);
    applyFormat(_currentName);
    return _isLandscape;
  }

  /**
   * Retorna todos os formatos disponíveis (presets + customizados).
   */
  function getAllFormats() {
    return {
      presets: PRESETS,
      groups:  GROUPS,
      custom:  _getCustoms(),
    };
  }

  /**
   * Retorna o estado atual do formato ativo.
   */
  function getCurrent() {
    const fmt = _resolve(_currentName) || PRESETS['A4'];
    let { width, height } = fmt;
    if (_isLandscape) [width, height] = [height, width];
    return { name: _currentName, width, height, landscape: _isLandscape };
  }

  /**
   * Retorna o label legível de um formato.
   */
  function getLabel(name) {
    const fmt = _resolve(name);
    if (!fmt) return name;
    return `${name} · ${fmt.width}×${fmt.height}mm`;
  }

  /* ── Expõe a API ── */
  return {
    init,
    applyFormat,
    previewCustom,
    saveAndApplyCustom,
    deleteCustomFormat,
    toggleOrientation,
    getAllFormats,
    getCurrent,
    getLabel,
    PRESETS,
    GROUPS,
    toMm,
  };

})();
