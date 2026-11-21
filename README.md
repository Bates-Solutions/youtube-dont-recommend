# YouTube: Don't Recommend Channel

A Chromium extension (Chrome / Brave / Edge / Vivaldi) that lets you tell YouTube
to stop recommending a channel **while you're watching one of its videos**, with
no digging through the 3-dots menu on a thumbnail.

Watching something and realise it's lazy AI slop? Hit the **🚫 Don't recommend**
button next to Subscribe, or press **Shift+B**. The extension sends YouTube's own
"Don't recommend channel" feedback for that channel, the same signal as the item
in a thumbnail's 3-dots menu. Because it's YouTube's own signal, it applies to
your whole account, on every device, not just this browser.

## Block while watching, two ways

- **Button:** hit **🚫 Don't recommend** next to Subscribe.
- **Keyboard shortcut:** press **Shift+B** (rebindable in the popup).

The button changes to **Told YouTube** once you've sent the signal for that
channel.

## What it does and doesn't do

- It **does** send YouTube's "Don't recommend channel" feedback, once per click.
  To do that it finds one of the channel's videos in the recommendations next to
  the video, opens that video's 3-dots menu (hidden, so nothing flashes) and
  clicks the item.
- It **doesn't** hide anything itself. What you see afterwards is up to YouTube's
  recommendations.
- If none of the channel's videos are in the recommendations yet, it says so;
  scroll the sidebar and try again.
- You need to be signed in to YouTube; signed out, the menu has no "Don't
  recommend channel" item.

## Install (unpacked)

1. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder.
4. Open any YouTube video. A **🚫 Don't recommend** button appears next to
   Subscribe.

## The popup

Click the extension's toolbar icon to:

- See the channels you've told YouTube about (newest first) and open their pages.
- Remove a channel from that list (× button). This only edits the list; it
  doesn't undo the signal at YouTube.
- Rebind the keyboard **Shortcut** (click it, then press your combo).
- **Export** the list as JSON, or **Clear list**.

To undo it, use Google's own controls: in My Activity, under "Other activity",
"YouTube 'Not interested' feedback" can be deleted. That clears all of it at once,
not one channel.

## How it works

- `content.js` runs on `youtube.com`, adds the watch-page button and the shortcut,
  and drives the 3-dots menu of one of the current channel's recommendation cards.
  A `MutationObserver` and YouTube's `yt-navigate-finish` events keep the button
  in place through the site's single-page navigation.
- The list of channels you've signalled, and your shortcut, live in
  `chrome.storage.local`.

## Notes / limits

- It matches the menu item by the text "…recommend channel", so it currently
  works on **English** YouTube only.
- YouTube changes its DOM often. If the button stops appearing or the signal stops
  sending, the selectors in `content.js` may need a refresh.
