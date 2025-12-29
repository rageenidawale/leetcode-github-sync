// =================================================
// ELEMENT REFERENCES
// =================================================

const screens = {
  welcome: document.getElementById("screen-welcome"),
  connect: document.getElementById("screen-connect"),
  success: document.getElementById("screen-success"),
  dashboard: document.getElementById("screen-dashboard"),
};

const btnStartSetup = document.getElementById("btn-start-setup");
const btnGoDashboard = document.getElementById("btn-go-dashboard");
const changeConfigLink = document.getElementById("change-config-link");

const connectForm = document.getElementById("connect-form");
const usernameInput = document.getElementById("github-username");
const repoInput = document.getElementById("github-repo");
const tokenInput = document.getElementById("github-token");

const repoNameEls = document.querySelectorAll(".repo-name");

const autoSyncToggle = document.getElementById("auto-sync-toggle");
const syncModeText = document.getElementById("sync-mode-text");
const manualSyncBtn = document.getElementById("manual-sync-btn");

// const lastSyncInfo = document.getElementById("last-sync-info");
// const lastSyncFile = document.getElementById("last-sync-file");
// const lastSyncTime = document.getElementById("last-sync-time");

const statusBox = document.getElementById("status-box");
const statusText = document.getElementById("status-text");

const formError = document.getElementById("form-error");

// Close buttons
document.querySelectorAll(".close-btn").forEach(btn => {
  btn.addEventListener("click", () => window.close());
});

// =================================================
// HELPERS
// =================================================

function showScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[screenName].classList.remove("hidden");
}

function formatRepo(owner, repo) {
  return `${owner}/${repo}`;
}

function updateRepoName(owner, repo) {
  repoNameEls.forEach(el => {
    el.textContent = formatRepo(owner, repo);
  });
}

function updateAutoSyncUI(autoSync) {
  autoSyncToggle.setAttribute("aria-checked", autoSync);

  if (autoSync) {
    syncModeText.textContent =
      "Solutions sync automatically after Accepted submissions";
    manualSyncBtn.classList.add("hidden");
  } else {
    syncModeText.textContent =
      "Auto sync is off. Manual sync required.";
    manualSyncBtn.classList.remove("hidden");
  }
}

function showFormError(message) {
  formError.textContent = message;
  formError.classList.remove("hidden");
}

function clearFormError() {
  formError.textContent = "";
  formError.classList.add("hidden");
}

function resetStatus() {
  statusBox.className = "status";
  statusText.textContent = "";
  statusText.innerHTML = "";
}

function hideStatus() {
  statusBox.classList.add("hidden");
}

function showError(message) {
  statusBox.classList.remove("hidden");
  statusBox.classList.add("error");
  statusText.innerHTML = message;
}

function showWarning(message) {
  statusBox.classList.remove("hidden");
  statusBox.classList.add("warning");
  statusText.innerHTML = message;
}

function showSuccess(message) {
  statusBox.classList.remove("hidden");
  statusBox.classList.add("success");
  statusText.innerHTML = message;
}

function renderStatus({ lastAccepted, lastSync, syncError, autoSync }) {
  // Always reset first
  resetStatus();

  // 1️⃣ Nothing ever happened
  if (!lastAccepted && !lastSync && !syncError) {
    hideStatus();
    return;
  }

  // 2️⃣ Error always wins
  if (syncError) {
    showError(syncError.message || "Sync failed due to an unknown error.");
    return;
  }

  // 3️⃣ Auto-sync OFF + accepted but NOT synced
  if (
    autoSync === false &&
    lastAccepted &&
    (!lastSync || lastAccepted.time > lastSync.time)
  ) {
    showWarning(
      `Solution accepted but not synced.<br>
       Last accepted: <b>${lastAccepted.path}</b> (${timeAgo(lastAccepted.time)})`
    );
    return;
  }

  // 4️⃣ Normal success (last synced)
  if (lastSync) {
    showSuccess(
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
const FORM_DRAFT_KEY = "connectFormDraft";

chrome.storage.local.get(
  [
    "githubOwner",
    "githubRepo",
    "githubToken",
    "autoSync",
    "lastAccepted",
    "lastSync",
    "syncError",
    FORM_DRAFT_KEY, 
  ],
  (data) => {
    renderStatus(data);
    const { githubOwner, githubRepo, githubToken } = data;

    // Default autoSync = true
    const autoSync = data.autoSync !== false;

    // ✅ CASE 1: Already connected → dashboard
    if (githubOwner && githubRepo && githubToken) {
      updateRepoName(githubOwner, githubRepo);
      updateAutoSyncUI(autoSync);
      showScreen("dashboard");

      if (data.lastSyncedFile && data.lastSyncedTime) {
        lastSyncFile.textContent = `Synced ${data.lastSyncedFile}`;
        lastSyncTime.textContent = data.lastSyncedTime;
        lastSyncInfo.classList.remove("hidden");
      }
      return;
    }

    // CASE 2: Not connected → welcome
    showScreen("welcome");

    // CASE 3: Restore form draft if it exists
    const draft = data[FORM_DRAFT_KEY];
    if (draft) {
      usernameInput.value = draft.githubOwner || "";
      repoInput.value = draft.githubRepo || "";
      tokenInput.value = draft.githubToken || "";
    }
  }
);

// =================================================
// NAVIGATION
// =================================================

btnStartSetup?.addEventListener("click", () => {
  showScreen("connect");
});

btnGoDashboard?.addEventListener("click", () => {
  showScreen("dashboard");
});

changeConfigLink?.addEventListener("click", () => {
  showScreen("connect");
});

// =================================================
// FORM SUBMIT (CONNECT REPO)
// =================================================

// Save draft on input
[usernameInput, repoInput, tokenInput].forEach(input => {
  input.addEventListener("input", () => {
    clearFormError();
    chrome.storage.local.set({
      [FORM_DRAFT_KEY]: {
        githubOwner: usernameInput.value,
        githubRepo: repoInput.value,
        githubToken: tokenInput.value
      }
    });
  });
});

connectForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const githubOwner = usernameInput.value.trim();
  const githubRepo = repoInput.value.trim();
  const githubToken = tokenInput.value.trim();

  if (!githubOwner || !githubRepo || !githubToken) return;

  // Disable button + show loading
  const submitBtn = connectForm.querySelector("button[type='submit']");
  submitBtn.textContent = "Connecting...";
  submitBtn.disabled = true;

  chrome.runtime.sendMessage(
    {
      type: "VERIFY_GITHUB",
      payload: { owner: githubOwner, repo: githubRepo, token: githubToken }
    },
    (response) => {
      submitBtn.disabled = false;
      submitBtn.textContent = "Connect Repository";

      if (!response || !response.success) {
        showFormError(response?.error || "Failed to connect to GitHub");
        return;
        }
      // ✅ Verified → persist config
      chrome.storage.local.set(
        {
          githubOwner,
          githubRepo,
          githubToken,
          autoSync: true
        },
        
        () => {
            chrome.storage.local.remove(FORM_DRAFT_KEY);
          updateRepoName(githubOwner, githubRepo);
          updateAutoSyncUI(true);
          showScreen("success");
        }
      );
    }
  );
});

// =================================================
// AUTO SYNC TOGGLE
// =================================================

autoSyncToggle?.addEventListener("click", () => {
  const isEnabled = autoSyncToggle.getAttribute("aria-checked") === "true";
  const nextState = !isEnabled;

  chrome.storage.local.set({ autoSync: nextState }, () => {
    updateAutoSyncUI(nextState);
  });
});

// =================================================
// MANUAL SYNC BUTTON (placeholder)
// =================================================

manualSyncBtn?.addEventListener("click", (e) => {
  e.preventDefault();

  manualSyncBtn.textContent = "Syncing...";
  manualSyncBtn.disabled = true;

  chrome.runtime.sendMessage({ type: "MANUAL_SYNC" });

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

  if (changes.lastSync || changes.syncError) {
    chrome.storage.local.get(
      ["autoSync", "lastSync", "lastAccepted", "syncError"],
      renderStatus
    );
  }
});
