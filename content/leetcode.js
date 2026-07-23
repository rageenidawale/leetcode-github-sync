let submissionInProgress = false;
let lastSeenResult = null;
let currentProblemSlug = null;

function safeSendMessage(payload) {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
    console.warn("Extension context unavailable. Message skipped.");
    return;
  }
  chrome.runtime.sendMessage(payload);
}

function getProblemSlug() {
  const match = window.location.pathname.match(/problems\/([^/]+)/);
  return match ? match[1] : null;
}

// Reset submission state when navigating to a different problem
setInterval(() => {
  const slug = getProblemSlug();
  if (!slug || slug === currentProblemSlug) return;

  currentProblemSlug = slug;
  submissionInProgress = false;
});

// Detect Submit click
document.addEventListener("click", (event) => {
  if (event.target.closest('[data-e2e-locator="console-submit-button"]')) {
    submissionInProgress = true;
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    submissionInProgress = true;
  }
});

// Observe result changes
const observer = new MutationObserver(() => {
  if (!submissionInProgress) return;

  const resultEl = document.querySelector('[data-e2e-locator="submission-result"]');
  if (!resultEl || resultEl === lastSeenResult) return;
  lastSeenResult = resultEl;

  if (resultEl.innerText.trim() === "Accepted") {
    submissionInProgress = false;
    safeSendMessage({ type: "EXTRACT_CODE" });
  }
});

observer.observe(document.body, { childList: true, subtree: true });
