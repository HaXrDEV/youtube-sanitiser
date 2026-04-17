/**
 * YouTube Sanitiser — popup script
 * Loads settings from chrome.storage.sync and saves on every change.
 */

const DEFAULTS = {
  hideShorts:    true,
  hidePlaylists: true,
  hideMixes:     true,
  hideLowViews:  false,
  minViews:      10000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a number with thousands separators: 10000 → "10,000" */
function formatNumber(n) {
  return Number(n).toLocaleString('en-US');
}

/** Strip commas/spaces and parse: "10,000" → 10000 */
function parseNumber(str) {
  const n = parseInt(str.replace(/[,\s]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function getEl(id) {
  return document.getElementById(id);
}

/** Show/hide and enable/disable the min-views sub-row */
function updateMinViewsVisibility(show) {
  const row = getEl('minViewsRow');
  const input = getEl('minViews');
  if (show) {
    row.classList.remove('hidden');
    input.disabled = false;
  } else {
    row.classList.add('hidden');
    input.disabled = true;
  }
}

// ─── Populate UI from settings ────────────────────────────────────────────────

function applyToUI(s) {
  getEl('hideShorts').checked    = !!s.hideShorts;
  getEl('hidePlaylists').checked = !!s.hidePlaylists;
  getEl('hideMixes').checked     = !!s.hideMixes;
  getEl('hideLowViews').checked  = !!s.hideLowViews;
  getEl('minViews').value        = formatNumber(s.minViews ?? DEFAULTS.minViews);
  updateMinViewsVisibility(!!s.hideLowViews);
}

// ─── Read current UI state into a settings object ────────────────────────────

function readFromUI() {
  return {
    hideShorts:    getEl('hideShorts').checked,
    hidePlaylists: getEl('hidePlaylists').checked,
    hideMixes:     getEl('hideMixes').checked,
    hideLowViews:  getEl('hideLowViews').checked,
    minViews:      parseNumber(getEl('minViews').value),
  };
}

// ─── Save settings ────────────────────────────────────────────────────────────

function save() {
  const s = readFromUI();
  chrome.storage.sync.set(s);
  updateMinViewsVisibility(s.hideLowViews);
}

// ─── Initialise ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Load stored settings, fall back to defaults
  chrome.storage.sync.get(DEFAULTS, stored => {
    applyToUI({ ...DEFAULTS, ...stored });
  });

  // Wire up all checkboxes to auto-save
  ['hideShorts', 'hidePlaylists', 'hideMixes', 'hideLowViews'].forEach(id => {
    getEl(id).addEventListener('change', save);
  });

  // Min-views input: save on blur, format on blur, strip on focus
  const minViewsInput = getEl('minViews');

  minViewsInput.addEventListener('focus', () => {
    minViewsInput.value = minViewsInput.value.replace(/,/g, '');
  });

  minViewsInput.addEventListener('blur', () => {
    const n = parseNumber(minViewsInput.value);
    minViewsInput.value = formatNumber(n || DEFAULTS.minViews);
    save();
  });

  // Allow Enter to confirm the input
  minViewsInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') minViewsInput.blur();
  });

  // Prevent non-numeric characters
  minViewsInput.addEventListener('input', () => {
    minViewsInput.value = minViewsInput.value.replace(/[^\d,]/g, '');
  });
});
