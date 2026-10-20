import { readFile, realpath, writeFile, mkdtemp, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { processHtml, validateConfig } from "./engine.mjs";

const skillDirectory = fileURLToPath(new URL("../", import.meta.url));
const repoDirectory = await realpath(fileURLToPath(new URL("../../../../", import.meta.url)));

function parseArguments(args) {
  const options = { mode: "check" };
  const seen = new Set();
  const valued = new Set(["--mode", "--file", "--html", "--config", "--output"]);
  const flags = new Set(["--stdin", "--write", "--json", "--help"]);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const key = arg.slice(2);
    if (seen.has(arg)) throw new Error(`Duplicate option: ${arg}`);
    seen.add(arg);
    if (valued.has(arg)) {
      if (args[index + 1] === undefined || args[index + 1].startsWith("--")) throw new Error(`Missing value for ${arg}`);
      options[key] = args[++index];
    } else if (flags.has(arg)) options[key] = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.help) return options;
  if ([options.file !== undefined, options.html !== undefined, Boolean(options.stdin)].filter(Boolean).length !== 1) {
    throw new Error("Specify exactly one of --file, --html or --stdin");
  }
  if (!["check", "fix", "diff"].includes(options.mode)) throw new Error("--mode must be check, fix or diff");
  if (options.write && (options.mode !== "fix" || !options.file)) throw new Error("--write requires --mode fix and --file");
  if (options.output && (options.mode !== "fix" || options.write)) throw new Error("--output requires fix mode without --write");
  return options;
}

function contained(path) {
  const rel = relative(repoDirectory, path);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("File paths must stay inside the repository");
  return path;
}

async function inputPath(path) {
  return contained(await realpath(resolve(repoDirectory, path)));
}

async function outputPath(path) {
  const target = resolve(repoDirectory, path);
  contained(target);
  const parent = await realpath(dirname(target));
  contained(parent);
  try {
    return contained(await realpath(target));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return target;
  }
}

function humanReport(report) {
  const lines = [`Form UI report: ${report.source} (${report.mode})`];
  for (const [category, issues] of Object.entries(report.byCategory)) {
    lines.push(`\n${category}: ${issues.length ? "" : "OK"}`);
    for (const issue of issues) {
      const location = issue.line ? `line ${issue.line}:${issue.column}` : issue.selector || "document";
      lines.push(`- [${issue.status}] ${location} (${issue.rule}): ${issue.message}`,
        `  ${issue.suggestion}${report.mode === "check" && issue.fixable ? " [safe auto-fix available]" : ""}`);
    }
  }
  const { totalIssues, autoFixed, remaining } = report.summary;
  lines.push(`\nSummary: ${totalIssues} issues; ${autoFixed} auto-fixed; ${remaining} remaining for manual remediation.`);
  return lines.join("\n");
}

async function makeDiff(before, after, sourceName) {
  if (before === after) return "";
  const directory = await mkdtemp(resolve(tmpdir(), "form-ui-"));
  try {
    const oldPath = resolve(directory, "before.html");
    const newPath = resolve(directory, "after.html");
    await Promise.all([writeFile(oldPath, before), writeFile(newPath, after)]);
    const result = spawnSync("git", ["--no-pager", "diff", "--no-index", "--no-prefix", "--no-ext-diff", "--no-textconv", "--", "before.html", "after.html"], {
      encoding: "utf8", cwd: directory,
    });
    if (result.error) throw result.error;
    if (![0, 1].includes(result.status)) throw new Error(`Diff failed: ${result.stderr}`);
    const label = (prefix) => {
      const name = `${prefix}/${sourceName}`;
      return /[\s"\\]/.test(name) ? JSON.stringify(name) : name;
    };
    return result.stdout
      .replace(/^diff --git .+$/m, `diff --git ${label("a")} ${label("b")}`)
      .replace(/^--- before\.html$/m, `--- ${label("a")}`)
      .replace(/^\+\+\+ after\.html$/m, `+++ ${label("b")}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/cli.mjs (--file repo/path.html | --html '<form>...</form>' | --stdin)\n"
      + "  [--mode check|fix|diff] [--config repo/config.json] [--json]\n"
      + "  [--write (fix file only) | --output repo/result.html (fix only)]\n"
      + "Exit codes: 0 = no remaining issues; 1 = issues remain; 2 = execution/configuration failure.\n"
      + "Fix and diff preview by default. Check never writes. Reports use original source locations.");
    return;
  }
  const defaults = JSON.parse(await readFile(resolve(skillDirectory, "config.json"), "utf8"));
  const overrides = options.config ? JSON.parse(await readFile(await inputPath(options.config), "utf8")) : {};
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)
    || (Object.hasOwn(overrides, "classes") && (!overrides.classes || typeof overrides.classes !== "object" || Array.isArray(overrides.classes)))) {
    throw new Error("Configuration overrides and classes must be JSON objects");
  }
  const config = validateConfig({ ...defaults, ...overrides, classes: { ...defaults.classes, ...overrides.classes } });
  const file = options.file ? await inputPath(options.file) : null;
  let source = options.html;
  if (file) source = await readFile(file, "utf8");
  if (options.stdin) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    source = Buffer.concat(chunks).toString("utf8");
  }
  const sourceName = options.file ?? "<stdin>";
  const result = await processHtml(source, config, { mode: options.mode, sourceName });
  if (options.mode === "diff") result.diff = result.formattedHtml === null ? null : await makeDiff(source, result.formattedHtml, sourceName);
  if (result.formattedHtml !== null && (options.write || options.output)) {
    const target = options.write ? file : await outputPath(options.output);
    if (!options.write && target === file) throw new Error("Use --write explicitly to overwrite the input file");
    if (options.write && await readFile(file, "utf8") !== source) throw new Error("Input changed during formatting; refusing to overwrite");
    await writeFile(target, result.formattedHtml);
  }
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(humanReport(result.report));
    if (options.mode === "diff" && result.diff !== null) console.log(`\n${result.diff || "No changes."}`);
    else if (options.mode === "fix" && result.formattedHtml !== null) console.log(`\nFormatted HTML:\n${result.formattedHtml}`);
  }
  process.exitCode = result.report.summary.remaining ? 1 : 0;
}

try {
  await main();
} catch (error) {
  console.error(`Form UI check failed: ${error.message}`);
  process.exitCode = 2;
}
