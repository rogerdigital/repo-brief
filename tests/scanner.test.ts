import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { scanRepository } from "../src/scanner.js";

async function createRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-brief-"));
  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      const fullPath = join(root, path);
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, content, "utf8");
    }),
  );
  return root;
}

describe("scanRepository", () => {
  test("detects pnpm, Next.js, available scripts, and agent readiness notes", async () => {
    const root = await createRepo({
      "pnpm-lock.yaml": "",
      "package.json": JSON.stringify(
        {
          scripts: {
            dev: "next dev",
            build: "next build",
            test: "vitest run",
          },
          dependencies: {
            next: "15.0.0",
            react: "19.0.0",
          },
        },
        null,
        2,
      ),
      "README.md": "# Demo\n\nRun `npm test` before opening a PR.\n",
    });

    const result = await scanRepository(root);

    assert.equal(result.packageManager, "pnpm");
    assert.ok(result.frameworks.includes("Next.js"));
    assert.deepEqual(result.commands, [
      { name: "dev", command: "pnpm dev" },
      { name: "build", command: "pnpm build" },
      { name: "test", command: "pnpm test" },
    ]);
    assert.ok(result.readinessNotes.includes(
      "README mentions npm commands, but pnpm-lock.yaml suggests pnpm.",
    ));
  });

  test("reports multiple lockfiles as a readiness note", async () => {
    const root = await createRepo({
      "pnpm-lock.yaml": "",
      "package-lock.json": "",
      "package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
    });

    const result = await scanRepository(root);

    assert.ok(result.readinessNotes.includes("Multiple package manager lockfiles found."));
  });

  test("reports missing package.json", async () => {
    const root = await createRepo({
      "pnpm-lock.yaml": "",
    });

    const result = await scanRepository(root);

    assert.equal(result.packageManager, "unknown");
    assert.deepEqual(result.commands, []);
    assert.ok(result.readinessNotes.includes("No package.json found."));
  });

  test("reports GitHub Actions script mismatch", async () => {
    const root = await createRepo({
      "package.json": JSON.stringify({ scripts: { build: "tsc", test: "vitest run" } }),
      ".github/workflows/ci.yml": [
        "name: CI",
        "on: [push]",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: pnpm verify",
      ].join("\n"),
    });

    const result = await scanRepository(root);

    assert.ok(
      result.readinessNotes.some((n) =>
        n.includes("verify") && n.includes("package.json has no verify script"),
      ),
    );
  });
});
