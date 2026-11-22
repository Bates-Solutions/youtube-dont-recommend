/* YouTube: Don't Recommend Channel: page-world helper.
 *
 * Runs in YouTube's own JavaScript world (manifest "world": "MAIN"), because the
 * content script can't see YouTube's page data. It does three things:
 *
 * 1. Harvest. Every recommendation card YouTube sends carries its 3-dots menu,
 *    including the "Don't recommend channel" command and its feedback token. The
 *    item is picked by its icon (REMOVE), not its text, so it works in any
 *    language. Tokens are read from ytInitialData, the yt-navigate-finish event,
 *    and the JSON responses of YouTube's own /youtubei/v1 fetches, and passed to
 *    content.js, which saves them by video ID. Only the token string is passed.
 * 2. Owner. The current video's channel ID, from the player response.
 * 3. Send. On request, build the feedback command for a token and hand it to
 *    YouTube's own command dispatch, so YouTube sends it with its own sign-in.
 *    The /feedback response is watched to confirm it was sent and processed.
 *
 * Messages to and from content.js are CustomEvents on document with JSON-string
 * details (objects don't cross between the two worlds). Any script in this world
 * can see and fire them, so content.js validates what it stores, and a send only
 * ever builds a feedback command from a token: it never runs a command it was
 * handed.
 */
(() => {
  "use strict";

  const emit = (name, detail) =>
    document.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(detail) }));

  /* ------------------------------------------------------------------ */
  /* Harvest                                                            */
  /* ------------------------------------------------------------------ */

  const iconOf = (o) =>
    o.leadingImage?.sources?.[0]?.clientResource?.imageName || o.icon?.iconType;

  function channelOf(item) {
    let s;
    try {
      s = JSON.stringify(item);
    } catch {
      return {};
    }
    const id = s.match(/"browseId":"(UC[\w-]{22})"/);
    const handle = s.match(/"canonicalBaseUrl":"\/(@[^"]+)"/);
    return { channelId: id ? id[1] : "", handle: handle ? handle[1].toLowerCase() : "" };
  }

  // Feedback tokens are URL-safe base64; anything else isn't one.
  const TOKEN_RE = /^[\w\-=%.]{8,1024}$/;

  const FEEDBACK_METADATA = {
    webCommandMetadata: { sendPost: true, apiUrl: "/youtubei/v1/feedback" },
  };

  // The command YouTube's own menu item runs, minus the UI actions that would
  // try to replace the card the menu belonged to.
  const feedbackCommand = (token) => ({
    commandMetadata: JSON.parse(JSON.stringify(FEEDBACK_METADATA)),
    feedbackEndpoint: { feedbackToken: token },
  });

  function harvest(root) {
    if (!root || typeof root !== "object") return;
    const items = [];
    const seen = new WeakSet();
    const walk = (o, item, icon, depth) => {
      if (!o || typeof o !== "object" || seen.has(o) || depth > 80) return;
      if (o instanceof Node || o === window) return;
      seen.add(o);
      if (typeof o.contentId === "string" || typeof o.videoId === "string") item = o;
      icon = iconOf(o) || icon;
      const token = o.feedbackEndpoint?.feedbackToken;
      if (token && icon === "REMOVE" && item) {
        if (TOKEN_RE.test(token)) {
          items.push({ videoId: item.contentId || item.videoId, ...channelOf(item), token });
        }
        const apiUrl = o.commandMetadata?.webCommandMetadata?.apiUrl;
        if (apiUrl && apiUrl !== FEEDBACK_METADATA.webCommandMetadata.apiUrl) {
          console.debug("[ydr] unexpected feedback command metadata", o.commandMetadata);
        }
        // Don't walk into the command: its actions hold the Undo button, with a
        // token of its own that would otherwise be saved for this video.
        return;
      }
      if (o.videoDetails?.videoId && o.videoDetails?.channelId) {
        emit("ydr:owner", {
          videoId: o.videoDetails.videoId,
          channelId: o.videoDetails.channelId,
        });
      }
      for (const k in o) walk(o[k], item, icon, depth + 1);
    };
    walk(root, null, undefined, 0);
    if (items.length) emit("ydr:tokens", { items });
  }

  /* ------------------------------------------------------------------ */
  /* fetch wrapper: harvest responses, watch /feedback sends            */
  /* ------------------------------------------------------------------ */

  const feedbackWatchers = new Set();
  const origFetch = window.fetch;

  // A request body as text, without consuming it.
  async function bodyText(input, init) {
    const b = init?.body;
    if (typeof b === "string") return b;
    if (b instanceof URLSearchParams) return b.toString();
    if (b instanceof Blob) return await b.text();
    if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) return new TextDecoder().decode(b);
    if (b == null && input instanceof Request) return await input.clone().text();
    return "";
  }

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url || String(input || "");
    const api = url.match(/\/youtubei\/v1\/(next|browse|search|player|feedback)\b/);
    let body = "";
    if (api && api[1] === "feedback") {
      try {
        body = await bodyText(input, init);
      } catch {}
    }
    const res = await origFetch.apply(this, arguments);
    if (api) {
      res
        .clone()
        .json()
        .then((json) => {
          if (api[1] === "feedback") feedbackWatchers.forEach((w) => w(body, json));
          else harvest(json);
        })
        .catch(() => {});
    }
    return res;
  };

  window.addEventListener("yt-navigate-finish", (e) => harvest(e.detail));
  document.addEventListener("DOMContentLoaded", () => {
    harvest(window.ytInitialData);
    harvest(window.ytInitialPlayerResponse);
  });

  /* ------------------------------------------------------------------ */
  /* Send                                                               */
  /* ------------------------------------------------------------------ */

  // How long to wait for YouTube's /feedback request after each method.
  const WAIT_MS = 6000;

  function waitForFeedback(token, ms) {
    return new Promise((resolve) => {
      const w = (body, json) => {
        if (body.includes(token)) {
          cleanup();
          resolve({ seen: true, json });
        }
      };
      const t = setTimeout(() => {
        cleanup();
        resolve({ seen: false });
      }, ms);
      function cleanup() {
        clearTimeout(t);
        feedbackWatchers.delete(w);
      }
      feedbackWatchers.add(w);
    });
  }

  const isProcessed = (json) =>
    Array.isArray(json?.feedbackResponses) &&
    json.feedbackResponses.some((r) => r.isProcessed);

  // Ways to ask YouTube's app to run a command, tried in order. Neither is a
  // documented API; the prototype records which one YouTube accepts.
  const METHODS = [
    [
      "resolveCommand",
      (cmd) => {
        const app = document.querySelector("ytd-app");
        if (!app || typeof app.resolveCommand !== "function") return false;
        app.resolveCommand(cmd);
        return true;
      },
    ],
    [
      "yt-action",
      (cmd) => {
        const target = document.querySelector("ytd-app") || document.body;
        target.dispatchEvent(
          new CustomEvent("yt-action", {
            bubbles: true,
            composed: true,
            detail: {
              actionName: "yt-service-request",
              args: [target, cmd],
              optionalAction: false,
              returnValue: [],
            },
          })
        );
        return true;
      },
    ],
  ];

  document.addEventListener("ydr:send", async (e) => {
    let req;
    try {
      req = JSON.parse(e.detail);
    } catch {
      return;
    }
    const out = { id: req.id, ok: false, method: "", error: "" };
    const token = req.token;
    if (typeof token !== "string" || !TOKEN_RE.test(token)) {
      out.error = "no token";
      return emit("ydr:sent", out);
    }
    // One watcher across both methods, so a slow request from the first method
    // still counts if it lands after the second one was tried.
    const seen = waitForFeedback(token, WAIT_MS * METHODS.length);
    const tried = [];
    const errors = [];
    for (const [name, run] of METHODS) {
      try {
        if (!run(feedbackCommand(token))) {
          errors.push(name + ": unavailable");
          continue;
        }
      } catch (err) {
        errors.push(name + ": " + (err && err.message));
        continue;
      }
      tried.push(name);
      const r = await Promise.race([seen, new Promise((r) => setTimeout(r, WAIT_MS, null))]);
      if (r && r.seen) {
        out.method = tried.join(" or ");
        out.ok = isProcessed(r.json);
        if (!out.ok) out.error = "sent, but YouTube didn't process it";
        return emit("ydr:sent", out);
      }
      errors.push(name + ": no request seen in " + WAIT_MS / 1000 + " s");
    }
    out.error = errors.join("; ");
    emit("ydr:sent", out);
  });
})();
