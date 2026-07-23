# Changelog

## Unreleased
- Replaced the personal access token with GitHub App sign-in: LinkCode now
  requests write access to a single repository you choose, and nothing else
- Added Connect / Disconnect in the popup; access tokens are short-lived and
  refreshed automatically (existing PAT users will reconnect once)

## v1.0.1
- Fixed popup crash (ReferenceError) after a manual sync
- Simplified internals; no change to sync behavior

## v1.0.0
- Initial release
- Sync accepted LeetCode solutions to GitHub
- Auto-sync and manual sync modes
