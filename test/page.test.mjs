// Tests for page.js: token harvesting and the send path.
// Run with: node --test test/*.test.mjs
// page.js runs in a vm with just enough of a browser stubbed for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../page.js", import.meta.url), "utf8");

const UC1 = "UC" + "a".repeat(22);
const UC2 = "UC" + "b".repeat(22);
const V1 = "vidAAAAAAA1";
const V2 = "vidBBBBBBB2";

// A response body can be read once, like a real Response. clone() gives an
// independent copy and fails once the body has been read.
function jsonResponse(body) {
  let used = false;
  return {
    get bodyUsed() {
      return used;
    },
    clone() {
      if (used) throw new TypeError("Response body is already used");
      return jsonResponse(body);
    },
    async json() {
      if (used) throw new TypeError("Response body is already used");
      used = true;
      return JSON.parse(JSON.stringify(body));
    },
  };
}

// A Request whose body can be read once; clone() copies it.
class FakeRequest {
  constructor(url, init = {}) {
    this.url = url;
    this._body = init.body;
    this.bodyUsed = false;
  }
  clone() {
    if (this.bodyUsed) throw new TypeError("Request body is already used");
    return new FakeRequest(this.url, { body: this._body });
  }
  async text() {
    if (this.bodyUsed) throw new TypeError("Request body is already used");
    this.bodyUsed = true;
    return this._body;
  }
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

  const ctx = {
    window,
    document,
    console: { debug: () => {} },
    CustomEvent,
    Request: FakeRequest,
    Node,
    Blob,
    URLSearchParams,
    ArrayBuffer,
    TextDecoder,
    WeakSet,
    JSON,
    setTimeout,
    clearTimeout,
    Promise,
    Array,
    Object,
    String,
  };
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
    sent: () => events.filter((e) => e.type === "ydr:sent").map((e) => e.detail),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A current-layout card (yt-lockup-view-model data) with three menu items.
// Each command's actions hold a confirmation with an Undo button that carries
// its own token and no icon, the way YouTube nests them.
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
                actions: [
                  {
                    replaceEnclosingAction: {
                      item: {
                        notificationMultiActionRenderer: {
                          responseText: { simpleText: "We won't recommend this channel" },
                          buttons: [
                            {
                              buttonRenderer: {
                                text: { simpleText: "Undo" },
                                command: { feedbackEndpoint: { feedbackToken: token + "-UNDO" } },
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                ],
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

// An app whose resolveCommand sends the command's token the way YouTube does.
function appSending(getPage, { bodyAs = (s) => s, delayMs = 0 } = {}) {
  const dispatched = [];
  return {
    dispatched,
    resolveCommand: (cmd) => {
      dispatched.push(cmd);
      const body = bodyAs(JSON.stringify({ feedbackTokens: [cmd.feedbackEndpoint.feedbackToken] }));
      setTimeout(() => getPage().window.fetch("https://www.youtube.com/youtubei/v1/feedback", { body }), delayMs);
    },
  };
}

test("harvests only the REMOVE token from each card, with its video and channel", () => {
  const p = load({ initialData: { contents: [lockup(V1, UC1, "@One"), lockup(V2, UC2, "@Two")] } });
  p.fire("DOMContentLoaded");
  assert.deepEqual(
    p.tokens().map((x) => [x.videoId, x.channelId, x.handle, x.token]),
    [
      [V1, UC1, "@one", "T-REMOVE-" + V1],
      [V2, UC2, "@two", "T-REMOVE-" + V2],
    ]
  );
});

test("doesn't save the Undo token nested inside the REMOVE command", () => {
  const p = load({ initialData: lockup(V1, UC1, "@One") });
  p.fire("DOMContentLoaded");
  const t = p.tokens().map((x) => x.token);
  assert.deepEqual(t, ["T-REMOVE-" + V1]);
});

test("passes only the token string, not the command or its UI actions", () => {
  const p = load({ initialData: lockup(V1, UC1, "@One") });
  p.fire("DOMContentLoaded");
  const [t] = p.tokens();
  assert.deepEqual(Object.keys(t).sort(), ["channelId", "handle", "token", "videoId"]);
});

test("handles the older compact-video layout", () => {
  const p = load({ initialData: { items: [compact(V2, UC2)] } });
  p.fire("DOMContentLoaded");
  const t = p.tokens();
  assert.equal(t.length, 1);
  assert.deepEqual([t[0].videoId, t[0].channelId, t[0].token], [V2, UC2, "T-REMOVE-" + V2]);
});

test("emits the watched video's owner from the player response", () => {
  const p = load({ playerResponse: { videoDetails: { videoId: V1, channelId: UC1 } } });
  p.fire("DOMContentLoaded");
  const owners = p.events.filter((e) => e.type === "ydr:owner").map((e) => e.detail);
  assert.deepEqual(owners, [{ videoId: V1, channelId: UC1 }]);
});

test("harvests /next responses without consuming the response YouTube gets", async () => {
  const p = load({ responses: { "/youtubei/v1/next": { contents: [lockup(V1, UC1, "@One")] } } });
  const res = await p.window.fetch("https://www.youtube.com/youtubei/v1/next?prettyPrint=false", {});
  await flush();
  assert.deepEqual(p.tokens().map((x) => x.videoId), [V1]);
  assert.equal(res.bodyUsed, false);
  assert.ok((await res.json()).contents);
});

test("harvests tokens from the yt-navigate-finish event", () => {
  const p = load();
  p.fireWin("yt-navigate-finish", { response: { response: { contents: [lockup(V2, UC2, "@Two")] } } });
  assert.deepEqual(p.tokens().map((x) => x.videoId), [V2]);
});

test("send: builds the feedback command itself and reports ok when YouTube processes it", async () => {
  let p;
  const app = appSending(() => p);
  p = load({ app, responses: { "/youtubei/v1/feedback": { feedbackResponses: [{ isProcessed: true }] } } });
  p.send({ id: "a", token: "T-REMOVE-x", command: { evil: true } });
  await wait(30);
  assert.deepEqual(p.sent(), [{ id: "a", ok: true, method: "resolveCommand", error: "" }]);
  // The command was built in the vm's realm, so compare it as plain JSON.
  assert.deepEqual(JSON.parse(JSON.stringify(app.dispatched)), [
    {
      commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: "/youtubei/v1/feedback" } },
      feedbackEndpoint: { feedbackToken: "T-REMOVE-x" },
    },
  ]);
});

test("send: reports not processed when YouTube rejects the token", async () => {
  let p;
  const app = appSending(() => p);
  p = load({ app, responses: { "/youtubei/v1/feedback": { feedbackResponses: [{ isProcessed: false }] } } });
  p.send({ id: "b", token: "T-old-token" });
  await wait(30);
  const [sent] = p.sent();
  assert.equal(sent.ok, false);
  assert.equal(sent.method, "resolveCommand");
  assert.match(sent.error, /didn't process/);
});

test("send: recognises a feedback request whose body is a Blob", async () => {
  let p;
  const app = appSending(() => p, { bodyAs: (s) => new Blob([s]) });
  p = load({ app, responses: { "/youtubei/v1/feedback": { feedbackResponses: [{ isProcessed: true }] } } });
  p.send({ id: "c", token: "T-REMOVE-blob" });
  await wait(30);
  assert.equal(p.sent()[0].ok, true);
});

test("send: reads a feedback Request's body without consuming it", async () => {
  const p = load({ responses: { "/youtubei/v1/feedback": { feedbackResponses: [{ isProcessed: true }] } } });
  const req = new FakeRequest("https://www.youtube.com/youtubei/v1/feedback", {
    body: JSON.stringify({ feedbackTokens: ["T-req"] }),
  });
  await p.window.fetch(req);
  assert.equal(req.bodyUsed, false);
});

test("send: rejects a missing or malformed token without dispatching", async () => {
  let p;
  const app = appSending(() => p);
  p = load({ app });
  p.send({ id: "d", command: { feedbackEndpoint: { feedbackToken: "T-from-command" } } });
  p.send({ id: "e", token: "<script>" });
  await flush();
  assert.deepEqual(p.sent(), [
    { id: "d", ok: false, method: "", error: "no token" },
    { id: "e", ok: false, method: "", error: "no token" },
  ]);
  assert.equal(app.dispatched.length, 0);
});
