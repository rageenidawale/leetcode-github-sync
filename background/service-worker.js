import { MESSAGES } from "../shared/constants.js";
import * as log from "../shared/logger.js";
import * as store from "../shared/storage.js";
import { normalizeLanguage, buildPath, buildHeader, buildCommitMessage, humanize } from "../shared/languages.js";
import { pushToGitHub } from "../shared/github.js";
import * as auth from "../shared/auth.js";

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

// Build the header + commit message, push to GitHub, then record the sync.
async function pushSubmission(submission, langInfo, cfg, settings, path, token) {
  const { problemSlug, language, code, meta } = submission;

  const header = buildHeader({
    slug: problemSlug,
    rawLanguage: language,
    langInfo,
    meta,
    headerOpts: settings.header,
  });

  const message = buildCommitMessage(settings.commitTemplate, {
    path,
    slug: problemSlug,
    title: meta?.title || humanize(problemSlug),
    difficulty: meta?.difficulty || "",
    lang: language,
    date: new Date().toLocaleString(),
  });

  await pushToGitHub({
    owner: cfg.owner,
    repo: cfg.repo,
    token,
    path,
    content: `${header}\n${code}`,
    message,
    branch: settings.branch,
  });

  await store.setLastSync(path);
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

  try {
    const path = buildPath(langInfo, submission.problemSlug, submission.meta, settings);
    await store.setLastAccepted(path);

    if (cfg.autoSync === false) return;

    const token = await auth.getAccessToken();
    await pushSubmission(submission, langInfo, cfg, settings, path, token);
  } catch (err) {
    log.error("GitHub push error:", err.message);
    await store.setSyncError(
      err.message.includes("401")
        ? "Couldn’t sync to GitHub. Please check your access token."
        : "Sync failed due to a network or GitHub issue."
    );
  }
}

async function handleManualSync() {
  const submission = await store.getLastSubmission();
  if (!submission) {
    log.warn("No submission available for manual sync");
    return;
  }

  if (!(await auth.isConnected())) {
    log.warn("GitHub not connected");
    return;
  }

  const langInfo = normalizeLanguage(submission.language);
  if (langInfo.family === "unknown") {
    log.warn("Unsupported language for manual sync");
    return;
  }

  const cfg = await store.getConfig();
  const settings = await store.getSettings();

  try {
    const path = buildPath(langInfo, submission.problemSlug, submission.meta, settings);
    const token = await auth.getAccessToken();
    await pushSubmission(submission, langInfo, cfg, settings, path, token);
  } catch (err) {
    log.error("Manual sync failed:", err.message);
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === MESSAGES.EXTRACT_CODE) handleExtractCode(sender, message.meta);
  if (message.type === MESSAGES.MANUAL_SYNC) handleManualSync();
});
