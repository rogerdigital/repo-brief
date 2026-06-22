import { join } from "node:path";
import type { Fix, Fixer, FixerContext } from "./types.js";

const PACKAGE_MANAGER_COMMANDS = new Set([
  "install",
  "add",
  "remove",
  "exec",
  "dlx",
  "ci",
]);

const BARE_SCRIPTS = ["test"];

/**
 * Patches `packageManager` field value from <declared>@<version> to
 * <lockfileManager>@<version>, preserving version and file formatting.
 */
export const fixPackageManagerField: Fixer = (ctx: FixerContext): Fix[] => {
  const note = ctx.brief.readinessNotes.find((n) =>
    n.startsWith("packageManager field declares "),
  );
  if (!note) return [];

  const declaredMatch = note.match(/declares (\w+)/);
  const lockfileMatch = note.match(/lockfile suggests (\w+)\./);
  if (!declaredMatch || !lockfileMatch) return [];

  const declared = declaredMatch[1];
  const target = lockfileMatch[1];

  const relPath = "package.json";
  const filePath = join(ctx.root, relPath);
  const original = ctx.files.get(filePath);
  if (original === undefined) return [];

  const fieldRe = new RegExp(
    `("packageManager"\\s*:\\s*")${declared}(@[^"]*)?(")`,
  );
  const patched = original.replace(fieldRe, (_m, pre, version, post) => {
    return `${pre}${target}${version ?? ""}${post}`;
  });
  if (patched === original) return [];

  ctx.files.set(filePath, patched);
  return [
    {
      filePath,
      relPath,
      certainty: "deterministic",
      note,
      originalContent: original,
      patchedContent: patched,
    },
  ];
};

/**
 * Rewrites package-manager script command prefixes in `content` so that every
 * script invocation uses `target` as the manager. install/add/remove/exec/dlx/ci
 * are left untouched. Shared by the README and CI fixers.
 */
function rewritePackageManagerCommands(content: string, target: string): string {
  const managerRe =
    /\b(npm|pnpm|yarn|bun)(?:\s+(run))?\s+([a-zA-Z0-9:_-]+)/g;

  return content.replace(
    managerRe,
    (full, manager: string, _run: string | undefined, script: string) => {
      if (PACKAGE_MANAGER_COMMANDS.has(script)) return full;
      if (manager === target) return full;

      if (target === "npm") {
        if (BARE_SCRIPTS.includes(script)) return `npm ${script}`;
        return `npm run ${script}`;
      }
      if (target === "pnpm") {
        return `pnpm ${script}`;
      }
      if (target === "yarn") {
        return `yarn ${script}`;
      }
      if (target === "bun") {
        return `bun ${script}`;
      }
      return full;
    },
  );
}

/**
 * Replaces wrong package-manager command prefixes in README with the target
 * (lockfile) manager. Excludes install/add/etc class commands.
 */
export const fixReadmePackageManagerCommands: Fixer = (ctx: FixerContext): Fix[] => {
  const note = ctx.brief.readinessNotes.find(
    (n) => n.startsWith("README mentions ") && n.includes("commands, but"),
  );
  if (!note) return [];

  const target = ctx.brief.packageManager;
  if (target === "unknown") return [];

  const relPath = "README.md";
  const filePath = join(ctx.root, relPath);
  const original = ctx.files.get(filePath);
  if (original === undefined) return [];

  const patched = rewritePackageManagerCommands(original, target);
  if (patched === original) return [];

  ctx.files.set(filePath, patched);
  return [
    {
      filePath,
      relPath,
      certainty: "deterministic",
      note,
      originalContent: original,
      patchedContent: patched,
    },
  ];
};

/**
 * Rewrites package-manager command prefixes in CI workflow `run:` lines so
 * they match the lockfile manager. Only `run:` steps are touched.
 */
export const fixCiPackageManagerCommands: Fixer = (ctx: FixerContext): Fix[] => {
  const note = ctx.brief.readinessNotes.find(
    (n) =>
      n.startsWith("GitHub Actions uses ") && n.includes(", but lockfile suggests"),
  );
  if (!note) return [];

  const target = ctx.brief.packageManager;
  if (target === "unknown") return [];

  const fixes: Fix[] = [];
  for (const relPath of ctx.brief.structure.ciWorkflows) {
    const filePath = join(ctx.root, relPath);
    const original = ctx.files.get(filePath);
    if (original === undefined) continue;

    const patched = original
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        const runValue =
          trimmed.startsWith("- run:")
            ? trimmed.slice("- run:".length).trim()
            : trimmed.startsWith("run:")
              ? trimmed.slice("run:".length).trim()
              : null;
        if (runValue === null) return line;

        const newRunValue = rewritePackageManagerCommands(runValue, target);
        if (newRunValue === runValue) return line;
        return line.replace(runValue, newRunValue);
      })
      .join("\n");

    if (patched === original) continue;

    ctx.files.set(filePath, patched);
    fixes.push({
      filePath,
      relPath,
      certainty: "deterministic",
      note,
      originalContent: original,
      patchedContent: patched,
    });
  }
  return fixes;
};

/**
 * Inserts `"name": "command"` before the closing `}` of the `scripts` block.
 * Uses regex to preserve file formatting. If no scripts block exists, returns
 * content unchanged (we don't fabricate a block).
 */
function insertScript(content: string, name: string, command: string): string {
  const scriptsBlockRe = /("scripts"\s*:\s*\{)([\s\S]*?)(\})/;
  const match = content.match(scriptsBlockRe);
  if (!match) return content;

  const [, open, body, close] = match;
  const trimmedBody = body.replace(/\s+$/, "");
  const hasExisting = /\S/.test(trimmedBody);
  const indentMatch = body.match(/\n(\s+)\S/);
  const indent = indentMatch ? indentMatch[1] : "  ";
  const newEntry = `${hasExisting ? "," : ""}\n${indent}"${name}": "${command}"\n`;

  const newBody = `${trimmedBody}${newEntry}`;
  return content.replace(scriptsBlockRe, `${open}${newBody}${close}`);
}

/**
 * Inserts conventional lint/typecheck scripts into package.json when the
 * corresponding readiness note fires. Marked `assumed-standard` because the
 * command assumes a default config.
 */
export const fixMissingStandardScripts: Fixer = (ctx: FixerContext): Fix[] => {
  const relPath = "package.json";
  const filePath = join(ctx.root, relPath);
  let current = ctx.files.get(filePath);
  if (current === undefined) return [];

  const hasLintNote = ctx.brief.readinessNotes.some(
    (n) => n.startsWith("ESLint config found") && n.includes("no lint script"),
  );
  const hasTypecheckNote = ctx.brief.readinessNotes.some(
    (n) =>
      n.startsWith("tsconfig.json found") && n.includes("no typecheck script"),
  );

  const insertions: { script: string; command: string; note: string }[] = [];
  if (hasLintNote && !/"lint"\s*:/.test(current)) {
    insertions.push({
      script: "lint",
      command: "eslint .",
      note: "ESLint config found but no lint script in package.json. Consider adding one.",
    });
  }
  if (hasTypecheckNote && !/"typecheck"\s*:/.test(current)) {
    insertions.push({
      script: "typecheck",
      command: "tsc --noEmit",
      note: "tsconfig.json found but no typecheck script in package.json. Consider adding one.",
    });
  }
  if (insertions.length === 0) return [];

  const snapshot = current;
  for (const ins of insertions) {
    current = insertScript(current, ins.script, ins.command);
  }
  ctx.files.set(filePath, current);

  // Emit a single combined Fix for display clarity.
  return [
    {
      filePath,
      relPath,
      certainty: "assumed-standard",
      note:
        insertions.length > 1
          ? insertions.map((i) => i.note).join(" / ")
          : insertions[0].note,
      originalContent: snapshot,
      patchedContent: current,
    },
  ];
};

const ALL_FIXERS: Fixer[] = [
  fixPackageManagerField,
  fixReadmePackageManagerCommands,
  fixCiPackageManagerCommands,
  fixMissingStandardScripts,
];

/**
 * Runs all fixers in order against a shared mutable fileContents map (so
 * later fixers see earlier fixers' patches — chain-patch). Returns the
 * collected Fix list.
 */
export function runFixers(ctx: FixerContext): Fix[] {
  const fixes: Fix[] = [];
  for (const fixer of ALL_FIXERS) {
    fixes.push(...fixer(ctx));
  }
  return fixes;
}
