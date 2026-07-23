# Changelog

## Unreleased
- Replaced the personal access token with GitHub App sign-in: LinkCode now
  requests write access to a single repository you choose, and nothing else
- Added Connect / Disconnect in the popup; access tokens are short-lived and
  refreshed automatically (existing PAT users will reconnect once)
- Added a Settings page: folder layout (by language and/or difficulty),
  filename and commit-message templates, target branch, and which fields
  appear in the file header
- Solutions now record difficulty and topics (read from LeetCode), which
  enables organizing files by difficulty
- Syncs now go through a background queue with automatic retry, offline
  recovery, and duplicate detection; failed syncs can be retried from Settings
- Added "Import existing solutions" to backfill recent accepted submissions,
  plus a recent-sync activity list

## v1.0.1
- Fixed popup crash (ReferenceError) after a manual sync
- Simplified internals; no change to sync behavior

## v1.0.0
- Initial release
- Sync accepted LeetCode solutions to GitHub
- Auto-sync and manual sync modes
