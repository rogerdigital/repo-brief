/**
 * Renders a unified diff (git-style header + @@ hunks + context/removed/added
 * lines) between two string contents. Zero dependencies; uses LCS.
 */
export function renderDiff(
  relPath: string,
  originalContent: string,
  patchedContent: string,
): string {
  const a = originalContent.split("\n");
  const b = patchedContent.split("\n");

  const m = a.length;
  const n = b.length;

  // LCS DP table (m+1 x n+1). For small files this is fine.
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Walk forward producing op list.
  type Op = { kind: "eq" | "del" | "add"; line: string };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ kind: "eq", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: "del", line: a[i] });
      i++;
    } else {
      ops.push({ kind: "add", line: b[j] });
      j++;
    }
  }
  while (i < m) {
    ops.push({ kind: "del", line: a[i] });
    i++;
  }
  while (j < n) {
    ops.push({ kind: "add", line: b[j] });
    j++;
  }

  const CONTEXT = 3;
  const changeIndices: number[] = [];
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].kind !== "eq") changeIndices.push(k);
  }
  if (changeIndices.length === 0) return "";

  const hunkStart = Math.max(0, changeIndices[0] - CONTEXT);
  const hunkEnd = Math.min(ops.length - 1, changeIndices[changeIndices.length - 1] + CONTEXT);

  const lines: string[] = [];
  lines.push(`--- a/${relPath}`);
  lines.push(`+++ b/${relPath}`);

  let oldStart = 0;
  let oldCount = 0;
  let newStart = 0;
  let newCount = 0;
  let oldLine = 1;
  let newLine = 1;
  for (let k = 0; k < ops.length; k++) {
    if (k === hunkStart) {
      oldStart = oldLine;
      newStart = newLine;
    }
    if (k >= hunkStart && k <= hunkEnd) {
      if (ops[k].kind === "eq") {
        oldLine++;
        newLine++;
        oldCount++;
        newCount++;
      } else if (ops[k].kind === "del") {
        oldLine++;
        oldCount++;
      } else {
        newLine++;
        newCount++;
      }
    } else {
      if (ops[k].kind === "eq") {
        oldLine++;
        newLine++;
      } else if (ops[k].kind === "del") {
        oldLine++;
      } else {
        newLine++;
      }
    }
  }

  lines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);

  for (let k = hunkStart; k <= hunkEnd; k++) {
    const op = ops[k];
    if (op.kind === "eq") lines.push(` ${op.line}`);
    else if (op.kind === "del") lines.push(`-${op.line}`);
    else lines.push(`+${op.line}`);
  }

  return lines.join("\n");
}
