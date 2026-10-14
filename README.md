<p align="center">
  <img src="extension/icons/icon-128.png" width="96" height="96" alt="Desktop GIFs icon">
</p>

<h1 align="center">Desktop GIFs</h1>

<p align="center">
  <strong>Post GIFs in YouTube comments and replies from a desktop browser.</strong>
</p>

<p align="center">
  <a href="https://github.com/rayytor/desktop_gifs/releases/latest"><img src="https://img.shields.io/github/manifest-json/v/rayytor/desktop_gifs?filename=extension%2Fmanifest.json&label=version&color=ff0033" alt="Version"></a>
  <img src="https://img.shields.io/badge/Chrome-121%2B-4285F4?logo=googlechrome&logoColor=white" alt="Chrome 121 or newer">
  <img src="https://img.shields.io/badge/Firefox-140%2B-FF7139?logo=firefoxbrowser&logoColor=white" alt="Firefox 140 or newer">
  <img src="https://img.shields.io/badge/Manifest-V3-34A853" alt="Manifest V3">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/rayytor/desktop_gifs" alt="License: GPL-3.0"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#use">Use</a> ·
  <a href="#troubleshooting">Troubleshooting</a> ·
  <a href="#limits">Limits</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#privacy">Privacy</a>
</p>

<p align="center">
  <img src="screenshots/picker.png" width="720" alt="The GIF picker open above a comment box, showing search results for &quot;cat&quot;, one of them starred as a favorite">
</p>

YouTube's mobile app can attach a GIF to a comment; the desktop site has no button for it. Desktop GIFs adds one, next to the emoji button:

<p align="center">
  <img src="screenshots/button.png" width="720" alt="The GIF button next to the emoji button in a comment box">
</p>

- **Everyone sees your GIF.** It is posted as an ordinary YouTube GIF comment, so viewers do not need the extension.
- **Write around it.** Pick a GIF, keep typing, then post with YouTube's own Comment button.
- **Search or paste.** Search Tenor, or paste a Tenor link.
- **Favorites.** Star the GIFs you use often and find them behind one button.
- **Nothing to set up.** No account, no API key, no tracking.

<sub>The screenshots show the extension's own interface on a test page that stands in for YouTube's comment box.</sub>

## Install

Desktop GIFs is not on the Chrome Web Store or addons.mozilla.org yet, so it is loaded from a ZIP. There is one for each browser on the [latest release](https://github.com/rayytor/desktop_gifs/releases/latest).

<p>
  <a href="https://github.com/rayytor/desktop_gifs/releases/latest/download/desktop-gifs-chromium.zip"><img src="https://img.shields.io/badge/Download-Chrome%20%C2%B7%20Edge%20%C2%B7%20Brave-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Download for Chrome, Edge and Brave"></a>
  <a href="https://github.com/rayytor/desktop_gifs/releases/latest/download/desktop-gifs-firefox.zip"><img src="https://img.shields.io/badge/Download-Firefox-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white" alt="Download for Firefox"></a>
</p>

### Chrome, Edge, Brave

1. Download [`desktop-gifs-chromium.zip`](https://github.com/rayytor/desktop_gifs/releases/latest/download/desktop-gifs-chromium.zip) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the unzipped folder, the one that has `manifest.json` directly inside it.

YouTube tabs that are already open get the button without a refresh.

Only Chrome is tested. Edge, Brave and other Chromium browsers should work the same way.

### Firefox

1. Download [`desktop-gifs-firefox.zip`](https://github.com/rayytor/desktop_gifs/releases/latest/download/desktop-gifs-firefox.zip). There is no need to unzip it.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and choose the ZIP.

YouTube tabs that are already open get the button without a refresh.

> [!NOTE]
> Firefox removes an add-on loaded this way when it closes. That is how Firefox treats every temporary add-on. Repeat steps 2 and 3 after a restart.

### From the source

The `extension` folder of this repository is the extension, and it loads in both browsers as it is: choose that folder in Chrome, or the `manifest.json` inside it in Firefox. Chromium browsers then list one harmless error about `background.scripts`; see [Troubleshooting](#troubleshooting).

## Use

1. On a video or a Short, click **Add a comment…** or **Reply**.
2. Click the **GIF** button next to the emoji button.
3. Click a GIF. It is attached to the comment box, below your text.
4. Write or edit your text, then click **Comment** (or press <kbd>Ctrl</kbd>+<kbd>Enter</kbd>).

The text in the comment box is posted together with the GIF. A comment can also be just the GIF. To take the GIF off, click the **×** in its corner; picking another GIF replaces it.

The picker opens with Tenor's featured GIFs. To find another one:

- type to search Tenor, or
- paste a Tenor link: a `tenor.com/view/…` page, a `media.tenor.com` file, or a bare Tenor ID.

To keep a GIF, point at it and click the star in its corner. The **★** button next to the search field shows your favorites; click it again to go back to the search. Click a favorite's star to remove it. Favorites are shared by all your YouTube tabs and are still there after a browser restart, in Firefox too, once the add-on is loaded again. Removing the extension from the browser deletes them.

| Key | What it does |
| --- | --- |
| <kbd>Enter</kbd> | In the search field, attaches the GIF when the picker shows exactly one, as it does after pasting a link |
| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | In a comment box with a GIF attached, posts the comment |
| <kbd>Esc</kbd> | Closes the picker |

## Troubleshooting

| What you see | What to do |
| --- | --- |
| No **GIF** button in the comment box | Refresh the YouTube tab. |
| "Not ready in this tab yet" | The tab was open before the install and the extension is still checking that it can post from it. Try again in a few seconds, or refresh the tab. |
| "The page hook is not running" or "The extension was reloaded" | Refresh the YouTube tab. |
| "The GIF was not sent" | YouTube did not send the comment. Press its Comment button again. |
| The post fails | Nothing is published, and your text and the GIF stay in the box. Try again. |
| "YouTube is not taking GIF comments from desktop for your account or network right now" | Since 14 October 2026 YouTube blocks GIF comments sent from desktop for some accounts or networks for a while, often after several GIFs have been posted. The extension already tried again. The GIF is not the cause, so picking another one will not help. Your text and the GIF stay in the box; try again later. The YouTube phone app may still post GIFs from the same account. |
| "YouTube turned it down. Trying again…" | YouTube blocked the comment and the extension is retrying on its own. Wait for it to finish; there is no need to click again. |
| "Either Tenor does not rate the GIF G, or YouTube is not taking GIF comments" | Tenor could not be asked for the GIF's rating, so the extension does not know which one it is. Try a GIF from the picker's search results: those are rated G. |
| "YouTube does not accept this GIF" | YouTube looked the GIF up and will not take it. Pick a different GIF. |
| "YouTube only takes GIFs that Tenor rates G" | The GIF has another rating on Tenor. The extension checks a pasted link when you pick it, and a favorite or a GIF without a rating just before posting. Pick a different GIF. |
| "Checking the GIF…" | The GIF was picked without a rating, so the extension asks Tenor for it before posting. This takes at most five seconds; if Tenor does not answer, the comment is posted anyway. |
| "YouTube rejected this GIF comment" | YouTube refused the comment for another reason. Its own explanation, if it gave one, follows the HTTP status. Nothing was posted. |
| "YouTube did not confirm this GIF comment" | YouTube's answer could not be read, so the comment may or may not be up. Check the comments before posting again. |
| Search finds nothing in Firefox | Open `about:addons`, select Desktop GIFs, and check under **Permissions** that access to `tenor.com` is on. |
| "Manifest file is missing or unreadable" | The wrong folder was chosen. Choose the folder that has `manifest.json` directly inside it. |
| Chrome, Edge or Brave lists the error `'background.scripts' requires manifest version of 2 or lower` | The extension is installed and works. The message appears when the `extension` folder is loaded from the source; that key is there for Firefox. `desktop-gifs-chromium.zip` does not have it. |
| Clicking **GIF** does nothing in Firefox | Update to 0.1.1 or newer. |

If posting keeps failing, open the browser's developer tools and look for **Desktop GIFs: comment not confirmed** in the YouTube tab's Console; Chromium also lists it among the extension's errors. It gives the endpoint, the Tenor ID, whether the GIF was rated G, whether there was text, how YouTube answered (`kind`), how many tries were made, the HTTP and API status and YouTube's own message. It holds no comment text, headers, cookies or response body, so it can be pasted into a bug report as it is.

## Limits

- **Unofficial.** This project is not affiliated with YouTube, Google or Tenor. It sends a field that YouTube's desktop site does not use itself, so it can stop working whenever YouTube changes something, and using it is at your own risk under YouTube's Terms of Service.
- **Tenor only.** YouTube's GIF comments take Tenor GIFs, so a GIF file from your computer cannot be posted.
- **YouTube may block it for a while.** Since 14 October 2026 YouTube blocks GIF comments sent from desktop for some accounts or networks, apparently for a while and often after several GIFs have been posted, while others still post normally. When it blocks a G-rated GIF, the extension tries three times in about six seconds, then stops. A blocked try posts nothing, so a retry never posts twice. Some people also report GIF comments posted from desktop being removed a few seconds later.
- **G-rated GIFs only.** YouTube turns down every GIF that Tenor does not rate G, so the picker shows only those, and a pasted link to any other GIF is not offered.
- **Search depends on Tenor's website.** Tenor closed its public API in June 2026. Search and ratings come from the API that tenor.com itself uses, with the key its pages carry, and fall back to the results in Tenor's web pages, which have no ratings. Either can break when Tenor changes its site.
- **GIFs only.** Stickers and still images are left out of the results.
- **New comments and replies only.** You cannot add a GIF while editing a comment or writing a channel post.

## How it works

When you pick a GIF, the content script attaches it to the comment box. When you press Comment, it adds a one-time marker to the end of your text and lets YouTube's own Comment button go through. YouTube builds and signs the request as usual. The main-world script catches that request, removes the marker and adds the GIF's Tenor ID. A marker that cannot be turned into a GIF is blocked, so it never appears as comment text.

| File | Runs in | Job |
| --- | --- | --- |
| `src/content.ts`, `src/content.css` | YouTube page, isolated world | Adds the GIF button and the picker |
| `src/main.ts` | YouTube page, main world | Rewrites the comment request so it carries the GIF |
| `src/sw.ts` | Service worker (background script in Firefox) | Fetches G-rated search results from Tenor; on install, adds the two scripts above to YouTube tabs that are already open |

The project is TypeScript-first. `npm run build` compiles the source files into `extension/dist`, and the manifest loads those generated files. `python3 tools/package.py` writes the release ZIPs from the built extension.

`node --test tests/main.test.cjs tests/sw.test.cjs` (Node.js 22 or newer) checks how comment requests are rewritten, how YouTube's answers are read and retried, and the Tenor rating check, against simulated responses. `python3 tests/picker.browser.py` drives the real content script in Chromium and Firefox on a local page that imitates YouTube's comment boxes and a notification reply dialog; it needs Python's `playwright` package and its browsers (`python3 -m playwright install chromium firefox`). Neither posts anything to YouTube.

## Privacy

- **YouTube and Tenor, nothing else:** `youtube.com`, where it adds the button, and for search `tenor.com` and Tenor's API at `tenor.googleapis.com`.
- **Nothing collected.** No analytics, no account.
- **Favorites stay in your browser.** They are kept in the extension's own local storage and are not sent anywhere.
- **Search goes to Tenor without your cookies**, and GIF previews load from Tenor's media servers.
- **Your YouTube credentials are never read.** YouTube's own page sends the comment.

## License

Copyright (C) 2026 rayytor

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3. It is distributed without any warranty. See [LICENSE](LICENSE).
