import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, parseFragment } from "parse5";
import { diffHunks, unifiedDiff } from "./diff.mjs";
import { selectorFor, sourceLine } from "./dom.mjs";
import { createFormatter } from "./format.mjs";
import { runRules } from "./rules.mjs";

export const DEFAULT_CONFIG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../config/form-ui.config.json",
);

export const CATEGORIES = [
  ["structure", "Form structure"],
  ["labeling", "Labeling"],
  ["spacing", "Spacing / layout"],
  ["typography", "Typography & headings"],
  ["required", "Required fields"],
  ["errors", "Errors"],
  ["hints", "Hints"],
  ["buttons", "Buttons"],
  ["accessibility", "Accessibility"],
  ["inline-styles", "Inline styles"],
  ["formatting", "Formatting"],
];

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function mergeConfig(base, override) {
  if (!isPlainObject(override)) return override === undefined ? base : override;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = isPlainObject(value) && isPlainObject(base?.[key]) ? mergeConfig(base[key], value) : value;
  }
  return result;
}

export function loadConfig(customPath) {
  const defaults = JSON.parse(readFileSync(DEFAULT_CONFIG_PATH, "utf8"));
  if (!customPath) return defaults;
  return mergeConfig(defaults, JSON.parse(readFileSync(customPath, "utf8")));
}

const isDocument = (source) => /^\s*(<!--[\s\S]*?-->\s*)*<(!doctype|html[\s>])/i.test(source);

function parseSource(source) {
  const options = { sourceCodeLocationInfo: true };
  return isDocument(source) ? parse(source, options) : parseFragment(source, options);
}

function describeFormattingHunk(hunk, config) {
  const reasons = [];
  const quote = config.formatting.quote === "single" ? `="` : `='`;
  if (hunk.removed.some((line) => line.includes(quote))) {
    reasons.push(`attribute values should use ${config.formatting.quote} quotes`);
  }
  if (hunk.removed.some((line) => /^\t/.test(line) || (line.match(/^ */)[0].length % config.formatting.indentSize !== 0))) {
    reasons.push(`indentation should be ${config.formatting.indentSize} spaces`);
  }
  if (hunk.removed.some((line) => /\s+$/.test(line))) reasons.push("trailing whitespace");
  const onlyFinalNewline = hunk.removed.length === 0 && hunk.added.length === 1 && hunk.added[0] === "";
  if (onlyFinalNewline) reasons.push("file should end with a single newline");
  else if (hunk.oldLines !== hunk.newLines) reasons.push("line breaks / nesting");
  if (reasons.length === 0) reasons.push("attribute order or spacing");
  return reasons;
}

function formattingIssues(source, format, config) {
  const formatted = format(parseSource(source));
  return diffHunks(source, formatted, 0).map((hunk) => ({
    category: "formatting",
    rule: "formatting",
    fixable: true,
    line: hunk.firstChangedOldLine,
    selector: null,
    message: `Formatting differs from the standard (${describeFormattingHunk(hunk, config).join(", ")}).`,
  }));
}

/**
 * Check and/or fix an HTML form source.
 * @param {string} source raw HTML
 * @param {{config?: object, mode?: "check"|"fix", file?: string}} options
 */
export function analyze(source, { config = loadConfig(), mode = "check", file = "<input>" } = {}) {
  const normalized = source.replace(/\r\n?/g, "\n");
  const format = createFormatter(config);
  const issues = [];

  const tree = parseSource(normalized);
  runRules(tree, config, (issue) => {
    issues.push({
      category: issue.category,
      rule: issue.rule,
      fixable: issue.fixable,
      line: sourceLine(issue.node),
      selector: selectorFor(issue.node),
      message: issue.message,
      ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
    });
  });
  const output = format(tree);
  issues.push(...formattingIssues(normalized, format, config));

  const order = new Map(CATEGORIES.map(([key], index) => [key, index]));
  issues.sort(
    (a, b) => order.get(a.category) - order.get(b.category) || (a.line ?? 0) - (b.line ?? 0),
  );
  const fixedStatus = mode === "fix" ? "auto-fixed" : "auto-fixable";
  for (const issue of issues) issue.status = issue.fixable ? fixedStatus : "manual";

  const categories = {};
  for (const [key] of CATEGORIES) categories[key] = issues.filter((issue) => issue.category === key).length;
  const fixable = issues.filter((issue) => issue.fixable).length;
  const summary = {
    total: issues.length,
    [mode === "fix" ? "autoFixed" : "autoFixable"]: fixable,
    manual: issues.length - fixable,
  };

  return {
    file,
    mode,
    summary,
    categories,
    issues,
    output,
    changed: output !== normalized,
    diff: unifiedDiff(normalized, output, file),
  };
}

const STATUS_TAG = { "auto-fixed": "fixed ", "auto-fixable": "auto  ", manual: "manual" };

export function renderReport(result, { command = result.mode } = {}) {
  const { summary } = result;
  const fixedLabel = result.mode === "fix" ? "auto-fixed" : "auto-fixable";
  const fixedCount = summary.autoFixed ?? summary.autoFixable;
  const lines = [
    `Form UI ${command} report: ${result.file}`,
    "",
    `Summary: ${summary.total} issue${summary.total === 1 ? "" : "s"} — ${fixedCount} ${fixedLabel}, ${summary.manual} manual`,
  ];
  for (const [key, title] of CATEGORIES) {
    const group = result.issues.filter((issue) => issue.category === key);
    if (group.length === 0) continue;
    lines.push("", `## ${title} (${group.length})`);
    for (const issue of group) {
      const where = [issue.line ? `L${issue.line}` : null, issue.selector].filter(Boolean).join(" ");
      lines.push(`- [${STATUS_TAG[issue.status]}] ${where ? `${where}: ` : ""}${issue.message}`);
      if (issue.suggestion) lines.push(`    → Fix: ${issue.suggestion}`);
    }
  }
  if (summary.total === 0) lines.push("", "✔ The form matches the UI conventions.");
  return lines.join("\n");
}

export function toJson(result, { includeOutput = false } = {}) {
  const { output, diff, ...rest } = result;
  return includeOutput ? { ...rest, output, diff } : rest;
}
