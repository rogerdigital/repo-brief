import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { scanRepository } from "../scanner.js";
import type { RepositoryBrief } from "../types.js";
import { TOOL_DEFINITIONS, executeTool, type RefreshFn } from "./tools.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_NAME = "repo-brief";
// NOTE: SERVER_VERSION must match package.json "version". Kept in sync by the
// version-consistency test (tests/mcp.test.ts). A hardcoded constant is used
// instead of runtime package.json reading because import.meta.url resolution
// is unreliable under `node --test`.
const SERVER_VERSION = "0.5.0";

export interface McpServerOptions {
  stdin?: Readable;
  stdout?: Writable;
}

function makeError(
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function makeResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

/**
 * Runs the MCP server over stdio (JSON-RPC 2.0, newline-delimited).
 * Scans `cwd` once at startup and caches the result; the `refresh` tool rescans.
 */
export async function runMcpServer(
  cwd: string,
  options: McpServerOptions = {},
): Promise<number> {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;

  let cache: RepositoryBrief;
  try {
    cache = await scanRepository(cwd);
  } catch (error) {
    process.stderr.write(
      `repo-brief mcp: startup scan failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }

  const refresh: RefreshFn = async (root) => {
    cache = await scanRepository(root);
    return cache;
  };

  const write = (response: JsonRpcResponse): void => {
    stdout.write(JSON.stringify(response) + "\n");
  };

  const handleRequest = async (request: JsonRpcRequest): Promise<void> => {
    const id = request.id ?? null;

    switch (request.method) {
      case "initialize":
        write(
          makeResult(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          }),
        );
        return;

      case "tools/list":
        write(makeResult(id, { tools: TOOL_DEFINITIONS }));
        return;

      case "tools/call": {
        const toolName = request.params?.name ?? "";
        const outcome = executeTool(toolName, cache, refresh);

        if (outcome.error) {
          write(makeError(id, outcome.error.code, outcome.error.message));
          return;
        }

        // If the tool is `refresh`, await the rescan and build the payload
        // from the freshly scanned brief.
        if (outcome.refreshPromise) {
          try {
            const fresh = await outcome.refreshPromise;
            const payload = { scannedAt: fresh.generatedAt, root: fresh.root };
            write(
              makeResult(id, {
                content: [{ type: "text", text: JSON.stringify(payload) }],
              }),
            );
          } catch (error) {
            write(
              makeError(
                id,
                -32603,
                `refresh failed: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
          }
          return;
        }

        write(
          makeResult(id, {
            content: [{ type: "text", text: JSON.stringify(outcome.payload) }],
          }),
        );
        return;
      }

      default:
        write(makeError(id, -32601, `Method not found: ${request.method}`));
    }
  };

  const rl = createInterface({ input: stdin, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim() === "") continue;

    let parsed: JsonRpcRequest;
    try {
      parsed = JSON.parse(line) as JsonRpcRequest;
    } catch {
      write(makeError(null, -32700, "Parse error"));
      continue;
    }

    await handleRequest(parsed);
  }

  return 0;
}
