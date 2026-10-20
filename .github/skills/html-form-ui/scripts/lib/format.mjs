// Deterministic HTML pretty-printer. Running it on its own output gives the same output (idempotent).
import { children, INLINE_TAGS, isComment, isElement, isText, setClassList, classList } from "./dom.mjs";

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);
const RAW_TEXT_TAGS = new Set(["script", "style"]);
const PRESERVE_TAGS = new Set(["pre", "textarea"]);
const BOOLEAN_ATTRS = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "checked",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "multiple",
  "nomodule",
  "novalidate",
  "open",
  "readonly",
  "required",
  "reversed",
  "selected",
]);

const collapse = (text) => text.replace(/[ \t\n\r\f]+/g, " ");

const escapeText = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\u00a0/g, "&nbsp;");

function escapeAttr(value, quote) {
  const escaped = value.replace(/&/g, "&amp;").replace(/\u00a0/g, "&nbsp;");
  return quote === '"' ? escaped.replace(/"/g, "&quot;") : escaped.replace(/'/g, "&#39;");
}

function attrRank(name, order) {
  const exact = order.indexOf(name);
  if (exact !== -1) return exact;
  if (name.startsWith("aria-") && order.includes("aria-*")) return order.indexOf("aria-*");
  if (name.startsWith("data-") && order.includes("data-*")) return order.indexOf("data-*");
  const rest = order.indexOf("*");
  return rest === -1 ? order.length : rest;
}

export function sortAttributes(attrs, order) {
  return [...attrs].sort((a, b) => {
    const diff = attrRank(a.name, order) - attrRank(b.name, order);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
}

export function createFormatter(config) {
  const indentUnit = " ".repeat(config.formatting.indentSize);
  const quote = config.formatting.quote === "single" ? "'" : '"';
  const order = config.formatting.attributeOrder;

  function renderAttrs(el) {
    if (classList(el).length > 0) setClassList(el, classList(el));
    else if (el.attrs.some((a) => a.name === "class")) el.attrs = el.attrs.filter((a) => a.name !== "class");
    return sortAttributes(el.attrs, order)
      .map((attr) => {
        const name = attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name;
        if (BOOLEAN_ATTRS.has(name) && el.namespaceURI?.endsWith("xhtml")) return ` ${name}`;
        return ` ${name}=${quote}${escapeAttr(attr.value, quote)}${quote}`;
      })
      .join("");
  }

  const openTag = (el) => `<${el.tagName}${renderAttrs(el)}>`;

  function isInlineNode(node) {
    if (isText(node)) return true;
    return isElement(node) && INLINE_TAGS.has(node.tagName) && children(node).every(isInlineNode);
  }

  // Adjacent text nodes are merged so whitespace collapses the same way after a re-parse.
  function mergeTexts(nodes) {
    const merged = [];
    for (const node of nodes) {
      const last = merged.at(-1);
      if (isText(node) && isText(last)) merged[merged.length - 1] = { nodeName: "#text", value: last.value + node.value };
      else merged.push(node);
    }
    return merged;
  }

  function renderInline(node) {
    if (isText(node)) return escapeText(collapse(node.value));
    if (VOID_TAGS.has(node.tagName)) return openTag(node);
    return `${openTag(node)}${mergeTexts(children(node)).map(renderInline).join("")}</${node.tagName}>`;
  }

  const renderRun = (nodes) => mergeTexts(nodes).map(renderInline).join("").replace(/^ +| +$/g, "");

  function renderPreserved(node) {
    if (isText(node)) return escapeText(node.value);
    if (isComment(node)) return `<!--${node.data}-->`;
    if (VOID_TAGS.has(node.tagName)) return openTag(node);
    return `${openTag(node)}${children(node).map(renderPreserved).join("")}</${node.tagName}>`;
  }

  function renderNode(node, depth, lines) {
    const indent = indentUnit.repeat(depth);
    if (isComment(node)) {
      lines.push(`${indent}<!--${node.data}-->`);
      return;
    }
    if (node.nodeName === "#documentType") {
      lines.push(`<!DOCTYPE ${node.name || "html"}>`);
      return;
    }
    if (!isElement(node)) return;

    const tag = node.tagName;
    const open = openTag(node);
    const close = `</${tag}>`;
    const kids = children(node);

    if (VOID_TAGS.has(tag)) {
      lines.push(indent + open);
    } else if (RAW_TEXT_TAGS.has(tag)) {
      lines.push(`${indent}${open}${kids.map((k) => k.value ?? "").join("")}${close}`);
    } else if (PRESERVE_TAGS.has(tag)) {
      const content = kids.map(renderPreserved).join("");
      // The HTML parser drops one leading newline inside <pre>/<textarea>, so keep it stable.
      lines.push(`${indent}${open}${content.startsWith("\n") ? "\n" : ""}${content}${close}`);
    } else if (kids.every(isInlineNode)) {
      lines.push(`${indent}${open}${renderRun(kids)}${close}`);
    } else {
      lines.push(indent + open);
      renderBlockChildren(kids, depth + 1, lines);
      lines.push(indent + close);
    }
  }

  function renderBlockChildren(nodes, depth, lines) {
    let run = [];
    const flush = () => {
      const text = renderRun(run);
      if (text) lines.push(indentUnit.repeat(depth) + text);
      run = [];
    };
    for (const node of nodes) {
      if (isInlineNode(node)) {
        run.push(node);
      } else {
        flush();
        renderNode(node, depth, lines);
      }
    }
    flush();
  }

  return function format(root) {
    const lines = [];
    renderBlockChildren(children(root), 0, lines);
    return `${lines.join("\n")}\n`;
  };
}
