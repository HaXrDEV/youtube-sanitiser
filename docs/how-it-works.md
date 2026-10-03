# How it works

YouTube Sanitiser has no build step and no background script. The manifest loads two content scripts on YouTube pages, `defaults.js` (the default settings) and `content.js` (everything else), and the popup reads and writes the settings.

## Hiding things

`content.js` adds a small stylesheet to the page and hides things by giving them the `yt-sanitised` class, which sets `display: none`. Because the element is taken out of the layout rather than blanked, a hidden video doesn't leave a gap. A grid row whose videos are all hidden is collapsed too.

What gets hidden depends on the filter:

- **Shorts:** the Shorts shelf on the home page and in search, and sidebar videos marked as Shorts.
- **Playlists and mixes:** the older playlist and mix renderers, plus cards in YouTube's newer "lockup" layout whose content ID starts with `PL` (playlist) or `RD` (mix). Video IDs are always 11 characters long, so a plain video whose ID happens to start with those letters isn't mistaken for one. Playlists aren't hidden on `/feed/playlists` or a channel's Playlists tab.
- **Low view count:** any video card whose view count is below your minimum.

## Keeping up with YouTube

YouTube builds most of the page after it loads, as you scroll and as you click around without a full page reload. The script handles that in two ways:

- A `MutationObserver` watches the page for new elements. Each one is filtered through the video card it belongs to, so a view count that arrives after its card still gets checked, and a freshly added card is checked once more shortly after, in case its details were still loading.
- When YouTube reports a navigation (the `yt-navigate-finish` and `yt-page-data-updated` events), every filter is removed and applied again from scratch.

A card is always checked from scratch, not just added to, because YouTube reuses cards for different videos. Otherwise a card that once showed a low-view video would stay hidden after it started showing a popular one.

## Reading view counts

Video cards come in a few shapes: the older `ytd-rich-item-renderer`, `ytd-video-renderer` and `ytd-compact-video-renderer`, and the newer `yt-lockup-view-model`, which sits inside a rich item on the home page and stands on its own in the watch page sidebar.

The view count is found among the card's text. A piece of text counts as a view count when:

- it reads like one, a number followed by the word for "views" (`1.2K views`, `1,2 mio. visninger`), or
- its accessibility label reads like one. Many languages now show only the number on screen, so Danish shows `54.947` while the label says "54.947 visninger", or
- it's in the slot of a search result that only ever holds the view count or the upload date.

The number is then read with the locale's separators (`1.234` and `1,234` both mean 1234) and its short magnitude suffix: `K`, `M` and `B` in English, `t.` and `mio.` in Danish, `тыс.` and `млн` in Russian, and so on for each supported language. The few suffixes that mean different things in different languages, like Turkish `B` (thousand, not billion), are picked by the page's language. A count the script can't read with confidence is skipped, and that video stays visible.

## Subscribed channels

**Exclude subscribed channels** needs to know who you're subscribed to. The script reads the channel list from YouTube's sidebar, briefly opening its "Show more" list so the whole list is there, then closes it again. It does this only while the option is on, and keeps the list in memory for as long as the page is open.

A card is matched to a channel by its channel link, or by the channel name for lockup cards, which don't link to the channel.

## Settings

Settings live in `chrome.storage.sync`, so Chrome syncs them across your computers if sync is on. The popup saves each change straight away, and the content script listens for `chrome.storage.onChanged`, so a toggle takes effect in every open YouTube tab without a reload. The content script starts filtering only once it has loaded your settings, so nothing stays hidden by a filter you've turned off.
