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

  test("reports README mismatch for yarn", async () => {
    const root = await createRepo({
      "yarn.lock": "",
      "package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
      "README.md": "Run `npm test` before opening a PR.\n",
    });

    const result = await scanRepository(root);

    assert.ok(result.readinessNotes.includes(
      "README mentions npm commands, but yarn.lock suggests yarn.",
    ));
  });

  test("reports README mismatch for bun", async () => {
    const root = await createRepo({
      "bun.lock": "",
      "package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
      "README.md": "Run `npm test` before opening a PR.\n",
    });

    const result = await scanRepository(root);

    assert.ok(result.readinessNotes.includes(
      "README mentions npm commands, but bun.lock suggests bun.",
    ));
  });

  test("reports README mismatch when npm detected but pnpm referenced", async () => {
    const root = await createRepo({
      "package-lock.json": "",
      "package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
      "README.md": "Run `pnpm test` before opening a PR.\n",
    });

    const result = await scanRepository(root);

    assert.ok(result.readinessNotes.includes(
      "README mentions pnpm commands, but package-lock.json suggests npm.",
    ));
  });

  test("reports README mismatch when npm detected but yarn referenced", async () => {
    const root = await createRepo({
      "package-lock.json": "",
      "package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
      "README.md": "Run `yarn test` before opening a PR.\n",
    });

    const result = await scanRepository(root);

    assert.ok(result.readinessNotes.includes(
      "README mentions yarn commands, but package-lock.json suggests npm.",
    ));
  });

  test("reports README scripts that are not defined in package.json", async () => {
    const root = await createRepo({
      "pnpm-lock.yaml": "",
      "package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
      "README.md": [
        "# Demo",
        "",
        "Run `pnpm test` before opening a PR.",
        "Run `pnpm verify` before publishing.",
      ].join("\n"),
    });

    const result = await scanRepository(root);

    assert.ok(result.readinessNotes.includes(
      "README references pnpm verify, but package.json has no verify script.",
    ));
  });

  test("reports packageManager field mismatch with lockfile", async () => {
    const root = await createRepo({
      "pnpm-lock.yaml": "",
      "package.json": JSON.stringify({
        packageManager: "yarn@4.0.0",
        scripts: { test: "vitest run" },
      }),
    });

    const result = await scanRepository(root);

    assert.ok(result.readinessNotes.includes(
      "packageManager field declares yarn, but lockfile suggests pnpm.",
    ));
  });

  test("does not report mismatch when packageManager field matches lockfile", async () => {
    const root = await createRepo({
      "pnpm-lock.yaml": "",
      "package.json": JSON.stringify({
        packageManager: "pnpm@9.0.0",
        scripts: { test: "vitest run" },
      }),
    });

    const result = await scanRepository(root);

    assert.ok(!result.readinessNotes.some((n) => n.includes("packageManager field")));
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

  test("ignores package manager commands in GitHub Actions", async () => {
    const root = await createRepo({
      "package.json": JSON.stringify({ scripts: { build: "tsc", test: "vitest run", verify: "npm test" } }),
      ".github/workflows/ci.yml": [
        "name: CI",
        "on: [push]",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: pnpm install --frozen-lockfile",
        "      - run: pnpm verify",
      ].join("\n"),
    });

    const result = await scanRepository(root);

    assert.equal(
      result.readinessNotes.some((n) => n.includes("install") && n.includes("package.json has no install script")),
      false,
    );
  });

  test("reports CI package manager mismatch with lockfile", async () => {
    const root = await createRepo({
      "pnpm-lock.yaml": "",
      "package.json": JSON.stringify({ scripts: { build: "tsc", test: "vitest run" } }),
      ".github/workflows/ci.yml": [
        "name: CI",
        "on: [push]",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: npm run build",
        "      - run: npm run test",
      ].join("\n"),
    });

    const result = await scanRepository(root);

    assert.ok(result.readinessNotes.some((n) =>
      n.includes("GitHub Actions uses npm") && n.includes("lockfile suggests pnpm"),
    ));
  });

  test("does not report CI mismatch when package managers match", async () => {
    const root = await createRepo({
      "pnpm-lock.yaml": "",
      "package.json": JSON.stringify({ scripts: { build: "tsc", test: "vitest run" } }),
      ".github/workflows/ci.yml": [
        "name: CI",
        "on: [push]",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: pnpm build",
        "      - run: pnpm test",
      ].join("\n"),
    });

    const result = await scanRepository(root);

    assert.ok(!result.readinessNotes.some((n) => n.includes("GitHub Actions uses")));
  });

  test("suggests lint script when ESLint config exists", async () => {
    const root = await createRepo({
      "package.json": JSON.stringify({ scripts: { build: "tsc", test: "vitest run" } }),
      ".eslintrc.json": "{}",
    });

    const result = await scanRepository(root);

    assert.ok(result.readinessNotes.some((n) =>
      n.includes("ESLint config found") && n.includes("no lint script"),
    ));
  });

  test("does not suggest lint script when lint script exists", async () => {
    const root = await createRepo({
      "package.json": JSON.stringify({ scripts: { build: "tsc", test: "vitest run", lint: "eslint ." } }),
      ".eslintrc.json": "{}",
    });

    const result = await scanRepository(root);

    assert.ok(!result.readinessNotes.some((n) => n.includes("ESLint config")));
  });

  test("suggests typecheck script when tsconfig.json exists", async () => {
    const root = await createRepo({
      "package.json": JSON.stringify({ scripts: { build: "tsc", test: "vitest run" } }),
      "tsconfig.json": "{}",
    });

    const result = await scanRepository(root);

    assert.ok(result.readinessNotes.some((n) =>
      n.includes("tsconfig.json found") && n.includes("no typecheck script"),
    ));
  });

  test("does not suggest typecheck when typecheck or check script exists", async () => {
    const root = await createRepo({
      "package.json": JSON.stringify({ scripts: { build: "tsc", test: "vitest run", typecheck: "tsc --noEmit" } }),
      "tsconfig.json": "{}",
    });

    const result = await scanRepository(root);

    assert.ok(!result.readinessNotes.some((n) => n.includes("tsconfig.json found")));
  });

  test("detects common project directories and GitHub workflow files", async () => {
    const root = await createRepo({
      "package.json": JSON.stringify({ scripts: { build: "tsc", test: "node --test" } }),
      "src/index.ts": "export {};",
      "tests/index.test.ts": "import 'node:test';",
      "docs/guide.md": "# Guide",
      ".github/workflows/ci.yml": "name: CI\n",
    });

    const result = await scanRepository(root);

    assert.deepEqual(result.structure.directories, ["src", "tests", "docs"]);
    assert.deepEqual(result.structure.ciWorkflows, [".github/workflows/ci.yml"]);
  });
});
