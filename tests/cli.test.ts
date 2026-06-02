import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { runCli } from "../src/cli.js";

describe("runCli", () => {
  test("defaults to brief mode and prints generated files without writing in dry run", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-brief-cli-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest run" } }, null, 2),
      "utf8",
    );

    const lines: string[] = [];
    const exitCode = await runCli(["--dry-run", "--cwd", root], {
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });

    const output = lines.join("\n");
    assert.equal(exitCode, 0);
    assert.match(output, /RepoBrief scanned your codebase\./);
    assert.match(output, /Would generate:/);
    assert.match(output, /AGENTS\.md/);
  });

  test("doctor lists readiness notes and writes no files", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-brief-cli-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest run" } }, null, 2),
      "utf8",
    );

    const lines: string[] = [];
    const exitCode = await runCli(["doctor", "--cwd", root], {
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });

    const output = lines.join("\n");
    assert.equal(exitCode, 0);
    assert.match(output, /Agent readiness notes:/);
    // doctor should not list generated files
    assert.equal(output.includes("Would generate:"), false);
    assert.equal(output.includes("Generated:"), false);
  });

  test("fix --dry-run lists files it would generate", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-brief-cli-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ scripts: { build: "tsc" } }, null, 2),
      "utf8",
    );

    const lines: string[] = [];
    const exitCode = await runCli(["fix", "--dry-run", "--cwd", root], {
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });

    const output = lines.join("\n");
    assert.equal(exitCode, 0);
    assert.match(output, /Fix mode is intentionally conservative in v0\.1\./);
    assert.match(output, /Would generate:/);
    assert.match(output, /AGENTS\.md/);
  });

  test("ignores a bare argument separator from package manager scripts", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-brief-cli-"));
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: {} }), "utf8");

    const lines: string[] = [];
    const exitCode = await runCli(["--", "--dry-run", "--cwd", root], {
      stdout: (line: string) => lines.push(line),
      stderr: (line: string) => lines.push(line),
    });

    assert.equal(exitCode, 0);
    assert.match(lines.join("\n"), /RepoBrief scanned your codebase\./);
  });
});
