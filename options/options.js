import * as store from "../shared/storage.js";
import { buildPath, normalizeLanguage } from "../shared/languages.js";

const el = (id) => document.getElementById(id);
const fields = {
  folderLayout: el("folder-layout"),
  filenameTemplate: el("filename-template"),
  commitTemplate: el("commit-template"),
  branch: el("branch"),
  date: el("header-date"),
  link: el("header-link"),
  difficulty: el("header-difficulty"),
  topics: el("header-topics"),
};
const preview = el("preview");
const savedMsg = el("saved-msg");

function readForm() {
  return {
    folderLayout: fields.folderLayout.value,
    filenameTemplate: fields.filenameTemplate.value.trim() || "{slug}",
    commitTemplate: fields.commitTemplate.value.trim() || "LeetCode: update {path}",
    branch: fields.branch.value.trim(),
    header: {
      date: fields.date.checked,
      link: fields.link.checked,
      difficulty: fields.difficulty.checked,
      topics: fields.topics.checked,
    },
  };
}

// Live example using a sample problem so the layout/filename choices are clear.
function updatePreview() {
  const sample = { id: 1, title: "Two Sum", difficulty: "Easy", topics: ["Array"] };
  try {
    preview.textContent = buildPath(normalizeLanguage("python3"), "two-sum", sample, readForm());
  } catch {
    preview.textContent = "—";
  }
}

async function load() {
  const s = await store.getSettings();
  fields.folderLayout.value = s.folderLayout;
  fields.filenameTemplate.value = s.filenameTemplate;
  fields.commitTemplate.value = s.commitTemplate;
  fields.branch.value = s.branch;
  fields.date.checked = s.header.date;
  fields.link.checked = s.header.link;
  fields.difficulty.checked = s.header.difficulty;
  fields.topics.checked = s.header.topics;
  updatePreview();
}

document.addEventListener("input", updatePreview);

el("save-btn").addEventListener("click", async () => {
  await store.setSettings(readForm());
  savedMsg.classList.add("show");
  setTimeout(() => savedMsg.classList.remove("show"), 1500);
});

load();
