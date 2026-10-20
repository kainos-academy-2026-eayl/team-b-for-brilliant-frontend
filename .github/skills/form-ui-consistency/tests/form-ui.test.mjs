import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseFragment } from "parse5";
import { processHtml, categories, validateConfig } from "../scripts/engine.mjs";

const config = JSON.parse(await readFile(new URL("../config.json", import.meta.url), "utf8"));
const fixture = (name) => readFile(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
const fix = (html, overrides = {}) => processHtml(html, { ...config, ...overrides }, { mode: "fix" });
const walk = (node) => [node, ...(node.childNodes ?? []).flatMap(walk)];
const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const cli = fileURLToPath(new URL("../scripts/cli.mjs", import.meta.url));
const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", input, cwd: repo });

test("golden form has no findings and remains byte-identical", async () => {
  const html = await fixture("golden");
  const checked = await processHtml(html, config);
  assert.equal(checked.report.summary.totalIssues, 0);
  assert.equal(checked.formattedHtml, null);
  assert.deepEqual(Object.keys(checked.report.byCategory), categories);
  assert.equal((await fix(html)).formattedHtml, html);
});

for (const name of ["golden", "missing-labels", "errors", "hints", "buttons", "inline-styles"]) {
  test(`${name}: formatting is idempotent and remaining findings are explicit`, async () => {
    const first = await fix(await fixture(name));
    assert.notEqual(first.formattedHtml, null);
    const second = await fix(first.formattedHtml);
    assert.equal(second.formattedHtml, first.formattedHtml);
    assert.equal(second.report.summary.autoFixed, 0);
    assert.equal(first.report.summary.totalIssues, first.report.summary.autoFixed + first.report.summary.remaining);
    assert.ok(first.report.issues.filter((issue) => !issue.fixable).every((issue) => issue.status === "manual-action" && issue.suggestion));
  });
}

test("missing labels report original line and never invent text", async () => {
  const html = await fixture("missing-labels");
  const checked = await processHtml(html, config);
  const missing = checked.report.issues.find((issue) => issue.rule === "missing-label");
  assert.equal(missing.line, 3);
  assert.equal(missing.selector, "input");
  assert.equal(missing.fixable, false);
  assert.equal(checked.report.summary.autoFixed, 0);
  assert.ok(!(await fix(html)).formattedHtml.includes("<label"));
});

test("recognized errors normalize, move below control and link to invalid state", async () => {
  const result = await fix(await fixture("errors"));
  const nodes = walk(parseFragment(result.formattedHtml));
  const input = nodes.find((node) => node.tagName === "input");
  const message = nodes.find((node) => attr(node, "class") === "form-error");
  assert.equal(message.tagName, "p");
  assert.equal(attr(input, "aria-invalid"), "true");
  assert.equal(attr(input, "aria-describedby"), attr(message, "id"));
  assert.ok(result.formattedHtml.indexOf("<input") < result.formattedHtml.indexOf('class="form-error"'));
  assert.equal(result.report.summary.remaining, 0);
});

test("hint association preserves existing describedby tokens", async () => {
  const result = await fix('<p id="outside">More information</p><form><div><label for="n">Name</label><input id="n" aria-describedby="outside"><span class="help">Help</span></div></form>');
  assert.match(result.formattedHtml, /aria-describedby="outside n-hint"/);
  assert.match(result.formattedHtml, /<p id="n-hint" class="form-hint">Help<\/p>/);
  assert.equal(result.report.summary.remaining, 0);
});

test("implicit label receives deterministic unique ID without disturbing names or values", async () => {
  const result = await fix('<div id="email"></div><form action="/save" method="post"><div><label>Email <input name="email" value="A &amp; B" required></label></div></form>');
  assert.match(result.formattedHtml, /for="email-2"/);
  assert.match(result.formattedHtml, /id="email-2" name="email"/);
  assert.match(result.formattedHtml, /value="A &amp; B"/);
  assert.match(result.formattedHtml, /action="\/save" method="post"/);
  assert.match(result.formattedHtml, /\(required\)/);
  assert.equal((await fix(result.formattedHtml)).formattedHtml, result.formattedHtml);
});

test("a unique adjacent unassociated label is linked without inventing wording", async () => {
  const result = await fix('<form><div><label>Name</label><input name="name"></div></form>');
  assert.match(result.formattedHtml, /<label for="name">Name<\/label>/);
  assert.match(result.formattedHtml, /id="name" name="name"/);
  assert.equal(result.report.summary.remaining, 0);
  assert.equal((await fix(result.formattedHtml)).formattedHtml, result.formattedHtml);
});

test("div error aliases can be normalized in an unambiguous field container", async () => {
  const result = await fix('<form><div><label for="n">Name</label><input id="n"><div class="error">Enter a name.</div></div></form>');
  assert.match(result.formattedHtml, /<p id="n-error" class="form-error">Enter a name.<\/p>/);
  assert.equal(result.report.summary.remaining, 0);
});

test("paragraph field wrappers are not rewritten into invalid nested paragraphs", async () => {
  const result = await fix('<form><p class="form-field"><label for="n">Name</label><input id="n"><span class="help">Help</span></p></form>');
  assert.ok(result.report.issues.some((issue) => issue.rule === "field-wrapper-element" && !issue.fixable));
  assert.match(result.formattedHtml, /<span class="help">Help<\/span>/);
  assert.equal((await fix(result.formattedHtml)).formattedHtml, result.formattedHtml);
});

test("visual-only required and ambiguous orphan labels require manual decisions", async () => {
  const result = await fix('<form><div><label for="wrong">Email *</label><input id="email"></div></form>');
  assert.ok(result.report.issues.some((issue) => issue.rule === "orphan-label" && !issue.fixable));
  assert.ok(result.report.issues.some((issue) => issue.rule === "missing-label"));
  assert.doesNotMatch(result.formattedHtml, /\brequired(?:=""| |>)/);
  const visual = await fix('<form><div><label for="email">Email *</label><input id="email"></div></form>');
  assert.ok(visual.report.issues.some((issue) => issue.rule === "required-semantics" && !issue.fixable));
});

test("terminal action aliases and primary-first ordering normalize safely", async () => {
  const result = await fix(await fixture("buttons"));
  assert.match(result.formattedHtml, /class="form-actions"/);
  assert.ok(result.formattedHtml.indexOf(">Save<") < result.formattedHtml.indexOf(">Cancel<"));
  assert.doesNotMatch(result.formattedHtml, /btn-primary|btn-secondary/);
  assert.equal(result.report.summary.remaining, 0);
});

test("secondary cancel links participate in terminal action grouping", async () => {
  const result = await fix('<form><a class="btn-secondary" href="/back">Cancel</a><button type="SUBMIT">Save</button></form>');
  assert.match(result.formattedHtml, /class="form-actions"/);
  assert.match(result.formattedHtml, /class="form-button-secondary" href="\/back"/);
  assert.ok(result.formattedHtml.indexOf(">Save<") < result.formattedHtml.indexOf(">Cancel<"));
  assert.equal(result.report.summary.remaining, 0);
});

test("nonterminal buttons are flagged, never moved across fields", async () => {
  const result = await fix('<form><button type="submit">Save</button><div><label for="n">Name</label><input id="n"></div></form>');
  assert.ok(result.report.issues.some((issue) => issue.rule === "action-placement" && !issue.fixable));
  assert.ok(result.formattedHtml.indexOf(">Save<") < result.formattedHtml.indexOf("<input"));
});

test("inline styles are preserved unless explicitly mapped or whitelisted", async () => {
  const source = await fixture("inline-styles");
  const unknown = await fix(source);
  assert.equal(unknown.report.byCategory["Inline styles"].length, 2);
  assert.match(unknown.formattedHtml, /style="max-width: 42rem"/);
  const configured = await fix(source, {
    inlineStyleWhitelist: ["max-width:42rem"],
    inlineStyleClassMap: { "margin-bottom:16px": "field-gap" },
  });
  assert.equal(configured.report.summary.remaining, 0);
  const wrapper = walk(parseFragment(configured.formattedHtml)).find((node) => attr(node, "class")?.includes("field-gap"));
  assert.ok(attr(wrapper, "class").split(" ").includes("form-field"));
  assert.doesNotMatch(configured.formattedHtml, /style="margin-bottom/);
});

test("style mappings participate in the same normalization pass", async () => {
  const overrides = { inlineStyleClassMap: { "font-size:12px": "help" } };
  const result = await fix('<form><div><label for="n">Name</label><input id="n"><span style="font-size:12px">Help</span></div></form>', overrides);
  assert.match(result.formattedHtml, /<p id="n-hint" class="form-hint">Help<\/p>/);
  assert.equal((await fix(result.formattedHtml, overrides)).formattedHtml, result.formattedHtml);
  assert.equal(result.report.summary.remaining, 0);
});

test("skill metadata matches its discoverable workspace directory", async () => {
  const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /^---\nname: form-ui-consistency\ndescription: '[^\n]+'\n/);
  assert.match(skill, /\n---\n/);
  const description = skill.match(/^description: '(.+)'$/m)[1];
  assert.ok(description.length <= 1024);
  assert.match(description, /Check.*format.*diff/i);
});

test("duplicate IDs and broken ARIA references are not silently repaired", async () => {
  const result = await fix('<form><div><label for="n">Name</label><input id="n" aria-describedby="gone"></div><div id="n"></div></form>');
  assert.equal(result.report.issues.filter((issue) => issue.rule === "duplicate-or-empty-id").length, 2);
  assert.ok(result.report.issues.some((issue) => issue.rule === "broken-reference"));
  assert.match(result.formattedHtml, /aria-describedby="gone"/);
  assert.equal((result.formattedHtml.match(/id="n"/g) ?? []).length, 2);
});

test("radio groups need fieldsets and legends; disabled/readonly are not guessed", async () => {
  const result = await fix('<form><div><label for="a">A</label><input id="a" name="choice" type="radio"></div><div><label for="b">B</label><input id="b" name="choice" type="radio" aria-disabled="true"></div><div><label for="s">S</label><select id="s" readonly><option>A</option></select></div></form>');
  assert.ok(result.report.issues.some((issue) => issue.rule === "group-legend"));
  assert.ok(result.report.issues.some((issue) => issue.rule === "state-semantics"));
  assert.ok(result.report.issues.some((issue) => issue.rule === "unsupported-readonly"));
  assert.doesNotMatch(result.formattedHtml, / disabled(?: |>)/);
});

test("hidden controls are exempt; empty actions and clickable divs are flagged", async () => {
  const result = await fix('<form><input type="hidden" name="token"><button type="submit"></button><div onclick="act()">Click</div></form>');
  assert.ok(!result.report.issues.some((issue) => issue.rule === "missing-label"));
  assert.ok(result.report.issues.some((issue) => issue.rule === "interactive-name"));
  assert.ok(result.report.issues.some((issue) => issue.rule === "non-native-interactive"));
});

test("image submit values do not count as accessible names; conflicting states are reported", async () => {
  const result = await fix('<form><div><input aria-label="Flag" type="checkbox" readonly disabled aria-disabled="false"></div><input type="image" value="Send"></form>');
  assert.ok(result.report.issues.some((issue) => issue.rule === "interactive-name"));
  assert.ok(result.report.issues.some((issue) => issue.rule === "unsupported-readonly"));
  assert.ok(result.report.issues.some((issue) => issue.rule === "conflicting-state"));
});

test("visible labels and ARIA label references are checked, including hidden ancestors", async () => {
  const result = await fix('<form><div><label for="n" hidden>Name</label><input id="n"></div><div><input aria-labelledby="missing"></div><div><input aria-label="Search"></div></form>');
  assert.equal(result.report.issues.filter((issue) => issue.rule === "missing-label").length, 2);
  assert.ok(result.report.issues.some((issue) => issue.rule === "invalid-labelledby"));
});

test("malformed HTML and template syntax return no potentially destructive rewrite", async () => {
  for (const source of ['<form><input id="a" id="b"></form>', '<form>{{ user.name }}</form>', '<form><input name="<%= name %>"></form>']) {
    const result = await fix(source);
    assert.equal(result.formattedHtml, null);
    assert.ok(result.report.summary.remaining > 0);
    assert.equal(result.report.summary.autoFixed, 0);
  }
});

test("full documents preserve doctype, script contents and unrelated data", async () => {
  const source = '<!doctype html><html lang="en"><head><title>Test</title></head><body><form><input aria-label="Name"></form><script>const a = "<form>";</script></body></html>';
  const result = await fix(source);
  assert.match(result.formattedHtml, /<!doctype html>/i);
  assert.match(result.formattedHtml, /const a = "<form>";/);
  assert.equal((await fix(result.formattedHtml)).formattedHtml, result.formattedHtml);
});

test("explicit body/head fragments preserve document-level attributes", async () => {
  const result = await fix('<head><title>Example</title></head><body class="page"><form><input aria-label="Name"></form></body>');
  assert.match(result.formattedHtml, /<body class="page">/);
  assert.match(result.formattedHtml, /<title>Example<\/title>/);
  assert.equal((await fix(result.formattedHtml)).formattedHtml, result.formattedHtml);
});

test("formatting options and wildcard attribute ordering are configurable", async () => {
  const result = await fix('<form class="form-ui"><div class="form-field"><input data-z="z" aria-label="X" name="n" id="n" data-a="a"></div></form>', {
    indentSize: 4, attributeOrder: ["name", "id", "class", "aria-*", "data-*"],
  });
  assert.match(result.formattedHtml, /\n {4}<div/);
  assert.match(result.formattedHtml, /name="n" id="n" aria-label="X" data-a="a" data-z="z"/);
  assert.throws(() => validateConfig({ ...config, indentSize: 0 }), /Invalid/);
  assert.throws(() => validateConfig({ ...config, typo: true }), /unknown option/);
  assert.throws(() => validateConfig({ ...config, hintAliases: ["form-hint"] }), /aliases/);
});

test("heading hierarchy and empty section headings need manual review", async () => {
  const result = await fix('<form><h3>Form</h3><section><h4>Group</h4></section><fieldset></fieldset></form>');
  assert.equal(result.report.byCategory["Typography/headings"].length, 2);
  assert.ok(result.report.issues.some((issue) => issue.rule === "section-title"));
  assert.match(result.formattedHtml, /<h3>Form<\/h3>/);
});

test("CLI stdin JSON, check-only and diff modes have correct output shapes", async () => {
  const golden = await fixture("golden");
  const checked = run(["--stdin", "--json"], golden);
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).formattedHtml, null);
  const diff = run(["--stdin", "--mode", "diff", "--json"], await fixture("buttons"));
  assert.equal(diff.status, 0, diff.stderr);
  const output = JSON.parse(diff.stdout);
  assert.match(output.diff, /@@/);
  assert.match(output.diff, /--- a\/<stdin>/);
  assert.doesNotMatch(output.diff, /--- a\/a\//);
  assert.match(output.formattedHtml, /form-actions/);
  assert.equal(output.report.mode, "diff");
});

test("CLI rejects unsafe arguments, outside-repo paths and check writes", () => {
  for (const args of [
    ["--mode", "check", "--html", "<form></form>", "--write"],
    ["--file", "../outside.html"],
    ["--stdin", "--html", "<form></form>"],
    ["--html", "<form></form>", "--config"],
    ["--html", "<form></form>", "--wat"],
    ["--html", "<form></form>", "--mode", "diff", "--output", "result.html"],
    ["--html", "<form></form>", "--mode", "fix", "--mode", "check"],
  ]) {
    const result = run(args);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /Form UI check failed:/);
  }
});

test("CLI check preserves file bytes; explicit fix persists and rechecks cleanly", async () => {
  const directory = await mkdtemp(resolve(repo, ".form-ui-test-"));
  try {
    const file = resolve(directory, "form.html");
    const source = await fixture("buttons");
    await writeFile(file, source);
    assert.equal(run(["--file", file, "--json"]).status, 1);
    assert.equal(await readFile(file, "utf8"), source);
    assert.equal(run(["--file", file, "--mode", "diff", "--json"]).status, 0);
    assert.equal(await readFile(file, "utf8"), source);
    const fixed = run(["--file", file, "--mode", "fix", "--write", "--json"]);
    assert.equal(fixed.status, 0, fixed.stderr);
    const persisted = await readFile(file, "utf8");
    assert.notEqual(persisted, source);
    assert.equal(run(["--file", file, "--json"]).status, 0);
    assert.equal(run(["--file", file, "--mode", "fix", "--write"]).status, 0);
    assert.equal(await readFile(file, "utf8"), persisted);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI raw argument and config overrides work; missing input and bad config fail", async () => {
  assert.equal(run(["--html", "<form></form>", "--mode", "fix", "--json"]).status, 0);
  assert.equal(run([]).status, 2);
  assert.equal(run(["--stdin"], "").status, 2);
  const directory = await mkdtemp(resolve(repo, ".form-ui-test-"));
  try {
    const path = resolve(directory, "config.json");
    await writeFile(path, JSON.stringify({ indentSize: 4 }));
    const configured = run(["--html", '<form><button>Go</button></form>', "--mode", "fix", "--config", path, "--json"]);
    assert.equal(configured.status, 0, configured.stderr);
    assert.match(JSON.parse(configured.stdout).formattedHtml, /\n {4}<div/);
    await writeFile(path, JSON.stringify({ typo: true }));
    assert.equal(run(["--html", "<form></form>", "--config", path]).status, 2);
    for (const invalid of [null, [], { classes: null }]) {
      await writeFile(path, JSON.stringify(invalid));
      assert.equal(run(["--html", "<form></form>", "--config", path]).status, 2);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
