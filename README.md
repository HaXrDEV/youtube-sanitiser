![Banner](docs/banner.svg)

YouTube Sanitiser is a small Chrome extension that tidies up YouTube. It hides Shorts, playlists, mixes and, if you like, videos hardly anyone has watched, so your home page and sidebar are mostly the videos you actually came for.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-red)
![Chrome](https://img.shields.io/badge/Chrome-extension-blue)
![No build step](https://img.shields.io/badge/build-none-lightgrey)

![Screenshot](docs/screenshot.png)

## What it hides

Click the extension's icon in the toolbar and switch off whatever you don't want to see. Changes show up straight away in every open YouTube tab, and if you use Chrome sync, your settings follow you to your other computers.

- **Shorts.** The Shorts shelf on the home page, and Shorts in the sidebar next to a video.
- **Playlists.** Playlist cards in your feed, in search results and in the sidebar. They stay put on your library's playlists page and on a channel's Playlists tab, since that's where you'd go looking for them.
- **Mixes.** The endless "Mix" playlists YouTube puts together for you.
- **Low view count.** Hides videos with fewer views than a number you choose (10,000 to start with). Turn on **Exclude subscribed channels** if you still want everything from the channels you follow, however small they are. To know who you follow, it reads your subscriptions from YouTube's sidebar, briefly opening its "Show more" list. The list is never saved or sent anywhere (see the [privacy policy](privacy-policy.md)).

Shorts, playlists and mixes are hidden from the moment you install it. The view count filter stays off until you turn it on.

The view count filter understands YouTube in English, Danish, Norwegian, Swedish, German, French, Spanish, Portuguese, Italian, Dutch, Finnish, Polish, Russian, Turkish and Indonesian. In other languages it may not recognise every count, and a video whose count it can't read is left alone.

## Installing

It's waiting for review on the Chrome Web Store. Until it's there, you can load it yourself:

1. Clone or download this repository.
2. Open `chrome://extensions` and switch on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and pick the repository folder.

If you change the code, click the reload button (↺) on the extension's card and refresh your YouTube tabs to see it. If you're curious how it finds and hides things, [docs/how-it-works.md](docs/how-it-works.md) walks through it.
