// Content script — runs on leetcode.com/problems/*. Classic content scripts
// can't import ES modules without bundling, so the couple of values it shares
// with the rest of the extension are mirrored here from shared/constants.js.
const MSG_EXTRACT_CODE = "EXTRACT_CODE";     // MESSAGES.EXTRACT_CODE
const MSG_ENQUEUE = "ENQUEUE";               // MESSAGES.ENQUEUE
const MSG_IMPORT_HISTORY = "IMPORT_HISTORY"; // MESSAGES.IMPORT_HISTORY
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

function csrfToken() {
  const m = document.cookie.match(/csrftoken=([^;]+)/);
  return m ? m[1] : "";
}

// Same-origin GraphQL call, sends LeetCode's session cookie + CSRF token.
async function gql(query, variables) {
  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "x-csrftoken": csrfToken() },
    body: JSON.stringify({ query, variables }),
  });
  return (await res.json())?.data;
}

function toMeta(q) {
  if (!q) return null;
  return {
    id: q.questionFrontendId,
    title: q.title,
    difficulty: q.difficulty,
    topics: (q.topicTags || []).map((t) => t.name),
  };
}

// Fetch id/title/difficulty/topics for a problem. Returns null on any failure
// so a sync never breaks over missing metadata.
async function fetchMeta(slug) {
  try {
    const d = await gql(
      `query q($slug:String!){question(titleSlug:$slug){questionFrontendId title difficulty topicTags{name}}}`,
      { slug }
    );
    return toMeta(d?.question);
  } catch (err) {
    console.warn(LOG_PREFIX, "Metadata fetch failed:", err.message);
    return null;
  }
}

async function setImportStatus(status) {
  try { await chrome.storage.local.set({ importStatus: status }); } catch {}
}

// Backfill recent accepted submissions into the sync queue. Runs in the page
// so it has the user's LeetCode session. Best-effort: skips items that fail.
async function importHistory() {
  await setImportStatus({ running: true, total: 0, done: 0 });
  try {
    const status = await gql(`query{userStatus{username isSignedIn}}`, {});
    const username = status?.userStatus?.username;
    if (!status?.userStatus?.isSignedIn || !username) throw new Error("Not signed in to LeetCode");

    const list =
      (await gql(
        `query r($u:String!,$n:Int!){recentAcSubmissionList(username:$u,limit:$n){id titleSlug}}`,
        { u: username, n: 20 }
      ))?.recentAcSubmissionList || [];

    // One (most recent) per problem.
    const seen = new Set();
    const items = list.filter((s) => (seen.has(s.titleSlug) ? false : seen.add(s.titleSlug)));

    await setImportStatus({ running: true, total: items.length, done: 0 });

    let done = 0;
    for (const it of items) {
      try {
        const d = await gql(
          `query d($id:Int!){submissionDetails(submissionId:$id){code lang{name} question{questionFrontendId title difficulty topicTags{name}}}}`,
          { id: Number(it.id) }
        );
        const sd = d?.submissionDetails;
        if (sd?.code && sd?.lang?.name) {
          safeSendMessage({
            type: MSG_ENQUEUE,
            submissions: [{ problemSlug: it.titleSlug, language: sd.lang.name, code: sd.code, meta: toMeta(sd.question) }],
          });
        }
      } catch (e) {
        console.warn(LOG_PREFIX, "Import item failed:", e.message);
      }
      done += 1;
      await setImportStatus({ running: true, total: items.length, done });
    }

    await setImportStatus({ running: false, total: items.length, done });
  } catch (err) {
    console.warn(LOG_PREFIX, "Import failed:", err.message);
    await setImportStatus({ running: false, error: err.message });
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === MSG_IMPORT_HISTORY) importHistory();
});

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
