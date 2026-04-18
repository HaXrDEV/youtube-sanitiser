![Banner](docs/banner.svg)

A Chrome extension that strips unwanted content from YouTube so only the videos you actually want to see remain.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-red)
![Chrome](https://img.shields.io/badge/Chrome-extension-blue)
![No build step](https://img.shields.io/badge/build-none-lightgrey)

---

## Filters

| Filter | What it hides |
| --- | --- |
| **Hide Shorts** | The Shorts shelf on the homepage and Shorts in the watch-page sidebar |
| **Hide Playlists** | Playlist cards in the feed and sidebar (skipped on `/feed/playlists` and channel playlist tabs) |
| **Hide Mixes** | YouTube-generated auto-mix playlists |
| **Hide low view count** | Videos below a configurable minimum view threshold |
| ↳ **Minimum views** | The view count threshold (default 10,000) |
| ↳ **Exclude subscribed channels** | Exempt channels you subscribe to from the low-view filter |

All filters apply instantly when toggled — no page refresh needed. Settings persist across browser restarts.

---

## Installation

### Chrome Web Store (coming soon)

The extension is pending Chrome Web Store review. Once published, it will be available to install there with no setup required.

### Load unpacked (developer)

1. Clone or download this repository
2. Open `icons/generate.html` in Chrome, download the three icon files, and save them into `icons/`
3. Go to `chrome://extensions`
4. Enable **Developer mode** (toggle in the top-right)
5. Click **Load unpacked** and select the repo folder

To pick up code changes after editing files, click the reload button (↺) on the extension card in `chrome://extensions`, then refresh any open YouTube tabs.

---

## How it works

- A **content script** (`content.js`) runs on every `youtube.com` page and injects `.yt-sanitised { display: none !important }`, so filtered elements are removed from layout with no blank gaps left behind
- A **MutationObserver** catches videos that load dynamically as you scroll; a deduplicating `Set` climbs to the nearest video renderer for each mutation so late-arriving view-count metadata is handled correctly
- **SPA navigation** is handled by listening to the `yt-navigate-finish` and `yt-page-data-updated` events YouTube fires on every client-side route change
- Settings are stored in `chrome.storage.sync` and pushed to the active tab via `chrome.tabs.sendMessage` for instant live updates whenever a toggle is flipped

---

## Project Structure

```text
youtube-sanitiser/
├── manifest.json       Chrome extension manifest (MV3)
├── content.js          Filter logic, MutationObserver, view-count parser
├── popup.html          Settings popup structure
├── popup.css           Dark YouTube-style theme with CSS toggle switches
├── popup.js            Load/save settings, live update via messaging
└── icons/
    ├── generate.html   Open once in a browser tab to produce the icon PNGs
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
