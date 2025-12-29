console.log("Background service worker loaded");

const GITHUB_API_BASE = "https://api.github.com";

/* -------------------- Helpers -------------------- */

// Normalize Monaco language IDs
function normalizeLanguage(rawLang) {
    console.log(rawLang);
  if (!rawLang) return { family: "unknown" };

  const l = rawLang.toLowerCase();

  // Monaco reports ALL SQL as "sql"
  if (l === "sql" || l === "mysql" || l === "postgresql") {
    return { family: "sql", dialect: "generic" };
  }

  // ---------- Pandas ----------
  if (l === "pandas") return { family: "pandas" };

  // ---------- Programming languages ----------
  const codeMap = {
    python: "python",
    python3: "python",
    javascript: "javascript",
    typescript: "javascript",
    java: "java",
    cpp: "cpp",
    "c++": "cpp",
    c: "c",
    csharp: "csharp",
    "c#": "csharp",
    go: "go",
    kotlin: "kotlin",
    swift: "swift",
    rust: "rust",
    ruby: "ruby",
    php: "php",
    dart: "dart",
    scala: "scala",
    racket: "racket",
    erlang: "erlang",
    elixir: "elixir",
  };

  if (codeMap[l]) {
    return { family: "code", language: codeMap[l] };
  }

  return { family: "unknown" };
}

// Map language → folder + extension
function getPath(langInfo, slug) {
  const snake = slug.replace(/-/g, "_");

  // ---------- SQL ----------
  if (langInfo.family === "sql") {
    return `database/${langInfo.dialect}/${snake}.sql`;
  }

  // ---------- Pandas ----------
  if (langInfo.family === "pandas") {
    return `database/pandas/${snake}.py`;
  }

  // ---------- Programming ----------
  const map = {
    python: { dir: "python", ext: "py" },
    javascript: { dir: "javascript", ext: "js" },
    java: { dir: "java", ext: "java" },
    cpp: { dir: "cpp", ext: "cpp" },
    c: { dir: "c", ext: "c" },
    csharp: { dir: "csharp", ext: "cs" },
    go: { dir: "go", ext: "go" },
    kotlin: { dir: "kotlin", ext: "kt" },
    swift: { dir: "swift", ext: "swift" },
    rust: { dir: "rust", ext: "rs" },
    ruby: { dir: "ruby", ext: "rb" },
    php: { dir: "php", ext: "php" },
    dart: { dir: "dart", ext: "dart" },
    scala: { dir: "scala", ext: "scala" },
    racket: { dir: "racket", ext: "rkt" },
    erlang: { dir: "erlang", ext: "erl" },
    elixir: { dir: "elixir", ext: "ex" },
  };

  const cfg = map[langInfo.language];
  if (!cfg) throw new Error("Unsupported language");

  return `${cfg.dir}/${snake}.${cfg.ext}`;
}

function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function humanizeSlug(slug) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getCommentPrefix(langInfo) {
  if (langInfo.family === "sql") return "--";
  if (langInfo.family === "pandas") return "#";
  if (langInfo.family === "code" && langInfo.language === "python") return "#";
  return "//";
}

function getLanguageDisplayName(language) {
  const map = {
    python: "Python",
    javascript: "JavaScript",
    java: "Java",
    cpp: "C++",
  };
  return map[language] || language;
}

function buildHeader({ title, slug, rawLanguage, langInfo }) {
  const prefix = getCommentPrefix(langInfo);
  const url = `https://leetcode.com/problems/${slug}/`;
  const date = new Date().toLocaleString();

  let languageLabel = rawLanguage;
  if (langInfo.family === "sql") {
    languageLabel = `SQL (${langInfo.dialect})`;
  }
  if (langInfo.family === "pandas") {
    languageLabel = "Python (Pandas)";
  }

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
  chrome.storage.local.set({
    lastAccepted: {
      path,
      time: Date.now()
    }
  });
}

function setLastSync(path) {
  chrome.storage.local.set({
    lastSync: {
      path,
      time: Date.now()
    },
    syncError: null
  });
}

function setSyncError(message) {
  chrome.storage.local.set({
    syncError: { message }
  });
}

/* -------------------- Message Listener -------------------- */

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "EXTRACT_CODE") return;

  console.log("📨 Background received EXTRACT_CODE message", message);
  console.log("[Background] Sender: ", sender);

  chrome.scripting.executeScript(
    {
      target: { tabId: sender.tab.id },
      world: "MAIN",
      func: () => {
        console.log("Running in page context");
        let code = "";
        let language = "unknown";

        if (window.monaco && window.monaco.editor) {
          const models = window.monaco.editor.getModels();
          if (models.length > 0) {
            const model = models[0];
            code = model.getValue();
            language = model.getLanguageId();
          } else {
            console.log("Monaco not found");
          }
        }

        console.log("Injected extracted: ", { language, code });

        return { code, language };
      },
    },
    async (results) => {
      console.log("Injection results: ", results);
      const result = results?.[0]?.result || {};
      let { code, language } = result;

      const langInfo = normalizeLanguage(language);
      console.log("langInfo: ", langInfo);

      if (langInfo.family === "unknown") return;

      // SAFETY GUARD
      if (!code || language === "unknown") {
        console.warn(
          "⚠️ Could not reliably detect language. Skipping GitHub push."
        );
        return;
      }

      const submission = {
        problemSlug: sender.tab.url.split("/")[4],
        language,
        code,
        timestamp: Date.now(),
      };

      console.log("Submission: ", submission);
      // Save submission
      chrome.storage.local.set({ lastSubmission: submission }, () => {
        console.log("💾 Submission saved to storage:", submission);

        // Read GitHub config and push
        chrome.storage.local.get(
          ["githubOwner", "githubRepo", "githubToken", "autoSync"],
          async (cfg) => {
            try {
              const { githubOwner, githubRepo, githubToken } = cfg;

              if (!githubOwner || !githubRepo || !githubToken) {
                console.warn("⚠️ GitHub not configured yet");
                return;
              }

              const path = getPath(langInfo, submission.problemSlug);
              setLastAccepted(path);

              const header = buildHeader({
                title: submission.problemSlug.replace(/-/g, " "),
                slug: submission.problemSlug,
                rawLanguage: language,
                langInfo,
              });

              const finalCode = `${header}\n${code}`;

              if (cfg.autoSync === false) {
                console.log("Auto Sync OFF - waiting for manual sync");
                return;
              }

              const result = await pushToGitHub({
                owner: cfg.githubOwner,
                repo: cfg.githubRepo,
                token: cfg.githubToken,
                path,
                content: finalCode,
              });

              console.log("✅ GitHub push successful:", result.content.path);
              setLastSync(path);
            } catch (err) {
              console.error("❌ GitHub push error:", err.message);
              setSyncError(
                err.message.includes("401")
                ? "Couldn’t sync to GitHub. Please check your access token."
                : "Sync failed due to a network or GitHub issue."
            );
            }
          }
        );
      });
    }
  );
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "MANUAL_SYNC") return;

  console.log("🔘 Manual sync triggered");

  chrome.storage.local.get(
    ["lastSubmission", "githubOwner", "githubRepo", "githubToken"],
    async (cfg) => {
      try {
        const { lastSubmission, githubOwner, githubRepo, githubToken } = cfg;

        if (!lastSubmission) {
          console.warn("⚠️ No submission available for manual sync");
          return;
        }

        if (!githubOwner || !githubRepo || !githubToken) {
          console.warn("⚠️ GitHub not configured");
          return;
        }

        const { problemSlug, language, code } = lastSubmission;
        const langInfo = normalizeLanguage(language);

        if (langInfo.family === "unknown") {
          console.warn("⚠️ Unsupported language for manual sync");
          return;
        }

        const path = getPath(langInfo, problemSlug);

        const header = buildHeader({
          title: problemSlug.replace(/-/g, " "),
          slug: problemSlug,
          rawLanguage: language,
          langInfo,
        });

        const finalCode = `${header}\n${code}`;

        const result = await pushToGitHub({
          owner: githubOwner,
          repo: githubRepo,
          token: githubToken,
          path,
          content: finalCode,
        });

        console.log("✅ Manual GitHub push successful:", result.content.path);
        setLastSync(path);

        chrome.storage.local.set({
          lastSyncedFile: path,
          lastSyncedTime: new Date().toLocaleString(),
        });
        console.log("Writing last sync to storage");

      } catch (err) {
        console.error("❌ Manual sync failed:", err.message);
      }
    }
  );
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "VERIFY_GITHUB") {
    verifyGitHubRepo(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }
});

async function verifyGitHubRepo({ owner, repo, token }) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (res.status === 401) {
    return { success: false, error: "Invalid access token" };
  }

  if (res.status === 403) {
    return {
      success: false,
      error: "Token does not have access to this repository",
    };
  }

  if (res.status === 404) {
    return { success: false, error: "Repository not found" };
  }

  if (!res.ok) {
    return { success: false, error: "GitHub verification failed" };
  }

  return { success: true };
}

/* -------------------- GitHub API -------------------- */

async function pushToGitHub({ owner, repo, token, path, content }) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`;

  // 1️⃣ Check if file exists (get SHA)
  let sha = null;
  const getRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (getRes.status === 200) {
    const data = await getRes.json();
    sha = data.sha;
  } else if (getRes.status !== 404) {
    const t = await getRes.text();
    throw new Error(`Precheck failed: ${getRes.status} ${t}`);
  }

  // 2️⃣ Create or update file
  const body = {
    message: `LeetCode: update ${path}`,
    content: base64Encode(content),
  };

  if (sha) body.sha = sha;

  const putRes = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const t = await putRes.text();
    throw new Error(`Push failed: ${putRes.status} ${t}`);
  }

  return putRes.json();
}
