import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { scanRepository } from "../src/scanner.js";

const fixturesRoot = join(process.cwd(), "examples", "fixtures");

describe("example fixtures", () => {
  test("cover package manager detection across fixture projects", async () => {
    const cases = [
      { fixture: "npm", packageManager: "npm" },
      { fixture: "yarn", packageManager: "yarn" },
      { fixture: "bun", packageManager: "bun" },
    ] as const;

    for (const testCase of cases) {
      const result = await scanRepository(join(fixturesRoot, testCase.fixture));

      assert.equal(result.packageManager, testCase.packageManager);
      assert.ok(result.commands.some((command) => command.name === "test"));
      assert.equal(
        result.readinessNotes.some((note) => note.includes("package manager")),
        false,
      );
    }
  });

  test("covers a repository without package.json", async () => {
    const result = await scanRepository(join(fixturesRoot, "no-package-json"));

    assert.equal(result.packageManager, "unknown");
    assert.deepEqual(result.commands, []);
    assert.ok(result.readinessNotes.includes("No package.json found."));
  });

  test("covers shallow monorepo structure signals", async () => {
    const result = await scanRepository(join(fixturesRoot, "monorepo"));

    assert.equal(result.packageManager, "pnpm");
    assert.ok(result.structure.directories.includes("packages"));
    assert.ok(result.structure.directories.includes("apps"));
    assert.ok(result.structure.ciWorkflows.includes(".github/workflows/ci.yml"));
  });
});
