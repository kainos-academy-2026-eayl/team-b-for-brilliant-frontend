// Form UI rules. Each rule reports issues and applies a fix only when it is safe to infer.
import {
  addClass,
  appendChild,
  children,
  classList,
  closest,
  createElement,
  createText,
  descendants,
  detach,
  elementChildren,
  getAttr,
  hasAttr,
  hasClass,
  hasOnlyInlineContent,
  INLINE_TAGS,
  insertAfter,
  insertBefore,
  isBlank,
  isElement,
  isHeading,
  isInside,
  isText,
  nextElementSibling,
  normalizedText,
  previousElementSibling,
  removeAttr,
  removeClasses,
  renameElement,
  setAttr,
} from "./dom.mjs";

const NON_LABELABLE_INPUTS = new Set(["hidden", "submit", "button", "reset", "image"]);
const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea", "label", "summary", "option"]);
const CONTROL_TAGS = new Set(["input", "select", "textarea", "button", "form", "fieldset", "label", "legend"]);
const MARKER_TAGS = new Set(["span", "abbr", "strong", "em", "sup", "b"]);
const MARKER_TEXTS = new Set(["*", "(required)", "required"]);

const inputType = (el) => (getAttr(el, "type") ?? "text").toLowerCase();

export function isLabelable(el) {
  if (!isElement(el)) return false;
  if (el.tagName === "select" || el.tagName === "textarea") return true;
  return el.tagName === "input" && !NON_LABELABLE_INPUTS.has(inputType(el));
}

const isChoice = (el) => el.tagName === "input" && ["radio", "checkbox"].includes(inputType(el));
const isRequired = (el) => hasAttr(el, "required") || getAttr(el, "aria-required") === "true";
const labelables = (root) => descendants(root).filter(isLabelable);
const truncate = (text, max = 40) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function isSubmit(el) {
  if (el.tagName === "button") return (getAttr(el, "type") ?? "submit").toLowerCase() === "submit";
  return el.tagName === "input" && ["submit", "image"].includes(inputType(el));
}

function buttonText(el) {
  if (el.tagName === "input") return getAttr(el, "value") ?? "";
  return normalizedText(el);
}

function createContext(root, config, report) {
  const ids = new Set(
    descendants(root)
      .map((el) => getAttr(el, "id"))
      .filter(Boolean),
  );
  const ctx = {
    root,
    config,
    cls: config.classes,
    tags: config.elements,
    report,
    ids,
    re: {
      buttonClass: new RegExp(config.aliases.buttonClassPattern),
      spacingClass: new RegExp(config.spacing.adHocClassPattern),
      spacingProperty: new RegExp(config.inlineStyles.spacingPropertyPattern),
      secondaryAction: new RegExp(config.aliases.secondaryActionTextPattern, "i"),
    },
  };
  ctx.uniqueId = (base) => {
    let slug = String(base)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug || /^\d/.test(slug)) slug = `field-${slug || "control"}`.replace(/-$/, "");
    let id = slug;
    for (let n = 2; ids.has(id); n++) id = `${slug}-${n}`;
    ids.add(id);
    return id;
  };
  ctx.findById = (id) => descendants(root).find((el) => getAttr(el, "id") === id) ?? null;
  return ctx;
}

// ---------- shared classification helpers ----------

function isActionButton(ctx, el) {
  if (el.tagName === "button") return true;
  if (el.tagName === "input") return ["submit", "button", "reset", "image"].includes(inputType(el));
  if (el.tagName === "a") {
    return getAttr(el, "role") === "button" || classList(el).some((c) => ctx.re.buttonClass.test(c));
  }
  return false;
}

function isMessageCandidate(el) {
  return !CONTROL_TAGS.has(el.tagName) && !isLabelable(el);
}

function isErrorEl(ctx, el) {
  if (!isMessageCandidate(el)) return false;
  return hasClass(el, ctx.cls.error) || classList(el).some((c) => ctx.config.aliases.error.includes(c));
}

function isHintEl(ctx, el) {
  if (!isMessageCandidate(el)) return false;
  if (hasClass(el, ctx.cls.hint) || classList(el).some((c) => ctx.config.aliases.hint.includes(c))) return true;
  if (el.tagName !== "small") return false;
  return !closest(
    el.parentNode,
    (n) => ["label", "legend", "button"].includes(n.tagName) || isErrorEl(ctx, n) || hasClass(n, ctx.cls.hint),
  );
}

function controlsOnlyGroup(container, name) {
  const controls = labelables(container);
  return controls.length > 0 && controls.every((c) => isChoice(c) && getAttr(c, "name") === name);
}

function isGroupFieldset(el) {
  if (!isElement(el) || el.tagName !== "fieldset") return false;
  const first = labelables(el)[0];
  const name = first && getAttr(first, "name");
  return Boolean(name) && isChoice(first) && controlsOnlyGroup(el, name);
}

function isSection(ctx, el) {
  return (
    (el.tagName === "fieldset" && !isGroupFieldset(el)) ||
    el.tagName === "section" ||
    hasClass(el, ctx.cls.section)
  );
}

function isStructural(ctx, el) {
  const { cls } = ctx;
  if (["fieldset", "form", "section", "legend", "label", "body", "html", "template"].includes(el.tagName)) return true;
  return [cls.wrapper, cls.section, cls.group, cls.actions, cls.field, cls.option].some((c) => hasClass(el, c));
}

function choiceGroups(form) {
  const groups = new Map();
  for (const el of labelables(form)) {
    const name = getAttr(el, "name");
    if (isChoice(el) && name) groups.set(name, [...(groups.get(name) ?? []), el]);
  }
  return groups;
}

function isGroupedOption(form, control, groups = choiceGroups(form)) {
  if (!isChoice(control)) return false;
  if ((groups.get(getAttr(control, "name"))?.length ?? 0) >= 2) return true;
  return isGroupFieldset(closest(control.parentNode, (n) => n.tagName === "fieldset", form));
}

function labelsFor(ctx, control) {
  const id = getAttr(control, "id");
  const found = id
    ? descendants(ctx.root).filter((el) => el.tagName === "label" && getAttr(el, "for") === id)
    : [];
  const wrapping = closest(control.parentNode, (n) => n.tagName === "label");
  if (wrapping && !found.includes(wrapping)) found.push(wrapping);
  return found;
}

function describeControl(ctx, control) {
  const label = labelsFor(ctx, control)[0];
  const text = label ? normalizedText(label).replace(/\s*\*$/, "") : "";
  if (text) return `"${truncate(text)}"`;
  const name = getAttr(control, "id") ?? getAttr(control, "name");
  return name ? `\`${name}\`` : `<${control.tagName}>`;
}

function ensureId(ctx, el) {
  const existing = getAttr(el, "id");
  if (existing) return existing;
  let base = getAttr(el, "name") ?? (el.tagName === "input" ? inputType(el) : el.tagName);
  if (isChoice(el) && getAttr(el, "value")) base = `${base}-${getAttr(el, "value")}`;
  if (el.tagName === "fieldset") {
    const first = labelables(el)[0];
    base = `${(first && getAttr(first, "name")) ?? "group"}-group`;
  }
  const id = ctx.uniqueId(base);
  setAttr(el, "id", id);
  return id;
}

/** Detaches an emptied, attribute-free (or class-only) container left behind after moving nodes. */
function removeIfEmptyContainer(ctx, node, form) {
  if (!isElement(node) || node === form || isStructural(ctx, node)) return;
  if (!["div", "p", "span"].includes(node.tagName)) return;
  if (node.attrs.some((a) => a.name !== "class")) return;
  if (children(node).every(isBlank)) detach(node);
}

// ---------- rules ----------

function ruleInlineStyles(ctx, form) {
  const { whitelist, classMap } = ctx.config.inlineStyles;
  // Cover the wrapper and title as well as the form itself, since they are part of the form UI.
  const parent = form.parentNode;
  const heading = previousElementSibling(form);
  const scope = hasClass(parent, ctx.cls.wrapper)
    ? descendants(parent, true)
    : [...(isHeading(heading) ? [heading] : []), ...descendants(form, true)];
  ctx.styled ??= new WeakSet();
  for (const el of scope) {
    if (ctx.styled.has(el)) continue;
    ctx.styled.add(el);
    const style = getAttr(el, "style");
    if (style === null) continue;
    const declarations = style
      .split(";")
      .map((part) => {
        const index = part.indexOf(":");
        if (index === -1) return null;
        return { prop: part.slice(0, index).trim().toLowerCase(), value: part.slice(index + 1).trim() };
      })
      .filter((d) => d?.prop && d.value);
    const kept = [];
    for (const d of declarations) {
      const css = `${d.prop}: ${d.value}`;
      const mappedClass = classMap[`${d.prop}:${d.value.toLowerCase().replace(/\s+/g, " ")}`];
      if (ctx.re.spacingProperty.test(d.prop)) {
        ctx.report({
          category: "spacing",
          rule: "inline-spacing",
          node: el,
          fixable: true,
          message: `Inline spacing \`${css}\` on <${el.tagName}> diverges from the standard spacing; removed (spacing comes from the layout classes).`,
        });
      } else if (mappedClass) {
        addClass(el, mappedClass);
        ctx.report({
          category: "inline-styles",
          rule: "inline-style-mapped",
          node: el,
          fixable: true,
          message: `Inline style \`${css}\` on <${el.tagName}> replaced with the standard class \`${mappedClass}\`.`,
        });
      } else if (whitelist.includes(d.prop)) {
        kept.push(d);
      } else {
        kept.push(d);
        ctx.report({
          category: "inline-styles",
          rule: "inline-style",
          node: el,
          fixable: false,
          message: `Inline style \`${css}\` on <${el.tagName}> is not allowed.`,
          suggestion:
            "Move it into a stylesheet class, or add a mapping in `inlineStyles.classMap` (or the property to `inlineStyles.whitelist`) in the config.",
        });
      }
    }
    if (declarations.length === 0) {
      ctx.report({
        category: "inline-styles",
        rule: "empty-style",
        node: el,
        fixable: true,
        message: `Empty style attribute on <${el.tagName}> removed.`,
      });
    }
    if (kept.length === 0) removeAttr(el, "style");
    else setAttr(el, "style", kept.map((d) => `${d.prop}: ${d.value}`).join("; "));
  }
}

function ruleSpacing(ctx, form) {
  for (const el of descendants(form, true)) {
    const removed = removeClasses(el, (c) => ctx.re.spacingClass.test(c));
    if (removed.length > 0) {
      ctx.report({
        category: "spacing",
        rule: "ad-hoc-spacing-class",
        node: el,
        fixable: true,
        message: `Ad-hoc spacing class${removed.length > 1 ? "es" : ""} \`${removed.join(" ")}\` on <${el.tagName}> removed; use the standard layout classes instead.`,
      });
    }
  }
  if (!ctx.config.spacing.removeLayoutBreaks) return;
  for (const el of descendants(form)) {
    // A <br> between block-level controls (not inside a line of text) is only being used for spacing.
    const isLayoutBreak =
      el.tagName === "br" && [previousSibling(el), nextSibling(el)].every(isFlowNeighbour);
    const isSpacer =
      ["div", "p", "span"].includes(el.tagName) &&
      children(el).every(isBlank) &&
      (el.attrs.length === 0 || (el.attrs.length === 1 && classList(el).every((c) => /spacer|spacing|gap/.test(c))));
    if (isLayoutBreak || isSpacer) {
      ctx.report({
        category: "spacing",
        rule: isLayoutBreak ? "layout-break" : "spacer-element",
        node: el,
        fixable: true,
        message: isLayoutBreak
          ? "<br> used to space out form controls removed; spacing comes from the field/section classes."
          : `Empty spacer <${el.tagName}> removed; spacing comes from the field/section classes.`,
      });
      detach(el);
    }
  }
}

function previousSibling(el) {
  const list = children(el.parentNode);
  for (let i = list.indexOf(el) - 1; i >= 0; i--) if (!isBlank(list[i])) return list[i];
  return null;
}

function nextSibling(el) {
  const list = children(el.parentNode);
  for (let i = list.indexOf(el) + 1; i < list.length; i++) if (!isBlank(list[i])) return list[i];
  return null;
}

const isFlowNeighbour = (n) => n === null || (isElement(n) && (n.tagName === "br" || !INLINE_TAGS.has(n.tagName)));

function ruleWrapper(ctx, form) {
  const { cls, tags } = ctx;
  const parent = form.parentNode;
  if (hasClass(parent, cls.wrapper)) return;
  if (
    isElement(parent) &&
    parent.tagName === tags.wrapper &&
    classList(parent).length === 0 &&
    elementChildren(parent).every((c) => c === form || isHeading(c))
  ) {
    addClass(parent, cls.wrapper);
    ctx.report({
      category: "structure",
      rule: "form-wrapper",
      node: parent,
      fixable: true,
      message: `Form container is missing the standard \`${cls.wrapper}\` class; added it.`,
    });
    return;
  }
  const heading = previousElementSibling(form);
  const wrapper = createElement(tags.wrapper, { class: cls.wrapper });
  insertBefore(wrapper, form);
  if (isHeading(heading)) appendChild(wrapper, heading);
  appendChild(wrapper, form);
  ctx.report({
    category: "structure",
    rule: "form-wrapper",
    node: form,
    fixable: true,
    message: `Form is not inside the standard <${tags.wrapper} class="${cls.wrapper}"> container; wrapped it${isHeading(heading) ? " (with its title)" : ""}.`,
  });
}

function findCaption(container, firstControl) {
  const first = elementChildren(container)[0];
  if (!first || isInside(firstControl, first)) return null;
  if (!["p", "span", "strong", "b", "div", "label", "h1", "h2", "h3", "h4", "h5", "h6"].includes(first.tagName)) return null;
  if (descendants(first).some((n) => isLabelable(n) || n.tagName === "button")) return null;
  if (first.tagName === "label" && hasAttr(first, "for")) return null;
  return normalizedText(first) ? first : null;
}

function makeLegend(ctx, el) {
  renameElement(el, "legend");
  removeAttr(el, "for");
  removeClasses(el, (c) => c === ctx.cls.label || c === ctx.cls.sectionTitle || c === ctx.cls.title);
}

function ruleGroups(ctx, form) {
  for (const [name, controls] of choiceGroups(form)) {
    if (controls.length < 2) continue;
    const fieldset = closest(controls[0].parentNode, (n) => n.tagName === "fieldset", form);
    if (fieldset && controls.every((c) => isInside(c, fieldset)) && controlsOnlyGroup(fieldset, name)) continue;

    let container = controls[0].parentNode;
    while (container !== form && !controls.every((c) => isInside(c, container))) container = container.parentNode;
    const caption = container !== form ? findCaption(container, controls[0]) : null;
    const kind = inputType(controls[0]) === "radio" ? "Radio" : "Checkbox";
    if (
      caption &&
      ["div", "section"].includes(container.tagName) &&
      ![ctx.cls.wrapper, ctx.cls.section, ctx.cls.actions].some((c) => hasClass(container, c)) &&
      controlsOnlyGroup(container, name)
    ) {
      renameElement(container, "fieldset");
      removeClasses(container, (c) => c === ctx.cls.field);
      makeLegend(ctx, caption);
      ctx.report({
        category: "accessibility",
        rule: "choice-group-fieldset",
        node: container,
        fixable: true,
        message: `${kind} group \`${name}\` is not wrapped in <fieldset>/<legend>; converted its container to a fieldset and its caption to a legend.`,
      });
    } else {
      ctx.report({
        category: "accessibility",
        rule: "choice-group-fieldset",
        node: controls[0],
        fixable: false,
        message: `${kind} group \`${name}\` is not wrapped in a <fieldset> with a <legend>.`,
        suggestion: `Wrap the options in <fieldset class="${ctx.cls.group}"><legend class="${ctx.cls.legend}">Question text</legend>…</fieldset>; the legend text must be written by a person.`,
      });
    }
  }
}

function ruleFieldsets(ctx, form) {
  const { cls } = ctx;
  for (const fieldset of descendants(form).filter((n) => n.tagName === "fieldset")) {
    const group = isGroupFieldset(fieldset);
    const wantClass = group ? cls.group : cls.section;
    if (addClass(fieldset, wantClass)) {
      ctx.report({
        category: "structure",
        rule: group ? "group-class" : "section-class",
        node: fieldset,
        fixable: true,
        message: `${group ? "Option group" : "Section"} <fieldset> is missing the standard \`${wantClass}\` class; added it.`,
      });
    }
    const legend = elementChildren(fieldset).find((c) => c.tagName === "legend");
    const first = elementChildren(fieldset)[0];
    if (!legend) {
      const caption = isHeading(first) ? first : group ? findCaption(fieldset, labelables(fieldset)[0]) : null;
      if (caption) {
        const old = caption.tagName;
        makeLegend(ctx, caption);
        ctx.report({
          category: "accessibility",
          rule: "fieldset-legend",
          node: caption,
          fixable: true,
          message: `<fieldset> uses <${old}> as its caption; converted it to <legend>.`,
        });
      } else {
        ctx.report({
          category: "structure",
          rule: "fieldset-legend",
          node: fieldset,
          fixable: false,
          message: "<fieldset> has no <legend> describing the group.",
          suggestion: `Add <legend class="${cls.legend}">Section name</legend> as the first child of the fieldset.`,
        });
      }
    } else if (first !== legend) {
      insertBefore(legend, first);
      ctx.report({
        category: "structure",
        rule: "legend-first",
        node: legend,
        fixable: true,
        message: "<legend> must be the first child of its <fieldset>; moved it.",
      });
    }
  }
}

function isLabelForControl(label, control, side) {
  if (label.tagName !== "label" || labelables(label).length > 0) return false;
  const forId = getAttr(label, "for");
  if (forId) return forId === getAttr(control, "id");
  return side === (isChoice(control) ? "after" : "before");
}

function ruleFieldWrappers(ctx, form) {
  const { cls, tags } = ctx;
  const groups = choiceGroups(form);
  for (const control of labelables(form)) {
    const grouped = isGroupedOption(form, control, groups);
    const wrapperClass = grouped ? cls.option : cls.field;
    if (closest(control, (n) => hasClass(n, wrapperClass), form)) continue;
    if (!grouped && closest(control, (n) => hasClass(n, cls.option), form)) continue;

    const unit = control.parentNode.tagName === "label" ? control.parentNode : control;
    const parent = unit.parentNode;
    const what = `${grouped ? "Option" : "Field"} ${describeControl(ctx, control)}`;
    if (
      parent !== form &&
      isElement(parent) &&
      ["div", "p"].includes(parent.tagName) &&
      !isStructural(ctx, parent) &&
      labelables(parent).length === 1 &&
      !descendants(parent).some((n) => isActionButton(ctx, n))
    ) {
      if (parent.tagName === "p") renameElement(parent, tags.field);
      addClass(parent, wrapperClass);
      ctx.report({
        category: "structure",
        rule: "field-wrapper",
        node: parent,
        fixable: true,
        message: `${what} is missing the standard \`${wrapperClass}\` wrapper class; added it to its container.`,
      });
      continue;
    }

    const list = children(parent);
    const start = list.indexOf(unit);
    let lo = start;
    let hi = start;
    let labelTaken = unit !== control;
    const belongs = (node, side) => {
      if (!isElement(node) || labelables(node).length > 0) return false;
      if (isHintEl(ctx, node) || isErrorEl(ctx, node)) return true;
      if (!labelTaken && isLabelForControl(node, control, side)) {
        labelTaken = true;
        return true;
      }
      return false;
    };
    for (let i = start - 1; i >= 0; i--) {
      if (isBlank(list[i])) continue;
      if (!belongs(list[i], "before")) break;
      lo = i;
    }
    for (let i = start + 1; i < list.length; i++) {
      if (isBlank(list[i])) continue;
      if (!belongs(list[i], "after")) break;
      hi = i;
    }
    const moving = list.slice(lo, hi + 1);
    const wrapper = createElement(tags.field, { class: wrapperClass });
    insertBefore(wrapper, moving[0]);
    for (const node of moving) appendChild(wrapper, node);
    ctx.report({
      category: "structure",
      rule: "field-wrapper",
      node: control,
      fixable: true,
      message: `${what} is not wrapped in the standard <${tags.field} class="${wrapperClass}">; wrapped its label, hint, control and error together.`,
    });
  }
}

function ruleSectionsAndDepth(ctx, form) {
  const controls = labelables(form);
  if (ctx.config.structure.requireSections) {
    const loose = controls.filter((c) => !closest(c.parentNode, (n) => n !== form && isSection(ctx, n), form));
    if (loose.length > 0) {
      ctx.report({
        category: "structure",
        rule: "sections",
        node: loose[0],
        fixable: false,
        message: `${loose.length} field${loose.length > 1 ? "s are" : " is"} not grouped in a form section (first: ${describeControl(ctx, loose[0])}).`,
        suggestion: `Group related fields in <fieldset class="${ctx.cls.section}"><legend class="${ctx.cls.legend}">Section name</legend>…</fieldset>; the legend text must be written by a person.`,
      });
    }
  }
  const max = ctx.config.structure.maxNestingDepth;
  for (const control of controls) {
    let depth = 0;
    for (let n = control.parentNode; n && n !== form; n = n.parentNode) depth++;
    if (depth + 1 > max) {
      ctx.report({
        category: "structure",
        rule: "nesting-depth",
        node: control,
        fixable: false,
        message: `${describeControl(ctx, control)} is nested ${depth + 1} levels deep inside the form (max ${max}).`,
        suggestion: "Flatten the markup to form > section > field > control.",
      });
    }
  }
}

function ruleLabels(ctx, form) {
  for (const control of labelables(form)) {
    const labelledBy = getAttr(control, "aria-labelledby");
    if (labelledBy !== null) {
      const missing = labelledBy.split(/\s+/).filter((id) => id && !ctx.findById(id));
      if (missing.length > 0 || !labelledBy.trim()) {
        ctx.report({
          category: "labeling",
          rule: "aria-labelledby",
          node: control,
          fixable: false,
          message: `aria-labelledby on ${describeControl(ctx, control)} references missing id(s): ${missing.join(", ") || "(empty)"}.`,
          suggestion: "Point aria-labelledby at the id of an element containing the visible label text.",
        });
      }
      continue;
    }
    if ((getAttr(control, "aria-label") ?? "").trim()) continue;
    const id = getAttr(control, "id");
    if (id && descendants(ctx.root).some((l) => l.tagName === "label" && getAttr(l, "for") === id)) continue;

    const wrapping = closest(control.parentNode, (n) => n.tagName === "label", form);
    if (wrapping) {
      const newId = ensureId(ctx, control);
      setAttr(wrapping, "for", newId);
      ctx.report({
        category: "labeling",
        rule: "label-for",
        node: wrapping,
        fixable: true,
        message: `Label "${truncate(normalizedText(wrapping))}" wraps its control without a for/id pair; added for="${newId}".`,
      });
      continue;
    }

    const field = closest(control, (n) => hasClass(n, ctx.cls.field) || hasClass(n, ctx.cls.option), form);
    const pool = field
      ? descendants(field).filter((n) => n.tagName === "label")
      : [previousElementSibling(control), nextElementSibling(control)].filter((n) => n?.tagName === "label");
    const candidates = pool.filter((label) => {
      const forId = getAttr(label, "for");
      return labelables(label).length === 0 && (!forId || !ctx.findById(forId));
    });
    if (candidates.length === 1) {
      const [label] = candidates;
      const before = getAttr(label, "for");
      const newId = ensureId(ctx, control);
      setAttr(label, "for", newId);
      ctx.report({
        category: "labeling",
        rule: "label-for",
        node: label,
        fixable: true,
        message: before
          ? `Label "${truncate(normalizedText(label))}" has for="${before}", which matches no element; changed it to for="${newId}".`
          : `Label "${truncate(normalizedText(label))}" is not associated with its control; added for="${newId}".`,
      });
      continue;
    }

    const placeholder = getAttr(control, "placeholder");
    ctx.report({
      category: "labeling",
      rule: "missing-label",
      node: control,
      fixable: false,
      message: `${describeControl(ctx, control)} has no accessible name (no <label>, aria-label or aria-labelledby)${placeholder ? `; placeholder "${truncate(placeholder)}" is not a label` : ""}.`,
      suggestion: `Add <label class="${ctx.cls.label}" for="${getAttr(control, "id") ?? "ID"}">Visible text</label> before the control; the label text must be written by a person.`,
    });
  }

  for (const label of descendants(form).filter((n) => n.tagName === "label")) {
    const forId = getAttr(label, "for");
    if (forId && !ctx.findById(forId)) {
      ctx.report({
        category: "labeling",
        rule: "orphan-label",
        node: label,
        fixable: false,
        message: `Label "${truncate(normalizedText(label))}" has for="${forId}", but no element has that id.`,
        suggestion: "Set `for` to the id of the control this label describes, or remove the label.",
      });
    }
  }

  const seen = new Map();
  for (const el of descendants(form)) {
    const id = getAttr(el, "id");
    if (!id) continue;
    if (seen.has(id)) {
      ctx.report({
        category: "labeling",
        rule: "duplicate-id",
        node: el,
        fixable: false,
        message: `Duplicate id="${id}"; labels and aria references become ambiguous.`,
        suggestion: "Give each element a unique id and update any matching `for`/aria attributes.",
      });
    }
    seen.set(id, el);
  }
}

function markerElements(ctx, label) {
  return descendants(label).filter(
    (el) =>
      hasClass(el, ctx.cls.requiredMarker) ||
      (MARKER_TAGS.has(el.tagName) && MARKER_TEXTS.has(normalizedText(el).toLowerCase())),
  );
}

function trailingStarText(label, markers) {
  let last = null;
  const visit = (node) => {
    for (const child of children(node)) {
      if (isText(child) && child.value.trim()) last = child;
      else if (isElement(child) && !markers.includes(child) && !isLabelable(child)) visit(child);
    }
  };
  visit(label);
  return last && /\*\s*$/.test(last.value) ? last : null;
}

function ruleRequired(ctx, form) {
  const { cls } = ctx;
  const markerText = ctx.config.requiredMarker.text;
  const seenGroups = new Set();
  for (const control of labelables(form)) {
    const groupFieldset = isChoice(control)
      ? closest(control.parentNode, (n) => n.tagName === "fieldset" && isGroupFieldset(n), form)
      : null;
    let required;
    let label;
    let subject;
    if (groupFieldset && labelables(groupFieldset).length > 1) {
      if (seenGroups.has(groupFieldset)) continue;
      seenGroups.add(groupFieldset);
      required = labelables(groupFieldset).some(isRequired);
      label = elementChildren(groupFieldset).find((c) => c.tagName === "legend");
      subject = `Group "${truncate(label ? normalizedText(label) : getAttr(control, "name"))}"`;
    } else {
      required = isRequired(control);
      label = labelsFor(ctx, control)[0];
      subject = `Field ${describeControl(ctx, control)}`;
    }
    if (!label) continue;

    const markers = markerElements(ctx, label);
    const star = trailingStarText(label, markers);
    const standard = markers.filter(
      (m) =>
        m.tagName === "span" &&
        hasClass(m, cls.requiredMarker) &&
        getAttr(m, "aria-hidden") === "true" &&
        normalizedText(m) === markerText &&
        elementChildren(m).length === 0,
    );

    if (required) {
      if (standard.length === 1 && markers.length === 1 && !star) continue;
      const hadAny = markers.length > 0 || star;
      for (const m of markers) detach(m);
      if (star) star.value = star.value.replace(/\s*\*\s*$/, "");
      appendChild(label, createText(" "));
      const marker = createElement("span", { class: cls.requiredMarker, "aria-hidden": "true" });
      appendChild(marker, createText(markerText));
      appendChild(label, marker);
      ctx.report({
        category: "required",
        rule: "required-marker",
        node: label,
        fixable: true,
        message: hadAny
          ? `${subject} uses a non-standard required marker; normalised to <span class="${cls.requiredMarker}" aria-hidden="true">${markerText}</span>.`
          : `${subject} is required but its label has no visual required marker; added <span class="${cls.requiredMarker}" aria-hidden="true">${markerText}</span>.`,
      });
    } else if (markers.length > 0 || star) {
      ctx.report({
        category: "required",
        rule: "required-semantics",
        node: label,
        fixable: false,
        message: `${subject} looks required (marker in its label) but the control has no \`required\` or aria-required="true".`,
        suggestion: "Add `required` to the control if it is mandatory, or remove the marker from the label.",
      });
    }
  }
}

function describedTarget(ctx, el, form) {
  const { cls } = ctx;
  const wrapper = closest(
    el.parentNode,
    (n) => hasClass(n, cls.field) || hasClass(n, cls.option) || isGroupFieldset(n),
    form,
  );
  if (!wrapper || wrapper === form) return null;
  if (wrapper.tagName === "fieldset" && labelables(wrapper).length > 1) return { wrapper, target: wrapper, group: true };
  const controls = labelables(wrapper);
  return controls.length === 1 ? { wrapper, target: controls[0], group: false } : null;
}

function positionMessage(ctx, el, info, isHint) {
  const { wrapper, target, group } = info;
  const siblings = elementChildren(wrapper);
  const index = (n) => siblings.indexOf(n);
  if (group) {
    const legend = siblings.find((c) => c.tagName === "legend");
    if (isHint) {
      const prev = previousElementSibling(el);
      if (legend && (el.parentNode !== wrapper || !(prev === legend || isHintEl(ctx, prev ?? {})))) {
        insertAfter(el, legend);
        return "moved it directly below the legend";
      }
    } else if (el.parentNode !== wrapper || siblings.slice(index(el) + 1).some((c) => !isErrorEl(ctx, c))) {
      appendChild(wrapper, el);
      return "moved it to the end of the group";
    }
    return null;
  }
  const anchor = siblings.find((c) => c === target || isInside(target, c));
  if (!anchor) return null;
  if (isHint) {
    const label = siblings.find((c) => c.tagName === "label" && getAttr(c, "for") === getAttr(target, "id"));
    const ok =
      el.parentNode === wrapper && index(el) < index(anchor) && (!label || index(label) < index(el));
    if (!ok) {
      insertBefore(el, anchor);
      return "moved it between the label and the control";
    }
    return null;
  }
  const between = siblings.slice(index(anchor) + 1, index(el));
  if (el.parentNode !== wrapper || index(el) < index(anchor) || between.some((c) => !isErrorEl(ctx, c))) {
    let reference = anchor;
    for (let next = nextElementSibling(reference); next && next !== el && isErrorEl(ctx, next); next = nextElementSibling(next)) {
      reference = next;
    }
    insertAfter(el, reference);
    return "moved it directly below the control";
  }
  return null;
}

function normalizeMessage(ctx, el, isHint, form) {
  const category = isHint ? "hints" : "errors";
  const word = isHint ? "Hint text" : "Error message";
  const standardClass = isHint ? ctx.cls.hint : ctx.cls.error;
  const aliases = isHint ? ctx.config.aliases.hint : ctx.config.aliases.error;
  const wantTag = isHint ? ctx.tags.hint : ctx.tags.error;
  const text = normalizedText(el);
  const name = text ? `"${truncate(text)}"` : `<${el.tagName}>`;

  const removed = removeClasses(el, (c) => aliases.includes(c) && c !== standardClass);
  if (addClass(el, standardClass) || removed.length > 0) {
    ctx.report({
      category,
      rule: `${category}-class`,
      node: el,
      fixable: true,
      message: `${word} ${name} uses ${removed.length ? `non-standard class \`${removed.join(" ")}\`` : "no standard class"}; normalised to \`${standardClass}\`.`,
    });
  }
  if (el.tagName !== wantTag) {
    if (hasOnlyInlineContent(el)) {
      const old = el.tagName;
      renameElement(el, wantTag);
      ctx.report({
        category,
        rule: `${category}-element`,
        node: el,
        fixable: true,
        message: `${word} ${name} uses <${old}>; changed it to the standard <${wantTag}>.`,
      });
    } else {
      ctx.report({
        category,
        rule: `${category}-element`,
        node: el,
        fixable: false,
        message: `${word} ${name} uses <${el.tagName}> with block content; the standard is a single <${wantTag}>.`,
        suggestion: `Reduce it to <${wantTag} class="${standardClass}">text</${wantTag}>.`,
      });
    }
  }

  const info = describedTarget(ctx, el, form);
  if (!info) {
    ctx.report({
      category,
      rule: `${category}-association`,
      node: el,
      fixable: false,
      message: `${word} ${name} is not inside a field with a single control, so it cannot be linked to an input.`,
      suggestion: `Move it inside the field wrapper (<div class="${ctx.cls.field}">) of the control it describes.`,
    });
    return;
  }

  const targetId = ensureId(ctx, info.target);
  let id = getAttr(el, "id");
  if (!id) {
    id = ctx.uniqueId(`${targetId}-${isHint ? "hint" : "error"}`);
    setAttr(el, "id", id);
  }
  const describedBy = (getAttr(info.target, "aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  if (!describedBy.includes(id)) {
    setAttr(info.target, "aria-describedby", [...describedBy, id].join(" "));
    ctx.report({
      category,
      rule: `${category}-describedby`,
      node: el,
      fixable: true,
      message: `${word} ${name} is not linked to its ${info.group ? "group" : "control"} via aria-describedby; linked it (id="${id}").`,
    });
  }

  const moved = positionMessage(ctx, el, info, isHint);
  if (moved) {
    ctx.report({
      category,
      rule: `${category}-position`,
      node: el,
      fixable: true,
      message: `${word} ${name} is in a non-standard position; ${moved} (order: label → hint → control → error).`,
    });
  }

  if (!isHint && !info.group && text && getAttr(info.target, "aria-invalid") !== "true") {
    setAttr(info.target, "aria-invalid", "true");
    ctx.report({
      category,
      rule: "errors-aria-invalid",
      node: el,
      fixable: true,
      message: `Field showing error ${name} is missing aria-invalid="true"; added it.`,
    });
  }
}

function ruleHintsAndErrors(ctx, form) {
  const all = descendants(form);
  const errors = all.filter((el) => isErrorEl(ctx, el));
  const hints = all.filter((el) => !errors.includes(el) && isHintEl(ctx, el));
  for (const el of hints) normalizeMessage(ctx, el, true, form);
  for (const el of errors) normalizeMessage(ctx, el, false, form);
}

function ruleButtons(ctx, form) {
  const { cls, tags } = ctx;
  const actions = descendants(form).filter(
    (el) =>
      isActionButton(ctx, el) &&
      !closest(el.parentNode, (n) => hasClass(n, cls.field) || hasClass(n, cls.option) || isGroupFieldset(n), form),
  );
  for (const button of actions.filter((b) => b.tagName === "button" && !hasAttr(b, "type"))) {
    const looksSecondary = ctx.re.secondaryAction.test(buttonText(button).trim());
    const type = looksSecondary ? "button" : "submit";
    setAttr(button, "type", type);
    ctx.report({
      category: "buttons",
      rule: "button-type",
      node: button,
      fixable: true,
      message: looksSecondary
        ? `Button "${truncate(buttonText(button))}" has no type, so it would submit the form; added type="button" because it looks like a secondary action.`
        : `Button "${truncate(buttonText(button))}" has no type (defaults to submit); added type="submit".`,
    });
  }
  if (!actions.some(isSubmit)) {
    ctx.report({
      category: "buttons",
      rule: "submit-missing",
      node: form,
      fixable: false,
      message: "Form has no submit button.",
      suggestion: `Add <div class="${cls.actions}"><button type="submit" class="${cls.primaryButton}">Submit</button></div> at the end of the form.`,
    });
  }
  if (actions.length === 0) return;

  const submits = actions.filter(isSubmit);
  const primary = submits.find((b) => classList(b).some((c) => /primary/.test(c))) ?? submits[0] ?? null;
  for (const button of actions) {
    const want = (button === primary ? cls.primaryButton : cls.secondaryButton).split(/\s+/);
    const current = classList(button);
    const nonStandard = current.filter((c) => ctx.re.buttonClass.test(c) && !want.includes(c));
    const missing = want.filter((c) => !current.includes(c));
    if (nonStandard.length === 0 && missing.length === 0) continue;
    removeClasses(button, (c) => nonStandard.includes(c));
    addClass(button, want);
    ctx.report({
      category: "buttons",
      rule: "button-class",
      node: button,
      fixable: true,
      message: `${button === primary ? "Primary" : "Secondary"} action "${truncate(buttonText(button))}" ${nonStandard.length ? `uses non-standard class \`${nonStandard.join(" ")}\`` : "is missing the standard classes"}; expected \`${want.join(" ")}\`.`,
    });
  }

  const commonParent = actions[0].parentNode;
  let box =
    descendants(form).find((el) => hasClass(el, cls.actions)) ??
    (commonParent !== form &&
    commonParent.tagName === tags.actions &&
    !isStructural(ctx, commonParent) &&
    elementChildren(commonParent).every((c) => actions.includes(c))
      ? commonParent
      : null);
  if (box && addClass(box, cls.actions)) {
    ctx.report({
      category: "buttons",
      rule: "actions-container",
      node: box,
      fixable: true,
      message: `Button container is missing the standard \`${cls.actions}\` class; added it.`,
    });
  }
  if (!box) {
    box = createElement(tags.actions, { class: cls.actions });
    appendChild(form, box);
  }

  for (const button of actions) {
    if (button.parentNode === box) continue;
    const oldParent = button.parentNode;
    ctx.report({
      category: "buttons",
      rule: "button-placement",
      node: button,
      fixable: true,
      message: `Action "${truncate(buttonText(button))}" is outside the form actions area; moved it into <${tags.actions} class="${cls.actions}">.`,
    });
    appendChild(box, button);
    removeIfEmptyContainer(ctx, oldParent, form);
  }

  if (box.parentNode !== form || elementChildren(form).at(-1) !== box) {
    const oldParent = box.parentNode;
    appendChild(form, box);
    removeIfEmptyContainer(ctx, oldParent, form);
    ctx.report({
      category: "buttons",
      rule: "actions-position",
      node: box,
      fixable: true,
      message: "Form actions are not at the bottom of the form; moved them to the end.",
    });
  }

  const boxButtons = elementChildren(box).filter((c) => actions.includes(c));
  if (primary && boxButtons[0] !== primary && boxButtons.includes(primary)) {
    insertBefore(primary, boxButtons[0]);
    ctx.report({
      category: "buttons",
      rule: "button-order",
      node: primary,
      fixable: true,
      message: `Primary action "${truncate(buttonText(primary))}" should come first in the actions area; reordered.`,
    });
  }
}

function ruleAccessibility(ctx, form) {
  const { cls } = ctx;
  for (const el of descendants(form)) {
    const role = getAttr(el, "role");
    if (hasAttr(el, "onclick") && !INTERACTIVE_TAGS.has(el.tagName) && !role) {
      ctx.report({
        category: "accessibility",
        rule: "clickable-non-interactive",
        node: el,
        fixable: false,
        message: `Clickable <${el.tagName}> has no role and is not keyboard accessible.`,
        suggestion: 'Use a real <button type="button"> instead (or add role, tabindex="0" and keyboard handlers).',
      });
    } else if (role && ["button", "link", "checkbox", "radio", "switch"].includes(role) && !INTERACTIVE_TAGS.has(el.tagName) && !hasAttr(el, "tabindex")) {
      ctx.report({
        category: "accessibility",
        rule: "role-not-focusable",
        node: el,
        fixable: false,
        message: `<${el.tagName} role="${role}"> cannot be reached with the keyboard.`,
        suggestion: `Prefer a native element; otherwise add tabindex="0" and keyboard handlers.`,
      });
    }
    if (Number(getAttr(el, "tabindex")) > 0) {
      ctx.report({
        category: "accessibility",
        rule: "positive-tabindex",
        node: el,
        fixable: false,
        message: `tabindex="${getAttr(el, "tabindex")}" overrides the natural tab order.`,
        suggestion: 'Remove it, or use tabindex="0", and order the markup to match the visual order.',
      });
    }
    if (isActionButton(ctx, el)) {
      const named =
        buttonText(el).trim() ||
        (getAttr(el, "aria-label") ?? "").trim() ||
        hasAttr(el, "aria-labelledby") ||
        (el.tagName === "input" && ["submit", "reset"].includes(inputType(el))) ||
        descendants(el).some((n) => n.tagName === "img" && (getAttr(n, "alt") ?? "").trim());
      if (!named) {
        ctx.report({
          category: "accessibility",
          rule: "button-name",
          node: el,
          fixable: false,
          message: `<${el.tagName}> button has no accessible name.`,
          suggestion: "Give it visible text, or an aria-label describing the action.",
        });
      }
    }
    const describedBy = getAttr(el, "aria-describedby");
    if (describedBy) {
      const missing = describedBy.split(/\s+/).filter((id) => id && !ctx.findById(id));
      if (missing.length > 0) {
        ctx.report({
          category: "accessibility",
          rule: "describedby-missing",
          node: el,
          fixable: false,
          message: `aria-describedby references missing id(s): ${missing.join(", ")}.`,
          suggestion: "Remove the stale id or add the hint/error element it should point to.",
        });
      }
    }
  }

  for (const control of descendants(form).filter((n) => isLabelable(n) || n.tagName === "button")) {
    const name = describeControl(ctx, control);
    const disabled = hasAttr(control, "disabled");
    if (getAttr(control, "aria-disabled") === "true" && disabled) {
      removeAttr(control, "aria-disabled");
      ctx.report({
        category: "accessibility",
        rule: "redundant-aria-disabled",
        node: control,
        fixable: true,
        message: `${name} has both \`disabled\` and aria-disabled="true"; removed the redundant aria-disabled.`,
      });
    } else if (getAttr(control, "aria-disabled") === "true") {
      ctx.report({
        category: "accessibility",
        rule: "aria-disabled-native",
        node: control,
        fixable: false,
        message: `${name} uses aria-disabled="true" instead of the native \`disabled\` attribute.`,
        suggestion: "Use `disabled` unless the control must stay focusable while disabled (then document why).",
      });
    }
    const readonlyUnsupported =
      control.tagName === "select" || ["checkbox", "radio", "file", "range", "color"].includes(inputType(control));
    const readonly = hasAttr(control, "readonly") && !readonlyUnsupported;
    if (hasAttr(control, "readonly") && readonlyUnsupported) {
      ctx.report({
        category: "accessibility",
        rule: "readonly-unsupported",
        node: control,
        fixable: false,
        message: `\`readonly\` has no effect on ${name} (<${control.tagName}${control.tagName === "input" ? ` type="${inputType(control)}"` : ""}>).`,
        suggestion: "Use `disabled` (plus a hidden input if the value must be submitted).",
      });
    }
    const wrapper = closest(control, (n) => hasClass(n, cls.field) || hasClass(n, cls.option), form);
    if (!wrapper || control.tagName === "button") continue;
    for (const [active, stateClass, word] of [
      [disabled, cls.disabledState, "Disabled"],
      [readonly, cls.readonlyState, "Read-only"],
    ]) {
      if (active && addClass(wrapper, stateClass)) {
        ctx.report({
          category: "accessibility",
          rule: "state-class",
          node: control,
          fixable: true,
          message: `${word} field ${name} is not visually indicated; added \`${stateClass}\` to its wrapper.`,
        });
      }
    }
  }
}

function ruleTypography(ctx, form) {
  const { cls, tags, config } = ctx;
  for (const label of descendants(form).filter((n) => n.tagName === "label")) {
    if (addClass(label, cls.label)) {
      ctx.report({
        category: "typography",
        rule: "label-class",
        node: label,
        fixable: true,
        message: `Label "${truncate(normalizedText(label))}" is missing the standard \`${cls.label}\` class; added it.`,
      });
    }
  }
  for (const legend of descendants(form).filter((n) => n.tagName === "legend")) {
    if (addClass(legend, cls.legend)) {
      ctx.report({
        category: "typography",
        rule: "legend-class",
        node: legend,
        fixable: true,
        message: `Legend "${truncate(normalizedText(legend))}" is missing the standard \`${cls.legend}\` class; added it.`,
      });
    }
  }

  const wrapper = form.parentNode;
  const outside = elementChildren(wrapper).filter((c) => isHeading(c) && elementChildren(wrapper).indexOf(c) < elementChildren(wrapper).indexOf(form));
  const leading = [];
  for (const child of elementChildren(form)) {
    if (!isHeading(child)) break;
    leading.push(child);
  }
  const title = outside[0] ?? leading[0];
  if (!title) {
    if (config.structure.requireTitle) {
      ctx.report({
        category: "typography",
        rule: "form-title",
        node: form,
        fixable: false,
        message: "Form has no title heading.",
        suggestion: `Add <${tags.title} class="${cls.title}">Form name</${tags.title}> above the <form>, inside the wrapper.`,
      });
    }
  } else {
    if (isInside(title, form)) {
      insertBefore(title, form);
      ctx.report({
        category: "typography",
        rule: "form-title-position",
        node: title,
        fixable: true,
        message: "Form title sits inside the <form>; moved it above the form, inside the wrapper.",
      });
    }
    if (title.tagName !== tags.title) {
      const old = title.tagName;
      renameElement(title, tags.title);
      ctx.report({
        category: "typography",
        rule: "form-title-level",
        node: title,
        fixable: true,
        message: `Form title "${truncate(normalizedText(title))}" uses <${old}>; the standard is <${tags.title}>.`,
      });
    }
    if (addClass(title, cls.title)) {
      ctx.report({
        category: "typography",
        rule: "form-title-class",
        node: title,
        fixable: true,
        message: `Form title is missing the standard \`${cls.title}\` class; added it.`,
      });
    }
  }

  for (const heading of descendants(form).filter(isHeading)) {
    const section = heading.parentNode;
    const isSectionHeading =
      isElement(section) &&
      section.tagName !== "fieldset" &&
      (section.tagName === "section" || hasClass(section, cls.section)) &&
      elementChildren(section)[0] === heading;
    if (!isSectionHeading) {
      ctx.report({
        category: "typography",
        rule: "unexpected-heading",
        node: heading,
        fixable: false,
        message: `Unexpected <${heading.tagName}> "${truncate(normalizedText(heading))}" inside the form.`,
        suggestion: `Use a <legend> for fieldset captions, <${tags.sectionHeading} class="${cls.sectionTitle}"> as the first child of a section, or plain text for content.`,
      });
      continue;
    }
    if (heading.tagName !== tags.sectionHeading) {
      const old = heading.tagName;
      renameElement(heading, tags.sectionHeading);
      ctx.report({
        category: "typography",
        rule: "section-heading-level",
        node: heading,
        fixable: true,
        message: `Section heading "${truncate(normalizedText(heading))}" uses <${old}>; the standard is <${tags.sectionHeading}>.`,
      });
    }
    if (addClass(heading, cls.sectionTitle)) {
      ctx.report({
        category: "typography",
        rule: "section-heading-class",
        node: heading,
        fixable: true,
        message: `Section heading is missing the standard \`${cls.sectionTitle}\` class; added it.`,
      });
    }
  }
}

/** Runs every rule against each <form> in the tree, mutating it with safe fixes. */
export function runRules(root, config, report) {
  const ctx = createContext(root, config, report);
  const forms = descendants(root).filter((el) => el.tagName === "form");
  if (forms.length === 0) {
    report({
      category: "structure",
      rule: "form-missing",
      node: null,
      fixable: false,
      message: "No <form> element found.",
      suggestion: "Wrap the fields in a <form> element.",
    });
    return;
  }
  for (const form of forms) {
    ruleInlineStyles(ctx, form);
    ruleSpacing(ctx, form);
    ruleWrapper(ctx, form);
    ruleGroups(ctx, form);
    ruleFieldsets(ctx, form);
    ruleFieldWrappers(ctx, form);
    ruleSectionsAndDepth(ctx, form);
    ruleLabels(ctx, form);
    ruleRequired(ctx, form);
    ruleHintsAndErrors(ctx, form);
    ruleButtons(ctx, form);
    ruleAccessibility(ctx, form);
    ruleTypography(ctx, form);
  }
}
