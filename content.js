/* YouTube: Don't Recommend Channel
 * Adds a "Don't recommend" button (and Shift+B shortcut) to the watch page.
 * Clicking it sends YouTube's own "Don't recommend channel" feedback for the
 * channel you're watching — by finding one of that channel's thumbnails in the
 * recommendations and triggering YouTube's real menu action on it.
 *
 * It does NOT hide anything locally; it only tells YouTube. That keeps the block
 * account-wide and avoids the refetch loop that per-card hiding caused.
 */
(() => {
  "use strict";

  const HISTORY_KEY = "blockHistory";
  const SETTINGS_KEY = "settings";

  const DEFAULT_SETTINGS = {
    shortcut: { key: "b", shift: true, alt: false, ctrl: false, meta: false },
  };
  let settings = { ...DEFAULT_SETTINGS };
  let history = []; // [{ keys, name, at }] — channels we've signalled

  /* ------------------------------------------------------------------ */
  /* Channel identity                                                   */
  /* ------------------------------------------------------------------ */

  const CHANNEL_LINK_SELECTOR =
    'a[href^="/@"], a[href*="/channel/"], a[href*="/c/"], a[href*="/user/"]';
  const CHANNEL_NAME_SELECTOR =
    "ytd-channel-name #text, ytd-channel-name a, " +
    "yt-content-metadata-view-model .ytContentMetadataViewModelMetadataRow";
  const CARD_SELECTOR = [
    "yt-lockup-view-model",
    "ytd-compact-video-renderer",
    "ytd-video-renderer",
    "ytd-rich-item-renderer",
    "ytd-grid-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-reel-item-renderer",
  ].join(",");
  const MENU_TRIGGER_SELECTOR =
    'button[aria-label="More actions"], yt-icon-button.dropdown-trigger, ' +
    "ytd-menu-renderer yt-icon-button#button, ytd-menu-renderer #button";

  function channelKeyFromHref(href) {
    if (!href) return null;
    let path;
    try {
      path = new URL(href, location.origin).pathname;
    } catch {
      return null;
    }
    let m;
    if ((m = path.match(/^\/channel\/(UC[\w-]+)/))) return "id:" + m[1];
    if ((m = path.match(/^\/(@[\w.\-]+)/))) return "handle:" + m[1].toLowerCase();
    if ((m = path.match(/^\/(?:c|user)\/([\w.\-]+)/)))
      return "legacy:" + m[1].toLowerCase();
    return null;
  }

  function normalizeName(s) {
    return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  // The channel of a recommendation card: { key, name } (either may be empty).
  function cardChannel(card) {
    const a = card.querySelector(CHANNEL_LINK_SELECTOR);
    const key = a ? channelKeyFromHref(a.getAttribute("href")) : null;
    const nameEl = card.querySelector(CHANNEL_NAME_SELECTOR);
    const name = nameEl ? nameEl.textContent.trim() : "";
    return { key, name };
  }

  // Every identifying key + name for the channel of the current watch page.
  function currentWatchChannel() {
    const keys = new Set();
    let name = "";

    const ownerLink = document.querySelector(
      "ytd-video-owner-renderer a.yt-simple-endpoint[href], " +
        "#owner #channel-name a[href], ytd-watch-metadata #owner a[href]"
    );
    if (ownerLink) {
      const k = channelKeyFromHref(ownerLink.getAttribute("href"));
      if (k) keys.add(k);
    }
    const nameEl = document.querySelector(
      "ytd-video-owner-renderer #channel-name a, #owner #channel-name a"
    );
    if (nameEl) name = nameEl.textContent.trim();

    const authorLink = document.querySelector(
      'span[itemprop="author"] link[itemprop="url"], link[itemprop="url"][href*="/channel/"]'
    );
    if (authorLink) {
      const k = channelKeyFromHref(authorLink.getAttribute("href"));
      if (k) keys.add(k);
    }
    return { keys: [...keys], name };
  }

  // Does a card belong to the channel we're watching?
  function cardMatchesCurrent(card, cur) {
    const { key, name } = cardChannel(card);
    if (key && cur.keys.includes(key)) return true;
    const nn = normalizeName(name);
    return !!nn && nn === normalizeName(cur.name);
  }

  /* ------------------------------------------------------------------ */
  /* Storage: history + settings                                        */
  /* ------------------------------------------------------------------ */

  function loadState() {
    chrome.storage.local.get([HISTORY_KEY, SETTINGS_KEY], (res) => {
      history = Array.isArray(res[HISTORY_KEY]) ? res[HISTORY_KEY] : [];
      settings = { ...DEFAULT_SETTINGS, ...(res[SETTINGS_KEY] || {}) };
      refreshButtonState();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[SETTINGS_KEY]) {
      settings = { ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
    }
    if (changes[HISTORY_KEY]) {
      history = Array.isArray(changes[HISTORY_KEY].newValue)
        ? changes[HISTORY_KEY].newValue
        : [];
      refreshButtonState();
    }
  });

  function alreadySignalled(keys, name) {
    const nn = normalizeName(name);
    return history.some(
      (h) =>
        (h.keys && h.keys.some((k) => keys.includes(k))) ||
        (nn && normalizeName(h.name) === nn)
    );
  }

  function recordSignalled(keys, name) {
    if (alreadySignalled(keys, name)) return;
    history.unshift({ keys, name, at: Date.now() });
    chrome.storage.local.set({ [HISTORY_KEY]: history });
  }

  /* ------------------------------------------------------------------ */
  /* Drive YouTube's own "Don't recommend channel" menu action          */
  /* ------------------------------------------------------------------ */

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  function openMenuItems() {
    const dd = document.querySelector(
      'ytd-popup-container tp-yt-iron-dropdown:not([aria-hidden="true"])'
    );
    const scope = dd || document;
    return scope.querySelectorAll(
      "yt-list-item-view-model, ytd-menu-service-item-renderer, " +
        'ytd-menu-service-item-download-renderer, tp-yt-paper-item, [role="menuitem"]'
    );
  }

  function findDontRecommendItem() {
    for (const it of openMenuItems()) {
      const t = (it.textContent || "").trim().toLowerCase();
      if (t.includes("recommend channel")) return it; // quote-agnostic
    }
    return null;
  }

  function closeOpenMenu() {
    const dd = document.querySelector(
      'ytd-popup-container tp-yt-iron-dropdown:not([aria-hidden="true"])'
    );
    (dd || document.body).dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        keyCode: 27,
        which: 27,
        bubbles: true,
      })
    );
    const backdrop = document.querySelector("tp-yt-iron-overlay-backdrop.opened");
    if (backdrop) backdrop.click();
  }

  // Open a card's 3-dot menu and click "Don't recommend channel". The popup is
  // hidden via CSS (data-ydr-driving) so no menu visibly flashes.
  async function driveDontRecommend(card) {
    const trigger = card.querySelector(MENU_TRIGGER_SELECTOR);
    if (!trigger) return false;

    document.documentElement.setAttribute("data-ydr-driving", "1");
    try {
      trigger.click();
      let item = null;
      for (let i = 0; i < 20 && !item; i++) {
        await delay(50);
        item = findDontRecommendItem();
      }
      if (item) {
        item.click();
        await delay(120); // let YouTube send the feedback
        return true;
      }
      closeOpenMenu();
      return false;
    } finally {
      document.documentElement.removeAttribute("data-ydr-driving");
    }
  }

  // Find one of the current channel's cards and drive its menu.
  // Returns "sent" | "no-card" | "no-item".
  async function tellYouTube(cur) {
    const cards = [...document.querySelectorAll(CARD_SELECTOR)];
    const target = cards.find(
      (c) => cardMatchesCurrent(c, cur) && c.querySelector(MENU_TRIGGER_SELECTOR)
    );
    if (!target) return "no-card";
    const ok = await driveDontRecommend(target);
    return ok ? "sent" : "no-item";
  }

  /* ------------------------------------------------------------------ */
  /* Block action (button + shortcut)                                   */
  /* ------------------------------------------------------------------ */

  let busy = false;

  async function blockCurrentChannel() {
    if (busy) return;
    const cur = currentWatchChannel();
    if (!cur.keys.length && !cur.name) {
      toast("Couldn't identify this channel — try again in a second.");
      return;
    }
    const label = cur.name || "this channel";
    busy = true;
    setButtonBusy(true);
    try {
      const res = await tellYouTube(cur);
      if (res === "sent") {
        recordSignalled(cur.keys, cur.name);
        toast(`Told YouTube to stop recommending ${label}.`);
      } else if (res === "no-card") {
        toast(
          `No ${label} video in the recommendations to send YouTube's signal — scroll the sidebar and try again.`
        );
      } else {
        toast(
          `Couldn't find YouTube's "Don't recommend channel" option — are you signed in?`
        );
      }
    } finally {
      busy = false;
      setButtonBusy(false);
      refreshButtonState();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Watch-page button                                                  */
  /* ------------------------------------------------------------------ */

  function makeButton() {
    const btn = document.createElement("button");
    btn.id = "ydr-block-btn";
    btn.type = "button";
    btn.className = "ydr-block-btn";
    // Built with DOM methods — YouTube enforces Trusted Types (no innerHTML).
    const ico = document.createElement("span");
    ico.className = "ydr-ico";
    ico.textContent = "🚫";
    const lbl = document.createElement("span");
    lbl.className = "ydr-label";
    lbl.textContent = "Don't recommend";
    btn.append(ico, lbl);
    btn.addEventListener("click", blockCurrentChannel);
    return btn;
  }

  function injectWatchButton() {
    if (!location.pathname.startsWith("/watch")) return;
    if (document.getElementById("ydr-block-btn")) {
      refreshButtonState();
      return;
    }
    const subscribe = document.querySelector(
      "ytd-watch-metadata #owner #subscribe-button, ytd-video-owner-renderer #subscribe-button"
    );
    if (subscribe && subscribe.parentElement) {
      subscribe.parentElement.insertBefore(makeButton(), subscribe.nextSibling);
      refreshButtonState();
    }
  }

  function setButtonBusy(on) {
    const btn = document.getElementById("ydr-block-btn");
    if (!btn) return;
    btn.classList.toggle("ydr-busy", on);
    if (on) btn.querySelector(".ydr-label").textContent = "Sending…";
  }

  function refreshButtonState() {
    const btn = document.getElementById("ydr-block-btn");
    if (!btn || btn.classList.contains("ydr-busy")) return;
    const cur = currentWatchChannel();
    const done = alreadySignalled(cur.keys, cur.name);
    btn.classList.toggle("ydr-blocked", done);
    btn.querySelector(".ydr-label").textContent = done
      ? "Told YouTube"
      : "Don't recommend";
    btn.title = done
      ? "You've already told YouTube not to recommend this channel"
      : `Tell YouTube to stop recommending this channel (${shortcutLabel()})`;
  }

  /* ------------------------------------------------------------------ */
  /* Toast                                                              */
  /* ------------------------------------------------------------------ */

  let toastTimer = null;
  function toast(msg) {
    let el = document.getElementById("ydr-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "ydr-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("ydr-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("ydr-show"), 3500);
  }

  /* ------------------------------------------------------------------ */
  /* Keyboard shortcut                                                  */
  /* ------------------------------------------------------------------ */

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
    );
  }

  function shortcutLabel() {
    const s = settings.shortcut || DEFAULT_SETTINGS.shortcut;
    const parts = [];
    if (s.ctrl) parts.push("Ctrl");
    if (s.alt) parts.push("Alt");
    if (s.shift) parts.push("Shift");
    if (s.meta) parts.push("Meta");
    parts.push((s.key || "").toUpperCase());
    return parts.join("+");
  }

  function onKeyDown(e) {
    const s = settings.shortcut;
    if (!s || !s.key || isTypingTarget(e.target)) return;
    if (
      e.key.toLowerCase() !== s.key.toLowerCase() ||
      e.shiftKey !== !!s.shift ||
      e.altKey !== !!s.alt ||
      e.ctrlKey !== !!s.ctrl ||
      e.metaKey !== !!s.meta
    ) {
      return;
    }
    if (!location.pathname.startsWith("/watch")) return;
    e.preventDefault();
    e.stopPropagation();
    blockCurrentChannel();
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                             */
  /* ------------------------------------------------------------------ */

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      injectWatchButton();
    });
  }

  function start() {
    loadState();
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    window.addEventListener("yt-navigate-finish", schedule);
    window.addEventListener("yt-page-data-updated", schedule);
    window.addEventListener("keydown", onKeyDown, true);
    schedule();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
