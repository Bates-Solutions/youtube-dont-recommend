# Chrome Web Store listing: copy & answers

Paste these into the Developer Dashboard fields. Edit to taste.

## Name (max 45 chars)

YouTube: Don't Recommend Channel

## Summary (max 132 chars)

Tell YouTube to stop recommending a channel while you watch it: one click or
Shift+B sends YouTube's own block signal.

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

## Category

Productivity

## Single purpose (required)

Let users send YouTube's "Don't recommend channel" feedback for the channel
they're watching, from the watch page.

## Permission justifications (required)

- storage: Save, locally, the list of channels the user has signalled, their
  keyboard shortcut, and the "Don't recommend channel" commands YouTube attached
  to the videos it showed them, so the watch-page button can send the right one.
- Host permission (https://www.youtube.com/*): Add the button and shortcut to the
  watch page; read the "Don't recommend channel" command that YouTube includes
  with each recommended video (a script in the page reads YouTube's own page data
  and responses for this, and changes nothing); and ask YouTube's page to send
  that command, exactly as its own 3-dots menu does.

## Data usage disclosures (check these)

- Does NOT collect or use user data. (Certify: no selling, no unrelated use, no
  creditworthiness use.)

## Assets checklist

- [x] Icon 128×128 (icons/icon128.png)
- [ ] Screenshot(s) 1280×800 or 640×400, at least one. Suggested shots:
      1. A watch page with the "🚫 Don't recommend" button next to Subscribe.
      2. The popup with a few channels and the shortcut setting.
- [ ] Privacy policy URL (host PRIVACY.md somewhere public, e.g. a GitHub repo).
- [ ] (Optional) Small promo tile 440×280.
