import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { scanRepository } from "../scanner.js";
import { runFixers } from "./fixers.js";
import { renderDiffs, applyFixes } from "./apply.js";
import type { CliIo, Fix, FixCommandOptions, FixerContext } from "./types.js";

async function safeRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Pre-reads all files that fixers might touch into two Maps: `original`
 * (immutable snapshot for clean diffs) and `current` (mutated by fixers for
 * chain-patching). Both start with the same content.
 */
async function loadFiles(root: string): Promise<{
  original: Map<string, string>;
  current: Map<string, string>;
}> {
  const current = new Map<string, string>();
  const original = new Map<string, string>();

  const topFiles = ["package.json", "README.md"];
  for (const candidate of topFiles) {
    const abs = join(root, candidate);
    const content = await safeRead(abs);
    if (content !== null) {
      current.set(abs, content);
      original.set(abs, content);
    }
  }

  const workflowsDir = join(root, ".github", "workflows");
  let entries: string[];
  try {
    entries = await readdir(workflowsDir);
  } catch {
    entries = [];
  }
  for (const entry of entries.filter(
    (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
  )) {
    const wfPath = join(workflowsDir, entry);
    const content = await safeRead(wfPath);
    if (content !== null) {
      current.set(wfPath, content);
      original.set(wfPath, content);
    }
  }

  return { original, current };
}

/**
 * Orchestrates the fix command: scan → run fixers (chain-patching a shared
 * fileContents map) → collapse to one Fix per file using the original snapshot
 * → print diffs (dry-run) or write (apply).
 */
export async function runFixCommand(
  root: string,
  options: FixCommandOptions,
  io: CliIo,
): Promise<number> {
  const brief = await scanRepository(root);
  const { original, current } = await loadFiles(root);

  const ctx: FixerContext = { brief, files: current, root };
  const rawFixes = runFixers(ctx);

  // Collapse chain-patched files into one Fix per file, using the original
  // snapshot so diffs show the full before→after.
  const fixesByFile = new Map<string, Fix>();
  for (const fix of rawFixes) {
    const existing = fixesByFile.get(fix.filePath);
    if (existing) {
      fixesByFile.set(fix.filePath, {
        ...existing,
        note: `${existing.note} / ${fix.note}`,
        patchedContent: fix.patchedContent,
      });
    } else {
      fixesByFile.set(fix.filePath, {
        ...fix,
        originalContent: original.get(fix.filePath) ?? fix.originalContent,
      });
    }
  }
  const fixes = [...fixesByFile.values()];

  if (fixes.length === 0) {
    io.stdout("No fixes needed. Your repo looks clean.");
    return 0;
  }

  if (!options.apply) {
    io.stdout(renderDiffs(fixes));
    io.stdout("");
    io.stdout("Dry-run: no files changed. Run with --apply to write.");
    return 0;
  }

  const summary = await applyFixes(fixes);
  io.stdout(
    `Applied ${summary.applied} fix(es) to ${summary.files.length} file(s): ${summary.files.join(", ")}`,
  );
  io.stdout("Review with: git diff");
  io.stdout("Rollback with: git checkout -- <file>");
  return 0;
}
