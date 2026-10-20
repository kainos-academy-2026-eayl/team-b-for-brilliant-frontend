#!/usr/bin/env node
// Usage: node form-ui.mjs <check|fix|diff> <file|-> [--json] [--write] [--config <path>] [--html "<raw html>"]
import { readFileSync, writeFileSync } from "node:fs";
import { analyze, loadConfig, renderReport, toJson } from "./lib/engine.mjs";

const USAGE = `Usage: form-ui.mjs <check|fix|diff> <file.html|-> [options]

Commands:
  check   Report issues only; never modifies the file.
  fix     Report issues and print the formatted HTML (or write it with --write).
  diff    Report issues and print a unified diff of the proposed fix.

Options:
  --json           Print a machine-readable JSON report instead of text.
  --write          (fix) Overwrite the input file with the fixed HTML.
  --config <path>  JSON file merged over the default conventions.
  --html "<html>"  Analyse raw HTML instead of a file. Use "-" as the file to read stdin.
  -h, --help       Show this help.

Exit codes: 0 = clean, 1 = issues remain (check: any issue; fix/diff: manual issues), 2 = usage error.`;

function parseArgs(argv) {
  const args = { command: null, file: null, json: false, write: false, config: null, html: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--write") args.write = true;
    else if (arg === "--config") args.config = argv[++i];
    else if (arg === "--html") args.html = argv[++i];
    else if (arg === "-h" || arg === "--help") args.help = true;
    else if (!args.command) args.command = arg;
    else if (!args.file) args.file = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return args;
}

function fail(message) {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  fail(error.message);
}
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
if (!["check", "fix", "diff"].includes(args.command)) fail(`Unknown command: ${args.command ?? "(none)"}`);
if (args.html === null && !args.file) fail("Provide a file path, '-' for stdin, or --html.");
if (args.write && (args.command !== "fix" || args.html !== null || args.file === "-")) {
  fail("--write only works with `fix` on a file path.");
}

const source =
  args.html ?? (args.file === "-" ? readFileSync(0, "utf8") : readFileSync(args.file, "utf8"));
const label = args.html !== null ? "<raw html>" : args.file === "-" ? "<stdin>" : args.file;
const config = loadConfig(args.config);
const result = analyze(source, { config, mode: args.command === "check" ? "check" : "fix", file: label });

if (args.json) {
  console.log(JSON.stringify(toJson(result, { includeOutput: args.command !== "check" }), null, 2));
} else {
  console.log(renderReport(result, { command: args.command }));
  if (args.command === "fix" && !args.write) {
    console.log(`\n---- Formatted HTML ----\n${result.output}`);
  } else if (args.command === "diff") {
    console.log(`\n---- Diff ----\n${result.diff || "(no changes)"}`);
  }
}

if (args.write && result.changed) {
  writeFileSync(args.file, result.output);
  if (!args.json) console.log(`\nWrote fixed HTML to ${args.file}`);
}

const remaining = args.command === "check" ? result.summary.total : result.summary.manual;
process.exitCode = remaining > 0 ? 1 : 0;
