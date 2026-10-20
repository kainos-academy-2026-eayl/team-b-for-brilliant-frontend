import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { analyze, loadConfig, mergeConfig, renderReport, toJson } from "../scripts/lib/engine.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, "../fixtures", name), "utf8");
const cli = join(here, "../scripts/form-ui.mjs");
const config = loadConfig();

const check = (source, options = {}) => analyze(source, { config, mode: "check", ...options });
const fix = (source, options = {}) => analyze(source, { config, mode: "fix", ...options });
const rules = (result) => result.issues.map((issue) => issue.rule);
const byRule = (result, rule) => result.issues.filter((issue) => issue.rule === rule);

const FIXTURES = [
  "golden.html",
  "missing-labels.html",
  "inconsistent-errors.html",
  "inconsistent-hints.html",
  "button-placement.html",
  "inline-styles.html",
];

describe("golden form", () => {
  it("has no issues and is left unchanged", () => {
    const source = fixture("golden.html");
    const result = fix(source);
    assert.equal(result.summary.total, 0);
    assert.equal(result.output, source);
    assert.equal(result.diff, "");
  });
});

describe("idempotency", () => {
  for (const name of FIXTURES) {
    it(`fixing ${name} twice gives the same output`, () => {
      const first = fix(fixture(name));
      const second = fix(first.output);
      assert.equal(second.output, first.output);
      assert.equal(second.summary.autoFixed, 0, `still fixable: ${rules(second).join(", ")}`);
      assert.equal(second.summary.manual, first.summary.manual);
    });
  }
});

describe("missing labels", () => {
  const result = check(fixture("missing-labels.html"));

  it("links an unassociated label and a wrapping label with for/id", () => {
    const messages = byRule(result, "label-for").map((issue) => issue.message);
    assert.equal(messages.length, 3);
    assert.ok(messages.some((m) => /wraps its control/.test(m)));
    const output = fix(fixture("missing-labels.html")).output;
    assert.match(output, /<label for="name" class="form-label">Name<\/label>/);
    assert.match(output, /<input id="name" name="name" type="text">/);
    assert.match(output, /<input id="email" name="email" type="email">/);
  });

  it("repairs a label whose for matches no id", () => {
    assert.match(fix(fixture("missing-labels.html")).output, /<label for="topic" class="form-label">Subject<\/label>/);
  });

  it("reports controls with no accessible name as manual (placeholder is not a label)", () => {
    const [issue] = byRule(result, "missing-label");
    assert.equal(issue.status, "manual");
    assert.equal(issue.line, 17);
    assert.match(issue.message, /placeholder/);
    assert.ok(issue.suggestion);
  });

  it("reports aria-labelledby pointing at a missing id", () => {
    assert.equal(byRule(result, "aria-labelledby")[0].status, "manual");
  });
});

describe("inconsistent errors", () => {
  const result = fix(fixture("inconsistent-errors.html"));

  it("normalises error classes and elements", () => {
    assert.ok(byRule(result, "errors-class").length >= 2);
    assert.ok(byRule(result, "errors-element").length >= 2);
    assert.doesNotMatch(result.output, /error-message|invalid-feedback|text-danger/);
  });

  it("links errors with aria-describedby and aria-invalid", () => {
    assert.match(
      result.output,
      /<input id="line1" name="line1" type="text" required aria-describedby="line1-error" aria-invalid="true">\n\s*<p id="line1-error" class="form-error">/,
    );
  });

  it("moves an error to directly below its control", () => {
    assert.match(result.output, /<input id="town"[^>]*>\n\s*<p id="town-error" class="form-error">/);
  });

  it("flags a form-level error that cannot be linked as manual", () => {
    const manual = result.issues.filter((issue) => issue.status === "manual");
    assert.equal(manual.length, 1);
    assert.equal(manual[0].category, "errors");
  });
});

describe("inconsistent hints", () => {
  const result = fix(fixture("inconsistent-hints.html"));

  it("normalises hint class, element, id and position", () => {
    assert.match(
      result.output,
      /<label for="card" class="form-label">Card number<\/label>\n\s*<p id="card-hint" class="form-hint">The long number on the front of your card<\/p>\n\s*<input id="card"[^>]*aria-describedby="card-hint"/,
    );
    assert.match(result.output, /<p id="expiry-hint" class="form-hint">For example, 04\/28<\/p>/);
  });

  it("links an existing standard hint that was not referenced", () => {
    assert.match(result.output, /<input id="cvc" name="cvc" type="text" aria-describedby="cvc-hint">/);
  });

  it("reports the stray form-level hint as manual", () => {
    assert.equal(result.summary.manual, 1);
    assert.equal(result.issues.find((issue) => issue.status === "manual").category, "hints");
  });
});

describe("button placement", () => {
  const result = fix(fixture("button-placement.html"));

  it("moves buttons into the actions area at the bottom with the primary first", () => {
    const actions = result.output.match(/<div class="form-actions">([\s\S]*?)<\/div>/)[1];
    const order = [...actions.matchAll(/(value="Log in"|Forgot password\?|Cancel)/g)].map((m) => m[1]);
    assert.deepEqual(order, ['value="Log in"', "Forgot password?", "Cancel"]);
    assert.match(result.output, /<\/div>\n {2}<\/form>/);
    assert.doesNotMatch(result.output, /class="buttons"/);
  });

  it("infers type=button for an untyped cancel button", () => {
    assert.match(result.output, /<button type="button" class="btn btn-secondary">Cancel<\/button>/);
  });

  it("applies standard primary and secondary classes", () => {
    assert.match(result.output, /<input type="submit" class="btn btn-primary" value="Log in">/);
    assert.doesNotMatch(result.output, /btn-green|btn-link/);
    assert.ok(rules(result).includes("button-order"));
  });
});

describe("inline styles", () => {
  const result = fix(fixture("inline-styles.html"));

  it("removes spacing declarations and maps known styles to classes", () => {
    assert.equal(byRule(result, "inline-spacing").length, 5);
    assert.match(result.output, /<h2 class="form-title text-center">/);
    assert.match(result.output, /<div class="form-field is-hidden">/);
    assert.doesNotMatch(result.output, /padding|margin|gap/);
  });

  it("keeps unmapped styles and reports them as manual", () => {
    const manual = result.issues.filter((issue) => issue.status === "manual");
    assert.equal(manual.length, 4);
    assert.ok(manual.every((issue) => issue.category === "inline-styles" && issue.suggestion));
    assert.match(result.output, /style="width: 100%"/);
  });

  it("allows whitelisted properties", () => {
    const custom = mergeConfig(config, { inlineStyles: { whitelist: ["width", "color", "display", "border"] } });
    const whitelisted = analyze(fixture("inline-styles.html"), { config: custom, mode: "fix" });
    assert.equal(whitelisted.summary.manual, 0);
  });
});

describe("other rules", () => {
  it("wraps a bare form and promotes its title", () => {
    const result = fix('<h1>Join</h1>\n<form><fieldset><legend>You</legend><label for="e">Email</label><input id="e" name="e"></fieldset><button>Join</button></form>\n');
    assert.match(result.output, /^<div class="form-wrapper">\n {2}<h2 class="form-title">Join<\/h2>\n {2}<form>/);
    assert.match(result.output, /<fieldset class="form-section">\n\s*<legend class="form-legend">You<\/legend>\n\s*<div class="form-field">/);
  });

  it("normalises the required marker and reports markers without semantics", () => {
    const required = fix('<form><div><label for="a">Name *</label><input id="a" name="a" required></div><button>Go</button></form>');
    assert.match(required.output, /Name <span class="form-required" aria-hidden="true">\*<\/span><\/label>/);
    const missing = check('<form><div><label for="a">Name *</label><input id="a" name="a"></div><button>Go</button></form>');
    assert.equal(byRule(missing, "required-semantics")[0]?.status, "manual");
  });

  it("groups radio buttons in a fieldset with a legend", () => {
    const result = fix(
      '<form><div><p>Size</p><input type="radio" id="s" name="size"><label for="s">S</label><input type="radio" id="m" name="size"><label for="m">M</label></div><button>Go</button></form>',
    );
    assert.match(result.output, /<fieldset class="form-group">\n\s*<legend class="form-legend">Size<\/legend>/);
    assert.match(result.output, /<div class="form-option">\n\s*<input id="s" name="size" type="radio">/);
  });

  it("reports clickable divs and positive tabindex as manual accessibility issues", () => {
    const result = check('<form><div onclick="x()">Go</div><input aria-label="Q" name="q" tabindex="3"><button>Go</button></form>');
    const accessibility = result.issues.filter((issue) => issue.category === "accessibility");
    assert.ok(accessibility.length >= 2);
    assert.ok(accessibility.every((issue) => issue.status === "manual"));
  });

  it("removes ad-hoc spacing classes and layout <br>s", () => {
    const result = fix('<form><div class="mb-4"><label for="a">A</label><input id="a" name="a" class="mt-2"></div><br><button>Go</button></form>');
    assert.doesNotMatch(result.output, /mb-4|mt-2|<br>/);
    assert.equal(result.issues.filter((issue) => issue.category === "spacing").length, 3);
  });

  it("reports a missing form and a missing submit button", () => {
    assert.ok(rules(check("<p>Hello</p>\n")).includes("form-missing"));
    assert.ok(rules(check('<form><label for="a">A</label><input id="a" name="a"></form>')).includes("submit-missing"));
  });
});

describe("formatting", () => {
  it("normalises quotes, indentation and attribute order", () => {
    const result = fix("<div class='form-wrapper'>\n\t<h2 class='form-title'>T</h2>\n</div>\n");
    assert.equal(result.output, '<div class="form-wrapper">\n  <h2 class="form-title">T</h2>\n</div>\n');
    assert.match(result.issues.find((issue) => issue.category === "formatting").message, /double quotes/);
  });

  it("orders attributes id, name, type, for, class, value, others, aria-*, data-*", () => {
    const result = fix('<form><div class="form-field"><input data-x="1" aria-label="Q" value="v" class="c" type="text" name="q" id="q" autocomplete="off"></div></form>');
    assert.match(result.output, /<input id="q" name="q" type="text" class="c" value="v" autocomplete="off" aria-label="Q" data-x="1">/);
  });

  it("respects configured quote style and indent size", () => {
    const custom = mergeConfig(config, { formatting: { quote: "single", indentSize: 4 } });
    const result = analyze(fixture("golden.html"), { config: custom, mode: "fix" });
    assert.match(result.output, /^<div class='form-wrapper'>\n {4}<h2 class='form-title'>/);
    assert.ok(result.issues.every((issue) => issue.category === "formatting"));
    assert.equal(analyze(result.output, { config: custom, mode: "fix" }).summary.total, 0);
  });
});

describe("report", () => {
  const source = fixture("inline-styles.html");

  it("check mode reports but never changes the summary into auto-fixed", () => {
    const result = check(source);
    assert.equal(result.summary.autoFixable + result.summary.manual, result.summary.total);
    assert.ok(result.issues.every((issue) => ["auto-fixable", "manual"].includes(issue.status)));
  });

  it("fix mode marks issues as auto-fixed or manual and totals them", () => {
    const result = fix(source);
    assert.equal(result.summary.total, result.issues.length);
    assert.equal(result.summary.autoFixed, result.issues.filter((issue) => issue.status === "auto-fixed").length);
    assert.equal(result.summary.manual, result.issues.filter((issue) => issue.status === "manual").length);
    assert.equal(Object.values(result.categories).reduce((a, b) => a + b, 0), result.summary.total);
  });

  it("includes a line number for each issue and groups the text report by category", () => {
    const result = fix(source);
    assert.ok(result.issues.every((issue) => Number.isInteger(issue.line)));
    const text = renderReport(result);
    assert.match(text, /Summary: 12 issues — 8 auto-fixed, 4 manual/);
    assert.match(text, /## Spacing \/ layout \(5\)/);
    assert.match(text, /## Inline styles \(7\)/);
    assert.match(text, /→ Fix: /);
  });

  it("produces a JSON-serialisable report", () => {
    const json = JSON.parse(JSON.stringify(toJson(fix(source), { includeOutput: true })));
    assert.deepEqual(Object.keys(json).sort(), ["categories", "changed", "diff", "file", "issues", "mode", "output", "summary"]);
    assert.deepEqual(Object.keys(json.issues[0]).sort(), ["category", "fixable", "line", "message", "rule", "selector", "status"]);
  });
});

describe("CLI", () => {
  const golden = join(here, "../fixtures/golden.html");

  it("exits 0 for a compliant file and 1 when issues remain", () => {
    assert.equal(spawnSync(process.execPath, [cli, "check", golden]).status, 0);
    assert.equal(spawnSync(process.execPath, [cli, "check", join(here, "../fixtures/missing-labels.html")]).status, 1);
  });

  it("accepts raw HTML and prints JSON", () => {
    const run = spawnSync(process.execPath, [cli, "check", "--json", "--html", '<form><input name="q"></form>'], { encoding: "utf8" });
    const report = JSON.parse(run.stdout);
    assert.equal(report.file, "<raw html>");
    assert.ok(report.summary.manual > 0);
  });

  it("reads stdin and prints a diff", () => {
    const run = spawnSync(process.execPath, [cli, "diff", "-"], { input: "<form>\n<button>Go</button>\n</form>\n", encoding: "utf8" });
    assert.match(run.stdout, /---- Diff ----\n--- a\/<stdin>\n\+\+\+ b\/<stdin>/);
  });

  it("rejects unknown commands with exit code 2", () => {
    assert.equal(spawnSync(process.execPath, [cli, "nope", golden]).status, 2);
  });
});
