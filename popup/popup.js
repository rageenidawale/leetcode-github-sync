import { KEYS, MESSAGES } from "../shared/constants.js";
import * as store from "../shared/storage.js";
import * as auth from "../shared/auth.js";

// =================================================
// ELEMENT REFERENCES
// =================================================

const screens = {
  welcome: document.getElementById("screen-welcome"),
  dashboard: document.getElementById("screen-dashboard"),
};

const btnConnect = document.getElementById("btn-connect");
const connectError = document.getElementById("connect-error");
const repoNameEl = document.getElementById("repo-name");
const autoSyncToggle = document.getElementById("auto-sync-toggle");
const syncModeText = document.getElementById("sync-mode-text");
const manualSyncBtn = document.getElementById("manual-sync-btn");
const statusBox = document.getElementById("status-box");
const statusText = document.getElementById("status-text");
const settingsLink = document.getElementById("settings-link");
const logoutLink = document.getElementById("logout-link");

// =================================================
// HELPERS
// =================================================

function showScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[screenName].classList.remove("hidden");
}

function updateRepoName(owner, repo) {
  repoNameEl.textContent = `${owner}/${repo}`;
}

function updateAutoSyncUI(autoSync) {
  autoSyncToggle.setAttribute("aria-checked", autoSync);

  if (autoSync) {
    syncModeText.textContent = "Solutions sync automatically after Accepted submissions";
    manualSyncBtn.classList.add("hidden");
  } else {
    syncModeText.textContent = "Auto sync is off. Manual sync required.";
    manualSyncBtn.classList.remove("hidden");
  }
}

function showConnectError(message) {
  connectError.textContent = message;
  connectError.classList.remove("hidden");
}

function hideStatus() {
  statusBox.classList.add("hidden");
}

// kind: "error" | "warning" | "success"
function showStatus(kind, message) {
  statusBox.className = `status ${kind}`;
  statusText.innerHTML = message;
}

function renderStatus({ lastAccepted, lastSync, syncError, autoSync }) {
  // Nothing ever happened
  if (!lastAccepted && !lastSync && !syncError) {
    hideStatus();
    return;
  }

  // Error always wins
  if (syncError) {
    showStatus("error", syncError.message || "Sync failed due to an unknown error.");
    return;
  }

  // Auto-sync OFF + accepted but NOT synced
  if (autoSync === false && lastAccepted && (!lastSync || lastAccepted.time > lastSync.time)) {
    showStatus(
      "warning",
      `Solution accepted but not synced.<br>
       Last accepted: <b>${lastAccepted.path}</b> (${timeAgo(lastAccepted.time)})`
    );
    return;
  }

  // Normal success (last synced)
  if (lastSync) {
    showStatus(
      "success",
      `Synced <b>${lastSync.path}</b><br>
       Last sync: ${timeAgo(lastSync.time)}`
    );
  }
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;

  return `${Math.floor(diff / 86400)} days ago`;
}

// =================================================
// INITIAL LOAD
// =================================================

async function init() {
  const data = await store.get([KEYS.autoSync, KEYS.lastAccepted, KEYS.lastSync, KEYS.syncError]);
  renderStatus(data);

  if (await auth.isConnected()) {
    const { owner, repo, autoSync } = await store.getConfig();
    updateRepoName(owner, repo);
    updateAutoSyncUI(autoSync !== false);
    showScreen("dashboard");
  } else {
    showScreen("welcome");
  }
}

init();

// =================================================
// CONNECT (GitHub App OAuth)
// =================================================

btnConnect?.addEventListener("click", async () => {
  connectError.classList.add("hidden");
  btnConnect.textContent = "Connecting…";
  btnConnect.disabled = true;

  try {
    const { owner, repo } = await auth.login();
    await store.set({ [KEYS.autoSync]: true });
    updateRepoName(owner, repo);
    updateAutoSyncUI(true);
    showScreen("dashboard");
  } catch (err) {
    showConnectError(err.message || "Could not connect to GitHub");
  } finally {
    btnConnect.textContent = "Connect with GitHub";
    btnConnect.disabled = false;
  }
});

// =================================================
// DISCONNECT
// =================================================

settingsLink?.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

logoutLink?.addEventListener("click", async (e) => {
  e.preventDefault();
  await auth.logout();
  hideStatus();
  showScreen("welcome");
});

// =================================================
// AUTO SYNC TOGGLE
// =================================================

autoSyncToggle?.addEventListener("click", () => {
  const nextState = autoSyncToggle.getAttribute("aria-checked") !== "true";

  store.set({ [KEYS.autoSync]: nextState }).then(() => {
    updateAutoSyncUI(nextState);
  });
});

// =================================================
// MANUAL SYNC BUTTON
// =================================================

manualSyncBtn?.addEventListener("click", (e) => {
  e.preventDefault();

  manualSyncBtn.textContent = "Syncing...";
  manualSyncBtn.disabled = true;

  chrome.runtime.sendMessage({ type: MESSAGES.MANUAL_SYNC });

  setTimeout(() => {
    manualSyncBtn.textContent = "Sync Last Submission";
    manualSyncBtn.disabled = false;
  }, 1000);
});

// =================================================
// STATUS UPDATE
// =================================================

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes[KEYS.lastSync] || changes[KEYS.syncError]) {
    store
      .get([KEYS.autoSync, KEYS.lastSync, KEYS.lastAccepted, KEYS.syncError])
      .then(renderStatus);
  }
});
