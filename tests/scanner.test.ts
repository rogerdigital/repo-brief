import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { scanRepository } from "../src/scanner.js";

async function createRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-brief-"));
  await Promise.all(
    Object.entries(files).map(([path, content]) =>
      writeFile(join(root, path), content, "utf8"),
    ),
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
});
