// Minimal LCS-based line diff producing unified-diff hunks.

function lcsTable(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  return { table, cols };
}

/** Returns a list of edit operations: { type: " " | "-" | "+", line, oldLine, newLine }. */
export function diffLines(oldText, newText) {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const { table, cols } = lcsTable(a, b);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ type: " ", line: a[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      ops.push({ type: "-", line: a[i], oldLine: i + 1, newLine: j + 1 });
      i++;
    } else {
      ops.push({ type: "+", line: b[j], oldLine: i + 1, newLine: j + 1 });
      j++;
    }
  }
  for (; i < a.length; i++) ops.push({ type: "-", line: a[i], oldLine: i + 1, newLine: j + 1 });
  for (; j < b.length; j++) ops.push({ type: "+", line: b[j], oldLine: i + 1, newLine: j + 1 });
  return ops;
}

/** Groups changes into hunks with `context` unchanged lines around them. */
export function diffHunks(oldText, newText, context = 3) {
  const ops = diffLines(oldText, newText);
  const changed = ops.map((op, index) => (op.type === " " ? -1 : index)).filter((i) => i !== -1);
  const hunks = [];
  for (const index of changed) {
    const last = hunks.at(-1);
    if (last && index - last.end - 1 <= context * 2) last.end = index;
    else hunks.push({ start: index, end: index });
  }
  return hunks.map(({ start, end }) => {
    const from = Math.max(0, start - context);
    const to = Math.min(ops.length - 1, end + context);
    const slice = ops.slice(from, to + 1);
    const removed = slice.filter((op) => op.type === "-").map((op) => op.line);
    const added = slice.filter((op) => op.type === "+").map((op) => op.line);
    return {
      oldStart: slice[0].oldLine,
      oldLines: slice.filter((op) => op.type !== "+").length,
      newStart: slice[0].newLine,
      newLines: slice.filter((op) => op.type !== "-").length,
      firstChangedOldLine: ops[start].oldLine,
      lastChangedOldLine: ops[end].oldLine,
      removed,
      added,
      lines: slice.map((op) => op.type + op.line),
    };
  });
}

export function unifiedDiff(oldText, newText, fileName = "form.html") {
  const hunks = diffHunks(oldText, newText);
  if (hunks.length === 0) return "";
  const body = hunks.flatMap((h) => [
    `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
    ...h.lines,
  ]);
  return [`--- a/${fileName}`, `+++ b/${fileName}`, ...body].join("\n") + "\n";
}
