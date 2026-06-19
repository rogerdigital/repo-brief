import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  fixPackageManagerField,
  fixReadmePackageManagerCommands,
  fixCiPackageManagerCommands,
  fixMissingStandardScripts,
} from "../../src/fix/fixers.js";
import type { FixerContext } from "../../src/fix/types.js";
import type { RepositoryBrief } from "../../src/types.js";

function makePmCtx(opts: {
  notes?: string[];
  packageJson?: string;
}): FixerContext {
  const packageJson =
    opts.packageJson ??
    JSON.stringify(
      { name: "x", packageManager: "pnpm@9.10.0", scripts: { build: "tsc" } },
      null,
      2,
    );
  const files = new Map<string, string>([["<root>/package.json", packageJson]]);
  const brief: RepositoryBrief = {
    root: "<root>",
    packageManager: "npm",
    frameworks: [],
    commands: [],
    readinessNotes: opts.notes ?? [],
    structure: { directories: [], ciWorkflows: [] },
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
  return { brief, files, root: "<root>" };
}

describe("fixPackageManagerField", () => {
  test("patches packageManager field when note present, preserving version", () => {
    const ctx = makePmCtx({
      notes: ["packageManager field declares pnpm, but lockfile suggests npm."],
    });

    const fixes = fixPackageManagerField(ctx);

    assert.equal(fixes.length, 1);
    assert.equal(fixes[0].certainty, "deterministic");
    assert.match(fixes[0].patchedContent, /"packageManager": "npm@9\.10\.0"/);
    assert.doesNotMatch(fixes[0].patchedContent, /pnpm@/);
    assert.match(fixes[0].patchedContent, /"name": "x"/);
  });

  test("produces no fix when note absent", () => {
    const ctx = makePmCtx({ notes: [] });
    const fixes = fixPackageManagerField(ctx);
    assert.equal(fixes.length, 0);
  });

  test("patches even when field has no @version", () => {
    const ctx = makePmCtx({
      notes: ["packageManager field declares pnpm, but lockfile suggests npm."],
      packageJson:
        '{\n  "name": "x",\n  "packageManager": "pnpm"\n}\n',
    });
    const fixes = fixPackageManagerField(ctx);
    assert.equal(fixes.length, 1);
    assert.match(fixes[0].patchedContent, /"packageManager": "npm"/);
  });

  test("produces no fix when packageManager field absent", () => {
    const ctx = makePmCtx({
      notes: ["packageManager field declares pnpm, but lockfile suggests npm."],
      packageJson: JSON.stringify({ name: "x" }),
    });
    const fixes = fixPackageManagerField(ctx);
    assert.equal(fixes.length, 0);
  });
});

function makeReadmeCtx(opts: {
  note?: string;
  readme?: string;
  target?: string;
}): FixerContext {
  const readme =
    opts.readme ??
    "# Project\n\nInstall deps:\n\nnpm install\n\nBuild:\n\nnpm run build\nnpm test\n";
  const files = new Map<string, string>([["<root>/README.md", readme]]);
  const brief: RepositoryBrief = {
    root: "<root>",
    packageManager: (opts.target ?? "pnpm") as RepositoryBrief["packageManager"],
    frameworks: [],
    commands: [],
    readinessNotes: opts.note ? [opts.note] : [],
    structure: { directories: [], ciWorkflows: [] },
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
  return { brief, files, root: "<root>" };
}

describe("fixReadmePackageManagerCommands", () => {
  test("replaces npm script commands with pnpm equivalents", () => {
    const ctx = makeReadmeCtx({
      note: "README mentions npm commands, but pnpm-lock.yaml suggests pnpm.",
    });

    const fixes = fixReadmePackageManagerCommands(ctx);

    assert.equal(fixes.length, 1);
    assert.match(fixes[0].patchedContent, /pnpm build/);
    assert.match(fixes[0].patchedContent, /pnpm test/);
    assert.doesNotMatch(fixes[0].patchedContent, /npm run build/);
    assert.match(fixes[0].patchedContent, /npm install/);
  });

  test("produces no fix when note absent", () => {
    const ctx = makeReadmeCtx({});
    const fixes = fixReadmePackageManagerCommands(ctx);
    assert.equal(fixes.length, 0);
  });

  test("replaces yarn commands when target is npm", () => {
    const ctx = makeReadmeCtx({
      note: "README mentions yarn commands, but package-lock.json suggests npm.",
      readme: "yarn build\nyarn test\n",
      target: "npm",
    });

    const fixes = fixReadmePackageManagerCommands(ctx);

    assert.equal(fixes.length, 1);
    assert.match(fixes[0].patchedContent, /npm run build/);
    assert.match(fixes[0].patchedContent, /npm test/);
  });
});

describe("fixCiPackageManagerCommands", () => {
  test("patches run: lines in workflow files", () => {
    const files = new Map<string, string>([
      [
        "<root>/.github/workflows/ci.yml",
        "name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run build\n      - run: npm test\n      - uses: actions/checkout@v4\n",
      ],
    ]);
    const brief: RepositoryBrief = {
      root: "<root>",
      packageManager: "pnpm",
      frameworks: [],
      commands: [],
      readinessNotes: ["GitHub Actions uses npm, but lockfile suggests pnpm."],
      structure: {
        directories: [],
        ciWorkflows: [".github/workflows/ci.yml"],
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    };
    const ctx: FixerContext = { brief, files, root: "<root>" };

    const fixes = fixCiPackageManagerCommands(ctx);

    assert.equal(fixes.length, 1);
    assert.match(fixes[0].patchedContent, /- run: pnpm build/);
    assert.match(fixes[0].patchedContent, /- run: pnpm test/);
    assert.match(fixes[0].patchedContent, /uses: actions\/checkout/);
    assert.doesNotMatch(fixes[0].patchedContent, /pnpm checkout/);
  });

  test("produces no fix when note absent", () => {
    const files = new Map<string, string>([
      ["<root>/.github/workflows/ci.yml", "- run: npm test\n"],
    ]);
    const brief: RepositoryBrief = {
      root: "<root>",
      packageManager: "pnpm",
      frameworks: [],
      commands: [],
      readinessNotes: [],
      structure: { directories: [], ciWorkflows: [".github/workflows/ci.yml"] },
      generatedAt: "2026-01-01T00:00:00.000Z",
    };
    const ctx: FixerContext = { brief, files, root: "<root>" };

    const fixes = fixCiPackageManagerCommands(ctx);
    assert.equal(fixes.length, 0);
  });
});

function makeScriptsCtx(opts: {
  notes?: string[];
  packageJson?: string;
}): FixerContext {
  const packageJson =
    opts.packageJson ??
    JSON.stringify(
      { name: "x", scripts: { build: "tsc", test: "node --test" } },
      null,
      2,
    );
  const files = new Map<string, string>([["<root>/package.json", packageJson]]);
  const brief: RepositoryBrief = {
    root: "<root>",
    packageManager: "npm",
    frameworks: [],
    commands: [],
    readinessNotes: opts.notes ?? [],
    structure: { directories: [], ciWorkflows: [] },
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
  return { brief, files, root: "<root>" };
}

describe("fixMissingStandardScripts", () => {
  test("adds lint script when eslint note present", () => {
    const ctx = makeScriptsCtx({
      notes: [
        "ESLint config found but no lint script in package.json. Consider adding one.",
      ],
    });
    const fixes = fixMissingStandardScripts(ctx);

    assert.equal(fixes.length, 1);
    assert.equal(fixes[0].certainty, "assumed-standard");
    assert.match(fixes[0].patchedContent, /"lint": "eslint \."/);
  });

  test("adds typecheck script when tsconfig note present", () => {
    const ctx = makeScriptsCtx({
      notes: [
        "tsconfig.json found but no typecheck script in package.json. Consider adding one.",
      ],
    });
    const fixes = fixMissingStandardScripts(ctx);

    assert.equal(fixes.length, 1);
    assert.match(fixes[0].patchedContent, /"typecheck": "tsc --noEmit"/);
  });

  test("produces no fix when script already present", () => {
    const ctx = makeScriptsCtx({
      notes: [
        "ESLint config found but no lint script in package.json. Consider adding one.",
      ],
      packageJson: JSON.stringify(
        { name: "x", scripts: { build: "tsc", lint: "eslint ." } },
        null,
        2,
      ),
    });
    const fixes = fixMissingStandardScripts(ctx);
    assert.equal(fixes.length, 0);
  });

  test("produces no fix when notes absent", () => {
    const ctx = makeScriptsCtx({ notes: [] });
    const fixes = fixMissingStandardScripts(ctx);
    assert.equal(fixes.length, 0);
  });
});
