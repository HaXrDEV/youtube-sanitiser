/**
 * YouTube Sanitiser: content script
 * Runs on every youtube.com page. Hides Shorts, playlists, mixes,
 * and low-view-count videos based on settings stored in chrome.storage.sync.
 * DEFAULTS comes from defaults.js, which the manifest loads first.
 */

// ─── Inject hide stylesheet once ─────────────────────────────────────────────

(function injectStyles() {
  const style = document.createElement('style');
  style.id = 'yt-sanitiser-styles';
  style.textContent = [
    '.yt-sanitised { display: none !important; }',
    // Collapse grid rows whose video cards are all hidden
    'ytd-rich-grid-row:has(ytd-rich-item-renderer.yt-sanitised):not(:has(ytd-rich-item-renderer:not(.yt-sanitised))) { display: none !important; }',
  ].join('\n');
  (document.head || document.documentElement).appendChild(style);
})();

// ─── Settings ─────────────────────────────────────────────────────────────────

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
 * Like querySelectorAll but also tests root itself.
 * Needed because MutationObserver delivers the added node directly, and
 * node.querySelectorAll(sel) only searches descendants, never self.
 */
function queryAll(root, selector) {
  const els = Array.from(root.querySelectorAll(selector));
  if (root.matches?.(selector)) els.unshift(root);
  return els;
}

// A whole word meaning "views" in supported languages
const VIEW_WORD_RE = /^(?:views?|visning(?:er|ar)?|aufrufe?|vues?|visualiza(?:ção|ções|ción|ciones)|visualizzazion[ei]|weergaven?|näyttö[äa]|katselukertaa?|wyświetle(?:ń|nia|nie)|просмотр\p{L}*|görüntüleme|tayangan)$/iu;

// Zero-view phrasing, which has no number to parse
const NO_VIEWS_RE = /^no views$/i;

// Magnitude suffix multipliers across locales (keys lowercased, trailing dot stripped)
const VIEW_SUFFIX_MULTIPLIERS = {
  'k': 1e3, 'm': 1e6, 'b': 1e9,          // English (k/M also French, Dutch, Spanish)
  't': 1e3, 'mio': 1e6, 'mia': 1e9,      // Danish (tusind, million, milliard)
  'mill': 1e6, 'mrd': 1e9,               // Norwegian (million, milliard); mrd also German, Finnish, Italian
  'tn': 1e3, 'mn': 1e6, 'md': 1e9,       // Swedish (tusen, miljon, miljard); md also French
  'tsd': 1e3,                            // German (Tausend)
  'mil': 1e3, 'mi': 1e6, 'bi': 1e9,      // Spanish/Portuguese (mil = thousand, milhões, bilhões)
  'mln': 1e6, 'mld': 1e9,                // Dutch/Italian/Polish (miljoen, milione, milion; miljard, miliard)
  'milj': 1e6,                           // Finnish (miljoonaa)
  'tys': 1e3,                            // Polish (tysiąc)
  'тыс': 1e3, 'млн': 1e6, 'млрд': 1e9,   // Russian
  'mr': 1e9,                             // Turkish (milyar)
  'rb': 1e3, 'jt': 1e6,                  // Indonesian (ribu, juta)
};

// Suffixes that mean something else in one locale, keyed by that locale's view word
const VIEW_SUFFIX_OVERRIDES = {
  'görüntüleme': { 'b': 1e3 },  // Turkish: B = bin (thousand)
  'tayangan':    { 'm': 1e9 },  // Indonesian: M = miliar (billion)
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
 * Examples: "1.2K views", "1,2 t. visninger", "1.234 Aufrufe", "1,2 M de vues"
 * The number must be followed by a view word, optionally with a known magnitude
 * suffix (and "de"/"di") in between, so titles like "100 Reviews of ..." and
 * unknown suffixes are rejected rather than guessed. Returns a number or null.
 */
function parseViewText(text) {
  if (NO_VIEWS_RE.test(text)) return 0;
  const m = text.match(/^(\d[\d.,]*)\s*(.*)/su);
  if (!m) return null;
  const n = parseLocaleNumber(m[1]);
  if (isNaN(n)) return null;
  const [first, ...rest] = m[2].toLowerCase().split(/[\s.]+/);
  if (VIEW_WORD_RE.test(first)) return n;
  const viewWord = rest[0] === 'de' || rest[0] === 'di' ? rest[1] : rest[0];
  if (!viewWord || !VIEW_WORD_RE.test(viewWord)) return null;
  const multiplier = VIEW_SUFFIX_OVERRIDES[viewWord]?.[first] ?? VIEW_SUFFIX_MULTIPLIERS[first];
  return multiplier ? n * multiplier : null;
}

/**
 * Extract view count from a video renderer element.
 * Returns a number or null.
 */
function getViewCount(el) {
  for (const span of el.querySelectorAll('span')) {
    const count = parseViewText(span.textContent.trim());
    if (count !== null) return count;
  }
  return null;
}

// ─── Filter functions ─────────────────────────────────────────────────────────

const VIDEO_RENDERER_SELECTOR =
  'ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer';

/**
 * Hide lockups (YouTube's current card layout) whose content ID starts with
 * prefix. Video IDs are always 11 characters, so this skips ordinary videos
 * whose ID happens to start with the same letters.
 */
function filterLockups(root, prefix) {
  queryAll(root, `[class*="content-id-${prefix}"]`).forEach(el => {
    const id = [...el.classList].find(c => c.startsWith('content-id-'))?.slice('content-id-'.length);
    if (!id?.startsWith(prefix) || id.length === 11) return;
    const item = el.closest('ytd-rich-item-renderer, ytd-compact-video-renderer');
    if (item) sanitise(item);
  });
}

function filterShorts(root) {
  // Climb to ytd-rich-section-renderer so its padding/margin collapses too
  queryAll(root, 'ytd-rich-shelf-renderer[is-shorts]').forEach(el => {
    sanitise(el.closest('ytd-rich-section-renderer') || el);
  });
  queryAll(root, 'ytd-reel-item-renderer').forEach(el => {
    sanitise(el.closest('ytd-rich-item-renderer') || el);
  });
  queryAll(root, 'ytd-compact-video-renderer').forEach(el => {
    if (
      el.querySelector('[overlay-style="SHORTS"]') ||
      el.querySelector('ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]')
    ) sanitise(el);
  });
  queryAll(root, 'ytd-reel-shelf-renderer').forEach(el => {
    sanitise(el.closest('ytd-rich-section-renderer') || el);
  });
}

function isPlaylistsPage() {
  const p = window.location.pathname;
  // /feed/playlists (library) or /@handle/playlists / /channel/x/playlists (channel tab)
  return p === '/feed/playlists' || p.endsWith('/playlists');
}

function filterPlaylists(root) {
  if (isPlaylistsPage()) return;
  queryAll(root,
    'ytd-playlist-renderer, ytd-compact-playlist-renderer, ytd-grid-playlist-renderer'
  ).forEach(sanitise);
  filterLockups(root, 'PL');
}

function filterMixes(root) {
  queryAll(root, 'ytd-radio-renderer, ytd-compact-radio-renderer').forEach(sanitise);
  filterLockups(root, 'RD');
}

// ─── Subscription cache ───────────────────────────────────────────────────────

/**
 * In-memory set of known subscribed channel paths (e.g. "/@ChannelName").
 * Populated by reading the guide sidebar, expanding it if needed.
 */
let cachedSubscriptions = new Set();

function readGuideChannels() {
  document.querySelectorAll('ytd-guide-entry-renderer a[href^="/@"]')
    .forEach(a => cachedSubscriptions.add(a.getAttribute('href').split('?')[0]));
}

/**
 * Find the first non-navigating toggle button in the guide subscriptions
 * section (the "Show more" / "Show less" button). It is identified as the
 * first href-less guide entry that follows at least one channel entry.
 * Pass skipHidden=true to ignore CSS-hidden entries (used when collapsing,
 * so we don't accidentally re-click the now-hidden "Show more").
 */
function findGuideToggle(skipHidden = false) {
  let seenChannel = false;
  return [...document.querySelectorAll('ytd-guide-entry-renderer')].find(el => {
    if (skipHidden && el.offsetParent === null) return false;
    const href = el.querySelector('a')?.getAttribute('href');
    if (href?.startsWith('/@') || href?.startsWith('/channel/')) { seenChannel = true; return false; }
    return seenChannel && !href;
  });
}

function expandGuideSubscriptions() {
  const before = cachedSubscriptions.size;
  readGuideChannels();

  const showMore = findGuideToggle();
  if (showMore) {
    showMore.click();
    setTimeout(() => {
      readGuideChannels();
      if (settings.excludeSubscribed && cachedSubscriptions.size !== before) fullRescan();
      findGuideToggle(true)?.click(); // collapse back ("Show less")
    }, 400);
  } else if (settings.excludeSubscribed && cachedSubscriptions.size !== before) {
    fullRescan();
  }
}

let guideWatched = false;

/**
 * Wait for the guide sidebar to render subscription entries, then expand
 * and read them. The guide loads asynchronously after the page content,
 * so we observe the DOM rather than relying on a fixed point in time.
 * Only runs once, and only when "Exclude subscribed channels" is in use,
 * since it clicks entries in the user's sidebar.
 */
function watchForGuide() {
  if (guideWatched) return;
  guideWatched = true;
  if (document.querySelector('ytd-guide-entry-renderer a[href^="/@"]')) {
    expandGuideSubscriptions();
    return;
  }
  const watcher = new MutationObserver(() => {
    if (document.querySelector('ytd-guide-entry-renderer a[href^="/@"]')) {
      watcher.disconnect();
      expandGuideSubscriptions();
    }
  });
  watcher.observe(document.body, { childList: true, subtree: true });
}

/** Returns the channel path for a video card element, or null. */
function getChannelPath(el) {
  const a = el.querySelector('a[href^="/@"], a[href^="/channel/"]');
  return a ? a.getAttribute('href').split('?')[0] : null;
}

function filterLowViews(root, minViews) {
  queryAll(root, VIDEO_RENDERER_SELECTOR).forEach(el => {
    // Don't touch elements already hidden by another filter
    if (el.classList.contains('yt-sanitised')) return;
    const count = getViewCount(el);
    if (count !== null && count < minViews) {
      if (settings.excludeSubscribed) {
        const channelPath = getChannelPath(el);
        if (channelPath && cachedSubscriptions.has(channelPath)) return;
      }
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

// ─── MutationObserver: catch dynamically added content ───────────────────────

/**
 * Filter a subtree. A video renderer is re-evaluated from scratch, because
 * YouTube reuses renderer elements for new videos and a stale hide would stick.
 */
function refilter(root) {
  if (root.matches(VIDEO_RENDERER_SELECTOR)) unsanitise(root);
  applyFilters(root);
}

const recheckScheduled = new WeakSet();

const observer = new MutationObserver(mutations => {
  // Filter each added node via its enclosing video renderer (when it has one),
  // so metadata injected after its container (lazy-load on scroll) triggers a
  // pass over the whole container. The Set deduplicates nodes sharing one.
  const pending = new Set();
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = /** @type {Element} */ (node);
      pending.add(el.closest(VIDEO_RENDERER_SELECTOR) || el);
      // Freshly added renderers may still lack metadata: re-check once it settles.
      if (el.matches(VIDEO_RENDERER_SELECTOR) && !recheckScheduled.has(el)) {
        recheckScheduled.add(el);
        setTimeout(() => {
          recheckScheduled.delete(el);
          refilter(el);
        }, 800);
      }
    }
  }
  pending.forEach(refilter);
});

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

function watchGuideIfNeeded() {
  if (settings.hideLowViews && settings.excludeSubscribed) watchForGuide();
}

chrome.storage.sync.get(DEFAULTS, stored => {
  settings = { ...DEFAULTS, ...stored };
  // Start observing only once the real settings are known, and rescan from
  // scratch in case a navigation event already filtered with the defaults.
  fullRescan();
  observer.observe(document.body, { childList: true, subtree: true });
  watchGuideIfNeeded();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    // A removed key reports newValue undefined: fall back to its default
    if (key in settings) settings[key] = newValue ?? DEFAULTS[key];
  }
  watchGuideIfNeeded();
  fullRescan();
});
