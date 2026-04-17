# YouTube Sanitiser

A Chrome extension that removes unwanted content from YouTube so only the videos you actually want to see remain.

## Filters

| Filter | What it hides |
|---|---|
| **Hide Shorts** | The Shorts shelf on the homepage and Shorts in the watch-page sidebar |
| **Hide Playlists** | Playlist cards in the feed and sidebar |
| **Hide Mixes** | YouTube-generated auto-mix playlists |
| **Hide low view count** | Videos below a configurable minimum view threshold |
| ↳ **Minimum views** | The view count threshold (default 10,000) |
| ↳ **Exclude subscribed channels** | Exempt channels you're subscribed to from the low-view filter |

All filters apply instantly when toggled — no page refresh needed. Settings persist across browser restarts.

## Installation

1. Clone or download this repository
2. Open `icons/generate.html` in Chrome, download the three icon files, and save them into `icons/`
3. Go to `chrome://extensions`
4. Enable **Developer mode** (toggle in the top-right)
5. Click **Load unpacked** and select the `youtube-sanitiser` folder

To pick up code changes after editing files, click the reload button (↺) on the extension card in `chrome://extensions`, then refresh any open YouTube tabs.

## How it works

- A **content script** (`content.js`) runs on every `youtube.com` page
- It injects a CSS class `.yt-sanitised { display: none !important }` so filtered elements are completely removed from layout — no blank gaps
- A **MutationObserver** catches videos that load dynamically as you scroll, with a deduplicating `Set` that climbs to the nearest video renderer for each mutation so late-arriving metadata is handled correctly
- Settings are saved in `chrome.storage.sync` and pushed directly to the active tab via `chrome.tabs.sendMessage` for instant live updates when a toggle is flipped
- YouTube SPA navigation is handled by listening to `yt-navigate-finish` and `yt-page-data-updated` events

## Files

```
youtube-sanitiser/
├── manifest.json       Chrome extension manifest (MV3)
├── content.js          Filter logic, MutationObserver, view-count parser
├── popup.html          Settings popup structure
├── popup.css           Dark YouTube-style theme with CSS toggle switches
├── popup.js            Load/save settings, live update via messaging
└── icons/
    ├── generate.html   Open once in browser to produce icon PNGs
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
