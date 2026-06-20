import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDiffs, applyFixes } from "../../src/fix/apply.js";
import type { Fix } from "../../src/fix/types.js";

function makeFix(opts: Partial<Fix> & { filePath: string; relPath: string }): Fix {
  return {
    certainty: "deterministic",
    note: "some note",
    originalContent: "a\nb\n",
    patchedContent: "a\nB\n",
    ...opts,
  };
}

describe("renderDiffs", () => {
  test("deterministic fix includes [deterministic] label and diff", () => {
    const fix = makeFix({ filePath: "/p/f", relPath: "f" });
    const out = renderDiffs([fix]);
    assert.match(out, /\[deterministic\] f/);
    assert.match(out, /reason: some note/);
    assert.match(out, /^--- a\/f$/m);
    assert.match(out, /^-b$/m);
    assert.match(out, /^\+B$/m);
  });

  test("assumed-standard fix includes [assumed-standard] label", () => {
    const fix = makeFix({
      filePath: "/p/f",
      relPath: "f",
      certainty: "assumed-standard",
    });
    const out = renderDiffs([fix]);
    assert.match(out, /\[assumed-standard\] f/);
  });

  test("empty list produces empty string", () => {
    assert.equal(renderDiffs([]), "");
  });
});

describe("applyFixes", () => {
  test("writes patched content and returns summary", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fix-apply-"));
    try {
      const target = join(dir, "f.txt");
      await writeFile(target, "a\nb\n", "utf8");
      const fix = makeFix({ filePath: target, relPath: "f.txt" });

      const summary = await applyFixes([fix]);
      assert.equal(summary.applied, 1);
      assert.deepEqual(summary.files, ["f.txt"]);

      const written = await readFile(target, "utf8");
      assert.equal(written, "a\nB\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
