import { writeFile } from "node:fs/promises";
import type { ApplySummary, Fix } from "./types.js";
import { renderDiff } from "./diff.js";

/**
 * Renders the fix list as labeled diff blocks for dry-run display.
 */
export function renderDiffs(fixes: Fix[]): string {
  return fixes
    .map((fix) => {
      const diff = renderDiff(
        fix.relPath,
        fix.originalContent,
        fix.patchedContent,
      );
      if (!diff) return "";
      return [
        `[${fix.certainty}] ${fix.relPath}`,
        `  reason: ${fix.note}`,
        diff,
      ].join("\n");
    })
    .filter((s) => s !== "")
    .join("\n\n");
}

/**
 * Writes each fix's patchedContent to disk. Returns a summary of what changed.
 */
export async function applyFixes(fixes: Fix[]): Promise<ApplySummary> {
  for (const fix of fixes) {
    await writeFile(fix.filePath, fix.patchedContent, "utf8");
  }
  return {
    applied: fixes.length,
    files: fixes.map((f) => f.relPath),
  };
}
