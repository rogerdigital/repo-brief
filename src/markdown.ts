/**
 * Markdown command-context extraction.
 *
 * Package-manager command detection (scanner) and rewriting (fixers) must only
 * look at text the author intended as a command — inline code spans (`...`) and
 * fenced code blocks (``` / ~~~) — never prose. Matching bare prose like
 * "referencing undefined npm/pnpm scripts" produces false-positive readiness
 * notes and unsafe rewrites. This module is the single source of truth for that
 * scoping, shared by the scanner and the fixers.
 */

export interface ManagerCommandMatch {
  /** Full matched command text, e.g. "npm run build". */
  match: string;
  /** Detected package manager, e.g. "npm". */
  manager: string;
  /** Whether the optional "run" keyword was present. */
  hasRun: boolean;
  /** Script/argument name following the manager, e.g. "build" or "install". */
  name: string;
}

/**
 * Matches a package-manager invocation: `<manager> [run] <name>`. Used inside
 * extracted code segments only, so it can stay permissive about spacing.
 */
const MANAGER_COMMAND_RE =
  /\b(npm|pnpm|yarn|bun)(?:\s+(run))?\s+([a-zA-Z0-9:_-]+)\b/g;

/**
 * Extracts substrings that are "command context": the inner text of inline code
 * spans and fenced code blocks. Order is fenced-then-inline; the relative order
 * is not semantically meaningful for callers.
 *
 * Backtick-balanced inline spans: a single backtick opens, the next single
 * backtick closes. A code fence (``` or ~~~) spanning lines is handled first so
 * its delimiters are not mistaken for inline spans.
 */
export function extractCodeSegments(text: string): string[] {
  const segments: string[] = [];

  // Fenced code blocks. Capture the fence marker (``` or ~~~) to require the
  // same marker on close.
  const fenceRe = /(^|\n)([ \t]*(```|~~~)[^\n]*\n)([\s\S]*?)(\n[ \t]*\3)/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    segments.push(m[4]);
  }

  // Inline code spans: `...` on a single line.
  const inlineRe = /`([^`\n]+)`/g;
  while ((m = inlineRe.exec(text)) !== null) {
    segments.push(m[1]);
  }

  return segments;
}

/**
 * Finds all package-manager command invocations across the extracted code
 * segments. De-duplicates nothing — callers decide what to do with matches.
 */
export function matchManagerCommands(segments: string[]): ManagerCommandMatch[] {
  const matches: ManagerCommandMatch[] = [];
  for (const segment of segments) {
    MANAGER_COMMAND_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MANAGER_COMMAND_RE.exec(segment)) !== null) {
      matches.push({
        match: m[0],
        manager: m[1],
        hasRun: m[2] === "run",
        name: m[3],
      });
    }
  }
  return matches;
}

/**
 * Convenience: extract code segments and return their command matches in one
 * call, for read-only detection (scanner).
 */
export function findManagerCommandsInMarkdown(text: string): ManagerCommandMatch[] {
  return matchManagerCommands(extractCodeSegments(text));
}

/**
 * Rewrites package-manager command prefixes inside extracted code segments so
 * every invocation uses `target` as the manager, then stitches the rewritten
 * segments back into the original text. Used by the fixers.

 * Only code-context occurrences are touched: prose is left verbatim. This is
 * the critical safety property — the whole point of command-context scoping.
 *
 * `keepNames` is the set of command names (install/add/remove/exec/dlx/ci) that
 * must not be rewritten regardless of manager.
 */
export function rewriteManagerCommandsInMarkdown(
  text: string,
  target: string,
  keepNames: ReadonlySet<string>,
): string {
  const rewriteSegment = (segment: string): string => {
    MANAGER_COMMAND_RE.lastIndex = 0;
    return segment.replace(
      MANAGER_COMMAND_RE,
      (full, manager: string, _run: string | undefined, name: string) => {
        if (keepNames.has(name)) return full;
        if (manager === target) return full;
        return reformatCommand(target, name);
      },
    );
  };

  // Fenced blocks first (same pattern as extraction), then inline spans.
  // Rewrite inline to preserve the fence delimiters themselves.
  let result = text.replace(
    /(^|\n)([ \t]*(```|~~~)[^\n]*\n)([\s\S]*?)(\n[ \t]*\3)/g,
    (_full, lead: string, open: string, _marker: string, body: string, close: string) =>
      lead + open + rewriteSegment(body) + close,
  );
  result = result.replace(/`([^`\n]+)`/g, (_full, body: string) => `\`${rewriteSegment(body)}\``);
  return result;
}

/**
 * Reformats a command for the target manager, following each manager's
 * conventional form. Mirrors the per-manager rules from the original README/CI
 * fixers: npm uses `npm run <name>` (bare for `test`); pnpm/yarn/bun use the
 * bare `<manager> <name>` form.
 */
function reformatCommand(target: string, name: string): string {
  const bareScripts = new Set(["test"]);
  if (target === "npm") {
    return bareScripts.has(name) ? `npm ${name}` : `npm run ${name}`;
  }
  return `${target} ${name}`;
}
