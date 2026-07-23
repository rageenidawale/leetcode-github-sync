# Privacy Policy

**LinkCode** respects your privacy and is designed with a **security-first** approach.
This document explains what data the extension accesses, how it is used, and what it does **not** do.

---

## What data the extension accesses

### 1. LeetCode website data

The extension runs on LeetCode problem pages (`https://leetcode.com/problems/*`) and observes:

- Submission result status (for example, *Accepted*)
- Problem metadata (name, id, difficulty, topics, URL)
- Programming language used
- Code that **you personally submit**

It reads this **only after you submit a solution**, to detect *Accepted* submissions. To label
and organize files, and to power **Import existing solutions**, it queries LeetCode's GraphQL API
using your logged-in LeetCode session (this requires reading LeetCode's CSRF cookie for
`leetcode.com` only — no other site's cookies are accessed).

---

### 2. GitHub repository access

LinkCode uses a **GitHub App** that you install on a **single repository** of your choice, with
**Contents: Read and write** permission. There is **no personal access token**. The extension holds
a short-lived (1-hour), repository-scoped token that is refreshed automatically.

The extension **does not**:

- Access your other repositories
- Access your GitHub profile beyond your username (used to confirm sign-in)
- Access organizations
- Access issues, pull requests, workflows, or settings

---

## The auth backend

GitHub sign-in requires a small backend (a Cloudflare Worker) that holds the GitHub App
credentials and mints the short-lived, repository-scoped tokens.

- The backend processes your **GitHub sign-in** (OAuth) and the **installation/repository** you chose.
- Your **solution code never passes through the backend** — it is sent directly from your browser to GitHub.

---

## What data is stored

All data is stored **locally in your browser** using Chrome's local storage:

- A signed sign-in session and the cached short-lived GitHub token
- Selected repository
- Sync mode and customization settings
- The pending sync queue and recent sync history

No personal data is stored on external servers.

---

## What data is NOT accessed

The extension **does not**:

- Read or store your LeetCode or GitHub password
- Access browsing history
- Track user activity
- Collect analytics or telemetry
- Send your code to any third party

---

## How data is transmitted

- Your solution code is sent **directly from your browser to GitHub** via the GitHub REST API.
- Sign-in and token requests go to the LinkCode auth backend.
- Problem metadata and import requests go to LeetCode's API.
- All communication happens over secure HTTPS connections.

---

## Background syncing

Syncs run through a background queue and may be retried automatically (including when you were
temporarily offline). This only ever applies to submissions you accepted with auto-sync enabled,
or that you explicitly queued via manual sync or import.

---

## User control

- Sync can be disabled at any time (Auto Sync toggle)
- Manual mode syncs only when you click Sync
- You can disconnect GitHub at any time, and uninstall the GitHub App from your GitHub settings

---

## Third-party services

This extension interacts with:

- **LeetCode** (`leetcode.com`)
- **GitHub** (`api.github.com`)
- The **LinkCode auth backend** (a Cloudflare Worker) for GitHub sign-in only

No other third-party services are used.

---

## Changes to this policy

This privacy policy may be updated as the extension evolves. Any changes will be reflected in the
extension documentation.

---

## Contact

If you have questions or concerns about privacy or security, please contact the developer via the
Chrome Web Store listing.
