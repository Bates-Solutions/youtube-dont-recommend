const HISTORY_KEY = "blockHistory";
const SETTINGS_KEY = "settings";

const DEFAULT_SETTINGS = {
  shortcut: { key: "b", shift: true, alt: false, ctrl: false, meta: false },
};

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");

function getHistory(cb) {
  chrome.storage.local.get(HISTORY_KEY, (res) =>
    cb(Array.isArray(res[HISTORY_KEY]) ? res[HISTORY_KEY] : [])
  );
}
function setHistory(entries, cb) {
  chrome.storage.local.set({ [HISTORY_KEY]: entries }, cb);
}

function channelUrl(entry) {
  for (const k of entry.keys || []) {
    if (k.startsWith("handle:")) return "https://www.youtube.com/" + k.slice(7);
    if (k.startsWith("id:")) return "https://www.youtube.com/channel/" + k.slice(3);
    if (k.startsWith("legacy:")) return "https://www.youtube.com/c/" + k.slice(7);
  }
  return "https://www.youtube.com/";
}

function keyLabel(entry) {
  const handle = (entry.keys || []).find((k) => k.startsWith("handle:"));
  if (handle) return handle.slice(7);
  const id = (entry.keys || []).find((k) => k.startsWith("id:"));
  if (id) return id.slice(3);
  return (entry.keys && entry.keys[0]) || "";
}

function render(entries) {
  entries.sort((a, b) => (b.at || 0) - (a.at || 0));
  countEl.textContent = String(entries.length);
  listEl.innerHTML = "";
  emptyEl.hidden = entries.length > 0;

  entries.forEach((entry) => {
    const li = document.createElement("li");

    const name = document.createElement("div");
    name.className = "name";
    const a = document.createElement("a");
    a.href = channelUrl(entry);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = entry.name || keyLabel(entry);
    name.appendChild(a);
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = keyLabel(entry);
    name.appendChild(meta);

    const rm = document.createElement("button");
    rm.className = "remove";
    rm.textContent = "×";
    rm.title = "Remove from this list";
    rm.addEventListener("click", () => {
      // Remove by channel identity, not list index (display is date-sorted while
      // storage keeps insertion order, so indexes wouldn't line up).
      // An entry with no keys (channel known by name only) is matched by its
      // name and time instead.
      getHistory((cur) => {
        const hasKeys = Array.isArray(entry.keys) && entry.keys.length > 0;
        const next = cur.filter((e) =>
          hasKeys
            ? !(e.keys && e.keys.some((k) => entry.keys.includes(k)))
            : !(e.at === entry.at && e.name === entry.name)
        );
        setHistory(next, () => render(next));
      });
    });

    li.appendChild(name);
    li.appendChild(rm);
    listEl.appendChild(li);
  });
}

document.getElementById("clear").addEventListener("click", () => {
  if (confirm("Clear the blocked-channels list? (This does not un-tell YouTube.)"))
    setHistory([], () => render([]));
});

document.getElementById("export").addEventListener("click", () => {
  getHistory((entries) => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "blocked-channels.json";
    document.body.append(a);
    a.click();
    a.remove();
    // Revoking straight after click() can cancel the download in Firefox.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
});

/* Shortcut rebinding --------------------------------------------------- */

const shortcutEl = document.getElementById("shortcut");
let settings = { ...DEFAULT_SETTINGS };

function shortcutLabel(s) {
  const parts = [];
  if (s.ctrl) parts.push("Ctrl");
  if (s.alt) parts.push("Alt");
  if (s.shift) parts.push("Shift");
  if (s.meta) parts.push("Meta");
  parts.push((s.key || "").toUpperCase());
  return parts.join("+");
}

function saveSettings() {
  chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

chrome.storage.local.get(SETTINGS_KEY, (res) => {
  settings = { ...DEFAULT_SETTINGS, ...(res[SETTINGS_KEY] || {}) };
  shortcutEl.textContent = shortcutLabel(settings.shortcut);
});

let recording = false;
shortcutEl.addEventListener("click", () => {
  recording = !recording;
  shortcutEl.classList.toggle("recording", recording);
  shortcutEl.textContent = recording ? "Press keys…" : shortcutLabel(settings.shortcut);
});

document.addEventListener("keydown", (e) => {
  if (!recording) return;
  e.preventDefault();
  if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
  if (e.key === "Escape") {
    recording = false;
    shortcutEl.classList.remove("recording");
    shortcutEl.textContent = shortcutLabel(settings.shortcut);
    return;
  }
  settings.shortcut = {
    key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
    shift: e.shiftKey,
    alt: e.altKey,
    ctrl: e.ctrlKey,
    meta: e.metaKey,
  };
  saveSettings();
  recording = false;
  shortcutEl.classList.remove("recording");
  shortcutEl.textContent = shortcutLabel(settings.shortcut);
});

getHistory(render);
