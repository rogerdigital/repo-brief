import { scanRepository } from "../scanner.js";
import { VERIFICATION_SCRIPTS } from "../render.js";
import type { RepositoryBrief } from "../types.js";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
  };
}

export const TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: "get_repo_map",
    description:
      "Returns the repository map: root path, package manager, detected frameworks, and shallow structure (directories, CI workflows).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_commands",
    description:
      "Returns detected package scripts and the subset used for verification (test/build/lint/verify).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_readiness_notes",
    description:
      "Returns agent readiness notes — early signals that may confuse humans or coding agents.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "refresh",
    description:
      "Rescans the repository and refreshes the cached brief. Call this after files change so subsequent queries return fresh data.",
    inputSchema: { type: "object", properties: {} },
  },
];

export interface ToolCallOutcome {
  /** Set when the tool name is unknown. */
  error?: { code: number; message: string };
  /** JSON-stringifiable payload returned to the caller. */
  payload?: unknown;
  /** Present only for the `refresh` tool; the caller awaits it and swaps the cache. */
  refreshPromise?: Promise<RepositoryBrief>;
}

export interface RefreshFn {
  (cwd: string): Promise<RepositoryBrief>;
}

/**
 * Synchronous for read tools; returns a `refreshPromise` for the `refresh` tool
 * so the server layer can own the async cache swap in one place.
 */
export function executeTool(
  name: string,
  cache: RepositoryBrief,
  refresh: RefreshFn,
): ToolCallOutcome {
  switch (name) {
    case "get_repo_map":
      return {
        payload: {
          root: cache.root,
          packageManager: cache.packageManager,
          frameworks: cache.frameworks,
          structure: cache.structure,
        },
      };

    case "get_commands": {
      const verification = cache.commands.filter((c) =>
        VERIFICATION_SCRIPTS.includes(c.name),
      );
      return { payload: { commands: cache.commands, verification } };
    }

    case "get_readiness_notes":
      return { payload: { notes: cache.readinessNotes } };

    case "refresh":
      return {
        refreshPromise: refresh(cache.root),
      };

    default:
      return {
        error: {
          code: -32601,
          message: `Unknown tool: ${name}`,
        },
      };
  }
}

export { scanRepository };
