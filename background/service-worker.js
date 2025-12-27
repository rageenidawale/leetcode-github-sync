console.log("Background service worker loaded");

const GITHUB_API_BASE = "https://api.github.com";

// map language -> folder + extension
function getPath(language, slug) {
  const snake = slug.replace(/-/g, "_");
  const map = {
    python: { dir: "python", ext: "py" },
    javascript: { dir: "javascript", ext: "js" },
    cpp: { dir: "cpp", ext: "cpp" }
  };
  const cfg = map[language.toLowerCase()];
  if (!cfg) throw new Error("Unsupported language");
  return `${cfg.dir}/${snake}.${cfg.ext}`;
}

function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "EXTRACT_CODE") {
    console.log("📨 Background received EXTRACT_CODE message");

    chrome.scripting.executeScript(
      {
        target: { tabId: sender.tab.id },
        world: "MAIN",
        func: () => {
          let code = "";

          if (window.monaco && window.monaco.editor) {
            const models = window.monaco.editor.getModels();
            if (models.length > 0) {
              code = models[0].getValue();
            }
          }

          return code;
        }
      },
      (results) => {
        const code = results?.[0]?.result || "";
        const submission = {
  problemSlug: sender.tab.url.split("/")[4], // e.g. "two-sum"
  language: "python", // we’ll refine later
  code,
  timestamp: Date.now()
};

chrome.storage.local.set(
  { lastSubmission: submission },
  () => {
    console.log("💾 Submission saved to storage:", submission);
  }
);

      }
    );
  }
  // READ CONFIG (you will set these once via popup later)
chrome.storage.local.get(
  ["githubOwner", "githubRepo", "githubToken", "lastSubmission"],
  async (cfg) => {
    try {
      const { githubOwner, githubRepo, githubToken, lastSubmission } = cfg;
      if (!githubOwner || !githubRepo || !githubToken) {
        console.warn("GitHub not configured yet");
        return;
      }

      const path = getPath(
        lastSubmission.language,
        lastSubmission.problemSlug
      );

      const result = await pushToGitHub({
        owner: githubOwner,
        repo: githubRepo,
        token: githubToken,
        path,
        content: lastSubmission.code
      });

      console.log("✅ GitHub push successful:", result.content.path);
    } catch (err) {
      console.error("❌ GitHub push error:", err.message);
    }
  }
);

});

async function pushToGitHub({ owner, repo, token, path, content }) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`;

  // 1) Check if file exists (to get sha for overwrite)
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
    // any error other than "not found"
    const t = await getRes.text();
    throw new Error(`Precheck failed: ${getRes.status} ${t}`);
  }

  // 2) Create or update file
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

