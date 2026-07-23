// GitHub auth for the extension. No PAT: the user connects via the GitHub App
// install/authorize flow, and we exchange a signed session for short-lived,
// repo-scoped installation tokens from the Worker (refreshing as needed).
import { WORKER_BASE_URL, KEYS } from "./constants.js";
import * as store from "./storage.js";

// Refresh the cached token this many ms before it actually expires.
const REFRESH_MARGIN = 2 * 60 * 1000;

// Interactive: open the GitHub App install/authorize screen and store the
// resulting session + connected repo. Must be called from the popup.
export async function login() {
  const state = crypto.randomUUID();
  const redirect = await chrome.identity.launchWebAuthFlow({
    url: `${WORKER_BASE_URL}/login?state=${encodeURIComponent(state)}`,
    interactive: true,
  });

  const params = new URL(redirect).searchParams;
  if (params.get("state") !== state) throw new Error("Auth state mismatch");

  const session = params.get("session");
  const owner = params.get("owner");
  const repo = params.get("repo");
  if (!session || !owner || !repo) throw new Error("GitHub connection failed");

  await store.set({ [KEYS.session]: session, [KEYS.owner]: owner, [KEYS.repo]: repo });
  await store.remove([KEYS.installToken, KEYS.installTokenExp]);
  return { owner, repo, login: params.get("login") };
}

export async function logout() {
  await store.remove([KEYS.session, KEYS.owner, KEYS.repo, KEYS.installToken, KEYS.installTokenExp]);
}

export async function isConnected() {
  const d = await store.get([KEYS.session, KEYS.owner, KEYS.repo]);
  return Boolean(d[KEYS.session] && d[KEYS.owner] && d[KEYS.repo]);
}

// Return a valid installation token, reusing the cached one until it nears
// expiry, otherwise minting a fresh one via the Worker.
export async function getAccessToken() {
  const d = await store.get([KEYS.session, KEYS.installToken, KEYS.installTokenExp]);
  if (!d[KEYS.session]) throw new Error("Not connected to GitHub");

  const cached = d[KEYS.installToken];
  const exp = d[KEYS.installTokenExp];
  if (cached && exp && exp - Date.now() > REFRESH_MARGIN) return cached;

  const res = await fetch(`${WORKER_BASE_URL}/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${d[KEYS.session]}` },
  });

  if (res.status === 401) {
    await logout();
    throw new Error("GitHub session expired. Please reconnect.");
  }
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);

  const { token, expires_at } = await res.json();
  await store.set({
    [KEYS.installToken]: token,
    [KEYS.installTokenExp]: new Date(expires_at).getTime(),
  });
  return token;
}
