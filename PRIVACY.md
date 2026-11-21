# Privacy Policy: YouTube: Don't Recommend Channel

_Last updated: 2026-11-21_

This extension is designed to collect **no personal data**.

## What it stores

- A list of the channels you've told YouTube not to recommend, and your keyboard
  shortcut.
- The "Don't recommend channel" commands YouTube attaches to the videos it shows
  you (up to 1,000), each with its video and channel ID, so the button can send
  the right one later. These are opaque tokens issued by YouTube for your
  account; they contain no browsing history beyond which video and channel each
  belongs to.
- A log of the last 100 sends: when, which video and channel, how old the token
  was, and whether YouTube accepted it.

All of this is saved **locally in your browser** using
  `chrome.storage.local`. It never leaves your device except via features you
  explicitly use (the Export button, which saves a file where you choose, and
  Chrome's own optional sync if you have extension sync enabled).

## What it does not do

- It does **not** collect, transmit, or sell any personal or browsing data.
- It contains **no analytics, tracking, or advertising**.
- It sends **nothing** to the developer or any third-party server.

## Network activity

When you click the button or use the shortcut, the extension clicks YouTube's own
built-in "Don't recommend channel" menu item on your behalf, exactly as if you
clicked it yourself. That request goes to YouTube (Google) under your own YouTube
session; the developer neither sees nor receives any of it. Nothing is sent
unless you click the button or press the shortcut.

## Permissions

- **storage**: to save your list of channels and your shortcut locally.
- **host access to `youtube.com`**: to add the button and shortcut to the watch
  page, read the "Don't recommend channel" command YouTube includes with each
  recommended video, and trigger YouTube's own "Don't recommend channel" action.
  A script in the page reads YouTube's page data and responses for this; it
  changes nothing and sends nothing anywhere.

## Contact

Questions: `mike@bates-solutions.com`
