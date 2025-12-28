console.log("Background service worker loaded");

const GITHUB_API_BASE = "https://api.github.com";

/* -------------------- Helpers -------------------- */

// Normalize Monaco language IDs
function normalizeLanguage(lang) {
  const map = {
    python: "python",
    python3: "python",
    javascript: "javascript",
    typescript: "javascript",
    java: "java",
    cpp: "cpp",
    "c++": "cpp"
  };
  return map[lang?.toLowerCase()] || "unknown";
}

// Map language → folder + extension
function getPath(language, slug) {
  const snake = slug.replace(/-/g, "_");
  const map = {
    python: { dir: "python", ext: "py" },
    javascript: { dir: "javascript", ext: "js" },
    java: { dir: "java", ext: "java" },
    cpp: { dir: "cpp", ext: "cpp" }
  };

  const cfg = map[language];
  if (!cfg) throw new Error("Unsupported language");

  return `${cfg.dir}/${snake}.${cfg.ext}`;
}

function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function humanizeSlug(slug) {
  return slug
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getCommentPrefix(language) {
  if (language === "python") return "#";
  return "//"; // javascript, java, cpp
}

function getLanguageDisplayName(language) {
  const map = {
    python: "Python",
    javascript: "JavaScript",
    java: "Java",
    cpp: "C++"
  };
  return map[language] || language;
}

function buildHeader({ problemSlug, language, difficulty, timestamp }, pageUrl) {
  const prefix = getCommentPrefix(language);
  const date = new Date(timestamp).toISOString().split("T")[0];
  const problemName = humanizeSlug(problemSlug);
  const langName = getLanguageDisplayName(language);

  return [
    `${prefix} ----------------------------------`,
    `${prefix} Problem: ${problemName}`,
    `${prefix} Link: ${pageUrl}`,
    `${prefix} Language: ${langName}`,
    `${prefix} Difficulty: ${difficulty}`,
    `${prefix} Date: ${date}`,
    `${prefix} Synced via: LeetCode GitHub Sync`,
    `${prefix} ----------------------------------`,
    ""
  ].join("\n");
}

/* -------------------- Message Listener -------------------- */

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "EXTRACT_CODE") return;

  console.log("📨 Background received EXTRACT_CODE message");

  chrome.scripting.executeScript(
    {
      target: { tabId: sender.tab.id },
      world: "MAIN",
      func: () => {
        let code = "";
        let language = "unknown";

        if (window.monaco && window.monaco.editor) {
          const models = window.monaco.editor.getModels();
          if (models.length > 0) {
            const model = models[0];
            code = model.getValue();
            language = model.getLanguageId();
          }
        }

        let difficulty = "unknown";

        // Try to detect difficulty text from page
        const difficultyEl = document.querySelector(
          '[class*="difficulty"], [class*="Difficulty"]'
        );

        if (difficultyEl) {
          const text = difficultyEl.innerText.trim().toLowerCase();
          if (text.includes("easy")) difficulty = "Easy";
          else if (text.includes("medium")) difficulty = "Medium";
          else if (text.includes("hard")) difficulty = "Hard";
        }

        return { code, language, difficulty };

      }
    },
    (results) => {
      const result = results?.[0]?.result || {};
      let { code, language, difficulty } = result;

      language = normalizeLanguage(language);

      // SAFETY GUARD
      if (!code || language === "unknown") {
        console.warn("⚠️ Could not reliably detect language. Skipping GitHub push.");
        return;
      }

      if (!difficulty || difficulty === "unknown") {
        console.warn("⚠️ Could not detect difficulty. Skipping GitHub push.");
        return;
      }


      const submission = {
        problemSlug: sender.tab.url.split("/")[4],
        language,
        difficulty,
        code,
        timestamp: Date.now()
      };


      // 1️⃣ Save submission
      chrome.storage.local.set({ lastSubmission: submission }, () => {
        console.log("💾 Submission saved to storage:", submission);

        // 2️⃣ Read GitHub config and push
        chrome.storage.local.get(
          ["githubOwner", "githubRepo", "githubToken"],
          async (cfg) => {
            try {
              const { githubOwner, githubRepo, githubToken } = cfg;

              if (!githubOwner || !githubRepo || !githubToken) {
                console.warn("⚠️ GitHub not configured yet");
                return;
              }

              const path = getPath(
                submission.language,
                submission.problemSlug
              );

              const header = buildHeader(
                submission,
                sender.tab.url
              );

              const finalCode = `${header}\n${submission.code}`;

              const result = await pushToGitHub({
                owner: githubOwner,
                repo: githubRepo,
                token: githubToken,
                path,
                content: finalCode
              });


              console.log("✅ GitHub push successful:", result.content.path);
            } catch (err) {
              console.error("❌ GitHub push error:", err.message);
            }
          }
        );
      });
    }
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "VERIFY_GITHUB") {
    verifyGitHubRepo(message.payload)
      .then(sendResponse)
      .catch(err =>
        sendResponse({ success: false, error: err.message })
      );
    return true; // async response
  }
});

async function verifyGitHubRepo({ owner, repo, token }) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      }
    }
  );

  if (res.status === 401) {
    return { success: false, error: "Invalid access token" };
  }

  if (res.status === 403) {
    return { success: false, error: "Token does not have access to this repository" };
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
      Accept: "application/vnd.github+json"
    }
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
    content: base64Encode(content)
  };

  if (sha) body.sha = sha;

  const putRes = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!putRes.ok) {
    const t = await putRes.text();
    throw new Error(`Push failed: ${putRes.status} ${t}`);
  }

  return putRes.json();
}
