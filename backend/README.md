# LinkCode auth backend

A tiny Cloudflare Worker that lets the extension push to **one** GitHub repo
without ever holding a personal access token. It holds the GitHub App private
key and mints short-lived (1 hour), repo-scoped installation tokens.

## One-time setup

### 1. Register a GitHub App
GitHub → Settings → Developer settings → **GitHub Apps** → New GitHub App.

- **Homepage URL**: anything (e.g. your repo URL).
- **Callback URL**: `https://YOUR-WORKER.workers.dev/callback`
- **Request user authorization (OAuth) during installation**: ✅ checked
- **Webhook**: uncheck **Active** (not used).
- **Permissions → Repository → Contents**: **Read and write**. Leave everything
  else at *No access*. (This is the whole point — minimum access.)
- **Where can this app be installed**: *Only on this account*.

Create it, then note the **App ID** and **Client ID**, generate a **Client
secret**, and generate a **Private key** (downloads a `.pem`).

### 2. Convert the private key to PKCS8
GitHub gives a PKCS1 key; Web Crypto needs PKCS8:
```
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in your-key.pem -out key.pkcs8.pem
```

### 3. Deploy the Worker
```
npm i -g wrangler          # if needed
cd backend
wrangler deploy
```
Set the App slug + secrets:
```
# edit wrangler.toml: APP_SLUG (from the App's URL) and EXT_REDIRECT_URL
wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_APP_PRIVATE_KEY   # paste the PKCS8 key contents
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put SESSION_SECRET           # openssl rand -hex 32
```

### 4. Point the extension at the Worker
- In `shared/constants.js`, set `WORKER_BASE_URL` to your Worker URL.
- Load the extension, then set `EXT_REDIRECT_URL` in `wrangler.toml` to the value
  of `chrome.identity.getRedirectURL()` (it's `https://<extension-id>.chromiumapp.org/`),
  and re-run `wrangler deploy`.

### 5. Install the App on your one repo
Open `https://github.com/apps/<APP_SLUG>/installations/new`, choose **Only select
repositories**, pick the single repo, install. (The extension's "Connect with
GitHub" button also opens this.)

## Endpoints
- `GET /login?state=…` → redirects to the install/authorize screen.
- `GET /callback` → verifies the user via OAuth, finds the installed repo, returns a signed session to the extension.
- `POST /token` (`Authorization: Bearer <session>`) → returns `{ token, expires_at, owner, repo }`.
