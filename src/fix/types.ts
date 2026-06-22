import type { RepositoryBrief } from "../types.js";

export type Certainty = "deterministic" | "assumed-standard";

export interface Fix {
  /** Absolute path to the file being patched. */
  filePath: string;
  /** Path relative to repo root, for display. */
  relPath: string;
  certainty: Certainty;
  /** The scanner note that triggered this fix, for the diff "reason" line. */
  note: string;
  originalContent: string;
  patchedContent: string;
}

export type FileContents = Map<string, string>;

export interface FixerContext {
  brief: RepositoryBrief;
  files: FileContents;
  root: string;
}

export type Fixer = (ctx: FixerContext) => Fix[];

export interface ApplySummary {
  applied: number;
  files: string[];
}

export interface FixCommandOptions {
  apply: boolean;
}

// CliIo is shared with the top-level CLI; re-export the canonical definition
// so fix-module consumers import from one place.
export type { CliIo } from "../types.js";
