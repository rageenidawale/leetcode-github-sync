import { MESSAGES } from "../shared/constants.js";
import * as log from "../shared/logger.js";
import * as store from "../shared/storage.js";
import { normalizeLanguage, buildPath } from "../shared/languages.js";
import * as auth from "../shared/auth.js";
import * as queue from "../shared/queue.js";

// Runs in the page (MAIN world) — must not reference anything outside itself.
function extractFromMonaco() {
  let code = "";
  let language = "unknown";

  if (window.monaco && window.monaco.editor) {
    const models = window.monaco.editor.getModels();
    if (models.length > 0) {
      code = models[0].getValue();
      language = models[0].getLanguageId();
    }
  }

  return { code, language };
}

async function handleExtractCode(sender, meta) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: sender.tab.id },
    world: "MAIN",
    func: extractFromMonaco,
  });

  const { code, language } = results?.[0]?.result || {};
  const langInfo = normalizeLanguage(language);

  if (langInfo.family === "unknown") return;

  // SAFETY GUARD
  if (!code || language === "unknown") {
    log.warn("Could not reliably detect language. Skipping GitHub push.");
    return;
  }

  const submission = {
    problemSlug: sender.tab.url.split("/")[4],
    language,
    code,
    meta: meta || null,
    timestamp: Date.now(),
  };

  await store.setLastSubmission(submission);

  if (!(await auth.isConnected())) {
    log.warn("GitHub not connected yet");
    return;
  }

  const cfg = await store.getConfig();
  const settings = await store.getSettings();

  // Record the accepted path (drives the "accepted but not synced" hint).
  try {
    await store.setLastAccepted(buildPath(langInfo, submission.problemSlug, submission.meta, settings));
  } catch { /* unsupported layout/lang — ignore, sync guard handles it */ }

  if (cfg.autoSync === false) return;

  await queue.enqueue(submission);
  await queue.processQueue();
}

async function handleManualSync() {
  const submission = await store.getLastSubmission();
  if (!submission) {
    log.warn("No submission available for manual sync");
    return;
  }

  await queue.enqueue(submission);
  await queue.processQueue();
}

async function handleEnqueue(submissions) {
  for (const s of submissions || []) await queue.enqueue(s);
  await queue.processQueue();
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === MESSAGES.EXTRACT_CODE) handleExtractCode(sender, message.meta);
  if (message.type === MESSAGES.MANUAL_SYNC) handleManualSync();
  if (message.type === MESSAGES.ENQUEUE) handleEnqueue(message.submissions);
  if (message.type === MESSAGES.RETRY_FAILED) queue.retryFailed();
});

// Background sync: drain the queue periodically and on startup, so failed or
// offline jobs get retried even without a new submission.
chrome.alarms.create("processSyncQueue", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "processSyncQueue") queue.processQueue();
});
chrome.runtime.onStartup.addListener(() => queue.processQueue());
queue.processQueue();
