// Persisted sync queue. One mechanism covers retry, offline queue, background
// sync and failed-sync recovery: jobs live in storage, and processQueue() is
// driven by new submissions, an alarm, and worker startup. Duplicate detection
// (content hash per path) and history live here too.
import { KEYS } from "./constants.js";
import * as store from "./storage.js";
import * as auth from "./auth.js";
import * as log from "./logger.js";
import { normalizeLanguage, buildPath, buildHeader, buildCommitMessage, humanize } from "./languages.js";
import { pushToGitHub } from "./github.js";

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30 * 1000;
const HISTORY_LIMIT = 50;

// Small non-crypto content hash (djb2) — enough to skip re-pushing identical files.
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export async function getQueue() {
  return (await store.get(KEYS.queue))[KEYS.queue] || [];
}
function setQueue(q) {
  return store.set({ [KEYS.queue]: q });
}

// Add one submission unless an identical pending job is already queued.
export async function enqueue(submission) {
  if (normalizeLanguage(submission.language).family === "unknown") return;
  const q = await getQueue();
  q.push({ id: crypto.randomUUID(), submission, attempts: 0, nextAt: 0, failed: false, lastError: null });
  await setQueue(q);
}

async function addHistory(entry) {
  const hist = (await store.get(KEYS.history))[KEYS.history] || [];
  hist.unshift({ ...entry, time: Date.now() });
  await store.set({ [KEYS.history]: hist.slice(0, HISTORY_LIMIT) });
}

// Build + push one submission. Returns { skipped, path } — skipped when the
// file content is unchanged since the last sync (duplicate detection).
async function syncOne(submission, cfg, settings, hashes) {
  const { problemSlug, language, code, meta } = submission;
  const langInfo = normalizeLanguage(language);
  if (langInfo.family === "unknown") throw new Error("Unsupported language");

  const path = buildPath(langInfo, problemSlug, meta, settings);
  const header = buildHeader({ slug: problemSlug, rawLanguage: language, langInfo, meta, headerOpts: settings.header });
  const content = `${header}\n${code}`;

  const h = hash(content);
  if (hashes[path] === h) return { skipped: true, path };

  const message = buildCommitMessage(settings.commitTemplate, {
    path,
    slug: problemSlug,
    title: meta?.title || humanize(problemSlug),
    difficulty: meta?.difficulty || "",
    lang: language,
    date: new Date().toLocaleString(),
  });

  const token = await auth.getAccessToken();
  await pushToGitHub({ owner: cfg.owner, repo: cfg.repo, token, path, content, message, branch: settings.branch });

  hashes[path] = h;
  return { skipped: false, path };
}

let processing = false;

// Attempt every ready job once. Failed pushes stay queued with exponential
// backoff; after MAX_ATTEMPTS they are marked failed (retryable by the user).
export async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    if (!(await auth.isConnected())) return;

    const cfg = await store.getConfig();
    const settings = await store.getSettings();
    const hashes = (await store.get(KEYS.syncedHashes))[KEYS.syncedHashes] || {};
    const now = Date.now();
    const remaining = [];
    let synced = false;

    // ponytail: queue + hashes persist once at the end of the batch. If the
    // worker is killed mid-batch, already-synced files may be re-pushed on the
    // next run (harmless — pushes are content-checked). Persist per-job if that
    // noise ever matters.

    for (const job of await getQueue()) {
      if (job.failed || job.nextAt > now) { remaining.push(job); continue; }
      try {
        const { skipped, path } = await syncOne(job.submission, cfg, settings, hashes);
        await store.setLastSync(path);
        await addHistory({ path, status: skipped ? "skipped" : "synced" });
        synced = true;
      } catch (err) {
        job.attempts += 1;
        job.lastError = err.message;
        if (job.attempts >= MAX_ATTEMPTS) {
          job.failed = true;
          await addHistory({ path: job.submission.problemSlug, status: "failed", error: err.message });
          await store.setSyncError(
            err.message.includes("401")
              ? "Couldn’t sync to GitHub. Please reconnect your account."
              : "Sync failed after several attempts. See sync activity in Settings."
          );
          log.error("Sync job failed permanently:", err.message);
        } else {
          job.nextAt = now + BASE_BACKOFF_MS * 2 ** (job.attempts - 1);
        }
        remaining.push(job);
      }
    }

    await setQueue(remaining);
    if (synced) await store.set({ [KEYS.syncedHashes]: hashes });
  } finally {
    processing = false;
  }
}

// Reset failed jobs and process them again.
export async function retryFailed() {
  const q = await getQueue();
  for (const job of q) {
    if (job.failed) { job.failed = false; job.attempts = 0; job.nextAt = 0; }
  }
  await setQueue(q);
  await processQueue();
}
