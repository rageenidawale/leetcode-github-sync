# LinkCode
LeetCode → GitHub Sync

LinkCode automatically syncs your **accepted LeetCode solutions** to a **single GitHub repository**, with full control, transparency, and minimal permissions.

---

## What is LinkCode?

**LinkCode** is a Chrome extension that watches your LeetCode submissions and saves **only accepted solutions** directly to a GitHub repository you choose.

- One repository per user
- Auto-sync or manual sync
- No personal access tokens — sign in with GitHub, scoped to one repo
- Configurable folders, filenames, commit messages, and headers
- Background sync queue with automatic retry

---

## Why does this extension exist?

Most existing LeetCode → GitHub tools ask for **full GitHub account access** and can touch **all your repositories**. LinkCode exists to fix that.

- **Minimal access** – a GitHub App installed on **one repository**, with **Contents: Read and write** and nothing else
- **Transparency** – you see exactly what gets synced
- **Control** – auto or manual syncing, plus per-field customization
- **Clean history** – Git handles versions, not the extension

---

## How does LinkCode work?

1. **Connect with GitHub**
   - Click **Connect with GitHub** in the popup
   - Install the LinkCode GitHub App on the **single repository** you want to sync
   - No token to copy or paste

2. **Solve problems on LeetCode**
   - LinkCode listens for **Accepted** submissions only

3. **Extract the solution safely**
   - Reads code directly from the editor and detects the language
   - Pulls problem difficulty and topics from LeetCode (used for folders/headers)

4. **Sync to GitHub**
   - Saves code under your chosen layout, e.g. by language:
     ```
     python/two_sum.py
     javascript/valid_parentheses.js
     ```
     …or by difficulty, or both (`python/easy/two_sum.py`)
   - Existing files are **updated**, not duplicated; Git handles history
   - Syncs run through a background queue that retries on failure or when offline

5. **You stay in control**
   - Auto-sync ON → sync happens automatically after each Accepted submission
   - Auto-sync OFF → sync manually from the popup

---

## Customization

Open **Settings** (the link on the dashboard, or right-click the extension → Options):

- **Folder layout** – by language, by difficulty, or both in either order
- **Filename** – template with `{slug}`, `{id}`, `{title}`
- **Commit message** – template with `{path}`, `{title}`, `{difficulty}`, `{lang}`, `{date}`, …
- **Branch** – push to a specific branch, or the repository default
- **File header** – toggle date, problem link, difficulty, and topics
- **Import existing solutions** – backfill your recent accepted submissions
- **Sync activity** – recent syncs and one-click retry of any that failed

---

## Security & Privacy

- **One repository only.** LinkCode uses a GitHub App you install on a single repo, with **Contents: Read and write** — no access to other repositories, issues, pull requests, profile, or organization data.
- **No personal access token.** You sign in with GitHub; the extension holds a short-lived (1-hour), repo-scoped token that is refreshed automatically.
- **Your code goes straight to GitHub.** A lightweight backend (a Cloudflare Worker) handles only the GitHub sign-in/token exchange — your solution code is pushed **directly from your browser to GitHub and never passes through it**.
- **Local storage only.** Session, settings, and the sync queue live in `chrome.storage.local`.
- **No analytics or tracking.**

---

## Self-hosting the backend

The GitHub sign-in requires a small backend (Cloudflare Worker) that holds the
GitHub App credentials and mints repo-scoped tokens. If you're running your own
instance, see [`backend/README.md`](backend/README.md) for the full setup:
register the GitHub App, deploy the Worker, and point `WORKER_BASE_URL` in
`shared/constants.js` at it.

---

## Features

- Sync **only accepted submissions**
- Auto-sync and manual sync
- GitHub App sign-in scoped to one repository
- Configurable folder layout, filename, commit message, branch, and header
- Difficulty and topics pulled from LeetCode
- Background sync queue: retry, offline recovery, duplicate detection
- Import recent accepted solutions
- Clean, distraction-free UI

---

## Tech Stack

- Chrome Extensions (Manifest V3), ES modules
- Vanilla JavaScript, no external dependencies
- GitHub App auth via a Cloudflare Worker
- GitHub REST API + LeetCode GraphQL

---

## Reporting Bugs

Please report issues here:
https://github.com/rageenidawale/linkcode-leetcode-github-sync/issues

Include what you expected, what actually happened, and screenshots if possible.

---

## Roadmap

See `Chrome Extension features` for the full plan. Next up: multiple
repositories, automatic README/portfolio generation, richer stats, and a UI
refresh.

---
