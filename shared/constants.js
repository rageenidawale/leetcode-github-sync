// Central constants for the LinkCode extension.
// Imported by the service worker and popup (ES modules). The content script
// can't import without bundling, so it mirrors the few values it needs.

export const APP_NAME = "LinkCode";

export const GITHUB_API_BASE = "https://api.github.com";

// Message types passed between content script, popup, and service worker.
export const MESSAGES = {
  EXTRACT_CODE: "EXTRACT_CODE",
  MANUAL_SYNC: "MANUAL_SYNC",
  VERIFY_GITHUB: "VERIFY_GITHUB",
};

// chrome.storage.local keys.
export const KEYS = {
  owner: "githubOwner",
  repo: "githubRepo",
  token: "githubToken",
  autoSync: "autoSync",
  lastSubmission: "lastSubmission",
  lastAccepted: "lastAccepted",
  lastSync: "lastSync",
  syncError: "syncError",
  formDraft: "connectFormDraft",
};

// Canonical language → output folder + file extension.
export const LANGS = {
  python:     { dir: "python",     ext: "py"    },
  javascript: { dir: "javascript", ext: "js"    },
  java:       { dir: "java",       ext: "java"  },
  cpp:        { dir: "cpp",        ext: "cpp"   },
  c:          { dir: "c",          ext: "c"     },
  csharp:     { dir: "csharp",     ext: "cs"    },
  go:         { dir: "go",         ext: "go"    },
  kotlin:     { dir: "kotlin",     ext: "kt"    },
  swift:      { dir: "swift",      ext: "swift" },
  rust:       { dir: "rust",       ext: "rs"    },
  ruby:       { dir: "ruby",       ext: "rb"    },
  php:        { dir: "php",        ext: "php"   },
  dart:       { dir: "dart",       ext: "dart"  },
  scala:      { dir: "scala",      ext: "scala" },
  racket:     { dir: "racket",     ext: "rkt"   },
  erlang:     { dir: "erlang",     ext: "erl"   },
  elixir:     { dir: "elixir",     ext: "ex"    },
};

// Monaco language IDs that map onto a canonical LANGS key.
export const LANG_ALIASES = {
  python3: "python",
  typescript: "javascript",
  "c++": "cpp",
  "c#": "csharp",
};
