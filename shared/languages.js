// LeetCode language handling: normalize Monaco language IDs, map them to a
// repository path, and build the file header comment.
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

// Map language + problem slug → repository file path.
export function getPath(langInfo, slug) {
  const snake = slug.replace(/-/g, "_");

  if (langInfo.family === "sql") return `database/${langInfo.dialect}/${snake}.sql`;
  if (langInfo.family === "pandas") return `database/pandas/${snake}.py`;

  const cfg = LANGS[langInfo.language];
  if (!cfg) throw new Error("Unsupported language");

  return `${cfg.dir}/${snake}.${cfg.ext}`;
}

export function getCommentPrefix(langInfo) {
  if (langInfo.family === "sql") return "--";
  if (langInfo.family === "pandas" || langInfo.language === "python") return "#";
  return "//";
}

export function buildHeader({ title, slug, rawLanguage, langInfo }) {
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
