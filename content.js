/**
 * YouTube Sanitiser — content script
 * Runs on every youtube.com page. Hides Shorts, playlists, mixes,
 * and low-view-count videos based on settings stored in chrome.storage.sync.
 */

// ─── Inject hide stylesheet once ─────────────────────────────────────────────

(function injectStyles() {
  const style = document.createElement('style');
  style.id = 'yt-sanitiser-styles';
  style.textContent = '.yt-sanitised { display: none !important; }';
  (document.head || document.documentElement).appendChild(style);
})();

// ─── Default settings ─────────────────────────────────────────────────────────

const DEFAULTS = {
  hideShorts:    true,
  hidePlaylists: true,
  hideMixes:     true,
  hideLowViews:  false,
  minViews:      10000,
};

let settings = { ...DEFAULTS };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitise(el) {
  if (el && !el.classList.contains('yt-sanitised')) {
    el.classList.add('yt-sanitised');
  }
}

function unsanitise(el) {
  el.classList.remove('yt-sanitised');
}

// Words meaning "views" in supported languages
const VIEW_WORD_RE = /views?|visning[ae]r?|aufrufe?|vues?|visualizaç[õo]es?|visualizaciones?|visualizzazioni?|weergaven?|näyttö[äa]|katselukertaa?|wyświetleń|просмотр\w*|görüntüleme|tayangan/i;

// Magnitude suffix multipliers across locales (keys lowercased, trailing dot stripped)
const VIEW_SUFFIX_MULTIPLIERS = {
  'k': 1e3, 'm': 1e6, 'b': 1e9,         // English
  't': 1e3, 'mio': 1e6, 'mia': 1e9,     // Danish/Norwegian (tusind, million, milliard)
  'tn': 1e3, 'mn': 1e6, 'md': 1e9,      // Swedish (tusen, miljon, miljard)
  'tsd': 1e3, 'mrd': 1e9,                // German (Tausend, Milliarde)
  'mil': 1e6,                             // Spanish/Portuguese (millones/milhões)
};

/**
 * Parse a number string that may use either comma or period as the
 * thousands/decimal separator. Returns a float or NaN.
 *
 * Rules:
 *   both present → whichever appears last is the decimal separator
 *   only comma   → ≤2 digits after comma = decimal ("1,5"); else thousands ("1,234")
 *   only dot     → exactly 3 digits after dot, or multiple dots = thousands ("1.234")
 */
function parseLocaleNumber(str) {
  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',');
    const lastDot   = str.lastIndexOf('.');
    return lastDot > lastComma
      ? parseFloat(str.replace(/,/g, ''))                     // "1,234.5"
      : parseFloat(str.replace(/\./g, '').replace(',', '.'));  // "1.234,5"
  }
  if (str.includes(',')) {
    const afterComma = str.split(',')[1] || '';
    return afterComma.length <= 2
      ? parseFloat(str.replace(',', '.'))   // "1,5" → decimal comma
      : parseFloat(str.replace(/,/g, ''));  // "1,234" → thousands comma
  }
  if (str.includes('.')) {
    const parts = str.split('.');
    return (parts.length > 2 || parts[parts.length - 1].length === 3)
      ? parseFloat(str.replace(/\./g, ''))  // "1.234" / "1.234.567" → thousands dot
      : parseFloat(str);                    // "1.5" → decimal dot
  }
  return parseFloat(str);
}

/**
 * Parse a YouTube view-count string in any supported language.
 * Examples: "1.2K views", "1,2 t. visninger", "1.234 Aufrufe"
 * Returns a number or null.
 */
function parseViewText(text) {
  // Capture leading number + optional magnitude suffix (e.g. "K", "t.", "mio.")
  const m = text.match(/^([\d.,]+)\s*([A-Za-zА-Яа-яÀ-ÿ]*\.?)/);
  if (!m) return null;
  const n = parseLocaleNumber(m[1]);
  if (isNaN(n)) return null;
  const suffix = m[2].toLowerCase().replace(/\.$/, '');
  return n * (VIEW_SUFFIX_MULTIPLIERS[suffix] || 1);
}

/**
 * Extract view count from a video renderer element.
 * Returns a number or null.
 */
function getViewCount(el) {
  const spans = el.querySelectorAll('span');
  for (const span of spans) {
    const text = span.textContent.trim();
    if (VIEW_WORD_RE.test(text)) {
      const count = parseViewText(text);
      if (count !== null) return count;
    }
  }
  return null;
}

// ─── Filter functions ─────────────────────────────────────────────────────────

function filterShorts(root) {
  // Full Shorts shelf (homepage)
  root.querySelectorAll('ytd-rich-shelf-renderer[is-shorts]').forEach(sanitise);

  // Individual reel items inside a shelf
  root.querySelectorAll('ytd-reel-item-renderer').forEach(el => {
    const parent = el.closest('ytd-rich-item-renderer') || el;
    sanitise(parent);
  });

  // Shorts in the watch-page sidebar — compact renderers whose overlay says "Shorts"
  root.querySelectorAll('ytd-compact-video-renderer').forEach(el => {
    if (
      el.querySelector('[overlay-style="SHORTS"]') ||
      el.querySelector('ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]')
    ) {
      sanitise(el);
    }
  });

  // Reel shelf in search / feed
  root.querySelectorAll('ytd-reel-shelf-renderer').forEach(sanitise);
}

function filterPlaylists(root) {
  root.querySelectorAll(
    'ytd-playlist-renderer, ytd-compact-playlist-renderer, ytd-grid-playlist-renderer'
  ).forEach(sanitise);
}

function filterMixes(root) {
  root.querySelectorAll(
    'ytd-radio-renderer, ytd-compact-radio-renderer'
  ).forEach(sanitise);
}

function filterLowViews(root, minViews) {
  const selectors = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
  ];
  root.querySelectorAll(selectors.join(',')).forEach(el => {
    // Don't touch elements already hidden by another filter
    if (el.classList.contains('yt-sanitised')) return;
    const count = getViewCount(el);
    if (count !== null && count < minViews) {
      sanitise(el);
    }
  });
}

// ─── Un-filter (restore all hidden elements) ──────────────────────────────────

function removeAllFilters() {
  document.querySelectorAll('.yt-sanitised').forEach(unsanitise);
}

// ─── Apply all active filters to a subtree ───────────────────────────────────

function applyFilters(root) {
  if (settings.hideShorts)    filterShorts(root);
  if (settings.hidePlaylists) filterPlaylists(root);
  if (settings.hideMixes)     filterMixes(root);
  if (settings.hideLowViews)  filterLowViews(root, settings.minViews);
}

// ─── Full re-scan (after settings change or navigation) ──────────────────────

function fullRescan() {
  // Remove all previously applied filters first, then reapply from scratch
  // so toggling a filter OFF actually reveals content again.
  removeAllFilters();
  applyFilters(document.body);
}

// ─── MutationObserver — catch dynamically added content ──────────────────────

const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        applyFilters(/** @type {Element} */ (node));
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// ─── YouTube SPA navigation ───────────────────────────────────────────────────

document.addEventListener('yt-navigate-finish', () => {
  // Small delay to let YouTube render the new page content
  setTimeout(fullRescan, 300);
});

// Also catch yt-page-data-updated which fires on subsequent renders
document.addEventListener('yt-page-data-updated', () => {
  setTimeout(fullRescan, 100);
});

// ─── Settings: load and watch ─────────────────────────────────────────────────

chrome.storage.sync.get(DEFAULTS, stored => {
  settings = { ...DEFAULTS, ...stored };
  applyFilters(document.body);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in settings) settings[key] = newValue;
  }
  fullRescan();
});
