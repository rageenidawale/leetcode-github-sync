// Content script — runs on leetcode.com/problems/*. Classic content scripts
// can't import ES modules without bundling, so the couple of values it shares
// with the rest of the extension are mirrored here from shared/constants.js.
const MSG_EXTRACT_CODE = "EXTRACT_CODE"; // MESSAGES.EXTRACT_CODE
const LOG_PREFIX = "[LinkCode]";

let submissionInProgress = false;
let lastSeenResult = null;
let currentProblemSlug = null;

function safeSendMessage(payload) {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
    console.warn(LOG_PREFIX, "Extension context unavailable. Message skipped.");
    return;
  }
  chrome.runtime.sendMessage(payload);
}

function getProblemSlug() {
  const match = window.location.pathname.match(/problems\/([^/]+)/);
  return match ? match[1] : null;
}

// Fetch id/title/difficulty/topics from LeetCode's GraphQL API (same-origin).
// Returns null on any failure so a sync never breaks over missing metadata.
async function fetchMeta(slug) {
  try {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query q($slug:String!){question(titleSlug:$slug){questionFrontendId title difficulty topicTags{name}}}`,
        variables: { slug },
      }),
    });
    const q = (await res.json())?.data?.question;
    if (!q) return null;
    return {
      id: q.questionFrontendId,
      title: q.title,
      difficulty: q.difficulty,
      topics: (q.topicTags || []).map((t) => t.name),
    };
  } catch (err) {
    console.warn(LOG_PREFIX, "Metadata fetch failed:", err.message);
    return null;
  }
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
    const slug = getProblemSlug();
    fetchMeta(slug).then((meta) => safeSendMessage({ type: MSG_EXTRACT_CODE, meta }));
  }
});

observer.observe(document.body, { childList: true, subtree: true });
