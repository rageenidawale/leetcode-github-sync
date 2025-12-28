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

const lastSyncInfo = document.getElementById("last-sync-info");
const lastSyncFile = document.getElementById("last-sync-file");
const lastSyncTime = document.getElementById("last-sync-time");

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

// =================================================
// INITIAL LOAD
// =================================================

chrome.storage.local.get(
  [
    "githubOwner",
    "githubRepo",
    "githubToken",
    "autoSync",
    "lastSyncedFile",
    "lastSyncedTime",
  ],
  (data) => {
    const { githubOwner, githubRepo, githubToken } = data;

    // Default autoSync = true
    const autoSync = data.autoSync !== false;

    if (githubOwner && githubRepo && githubToken) {
      updateRepoName(githubOwner, githubRepo);
      updateAutoSyncUI(autoSync);
      showScreen("dashboard");

      if (data.lastSyncedFile && data.lastSyncedTime) {
        lastSyncFile.textContent = `Synced ${data.lastSyncedFile}`;
        lastSyncTime.textContent = data.lastSyncedTime;
        lastSyncInfo.classList.remove("hidden");
      }
    } else {
      showScreen("welcome");
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
        alert(response?.error || "Failed to connect to GitHub");
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

manualSyncBtn?.addEventListener("click", () => {
  // This will later send a message to background.js
  // For now, visual feedback only

  manualSyncBtn.textContent = "Syncing...";
  manualSyncBtn.disabled = true;

  setTimeout(() => {
    manualSyncBtn.textContent = "Sync Last Submission";
    manualSyncBtn.disabled = false;
  }, 1000);
});
