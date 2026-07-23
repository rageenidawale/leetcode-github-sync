// LeetCode language handling + customizable path/header/commit building.
import { LANGS, LANG_ALIASES } from "./constants.js";

// Normalize a Monaco language ID into a family + canonical language.
export function normalizeLanguage(rawLang) {
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

export function humanize(slug) {
  return slug.replace(/-/g, " ");
}

function snake(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/* -------------------- path building -------------------- */

function languageFolder(langInfo) {
  if (langInfo.family === "sql") return `database/${langInfo.dialect}`;
  if (langInfo.family === "pandas") return "database/pandas";
  return LANGS[langInfo.language].dir;
}

function languageExt(langInfo) {
  if (langInfo.family === "sql") return "sql";
  if (langInfo.family === "pandas") return "py";
  return LANGS[langInfo.language].ext;
}

// Difficulty is only available when metadata loaded; fall back to language-only.
function folderSegments(layout, langFolder, difficulty) {
  switch (layout) {
    case "difficulty":
      return difficulty ? [difficulty] : [langFolder];
    case "language/difficulty":
      return difficulty ? [langFolder, difficulty] : [langFolder];
    case "difficulty/language":
      return difficulty ? [difficulty, langFolder] : [langFolder];
    case "language":
    default:
      return [langFolder];
  }
}

function buildFilename(template, slug, meta) {
  const tokens = {
    slug: snake(slug),
    id: meta?.id ? String(meta.id) : "",
    title: meta?.title ? snake(meta.title) : snake(slug),
  };
  const name = (template || "{slug}")
    .replace(/\{(slug|id|title)\}/g, (_, k) => tokens[k])
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return name || snake(slug);
}

export function buildPath(langInfo, slug, meta, settings) {
  if (langInfo.family === "unknown") throw new Error("Unsupported language");
  const difficulty = (meta?.difficulty || "").toLowerCase();
  const segments = folderSegments(settings.folderLayout, languageFolder(langInfo), difficulty);
  const filename = buildFilename(settings.filenameTemplate, slug, meta);
  return [...segments, `${filename}.${languageExt(langInfo)}`].join("/");
}

/* -------------------- header comment -------------------- */

function commentPrefix(langInfo) {
  if (langInfo.family === "sql") return "--";
  if (langInfo.family === "pandas" || langInfo.language === "python") return "#";
  return "//";
}

export function buildHeader({ slug, rawLanguage, langInfo, meta, headerOpts }) {
  const prefix = commentPrefix(langInfo);
  const opts = headerOpts || {};

  let languageLabel = rawLanguage;
  if (langInfo.family === "sql") languageLabel = `SQL (${langInfo.dialect})`;
  if (langInfo.family === "pandas") languageLabel = "Python (Pandas)";

  const lines = [
    `LeetCode Problem: ${meta?.title || humanize(slug)}`,
    `Language: ${languageLabel}`,
  ];
  if (opts.difficulty && meta?.difficulty) lines.push(`Difficulty: ${meta.difficulty}`);
  if (opts.topics && meta?.topics?.length) lines.push(`Topics: ${meta.topics.join(", ")}`);
  if (opts.link !== false) lines.push(`Link: https://leetcode.com/problems/${slug}/`);
  lines.push("Synced by: LinkCode");
  if (opts.date !== false) lines.push(`Date: ${new Date().toLocaleString()}`);

  const bar = `${prefix} ======================================`;
  const body = lines.map((l) => `${prefix} ${l}`).join("\n");
  return `${bar}\n${body}\n${bar}\n\n`;
}

/* -------------------- commit message -------------------- */

export function buildCommitMessage(template, tokens) {
  const t = template || "LeetCode: update {path}";
  return t.replace(/\{(path|slug|title|difficulty|lang|date)\}/g, (_, k) => tokens[k] ?? "");
}
