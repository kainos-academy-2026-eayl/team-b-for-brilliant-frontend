// Small helpers for working with the parse5 default tree (plain objects).

export const HTML_NS = "http://www.w3.org/1999/xhtml";

export const INLINE_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "br",
  "cite",
  "code",
  "data",
  "dfn",
  "em",
  "i",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
  "wbr",
]);

export const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

export const isElement = (node) => Boolean(node) && typeof node.tagName === "string";
export const isText = (node) => node?.nodeName === "#text";
export const isComment = (node) => node?.nodeName === "#comment";
export const isHeading = (node) => isElement(node) && HEADING_TAGS.has(node.tagName);

export function children(node) {
  if (isElement(node) && node.tagName === "template" && node.content) {
    return node.content.childNodes;
  }
  return node.childNodes ?? [];
}

export const elementChildren = (node) => children(node).filter(isElement);

export function getAttr(el, name) {
  const attr = el.attrs?.find((a) => a.name === name && !a.prefix);
  return attr ? attr.value : null;
}

export const hasAttr = (el, name) => getAttr(el, name) !== null;

export function setAttr(el, name, value) {
  const attr = el.attrs.find((a) => a.name === name && !a.prefix);
  if (attr) attr.value = value;
  else el.attrs.push({ name, value });
}

export function removeAttr(el, name) {
  el.attrs = el.attrs.filter((a) => a.name !== name || a.prefix);
}

export function classList(el) {
  return (getAttr(el, "class") ?? "").split(/\s+/).filter(Boolean);
}

export function setClassList(el, list) {
  const unique = [...new Set(list)];
  if (unique.length === 0) removeAttr(el, "class");
  else setAttr(el, "class", unique.join(" "));
}

export const hasClass = (el, cls) => isElement(el) && classList(el).includes(cls);

/** Adds the classes (space separated string or array). Returns true if anything changed. */
export function addClass(el, classes) {
  const wanted = Array.isArray(classes) ? classes : classes.split(/\s+/).filter(Boolean);
  const current = classList(el);
  const missing = wanted.filter((c) => !current.includes(c));
  if (missing.length === 0) return false;
  setClassList(el, [...current, ...missing]);
  return true;
}

/** Removes classes matching the predicate. Returns the removed class names. */
export function removeClasses(el, predicate) {
  const current = classList(el);
  const removed = current.filter(predicate);
  if (removed.length > 0) setClassList(el, current.filter((c) => !predicate(c)));
  return removed;
}

export function createElement(tagName, attrs = {}) {
  return {
    nodeName: tagName,
    tagName,
    attrs: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    namespaceURI: HTML_NS,
    childNodes: [],
    parentNode: null,
  };
}

export const createText = (value) => ({ nodeName: "#text", value, parentNode: null });

export function detach(node) {
  const parent = node.parentNode;
  if (!parent) return;
  const list = children(parent);
  const index = list.indexOf(node);
  if (index !== -1) list.splice(index, 1);
  node.parentNode = null;
}

export function appendChild(parent, node) {
  detach(node);
  children(parent).push(node);
  node.parentNode = parent.tagName === "template" ? parent.content : parent;
}

export function insertBefore(node, reference) {
  detach(node);
  const parent = reference.parentNode;
  const list = children(parent);
  list.splice(list.indexOf(reference), 0, node);
  node.parentNode = parent;
}

export function insertAfter(node, reference) {
  detach(node);
  const parent = reference.parentNode;
  const list = children(parent);
  list.splice(list.indexOf(reference) + 1, 0, node);
  node.parentNode = parent;
}

export function renameElement(el, tagName) {
  el.tagName = tagName;
  el.nodeName = tagName;
}

/** Depth-first list of descendant elements (optionally including the root). */
export function descendants(root, includeSelf = false) {
  const out = [];
  const visit = (node) => {
    for (const child of children(node)) {
      if (isElement(child)) {
        out.push(child);
        visit(child);
      }
    }
  };
  if (includeSelf && isElement(root)) out.push(root);
  visit(root);
  return out;
}

export function closest(el, predicate, stopAt = null) {
  let current = el;
  while (isElement(current)) {
    if (predicate(current)) return current;
    if (current === stopAt) return null;
    current = current.parentNode;
  }
  return null;
}

export const isInside = (el, ancestor) => closest(el, (n) => n === ancestor) !== null;

export function textContent(node) {
  if (isText(node)) return node.value;
  if (isComment(node)) return "";
  return children(node).map(textContent).join("");
}

export const normalizedText = (node) => textContent(node).replace(/\s+/g, " ").trim();

export const isBlank = (node) => isComment(node) || (isText(node) && node.value.trim() === "");

export function previousElementSibling(el) {
  const list = children(el.parentNode);
  for (let i = list.indexOf(el) - 1; i >= 0; i--) {
    if (isElement(list[i])) return list[i];
    if (!isBlank(list[i])) return null;
  }
  return null;
}

export function nextElementSibling(el) {
  const list = children(el.parentNode);
  for (let i = list.indexOf(el) + 1; i < list.length; i++) {
    if (isElement(list[i])) return list[i];
    if (!isBlank(list[i])) return null;
  }
  return null;
}

/** True when the element only contains text and inline (phrasing) elements. */
export function hasOnlyInlineContent(el) {
  return children(el).every(
    (child) =>
      !isElement(child) || (INLINE_TAGS.has(child.tagName) && hasOnlyInlineContent(child)),
  );
}

export function sourceLine(node) {
  let current = node;
  while (current) {
    if (current.sourceCodeLocation?.startLine) return current.sourceCodeLocation.startLine;
    current = current.parentNode;
  }
  return null;
}

function describe(el) {
  const id = getAttr(el, "id");
  if (id) return `${el.tagName}#${id}`;
  const name = getAttr(el, "name");
  if (name) return `${el.tagName}[name="${name}"]`;
  const cls = classList(el)[0];
  return cls ? `${el.tagName}.${cls}` : el.tagName;
}

/** A short, human-readable CSS-like selector for an element. */
export function selectorFor(el) {
  if (!isElement(el)) return null;
  const parts = [describe(el)];
  let current = el.parentNode;
  while (
    isElement(current) &&
    parts.length < 3 &&
    !hasAttr(el, "id") &&
    !hasAttr(el, "name")
  ) {
    parts.unshift(describe(current));
    if (hasAttr(current, "id")) break;
    current = current.parentNode;
  }
  return parts.join(" > ");
}
