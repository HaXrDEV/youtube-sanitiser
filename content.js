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

/**
 * Parse a YouTube view-count string like "1.2K views" → 1200.
 * Returns null if unparseable.
 */
function parseViewText(text) {
  const m = text.match(/([\d,.]+)\s*([KMBkmb]?)\s*views?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(n)) return null;
  const suffix = m[2].toUpperCase();
  if (suffix === 'K') n *= 1e3;
  else if (suffix === 'M') n *= 1e6;
  else if (suffix === 'B') n *= 1e9;
  return n;
}

/**
 * Extract view count from a video renderer element.
 * Returns a number or null.
 */
function getViewCount(el) {
  // Metadata lines contain view count + upload date spans
  const spans = el.querySelectorAll(
    '#metadata-line span, #metadata span, .ytd-video-meta-block span'
  );
  for (const span of spans) {
    const text = span.textContent.trim();
    if (/views?/i.test(text)) {
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
