const GITHUB_API_BASE = "https://api.github.com";

/* -------------------- Language table -------------------- */

// Canonical language → output folder + file extension.
const LANGS = {
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
const LANG_ALIASES = {
  python3: "python",
  typescript: "javascript",
  "c++": "cpp",
  "c#": "csharp",
};

/* -------------------- Helpers -------------------- */

// Normalize Monaco language IDs
function normalizeLanguage(rawLang) {
  if (!rawLang) return { family: "unknown" };

  const l = rawLang.toLowerCase();

  // Monaco reports ALL SQL as "sql"
  if (l === "sql" || l === "mysql" || l === "postgresql") {
    return { family: "sql", dialect: "generic" };
  }

  if (l === "pandas") return { family: "pandas" };

  const language = LANG_ALIASES[l] || l;
  if (LANGS[language]) return { family: "code", language };

  return { family: "unknown" };
}

// Map language → folder + extension
function getPath(langInfo, slug) {
  const snake = slug.replace(/-/g, "_");

  if (langInfo.family === "sql") return `database/${langInfo.dialect}/${snake}.sql`;
  if (langInfo.family === "pandas") return `database/pandas/${snake}.py`;

  const cfg = LANGS[langInfo.language];
  if (!cfg) throw new Error("Unsupported language");

  return `${cfg.dir}/${snake}.${cfg.ext}`;
}

function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function getCommentPrefix(langInfo) {
  if (langInfo.family === "sql") return "--";
  if (langInfo.family === "pandas" || langInfo.language === "python") return "#";
  return "//";
}

function buildHeader({ title, slug, rawLanguage, langInfo }) {
  const prefix = getCommentPrefix(langInfo);
  const url = `https://leetcode.com/problems/${slug}/`;
  const date = new Date().toLocaleString();

  let languageLabel = rawLanguage;
  if (langInfo.family === "sql") languageLabel = `SQL (${langInfo.dialect})`;
  if (langInfo.family === "pandas") languageLabel = "Python (Pandas)";

  return `
${prefix} ======================================
${prefix} LeetCode Problem: ${title}
${prefix} Language: ${languageLabel}
${prefix} Link: ${url}
${prefix} Synced by: LinkCode
${prefix} Date: ${date}
${prefix} ======================================

`.trimStart();
}

function setLastAccepted(path) {
  chrome.storage.local.set({ lastAccepted: { path, time: Date.now() } });
}

function setLastSync(path) {
  chrome.storage.local.set({ lastSync: { path, time: Date.now() }, syncError: null });
}

function setSyncError(message) {
  chrome.storage.local.set({ syncError: { message } });
}

// Runs in the page (MAIN world) — must not reference anything outside itself.
function extractFromMonaco() {
  let code = "";
  let language = "unknown";

  if (window.monaco && window.monaco.editor) {
    const models = window.monaco.editor.getModels();
    if (models.length > 0) {
      code = models[0].getValue();
      language = models[0].getLanguageId();
    }
  }

  return { code, language };
}

// Build the header + push a submission to GitHub, then record the sync.
async function pushSubmission({ problemSlug, language, code }, langInfo, cfg, path) {
  const header = buildHeader({
    title: problemSlug.replace(/-/g, " "),
    slug: problemSlug,
    rawLanguage: language,
    langInfo,
  });

  await pushToGitHub({
    owner: cfg.githubOwner,
    repo: cfg.githubRepo,
    token: cfg.githubToken,
    path,
    content: `${header}\n${code}`,
  });

  setLastSync(path);
}

/* -------------------- Message handlers -------------------- */

async function handleExtractCode(sender) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: sender.tab.id },
    world: "MAIN",
    func: extractFromMonaco,
  });

  const { code, language } = results?.[0]?.result || {};
  const langInfo = normalizeLanguage(language);

  if (langInfo.family === "unknown") return;

  // SAFETY GUARD
  if (!code || language === "unknown") {
    console.warn("Could not reliably detect language. Skipping GitHub push.");
    return;
  }

  const submission = {
    problemSlug: sender.tab.url.split("/")[4],
    language,
    code,
    timestamp: Date.now(),
  };

  await chrome.storage.local.set({ lastSubmission: submission });

  const cfg = await chrome.storage.local.get([
    "githubOwner",
    "githubRepo",
    "githubToken",
    "autoSync",
  ]);

  if (!cfg.githubOwner || !cfg.githubRepo || !cfg.githubToken) {
    console.warn("⚠️ GitHub not configured yet");
    return;
  }

  try {
    const path = getPath(langInfo, submission.problemSlug);
    setLastAccepted(path);

    if (cfg.autoSync === false) return;

    await pushSubmission(submission, langInfo, cfg, path);
  } catch (err) {
    console.error("GitHub push error:", err.message);
    setSyncError(
      err.message.includes("401")
        ? "Couldn’t sync to GitHub. Please check your access token."
        : "Sync failed due to a network or GitHub issue."
    );
  }
}

async function handleManualSync() {
  const cfg = await chrome.storage.local.get([
    "lastSubmission",
    "githubOwner",
    "githubRepo",
    "githubToken",
  ]);

  const { lastSubmission } = cfg;

  if (!lastSubmission) {
    console.warn("⚠️ No submission available for manual sync");
    return;
  }

  if (!cfg.githubOwner || !cfg.githubRepo || !cfg.githubToken) {
    console.warn("⚠️ GitHub not configured");
    return;
  }

  const langInfo = normalizeLanguage(lastSubmission.language);

  if (langInfo.family === "unknown") {
    console.warn("⚠️ Unsupported language for manual sync");
    return;
  }

  try {
    const path = getPath(langInfo, lastSubmission.problemSlug);
    await pushSubmission(lastSubmission, langInfo, cfg, path);
  } catch (err) {
    console.error("❌ Manual sync failed:", err.message);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXTRACT_CODE") {
    handleExtractCode(sender);
    return;
  }

  if (message.type === "MANUAL_SYNC") {
    handleManualSync();
    return;
  }

  if (message.type === "VERIFY_GITHUB") {
    verifyGitHubRepo(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }
});

/* -------------------- GitHub API -------------------- */

async function verifyGitHubRepo({ owner, repo, token }) {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (res.status === 401) return { success: false, error: "Invalid access token" };
  if (res.status === 403) {
    return { success: false, error: "Token does not have access to this repository" };
  }
  if (res.status === 404) return { success: false, error: "Repository not found" };
  if (!res.ok) return { success: false, error: "GitHub verification failed" };

  return { success: true };
}

async function pushToGitHub({ owner, repo, token, path, content }) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };

  // Check if file exists (get SHA)
  let sha = null;
  const getRes = await fetch(url, { headers });

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
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    throw new Error(`Push failed: ${putRes.status} ${await putRes.text()}`);
  }

  return putRes.json();
}
