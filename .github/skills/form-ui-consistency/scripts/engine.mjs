import { parse, parseFragment, serialize } from "parse5";
import prettier from "prettier";

export const categories = [
  "Form structure", "Labeling", "Spacing/layout", "Typography/headings", "Required fields",
  "Errors", "Hints", "Buttons", "Accessibility", "Inline styles", "Formatting",
];

const elements = (node) => (node.childNodes ?? []).filter((child) => child.tagName);
const walk = (node) => [node, ...(node.childNodes ?? []).flatMap(walk)];
const attr = (node, name) => node?.attrs?.find((item) => item.name === name)?.value;
const has = (node, name) => attr(node, name) !== undefined;
const tokens = (value) => (value ?? "").split(/\s+/).filter(Boolean);
const classes = (node) => tokens(attr(node, "class"));
const hasClass = (node, name) => classes(node).includes(name);
const text = (node) => node.nodeName === "#text"
  ? node.value : (node.childNodes ?? []).map(text).join("");
const control = (node) => ["input", "select", "textarea"].includes(node.tagName)
  && !["hidden", "submit", "reset", "button", "image"].includes((attr(node, "type") ?? "").toLowerCase());
const action = (node) => node.tagName === "button"
  || (node.tagName === "input" && ["submit", "reset", "button", "image"].includes((attr(node, "type") ?? "").toLowerCase()))
  || (node.tagName === "a" && attr(node, "data-form-action") === "secondary");
const groupControl = (node) => node.tagName === "input"
  && ["radio", "checkbox"].includes((attr(node, "type") ?? "").toLowerCase());
const visible = (node) => {
  for (let parent = node; parent; parent = parent.parentNode) {
    if (has(parent, "hidden") || attr(parent, "aria-hidden") === "true"
      || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr(parent, "style") ?? "")) return false;
  }
  return true;
};

function set(node, name, value) {
  const existing = node.attrs.find((item) => item.name === name);
  if (existing) existing.value = value;
  else node.attrs.push({ name, value });
}

function remove(node, name) {
  node.attrs = node.attrs.filter((item) => item.name !== name);
}

function addClass(node, name, aliases = []) {
  set(node, "class", [...new Set([...classes(node).filter((item) => !aliases.includes(item)), name])].join(" "));
}

function append(parent, child) {
  child.parentNode = parent;
  parent.childNodes.push(child);
}

function element(tagName, attrs = {}) {
  return {
    nodeName: tagName, tagName, namespaceURI: "http://www.w3.org/1999/xhtml",
    attrs: Object.entries(attrs).map(([name, value]) => ({ name, value })), childNodes: [],
  };
}

function wrap(node, className) {
  const parent = node.parentNode;
  const wrapper = element("div", { class: className });
  parent.childNodes.splice(parent.childNodes.indexOf(node), 1, wrapper);
  wrapper.parentNode = parent;
  append(wrapper, node);
  return wrapper;
}

function ancestor(node, predicate) {
  for (let parent = node.parentNode; parent; parent = parent.parentNode) {
    if (predicate(parent)) return parent;
  }
  return undefined;
}

function normalizeStyle(value) {
  return value.split(";").map((part) => part.trim().replace(/\s*:\s*/, ":"))
    .filter(Boolean).sort().join(";");
}

export function validateConfig(config) {
  const fail = (message) => { throw new Error(`Invalid form UI configuration: ${message}`); };
  if (!config || typeof config !== "object" || Array.isArray(config)) fail("expected an object");
  const expected = [
    "indentSize", "printWidth", "attributeOrder", "classes", "titleLevel", "sectionLevel",
    "hintTag", "errorTag", "requiredText", "hintAliases", "errorAliases", "primaryAliases",
    "secondaryAliases", "inlineStyleWhitelist", "inlineStyleClassMap",
  ];
  for (const key of Object.keys(config)) if (!expected.includes(key)) fail(`unknown option ${key}`);
  for (const [key, min, max] of [["indentSize", 1, 8], ["printWidth", 40, 240], ["titleLevel", 1, 6], ["sectionLevel", 1, 6]]) {
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) fail(key);
  }
  if (config.sectionLevel <= config.titleLevel) fail("sectionLevel must follow titleLevel");
  const classKeys = ["form", "field", "section", "hint", "error", "required", "actions", "primary", "secondary"];
  if (!config.classes || Object.keys(config.classes).length !== classKeys.length) fail("classes");
  for (const key of classKeys) {
    if (!/^[a-zA-Z_][\w-]*$/.test(config.classes[key] ?? "")) fail(`classes.${key}`);
  }
  if (new Set(Object.values(config.classes)).size !== classKeys.length) fail("classes must be distinct");
  for (const key of ["attributeOrder", "hintAliases", "errorAliases", "primaryAliases", "secondaryAliases", "inlineStyleWhitelist"]) {
    if (!Array.isArray(config[key]) || config[key].some((value) => typeof value !== "string" || !value.trim())) fail(key);
  }
  if (!config.attributeOrder.length || new Set(config.attributeOrder).size !== config.attributeOrder.length) fail("attributeOrder");
  if (config.attributeOrder.some((pattern) => !/^[a-z][a-z0-9:-]*\*?$/.test(pattern))) fail("attributeOrder patterns");
  const aliasKeys = ["hintAliases", "errorAliases", "primaryAliases", "secondaryAliases"];
  const aliases = aliasKeys.flatMap((key) => config[key]);
  if (aliases.some((name) => !/^[a-zA-Z_][\w-]*$/.test(name) || Object.values(config.classes).includes(name))
    || new Set(aliases).size !== aliases.length) fail("aliases must be distinct class tokens, separate from standard classes");
  for (const key of ["hintTag", "errorTag"]) if (!["p", "span"].includes(config[key])) fail(key);
  if (typeof config.requiredText !== "string" || !config.requiredText.trim()) fail("requiredText");
  if (!config.inlineStyleClassMap || typeof config.inlineStyleClassMap !== "object"
    || Array.isArray(config.inlineStyleClassMap)) fail("inlineStyleClassMap");
  for (const [style, className] of Object.entries(config.inlineStyleClassMap)) {
    if (!style.trim() || typeof className !== "string" || !/^[a-zA-Z_][\w-]*$/.test(className)) fail("inlineStyleClassMap entry");
  }
  return config;
}

export async function processHtml(source, config, { mode = "check", sourceName = "<stdin>" } = {}) {
  validateConfig(config);
  if (!["check", "fix", "diff"].includes(mode)) throw new Error(`Unknown mode: ${mode}`);
  const fixing = mode !== "check";
  const issues = [];
  function issue(category, rule, node, message, suggestion, apply) {
    const id = attr(node, "id");
    const location = node?.sourceCodeLocation?.startTag ?? node?.sourceCodeLocation;
    issues.push({
      category, rule, line: location?.startLine ?? null, column: location?.startCol ?? null,
      selector: id ? `[id=${JSON.stringify(id)}]` : node?.tagName ?? null,
      message, suggestion, fixable: Boolean(apply),
      status: fixing && apply ? "auto-fixed" : "manual-action",
    });
    // Run the same deterministic plan in all modes; check never writes or returns the plan as HTML.
    if (apply) apply();
  }
  function result(formattedHtml) {
    const autoFixed = issues.filter((item) => item.status === "auto-fixed").length;
    return {
      report: {
        source: sourceName, mode, issues,
        byCategory: Object.fromEntries(categories.map((category) => [category, issues.filter((item) => item.category === category)])),
        summary: { totalIssues: issues.length, autoFixed, remaining: issues.length - autoFixed, manualRemediation: issues.length - autoFixed },
      },
      formattedHtml: fixing ? formattedHtml : null,
    };
  }
  if (typeof source !== "string" || !source.trim()) throw new Error("HTML input must not be empty");
  if (/\{\{|\{%|<%/.test(source)) {
    issue("Formatting", "unsupported-template", null, "Template syntax cannot be safely parsed as plain HTML.",
      "Render the template first or manually apply the documented patterns; do not rewrite the template with this formatter.");
    return result(null);
  }
  const parseErrors = [];
  const options = { sourceCodeLocationInfo: true, onParseError: (error) => parseErrors.push(error) };
  const document = parse(source, { sourceCodeLocationInfo: true });
  const fullDocument = walk(document).some((node) => node.nodeName === "#documentType"
    || (["html", "head", "body"].includes(node.tagName) && node.sourceCodeLocation));
  const root = fullDocument ? parse(source, options) : parseFragment(source, options);
  const errors = parseErrors.filter((error) => error.code !== "missing-doctype");
  if (errors.length) {
    for (const error of errors) {
      issue("Formatting", "invalid-html", { sourceCodeLocation: error },
        `HTML parse error: ${error.code}.`, "Repair the source HTML before formatting; parser recovery could discard content.");
    }
    return result(null);
  }
  const nodes = walk(root);
  const forms = nodes.filter((node) => node.tagName === "form");
  if (!forms.length) {
    issue("Form structure", "missing-form", null, "No HTML form was found.", "Provide HTML containing a form element.");
    return result(null);
  }
  const byId = new Map();
  for (const node of nodes.filter((item) => has(item, "id"))) {
    const id = attr(node, "id");
    byId.set(id, [...(byId.get(id) ?? []), node]);
  }
  const usedIds = new Set(byId.keys());
  const uniqueId = (base) => {
    const slug = base.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "field";
    let candidate = slug;
    for (let suffix = 2; usedIds.has(candidate); suffix++) candidate = `${slug}-${suffix}`;
    usedIds.add(candidate);
    return candidate;
  };
  const resolveId = (id) => {
    const matches = byId.get(id) ?? walk(root).filter((node) => attr(node, "id") === id);
    return matches.length === 1 ? matches[0] : undefined;
  };
  for (const [id, duplicates] of byId) {
    if (!id || duplicates.length > 1) {
      for (const node of duplicates) issue("Accessibility", "duplicate-or-empty-id", node,
        `ID ${JSON.stringify(id)} is ${id ? "duplicated" : "empty"}.`,
        "Assign a unique non-empty ID and update its references manually.");
    }
  }
  const validLabel = (label) => visible(label) && text(label).trim();
  const namedByAria = (node) => {
    if (has(node, "aria-labelledby")) {
      const ids = tokens(attr(node, "aria-labelledby"));
      return ids.length > 0 && ids.every((id) => resolveId(id) && text(resolveId(id)).trim());
    }
    return Boolean(attr(node, "aria-label")?.trim());
  };
  const classRule = (node, key, category, aliases = []) => {
    if (!hasClass(node, config.classes[key]) || aliases.some((name) => hasClass(node, name))) {
      issue(category, `${key}-class`, node, `Use the standard ${config.classes[key]} class.`,
        `Add ${config.classes[key]} and replace recognized aliases.`, () => addClass(node, config.classes[key], aliases));
    }
  };
  for (const form of forms) {
    classRule(form, "form", "Form structure");
    const descendants = walk(form);
    const controls = descendants.filter(control);
    const labels = nodes.filter((node) => node.tagName === "label");
    const recognizedMessage = (node) => [config.classes.hint, config.classes.error,
      ...config.hintAliases, ...config.errorAliases].some((name) => hasClass(node, name));
    for (const node of descendants.filter((item) => has(item, "style"))) {
      const style = normalizeStyle(attr(node, "style"));
      if (!config.inlineStyleWhitelist.map(normalizeStyle).includes(style)) {
        const mapped = Object.entries(config.inlineStyleClassMap).find(([value]) => normalizeStyle(value) === style)?.[1];
        issue("Inline styles", "inline-style", node, "Inline visual/layout styles are not allowed unless explicitly whitelisted.",
          mapped ? `Replace this exact style with ${mapped}.` : "Move declarations to a reviewed stylesheet class, or explicitly whitelist the exact style.",
          mapped ? () => { addClass(node, mapped); remove(node, "style"); } : undefined);
      }
    }
    for (const label of labels.filter((node) => ancestor(node, (parent) => parent === form))) {
      if (has(label, "for") && !control(resolveId(attr(label, "for")) ?? {})) {
        issue("Labeling", "orphan-label", label, "Label for does not resolve to one unique field.",
          "Set for to the intended field ID; do not guess when several controls are possible.");
      }
    }
    const headings = descendants.filter((node) => /^h[1-6]$/.test(node.tagName ?? ""));
    for (const heading of headings) {
      const inSection = ancestor(heading, (node) => ["fieldset", "section"].includes(node.tagName));
      const expected = inSection ? config.sectionLevel : config.titleLevel;
      if (heading.tagName !== `h${expected}`) issue("Typography/headings", "heading-level", heading,
        `Expected h${expected} for this ${inSection ? "section" : "form title"}.`,
        "Review the surrounding page hierarchy and adjust the heading level or configuration.");
    }
    for (const section of descendants.filter((node) => ["fieldset", "section"].includes(node.tagName))) {
      classRule(section, "section", "Spacing/layout");
      const title = elements(section).find((node) => section.tagName === "fieldset"
        ? node.tagName === "legend" : /^h[1-6]$/.test(node.tagName));
      if (!title || !text(title).trim()) issue("Form structure", "section-title", section,
        "Field groups need a meaningful legend or section heading.", "Supply a visible group heading; its wording needs developer input.");
    }
    for (let index = 0; index < controls.length; index++) {
      const field = controls[index];
      let id = attr(field, "id");
      const wrappingLabel = ancestor(field, (node) => node.tagName === "label");
      let label = id && resolveId(id) === field
        ? labels.find((node) => attr(node, "for") === id && validLabel(node)) : undefined;
      if (!label && wrappingLabel && validLabel(wrappingLabel) && !has(wrappingLabel, "for")
        && walk(wrappingLabel).filter(control).length === 1 && (!id || resolveId(id) === field)) {
        issue("Labeling", "explicit-label", field, "Use an explicit label for / input id association.",
          "Associate the existing wrapping label with a stable unique field ID.", () => {
            id ||= uniqueId(attr(field, "name") || `form-${forms.indexOf(form) + 1}-field-${index + 1}`);
            set(field, "id", id);
            set(wrappingLabel, "for", id);
          });
        label = wrappingLabel;
      }
      const parentLabels = elements(field.parentNode).filter((node) => node.tagName === "label");
      if (!label && !wrappingLabel && parentLabels.length === 1 && !has(parentLabels[0], "for")
        && validLabel(parentLabels[0]) && walk(field.parentNode).filter(control).length === 1
        && (!id || resolveId(id) === field)) {
        const nearbyLabel = parentLabels[0];
        issue("Labeling", "explicit-label", field, "The unique adjacent label has no explicit association.",
          "Associate the existing label with a stable unique field ID.", () => {
            id ||= uniqueId(attr(field, "name") || `form-${forms.indexOf(form) + 1}-field-${index + 1}`);
            set(field, "id", id);
            set(nearbyLabel, "for", id);
          });
        label = nearbyLabel;
      }
      if (!label && !namedByAria(field)) {
        issue("Labeling", "missing-label", field, "Field has no valid visible label or accessible name.",
          "Add meaningful label text with matching for/id, or aria-label/aria-labelledby when visual labeling is inappropriate.");
      }
      if (has(field, "aria-labelledby") && !namedByAria(field)) {
        issue("Accessibility", "invalid-labelledby", field, "aria-labelledby contains missing, ambiguous or empty references.",
          "Reference unique IDs whose text supplies the intended accessible name.");
      }
      let wrapper = ancestor(field, (node) => hasClass(node, config.classes.field));
      if (wrapper && wrapper.tagName !== "div") {
        issue("Form structure", "field-wrapper-element", wrapper, "The standard field wrapper must be a div.",
          "Replace the wrapper with a div after checking its semantic purpose; block messages must not be nested inside paragraphs.");
        wrapper = undefined;
      }
      if (wrapper && walk(wrapper).filter(control).length !== 1) {
        issue("Form structure", "shared-field-wrapper", wrapper, "A field wrapper contains multiple controls.",
          "Give each field its own wrapper and use a fieldset/legend for the group.");
        wrapper = undefined;
      }
      if (!wrapper) {
        const parent = field.parentNode;
        const safeParent = parent?.tagName === "div" && walk(parent).filter(control).length === 1
          && elements(parent).every((node) => node === field || node === wrappingLabel
            || ["label", "p", "span"].includes(node.tagName)
            || (node.tagName === "div" && recognizedMessage(node)));
        const standalone = parent === form && !label && !elements(parent).some((node) => node.tagName === "label");
        if (safeParent || standalone) {
          issue("Spacing/layout", "field-wrapper", field, "Field needs a standard spacing wrapper.",
            `Use div.${config.classes.field}.`, () => {
              wrapper = safeParent ? parent : wrap(field, config.classes.field);
              addClass(wrapper, config.classes.field);
            });
        } else {
          issue("Form structure", "field-wrapper", field, "Field structure cannot be safely normalized automatically.",
            `Group its label, control, hint and error in one div.${config.classes.field}; preserve layout and behavior.`);
        }
      }
      if (wrapper && ancestor(wrapper, (node) => hasClass(node, config.classes.field))) {
        issue("Form structure", "nested-field-wrapper", wrapper, "Field wrappers are nested.",
          "Flatten redundant wrappers after checking CSS and event-handler dependencies.");
      }
      if (wrapper) {
        const messages = walk(wrapper).filter((node) => node !== field && node.tagName
          && [config.classes.hint, config.classes.error, ...config.hintAliases, ...config.errorAliases]
            .some((name) => hasClass(node, name)));
        const errorsForField = [];
        const handledMessages = [];
        for (const message of messages) {
          const isError = [config.classes.error, ...config.errorAliases].some((name) => hasClass(message, name));
          const key = isError ? "error" : "hint";
          const category = isError ? "Errors" : "Hints";
          const expectedTag = config[`${key}Tag`];
          const aliases = config[`${key}Aliases`];
          const unsafeTag = !["div", "p", "span"].includes(message.tagName)
            || elements(message).some((node) => !["span", "strong", "em", "a", "b", "i", "small"].includes(node.tagName));
          if (unsafeTag || message.parentNode !== wrapper || field.parentNode !== wrapper) {
            issue(category, `${key}-structure`, message, "Message is not a simple field-level sibling.",
              "Place a simple message immediately after the control without removing dynamic or interactive content.");
            continue;
          }
          handledMessages.push(message);
          classRule(message, key, category, aliases);
          if (message.tagName !== expectedTag) issue(category, `${key}-element`, message,
            `Use ${expectedTag} for ${key} text.`, `Change the message element to ${expectedTag}.`, () => {
              message.tagName = expectedTag;
              message.nodeName = expectedTag;
            });
          if (!attr(message, "id")) issue(category, `${key}-id`, message, "Message needs a stable unique ID.",
            "Generate an ID to link this message.", () => set(message, "id", uniqueId(`${id || attr(field, "name") || `field-${index + 1}`}-${key}`)));
          const messageId = attr(message, "id");
          if (messageId && resolveId(messageId) === message
            && !tokens(attr(field, "aria-describedby")).includes(messageId)) {
            issue(category, `${key}-association`, field, `Field does not reference its ${key}.`,
              "Append the message ID to aria-describedby, preserving existing references.",
              () => set(field, "aria-describedby", [...tokens(attr(field, "aria-describedby")), messageId].join(" ")));
          }
          if (isError && visible(message) && text(message).trim()) errorsForField.push(message);
        }
        if (errorsForField.length && attr(field, "aria-invalid") !== "true") {
          issue("Errors", "invalid-state", field, "A visible field error requires aria-invalid=true.",
            "Mark the field invalid while the error is displayed.", () => set(field, "aria-invalid", "true"));
        }
        const siblingMessages = elements(wrapper).filter((node) => handledMessages.includes(node));
        const ordered = [...siblingMessages.filter((node) => hasClass(node, config.classes.hint)),
          ...siblingMessages.filter((node) => hasClass(node, config.classes.error))];
        const siblings = elements(wrapper);
        const after = siblings.slice(siblings.indexOf(field) + 1, siblings.indexOf(field) + 1 + ordered.length);
        if (ordered.length && field.parentNode === wrapper && ordered.some((node, i) => after[i] !== node)) {
          issue("Errors", "message-order", wrapper, "Hints then errors must immediately follow the control.",
            "Move existing message siblings immediately after the field.", () => {
              wrapper.childNodes = wrapper.childNodes.filter((node) => !ordered.includes(node));
              wrapper.childNodes.splice(wrapper.childNodes.indexOf(field) + 1, 0, ...ordered);
            });
        }
      }
      const marker = label && walk(label).find((node) => hasClass(node, config.classes.required));
      const visualRequired = Boolean(marker || (label && (text(label).includes(config.requiredText) || /\*/.test(text(label)))));
      const semanticRequired = has(field, "required") || attr(field, "aria-required") === "true";
      const requiredSupported = field.tagName !== "input"
        || !["range", "color"].includes((attr(field, "type") ?? "text").toLowerCase());
      if (visualRequired && !semanticRequired) issue("Required fields", "required-semantics", field,
        "Visual required indication lacks required semantics.",
        "Confirm whether the field is mandatory and set required (native controls) or remove the visual marker.");
      if (semanticRequired && !requiredSupported) issue("Required fields", "unsupported-required", field,
        "This input type does not support native required validation.", "Review the input type and validation requirements.");
      if (semanticRequired && label && !marker) {
        const ambiguous = visualRequired;
        issue("Required fields", "required-marker", label, "Required field needs the standard visual marker.",
          ambiguous ? "Replace the existing indication with the configured marker; preserve the label wording."
            : "Append a decorative required marker to the label.",
          ambiguous ? undefined : () => {
            const span = element("span", { class: config.classes.required, "aria-hidden": "true" });
            append(span, { nodeName: "#text", value: config.requiredText });
            append(label, { nodeName: "#text", value: " " });
            append(label, span);
          });
      } else if (semanticRequired && !label) {
        issue("Required fields", "required-visible-label", field, "Required field has no visible label for its marker.",
          "Provide an appropriate visible label/required indication; keep intentional visually unlabeled patterns accessible.");
      }
      if (marker && (marker.tagName !== "span" || text(marker) !== config.requiredText || attr(marker, "aria-hidden") !== "true")) {
        issue("Required fields", "marker-pattern", marker, "Required marker text or accessibility pattern is inconsistent.",
          `Use a span.${config.classes.required} containing ${config.requiredText} with aria-hidden=true.`);
      }
      if (has(field, "readonly") && !["input", "textarea"].includes(field.tagName)) {
        issue("Accessibility", "unsupported-readonly", field, "readonly has no native effect on this control.",
          "Choose a supported read-only pattern; do not replace it with disabled without reviewing submission behavior.");
      }
      if (has(field, "readonly") && field.tagName === "input" && ![
        "text", "search", "tel", "url", "email", "password", "date", "month", "week",
        "time", "datetime-local", "number",
      ].includes((attr(field, "type") ?? "text").toLowerCase())) {
        issue("Accessibility", "unsupported-readonly", field, "readonly has no native effect on this input type.",
          "Use a supported state without changing submission semantics unintentionally.");
      }
      for (const [native, aria] of [["disabled", "aria-disabled"], ["readonly", "aria-readonly"], ["required", "aria-required"]]) {
        if (has(field, native) && attr(field, aria) === "false") {
          issue("Accessibility", "conflicting-state", field, `${native} conflicts with ${aria}=false.`,
            "Reconcile the native and ARIA states after confirming intended behavior.");
        }
      }
      if ((attr(field, "aria-disabled") === "true" && !has(field, "disabled"))
        || (attr(field, "aria-readonly") === "true" && !has(field, "readonly"))) {
        issue("Accessibility", "state-semantics", field, "ARIA-only state does not enforce native disabled/read-only behavior.",
          "Confirm intended behavior and use the supported native attribute; disabled fields are not submitted.");
      }
      if (attr(field, "aria-invalid") === "true" && !tokens(attr(field, "aria-describedby"))
        .some((reference) => {
          const message = resolveId(reference);
          return message && hasClass(message, config.classes.error) && visible(message) && text(message).trim();
        }) && !tokens(attr(field, "aria-errormessage")).some((reference) => {
          const message = resolveId(reference);
          return message && hasClass(message, config.classes.error) && visible(message) && text(message).trim();
        })) {
        issue("Errors", "missing-error", field, "Invalid field has no linked visible standard error message.",
          "Provide and reference a field-specific error message, or clear stale invalid state.");
      }
    }
    const groups = new Map();
    for (const field of controls.filter(groupControl)) {
      if (!attr(field, "name")) continue;
      const key = `${attr(field, "type").toLowerCase()}:${attr(field, "name")}`;
      groups.set(key, [...(groups.get(key) ?? []), field]);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const fieldset = ancestor(group[0], (node) => node.tagName === "fieldset");
      if (!fieldset || !elements(fieldset).some((node) => node.tagName === "legend" && text(node).trim())
        || group.some((field) => ancestor(field, (node) => node.tagName === "fieldset") !== fieldset)) {
        issue("Accessibility", "group-legend", group[0], "Related radio/checkbox controls need a shared fieldset and legend.",
          "Group these controls in a fieldset and supply meaningful legend text.");
      }
    }
    const buttons = descendants.filter((node) => action(node) || (node.tagName === "a"
      && [config.classes.primary, config.classes.secondary, ...config.primaryAliases, ...config.secondaryAliases]
        .some((name) => hasClass(node, name))));
    const role = (button) => {
      const type = (attr(button, "type") ?? (button.tagName === "button" ? "submit" : "")).toLowerCase();
      if (type === "submit" || hasClass(button, config.classes.primary) || config.primaryAliases.some((name) => hasClass(button, name))) return "primary";
      if (type === "reset" || hasClass(button, config.classes.secondary) || config.secondaryAliases.some((name) => hasClass(button, name))
        || attr(button, "data-form-action") === "secondary") return "secondary";
      return undefined;
    };
    const terminal = buttons.filter((button) => role(button));
    for (const button of buttons) {
      if (!role(button)) issue("Buttons", "ambiguous-action", button, "Button action role cannot be safely inferred.",
        "Mark a terminal secondary action with data-form-action=secondary; keep field-level buttons in place.");
      else classRule(button, role(button), "Buttons", config[`${role(button)}Aliases`]);
    }
    if (terminal.length) {
      let container = terminal[0].parentNode;
      const sameParent = terminal.every((button) => button.parentNode === container);
      const onlyActions = elements(container).every((node) => terminal.includes(node));
      const last = elements(form).at(-1);
      const safe = sameParent && ((container === form && terminal.every((button, index) =>
        elements(form).slice(-terminal.length)[index] === button))
        || (container.parentNode === form && container === last && onlyActions));
      if (!safe) issue("Buttons", "action-placement", terminal[0], "Terminal actions must share a bottom-of-form container.",
        "Move terminal actions to the final form-actions container after reviewing DOM, CSS and event dependencies.");
      else {
        if (container === form) {
          issue("Buttons", "action-container", terminal[0], "Bottom actions need a shared container.",
            `Wrap terminal actions in div.${config.classes.actions}.`, () => {
              container = element("div", { class: config.classes.actions });
              form.childNodes = form.childNodes.filter((node) => !terminal.includes(node));
              append(form, container);
              for (const button of terminal) append(container, button);
            });
        } else classRule(container, "actions", "Buttons");
        const actionElements = elements(container);
        const sorted = [...actionElements.filter((node) => role(node) === "primary"),
          ...actionElements.filter((node) => role(node) !== "primary")];
        if (sorted.some((node, index) => node !== actionElements[index])) {
          const positiveTabindex = walk(container).some((node) => Number(attr(node, "tabindex")) > 0);
          issue("Buttons", "action-order", container, "Primary actions must precede secondary actions.",
            positiveTabindex ? "Remove custom positive tab order before rearranging actions." : "Order primary actions before secondary actions.",
            positiveTabindex ? undefined : () => {
              let index = 0;
              container.childNodes = container.childNodes.map((node) => node.tagName ? sorted[index++] : node);
            });
        }
      }
    }
    for (const node of descendants.filter((item) => item.tagName)) {
      if (!control(node) && has(node, "aria-labelledby") && !namedByAria(node)) {
        issue("Accessibility", "invalid-labelledby", node, "aria-labelledby contains missing, ambiguous or empty references.",
          "Reference unique IDs whose text supplies the intended accessible name.");
      }
      for (const referenceAttr of ["aria-describedby", "aria-errormessage"]) {
        if (has(node, referenceAttr) && (!tokens(attr(node, referenceAttr)).length
          || tokens(attr(node, referenceAttr)).some((id) => !resolveId(id)))) {
          issue(referenceAttr === "aria-errormessage" ? "Errors" : "Accessibility", "broken-reference", node,
            `${referenceAttr} contains missing or ambiguous references.`, "Correct referenced IDs; existing references are never silently removed.");
        }
      }
      if ((has(node, "onclick") || attr(node, "role") === "button") && !["button", "input", "a"].includes(node.tagName)) {
        issue("Accessibility", "non-native-interactive", node, "Non-native clickable element needs a native-control review.",
          "Prefer a button; otherwise provide role, accessible name, focusability and keyboard activation.");
      }
      const interactive = action(node) || (node.tagName === "a" && has(node, "href"))
        || ["button", "link", "checkbox", "radio", "switch", "textbox", "combobox", "slider"].includes(attr(node, "role"));
      const inputType = (attr(node, "type") ?? "").toLowerCase();
      const inputName = node.tagName === "input" && (inputType === "image" ? attr(node, "alt")?.trim() : (
        (["submit", "reset"].includes(inputType) && !has(node, "value"))
        || attr(node, "value")?.trim()));
      const contentName = text(node).trim() || walk(node).some((child) => child.tagName === "img" && attr(child, "alt")?.trim());
      if (interactive && !control(node) && !namedByAria(node) && !inputName && !contentName) {
        issue("Accessibility", "interactive-name", node, "Interactive element has no accessible name.",
          "Provide meaningful visible text, image alt text or a valid ARIA name.");
      }
      if ([config.classes.hint, config.classes.error, ...config.hintAliases, ...config.errorAliases].some((name) => hasClass(node, name))
        && !ancestor(node, (parent) => hasClass(parent, config.classes.field))) {
        issue(hasClass(node, config.classes.error) || config.errorAliases.some((name) => hasClass(node, name)) ? "Errors" : "Hints",
          "orphan-message", node, "Message is outside a field wrapper and cannot be safely associated.",
          "Place the message in the intended field wrapper and reference its unique ID from the control.");
      }
    }
  }
  const rank = (name) => {
    const index = config.attributeOrder.findIndex((pattern) => pattern.endsWith("*")
      ? name.startsWith(pattern.slice(0, -1)) : name === pattern);
    return index < 0 ? config.attributeOrder.length : index;
  };
  for (const form of forms) for (const node of walk(form).filter((item) => item.attrs)) {
    node.attrs.sort((a, b) => rank(a.name) - rank(b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
  const formattedHtml = await prettier.format(serialize(root), {
    parser: "html", tabWidth: config.indentSize, useTabs: false, printWidth: config.printWidth,
    endOfLine: "lf", htmlWhitespaceSensitivity: "css", embeddedLanguageFormatting: "off",
  });
  // Compare formatting separately from semantic repairs, so a check report reflects original markup.
  const original = fullDocument ? parse(source) : parseFragment(source);
  for (const form of walk(original).filter((node) => node.tagName === "form")) {
    for (const node of walk(form).filter((item) => item.attrs)) {
      node.attrs.sort((a, b) => rank(a.name) - rank(b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    }
  }
  const formattingOnly = await prettier.format(serialize(original), {
    parser: "html", tabWidth: config.indentSize, useTabs: false, printWidth: config.printWidth,
    endOfLine: "lf", htmlWhitespaceSensitivity: "css", embeddedLanguageFormatting: "off",
  });
  if (source !== formattingOnly) issue("Formatting", "html-format", null,
    "Indentation, quoting, attribute order or whitespace differs from the standard.",
    "Apply the deterministic HTML formatter (double quotes and LF line endings).", () => {});
  return result(formattedHtml);
}
