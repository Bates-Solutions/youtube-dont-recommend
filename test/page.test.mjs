// Tests for page.js: token harvesting and the send path.
// Run with: node --test test/
// page.js runs in a vm with just enough of a browser stubbed for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../page.js", import.meta.url), "utf8");

const UC1 = "UC" + "a".repeat(22);
const UC2 = "UC" + "b".repeat(22);

function jsonResponse(body) {
  const res = {
    clone: () => res,
    json: async () => body,
  };
  return res;
}

// Load page.js into a fresh sandbox. `responses` maps a URL fragment to the
// JSON the stubbed network returns for it.
function load({ initialData, playerResponse, responses = {}, app } = {}) {
  const docListeners = {};
  const winListeners = {};
  const events = [];
  const fetchCalls = [];

  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  class Request {}
  class Node {}

  const document = {
    addEventListener: (t, fn) => (docListeners[t] ||= []).push(fn),
    dispatchEvent: (e) => {
      events.push({ type: e.type, detail: typeof e.detail === "string" ? JSON.parse(e.detail) : e.detail });
      (docListeners[e.type] || []).forEach((fn) => fn(e));
    },
    querySelector: (sel) => (sel === "ytd-app" ? app || null : null),
    body: { dispatchEvent: () => {} },
  };

  const window = {
    ytInitialData: initialData,
    ytInitialPlayerResponse: playerResponse,
    addEventListener: (t, fn) => (winListeners[t] ||= []).push(fn),
    fetch: async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      fetchCalls.push({ url, init });
      const key = Object.keys(responses).find((k) => url.includes(k));
      return jsonResponse(key ? responses[key] : {});
    },
  };

  const ctx = { window, document, CustomEvent, Request, Node, WeakSet, JSON, setTimeout, clearTimeout, Promise, Array, Object, String };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return {
    window,
    events,
    fetchCalls,
    fire: (type) => (docListeners[type] || []).forEach((fn) => fn({ type })),
    fireWin: (type, detail) => (winListeners[type] || []).forEach((fn) => fn({ type, detail })),
    send: (detail) => document.dispatchEvent(new CustomEvent("ydr:send", { detail: JSON.stringify(detail) })),
    tokens: () => events.filter((e) => e.type === "ydr:tokens").flatMap((e) => e.detail.items),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

// A current-layout card (yt-lockup-view-model data) with three menu items.
function lockup(videoId, channelId, handle) {
  const item = (label, icon, token) => ({
    listItemViewModel: {
      title: { content: label },
      leadingImage: { sources: [{ clientResource: { imageName: icon } }] },
      rendererContext: {
        commandContext: {
          onTap: {
            innertubeCommand: {
              commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: "/youtubei/v1/feedback" } },
              feedbackEndpoint: {
                feedbackToken: token,
                actions: [{ replaceEnclosingAction: { item: {} } }],
              },
            },
          },
        },
      },
    },
  });
  return {
    lockupViewModel: {
      contentId: videoId,
      metadata: {
        image: {
          onTap: {
            innertubeCommand: {
              browseEndpoint: { browseId: channelId, canonicalBaseUrl: "/" + handle },
            },
          },
        },
      },
      menu: {
        sheet: {
          listItems: [
            item("Not interested", "HIDE", "T-HIDE-" + videoId),
            item("Don't recommend channel", "REMOVE", "T-REMOVE-" + videoId),
            item("Show fewer Shorts", "X_CIRCLE", "T-SHORTS-" + videoId),
          ],
        },
      },
    },
  };
}

// An older-layout card (ytd-compact-video-renderer data).
function compact(videoId, channelId) {
  return {
    compactVideoRenderer: {
      videoId,
      longBylineText: { runs: [{ navigationEndpoint: { browseEndpoint: { browseId: channelId } } }] },
      menu: {
        menuRenderer: {
          items: [
            {
              menuServiceItemRenderer: {
                icon: { iconType: "NOT_INTERESTED" },
                serviceEndpoint: { feedbackEndpoint: { feedbackToken: "T-NI-" + videoId } },
              },
            },
            {
              menuServiceItemRenderer: {
                icon: { iconType: "REMOVE" },
                serviceEndpoint: {
                  commandMetadata: { webCommandMetadata: { apiUrl: "/youtubei/v1/feedback" } },
                  feedbackEndpoint: { feedbackToken: "T-REMOVE-" + videoId },
                },
              },
            },
          ],
        },
      },
    },
  };
}

test("harvests only the REMOVE token from each card, with its video and channel", () => {
  const p = load({ initialData: { contents: [lockup("vid1", UC1, "@One"), lockup("vid2", UC2, "@Two")] } });
  p.fire("DOMContentLoaded");
  const t = p.tokens();
  assert.equal(t.length, 2);
  assert.deepEqual(
    t.map((x) => [x.videoId, x.channelId, x.handle, x.command.feedbackEndpoint.feedbackToken]),
    [
      ["vid1", UC1, "@one", "T-REMOVE-vid1"],
      ["vid2", UC2, "@two", "T-REMOVE-vid2"],
    ]
  );
});

test("keeps only the token and command metadata, not the card's UI actions", () => {
  const p = load({ initialData: lockup("vid1", UC1, "@One") });
  p.fire("DOMContentLoaded");
  const [t] = p.tokens();
  assert.deepEqual(t.command.feedbackEndpoint, { feedbackToken: "T-REMOVE-vid1" });
  assert.equal(t.command.commandMetadata.webCommandMetadata.apiUrl, "/youtubei/v1/feedback");
});

test("handles the older compact-video layout", () => {
  const p = load({ initialData: { items: [compact("vid3", UC2)] } });
  p.fire("DOMContentLoaded");
  const t = p.tokens();
  assert.equal(t.length, 1);
  assert.equal(t[0].videoId, "vid3");
  assert.equal(t[0].channelId, UC2);
  assert.equal(t[0].command.feedbackEndpoint.feedbackToken, "T-REMOVE-vid3");
});

test("emits the watched video's owner from the player response", () => {
  const p = load({ playerResponse: { videoDetails: { videoId: "w1", channelId: UC1 } } });
  p.fire("DOMContentLoaded");
  const owners = p.events.filter((e) => e.type === "ydr:owner").map((e) => e.detail);
  assert.deepEqual(owners, [{ videoId: "w1", channelId: UC1 }]);
});

test("harvests tokens from YouTube's own /next responses", async () => {
  const p = load({ responses: { "/youtubei/v1/next": { contents: [lockup("vid4", UC1, "@One")] } } });
  await p.window.fetch("https://www.youtube.com/youtubei/v1/next?prettyPrint=false", {});
  await flush();
  assert.deepEqual(p.tokens().map((x) => x.videoId), ["vid4"]);
});

test("harvests tokens from the yt-navigate-finish event", () => {
  const p = load();
  p.fireWin("yt-navigate-finish", { response: { response: { contents: [lockup("vid5", UC2, "@Two")] } } });
  assert.deepEqual(p.tokens().map((x) => x.videoId), ["vid5"]);
});

test("send: reports ok when YouTube processes the feedback request", async () => {
  let p;
  const app = {
    resolveCommand: (cmd) =>
      p.window.fetch("https://www.youtube.com/youtubei/v1/feedback", {
        body: JSON.stringify({ feedbackTokens: [cmd.feedbackEndpoint.feedbackToken] }),
      }),
  };
  p = load({ app, responses: { "/youtubei/v1/feedback": { feedbackResponses: [{ isProcessed: true }] } } });
  p.send({ id: 7, command: { feedbackEndpoint: { feedbackToken: "T-REMOVE-x" } } });
  await new Promise((r) => setTimeout(r, 20));
  const sent = p.events.filter((e) => e.type === "ydr:sent").map((e) => e.detail);
  assert.deepEqual(sent, [{ id: 7, ok: true, method: "resolveCommand", error: "" }]);
});

test("send: reports not processed when YouTube rejects the token", async () => {
  let p;
  const app = {
    resolveCommand: (cmd) =>
      p.window.fetch("https://www.youtube.com/youtubei/v1/feedback", {
        body: JSON.stringify({ feedbackTokens: [cmd.feedbackEndpoint.feedbackToken] }),
      }),
  };
  p = load({ app, responses: { "/youtubei/v1/feedback": { feedbackResponses: [{ isProcessed: false }] } } });
  p.send({ id: 8, command: { feedbackEndpoint: { feedbackToken: "T-old" } } });
  await new Promise((r) => setTimeout(r, 20));
  const [sent] = p.events.filter((e) => e.type === "ydr:sent").map((e) => e.detail);
  assert.equal(sent.ok, false);
  assert.equal(sent.method, "resolveCommand");
  assert.match(sent.error, /didn't process/);
});

test("send: a request with no token fails at once", () => {
  const p = load();
  p.send({ id: 9, command: {} });
  const [sent] = p.events.filter((e) => e.type === "ydr:sent").map((e) => e.detail);
  assert.deepEqual(sent, { id: 9, ok: false, method: "", error: "no token" });
});
