# Privacy Policy: YouTube: Don't Recommend Channel

_Last updated: 2026-11-21_

This extension is designed to collect **no personal data**.

## What it stores

- A list of the channels you've told YouTube not to recommend, and your keyboard
  shortcut.
- The "Don't recommend channel" tokens YouTube attaches to the videos it shows
  you (up to 1,000), each with its video and channel ID, so the button can send
  the right one later. These are opaque tokens issued by YouTube for your
  account; they contain no browsing history beyond which video and channel each
  belongs to.
- A log of the last 100 sends: when, which video and channel, how old the token
  was, and whether YouTube accepted it.

All of this is saved **locally in your browser** using `chrome.storage.local`,
which the browser does not sync between devices. It never leaves your device except
through the Export button, which saves the channel list to a file where you
choose.

## What it does not do

- It does **not** collect, transmit, or sell any personal or browsing data.
- It contains **no analytics, tracking, or advertising**.
- It sends **nothing** to the developer or any third-party server.

## Network activity

The extension's only network activity is YouTube's own "Don't recommend
channel" feedback, sent when you click the button or press the shortcut, and
never otherwise. It asks YouTube's page to send that feedback for the channel
you're watching, using a token YouTube gave out with one of that channel's
videos. If it has no token for the channel, it clicks the "Don't recommend
channel" item in one of the channel's thumbnail menus instead, exactly as if you
clicked it yourself. Either way the request goes to YouTube (Google) under your
own YouTube session; the developer neither sees nor receives any of it.

To find the tokens, a script in the YouTube page watches the data YouTube's page
loads (its own requests to youtube.com, which it wraps to read the responses).
It reads that data; it doesn't change it, and it doesn't send it anywhere.

## Permissions

- **storage**: to save, locally, your list of channels, your shortcut, the saved
  tokens, and the log of sends.
- **host access to `youtube.com`**: to add the button and shortcut to the watch
  page, read the "Don't recommend channel" tokens YouTube includes with each
  recommended video, and send YouTube's own "Don't recommend channel" feedback
  when you ask.

## Contact

Questions: `mike@bates-solutions.com`
