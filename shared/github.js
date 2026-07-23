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

export async function pushToGitHub({ owner, repo, token, path, content }) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`;

  // Check if file exists (get SHA)
  let sha = null;
  const getRes = await fetch(url, { headers: authHeaders(token) });

  if (getRes.status === 200) {
    sha = (await getRes.json()).sha;
  } else if (getRes.status !== 404) {
    throw new Error(`Precheck failed: ${getRes.status} ${await getRes.text()}`);
  }

  // Create or update file
  const body = { message: `LeetCode: update ${path}`, content: base64Encode(content) };
  if (sha) body.sha = sha;

  const putRes = await fetch(url, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    throw new Error(`Push failed: ${putRes.status} ${await putRes.text()}`);
  }

  return putRes.json();
}
