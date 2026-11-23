# Firefox Add-ons listing: copy & answers

Paste these into the Firefox Add-ons Developer Hub (https://addons.mozilla.org/developers/) when you
submit a new add-on. Edit to taste. The Chrome Web Store copy is in [STORE_LISTING.md](STORE_LISTING.md).

## Upload

- **Where to list it:** On this site.
- **File:** the zip from `npx web-ext build --ignore-files test "test/**" screenshots "screenshots/**" "*.md"`.
  It needs `manifest.json` at the top level of the zip, which `web-ext build` does.
- **Platforms:** Firefox only. The manifest needs Firefox 140, and the Android build isn't supported
  (it needs Firefox for Android 142 and hasn't been tested).
- **Source code:** "Do you use any of the following in your extension: code generators,
  minifiers, template engines, transpilers?" Answer **No**: every file is hand-written and
  shipped as is, so no source upload is needed.

## Name (max 50 chars)

YouTube: Don't Recommend Channel

## Add-on URL

youtube-dont-recommend

## Summary (max 250 chars)

Tell YouTube to stop recommending a channel while you watch it: one click on the button next to
Subscribe, or Shift+B, sends YouTube's own "Don't recommend channel" feedback.

## Description

Watching a video and realise it's lazy AI-generated slop? YouTube makes this
weirdly hard: the "Don't recommend channel" option is buried in the 3-dots menu
on a thumbnail, and it isn't on the page for the video you're actually watching.

This extension fixes that. While watching, hit the "🚫 Don't recommend" button
next to Subscribe, or press Shift+B. The extension sends YouTube's own "Don't
recommend channel" feedback for that channel, exactly as if you'd used the menu
yourself. Because it's YouTube's own signal, it applies to your whole YouTube
account, on every device.

The toolbar popup lists the channels you've told YouTube about, lets you rebind
the shortcut, and exports the list as JSON.

No accounts, no tracking, no data sent to the developer. You need to be signed in
to YouTube.

## Categories

- Photos, Music & Videos

AMO doesn't accept "Other" alongside another category.

## Tags

youtube, content blocker

AMO tags come from a fixed list (`https://addons.mozilla.org/api/v5/addons/tags/`); "recommendations"
and "block channel" aren't on it.

## Support

- **Support website:** https://github.com/Bates-Solutions/youtube-dont-recommend/issues
- **Support email:** leave blank, or a team address.

## License

MIT License

## Privacy policy

Tick "This add-on has a privacy policy" and paste [PRIVACY.md](PRIVACY.md).

## Data collection

The manifest declares `data_collection_permissions: { required: ["none"] }`, so Firefox shows no
data-collection prompt and the listing says it collects no data. That matches PRIVACY.md: what the
extension stores stays in the browser's local extension storage. Its only network request is YouTube's
own `/youtubei/v1/feedback` call, made only when the user clicks the button or presses the shortcut,
to www.youtube.com under the user's own session, carrying only a token YouTube issued. Nothing is sent
to the developer or any third party.

## Notes to reviewer

The extension has two content scripts on www.youtube.com:

- `page.js` runs in the page's own world (`"world": "MAIN"`). It reads the "Don't recommend channel"
  feedback token YouTube attaches to each recommended video, from `ytInitialData`, the
  `yt-navigate-finish` event, and the JSON responses of the page's own `fetch` calls to
  `/youtubei/v1/` `next`, `browse`, `search`, `player` and `feedback`, which it wraps to read.
  For `/feedback` it also reads the request body, to match the response to the token sent. It
  doesn't change any request or send their contents anywhere.
- To send, `page.js` builds a fresh "Don't recommend channel" feedback command from a validated
  token (it never runs a command it was handed) and passes it to YouTube's own command handler,
  `ytd-app.resolveCommand`, or failing that dispatches a `yt-action` event, the same path
  YouTube's 3-dots menu uses. It then watches YouTube's `/feedback` response to confirm it.
- If there is no token for the channel, `content.js` falls back to opening the 3-dots menu on one
  of the channel's thumbnails and clicking its "Don't recommend channel" item with synthetic
  clicks. While it does, a CSS rule (`data-ydr-driving` on the root element) hides the menu popup
  so it doesn't flash.
- Both send paths run only when the user clicks the button or presses the shortcut.
- `content.js` runs in the isolated world. It adds the button and the Shift+B shortcut, validates
  the tokens `page.js` reports before storing them, and keeps everything in `storage.local`:
  the channel history and shortcut setting, the token cache (up to 1,000, each with its video and
  channel ID) and a log of the last 100 sends. The two scripts exchange JSON strings through `CustomEvent`s on `document`.

No remote code is loaded and nothing is sent anywhere except YouTube's own feedback request, under
the user's YouTube session, when they ask. To test it: sign in to YouTube, open any video, and click
**🚫 Don't recommend** next to Subscribe. The channel then appears in the extension's popup, and the
feedback in Google My Activity under "YouTube 'Not interested' feedback".

## Screenshots

Upload in this order (1280×800):

1. `screenshots/1-watch-page.png`: a watch page after a click, the button reading "Told YouTube"
   next to Subscribe.
2. `screenshots/2-popup.png`: the popup with a signalled channel and the shortcut setting.
