// LinkCode auth backend (Cloudflare Worker).
//
// Holds the GitHub App private key + OAuth client secret so the extension
// never does. Flow:
//   GET  /login    -> redirect to the GitHub App install/authorize screen
//   GET  /callback -> verify the user (OAuth), discover the installed repo,
//                     hand the extension a signed session
//   POST /token    -> exchange a valid session for a short-lived, repo-scoped
//                     installation token (Contents: write on one repo only)
//
// The session is an HMAC-signed token the extension stores; it carries the
// installation id + repo, so /token is stateless (no KV needed).

const GH_API = "https://api.github.com";
const UA = "LinkCode";

/* ---------- encoding helpers ---------- */
const enc = (s) => new TextEncoder().encode(s);
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (obj) => b64url(enc(JSON.stringify(obj)));
const b64urlToBytes = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return Uint8Array.from(atob(s + pad), (c) => c.charCodeAt(0));
};

/* ---------- GitHub App JWT (RS256) ---------- */
async function importPrivateKey(pem) {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = b64urlToBytes(body.replace(/\+/g, "-").replace(/\//g, "_"));
  return crypto.subtle.importKey(
    "pkcs8", der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
}

async function appJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID };
  const data = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const key = await importPrivateKey(env.GITHUB_APP_PRIVATE_KEY);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc(data));
  return `${data}.${b64url(sig)}`;
}

/* ---------- session HMAC ---------- */
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}
async function signSession(env, payload) {
  const data = b64urlJson(payload);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env.SESSION_SECRET), enc(data));
  return `${data}.${b64url(sig)}`;
}
async function verifySession(env, token) {
  const [data, sig] = (token || "").split(".");
  if (!data || !sig) return null;
  const ok = await crypto.subtle.verify(
    "HMAC", await hmacKey(env.SESSION_SECRET), b64urlToBytes(sig), enc(data)
  );
  if (!ok) return null;
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(data)));
}

/* ---------- GitHub calls ---------- */
function ghHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": UA };
}

async function exchangeCode(env, code) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("OAuth code exchange failed");
  return data.access_token;
}

async function getLogin(userToken) {
  const res = await fetch(`${GH_API}/user`, { headers: ghHeaders(userToken) });
  if (!res.ok) throw new Error("Could not read GitHub user");
  return (await res.json()).login;
}

// repo optional: omit to mint a token for the whole installation (used once to
// discover the repo); pass it to scope the token to that single repo.
async function installationToken(env, installationId, repo) {
  const jwt = await appJwt(env);
  const body = repo
    ? { repositories: [repo], permissions: { contents: "write" } }
    : { permissions: { contents: "write" } };
  const res = await fetch(`${GH_API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { ...ghHeaders(jwt), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Installation token failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getInstallationRepo(token) {
  const res = await fetch(`${GH_API}/installation/repositories`, { headers: ghHeaders(token) });
  const data = await res.json();
  const r = data.repositories?.[0];
  if (!r) throw new Error("No repository in installation");
  return { owner: r.owner.login, repo: r.name };
}

/* ---------- responses ---------- */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...extra } });
const text = (s, status = 200) => new Response(s, { status });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      // Start: send the user to install/authorize the GitHub App.
      if (url.pathname === "/login") {
        const state = url.searchParams.get("state") || "";
        const dest = `https://github.com/apps/${env.APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`;
        return Response.redirect(dest, 302);
      }

      // GitHub returns here after install with ?code, ?installation_id, ?state.
      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const installationId = url.searchParams.get("installation_id");
        const state = url.searchParams.get("state") || "";
        if (!installationId) return text("Missing installation_id", 400);
        if (!code) return text("Missing OAuth code — enable 'Request user authorization during installation'", 400);

        // OAuth gate: prove a real user authorized, not just anyone hitting the URL.
        const login = await getLogin(await exchangeCode(env, code));

        // Discover the single repo this installation covers.
        const discovery = await installationToken(env, installationId);
        const { owner, repo } = await getInstallationRepo(discovery.token);

        const session = await signSession(env, { installation_id: installationId, owner, repo, login, iat: Date.now() });
        const dest = `${env.EXT_REDIRECT_URL}?session=${encodeURIComponent(session)}` +
          `&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}` +
          `&login=${encodeURIComponent(login)}&state=${encodeURIComponent(state)}`;
        return Response.redirect(dest, 302);
      }

      // Mint a fresh repo-scoped installation token for a valid session.
      if (url.pathname === "/token") {
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
        if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, CORS);

        const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        const payload = await verifySession(env, bearer);
        if (!payload) return json({ error: "Invalid session" }, 401, CORS);

        const t = await installationToken(env, payload.installation_id, payload.repo);
        return json({ token: t.token, expires_at: t.expires_at, owner: payload.owner, repo: payload.repo }, 200, CORS);
      }

      return text("LinkCode auth worker", 200);
    } catch (err) {
      return text(`Error: ${err.message}`, 500);
    }
  },
};
