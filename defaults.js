/**
 * YouTube Sanitiser: default settings
 * Shared by the content script and the popup, each of which loads this file first.
 */

const DEFAULTS = {
  hideShorts:        true,
  hidePlaylists:     true,
  hideMixes:         true,
  hideLowViews:      false,
  minViews:          10000,
  excludeSubscribed: false,
};
