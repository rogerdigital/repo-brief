import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderDiff } from "../../src/fix/diff.js";

describe("renderDiff", () => {
  test("identical content produces no diff body", () => {
    const content = "line one\nline two\n";
    const result = renderDiff("file.txt", content, content);
    assert.equal(result, "");
  });

  test("single line change produces a hunk with - and + lines", () => {
    const original = "alpha\nbeta\ngamma\n";
    const patched = "alpha\nBETA\ngamma\n";
    const result = renderDiff("file.txt", original, patched);

    assert.match(result, /^--- a\/file\.txt$/m);
    assert.match(result, /^\+\+\+ b\/file\.txt$/m);
    assert.match(result, /^@@ /m);
    assert.match(result, /^-beta$/m);
    assert.match(result, /^\+BETA$/m);
    assert.match(result, /^ alpha$/m);
  });

  test("added line appears as + only", () => {
    const original = "a\nb\n";
    const patched = "a\nb\nc\n";
    const result = renderDiff("f", original, patched);

    assert.match(result, /^\+c$/m);
    assert.doesNotMatch(result, /^-c$/m);
  });

  test("removed line appears as - only", () => {
    const original = "a\nb\nc\n";
    const patched = "a\nc\n";
    const result = renderDiff("f", original, patched);

    assert.match(result, /^-b$/m);
    assert.doesNotMatch(result, /^\+b$/m);
  });

  test("empty original with added content shows all lines as +", () => {
    const result = renderDiff("f", "", "x\ny\n");
    assert.match(result, /^\+x$/m);
    assert.match(result, /^\+y$/m);
  });

  test("distant changes render as separate hunks", () => {
    const original = [
      "a1",
      "a2",
      "a3",
      "a4",
      "a5",
      "a6",
      "a7",
      "a8",
      "a9",
      "a10",
    ].join("\n");
    const patched = [
      "A1",
      "a2",
      "a3",
      "a4",
      "a5",
      "a6",
      "a7",
      "a8",
      "a9",
      "A10",
    ].join("\n");

    const result = renderDiff("file.txt", original, patched);

    assert.equal(result.match(/^@@ /gm)?.length, 2);
  });
});
