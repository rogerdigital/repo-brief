import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFixCommand } from "../../src/fix/index.js";

let root: string;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "fix-e2e-"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "x",
        packageManager: "npm@9.0.0",
        scripts: { build: "tsc" },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(join(root, "pnpm-lock.yaml"), "", "utf8");
  await writeFile(
    join(root, "README.md"),
    "# Project\n\nnpm run build\nnpm test\n",
    "utf8",
  );
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("runFixCommand", () => {
  test("dry-run prints diffs without writing files", async () => {
    const lines: string[] = [];
    const exitCode = await runFixCommand(
      root,
      { apply: false },
      { stdout: (l) => lines.push(l), stderr: () => {} },
    );

    assert.equal(exitCode, 0);
    const out = lines.join("\n");
    assert.match(out, /\[deterministic\] README\.md/);
    assert.match(out, /\[deterministic\] package\.json/);

    const pkg = await readFile(join(root, "package.json"), "utf8");
    assert.match(pkg, /"packageManager": "npm@9\.0\.0"/);
  });

  test("apply writes files and prints summary", async () => {
    const lines: string[] = [];
    const exitCode = await runFixCommand(
      root,
      { apply: true },
      { stdout: (l) => lines.push(l), stderr: () => {} },
    );

    assert.equal(exitCode, 0);
    const out = lines.join("\n");
    assert.match(out, /Applied \d+ fix\(es\)/);

    const pkg = await readFile(join(root, "package.json"), "utf8");
    assert.match(pkg, /"packageManager": "pnpm@9\.0\.0"/);
    const readme = await readFile(join(root, "README.md"), "utf8");
    assert.match(readme, /pnpm build/);
  });

  test("clean repo prints clean message", async () => {
    const clean = await mkdtemp(join(tmpdir(), "fix-clean-"));
    try {
      await writeFile(
        join(clean, "package.json"),
        JSON.stringify({ name: "c", scripts: { build: "tsc", test: "vitest" } }),
        "utf8",
      );
      const lines: string[] = [];
      const exitCode = await runFixCommand(
        clean,
        { apply: false },
        { stdout: (l) => lines.push(l), stderr: () => {} },
      );
      assert.equal(exitCode, 0);
      assert.match(lines.join("\n"), /No fixes needed/i);
    } finally {
      await rm(clean, { recursive: true, force: true });
    }
  });
});
