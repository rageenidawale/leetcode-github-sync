import { KEYS, MESSAGES } from "../shared/constants.js";
import * as store from "../shared/storage.js";
import { buildPath, normalizeLanguage } from "../shared/languages.js";

const el = (id) => document.getElementById(id);
const fields = {
  folderLayout: el("folder-layout"),
  filenameTemplate: el("filename-template"),
  commitTemplate: el("commit-template"),
  branch: el("branch"),
  date: el("header-date"),
  link: el("header-link"),
  difficulty: el("header-difficulty"),
  topics: el("header-topics"),
};
const preview = el("preview");
const savedMsg = el("saved-msg");

function readForm() {
  return {
    folderLayout: fields.folderLayout.value,
    filenameTemplate: fields.filenameTemplate.value.trim() || "{slug}",
    commitTemplate: fields.commitTemplate.value.trim() || "LeetCode: update {path}",
    branch: fields.branch.value.trim(),
    header: {
      date: fields.date.checked,
      link: fields.link.checked,
      difficulty: fields.difficulty.checked,
      topics: fields.topics.checked,
    },
  };
}

// Live example using a sample problem so the layout/filename choices are clear.
function updatePreview() {
  const sample = { id: 1, title: "Two Sum", difficulty: "Easy", topics: ["Array"] };
  try {
    preview.textContent = buildPath(normalizeLanguage("python3"), "two-sum", sample, readForm());
  } catch {
    preview.textContent = "—";
  }
}

async function load() {
  const s = await store.getSettings();
  fields.folderLayout.value = s.folderLayout;
  fields.filenameTemplate.value = s.filenameTemplate;
  fields.commitTemplate.value = s.commitTemplate;
  fields.branch.value = s.branch;
  fields.date.checked = s.header.date;
  fields.link.checked = s.header.link;
  fields.difficulty.checked = s.header.difficulty;
  fields.topics.checked = s.header.topics;
  updatePreview();
}

document.addEventListener("input", updatePreview);

el("save-btn").addEventListener("click", async () => {
  await store.setSettings(readForm());
  savedMsg.classList.add("show");
  setTimeout(() => savedMsg.classList.remove("show"), 1500);
});

// =================================================
// SYNC ACTIVITY
// =================================================

const importStatusEl = el("import-status");
const historyList = el("history-list");
const failedRow = el("failed-row");
const failedCount = el("failed-count");

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

async function renderHistory() {
  const hist = (await store.get(KEYS.history))[KEYS.history] || [];
  if (!hist.length) {
    historyList.textContent = "No syncs yet.";
    return;
  }
  historyList.innerHTML = hist
    .slice(0, 15)
    .map((h) => `${h.status === "failed" ? "✗" : h.status === "skipped" ? "•" : "✓"} ${h.path} — ${timeAgo(h.time)}`)
    .join("<br>");
}

async function renderFailed() {
  const q = (await store.get(KEYS.queue))[KEYS.queue] || [];
  const failed = q.filter((j) => j.failed).length;
  failedRow.style.display = failed ? "flex" : "none";
  failedCount.textContent = failed ? `${failed} failed` : "";
}

function renderImportStatus(status) {
  if (!status) { importStatusEl.textContent = ""; return; }
  if (status.error) { importStatusEl.textContent = `Import failed: ${status.error}`; return; }
  if (status.running) { importStatusEl.textContent = `Importing ${status.done}/${status.total || "…"}`; return; }
  importStatusEl.textContent = status.total ? `Queued ${status.done}/${status.total}. Syncing in background.` : "";
}

el("import-btn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ url: "https://leetcode.com/*" });
  if (!tab) {
    importStatusEl.textContent = "Open a leetcode.com tab first.";
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: MESSAGES.IMPORT_HISTORY });
});

el("retry-btn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: MESSAGES.RETRY_FAILED });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[KEYS.history]) renderHistory();
  if (changes[KEYS.queue]) renderFailed();
  if (changes[KEYS.importStatus]) renderImportStatus(changes[KEYS.importStatus].newValue);
});

async function loadActivity() {
  await renderHistory();
  await renderFailed();
  renderImportStatus((await store.get(KEYS.importStatus))[KEYS.importStatus]);
}

load();
loadActivity();
