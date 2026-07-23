// GitHub Contents API client. Isolated here so auth changes (Milestone 2)
// only touch this module.
import { GITHUB_API_BASE } from "./constants.js";

function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
}

// Current blob SHA for a path (null if the file doesn't exist).
async function getSha(url, token) {
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 200) return (await res.json()).sha;
  if (res.status === 404) return null;
  throw new Error(`Precheck failed: ${res.status} ${await res.text()}`);
}

export async function pushToGitHub({ owner, repo, token, path, content, message, branch }) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`;
  const getUrl = branch ? `${url}?ref=${encodeURIComponent(branch)}` : url;

  const put = async (sha) => {
    const body = { message: message || `LeetCode: update ${path}`, content: base64Encode(content) };
    if (sha) body.sha = sha;
    if (branch) body.branch = branch;
    return fetch(url, {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  let putRes = await put(await getSha(getUrl, token));

  // Conflict: the file changed between our SHA read and write — refetch and retry once.
  if (putRes.status === 409 || putRes.status === 422) {
    putRes = await put(await getSha(getUrl, token));
  }

  if (!putRes.ok) {
    throw new Error(`Push failed: ${putRes.status} ${await putRes.text()}`);
  }

  return putRes.json();
}
