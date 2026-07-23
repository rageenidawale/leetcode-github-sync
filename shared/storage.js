// Thin wrapper over chrome.storage.local: one place that knows the storage
// shape, so callers don't repeat key names or the get/set boilerplate.
import { KEYS } from "./constants.js";

const local = chrome.storage.local;

export const get = (keys) => local.get(keys);
export const set = (obj) => local.set(obj);
export const remove = (keys) => local.remove(keys);

// Connected repo + sync preference. The GitHub token itself is handled by
// shared/auth.js, not stored here.
export async function getConfig() {
  const d = await local.get([KEYS.owner, KEYS.repo, KEYS.autoSync]);
  return {
    owner: d[KEYS.owner],
    repo: d[KEYS.repo],
    autoSync: d[KEYS.autoSync],
  };
}

// Sync state setters.
export function setLastAccepted(path) {
  return local.set({ [KEYS.lastAccepted]: { path, time: Date.now() } });
}

export function setLastSync(path) {
  return local.set({ [KEYS.lastSync]: { path, time: Date.now() }, [KEYS.syncError]: null });
}

export function setSyncError(message) {
  return local.set({ [KEYS.syncError]: { message } });
}

// Last extracted submission (used by manual sync).
export async function getLastSubmission() {
  const d = await local.get(KEYS.lastSubmission);
  return d[KEYS.lastSubmission];
}

export function setLastSubmission(submission) {
  return local.set({ [KEYS.lastSubmission]: submission });
}
