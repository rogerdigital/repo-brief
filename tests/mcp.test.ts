import { PassThrough } from "node:stream";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { runMcpServer } from "../src/mcp/server.js";

interface CapturedResponse {
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

async function runSession(
  cwd: string,
  lines: string[],
): Promise<CapturedResponse[]> {
  const stdin = new PassThrough();
  const stdout = new PassThrough();

  const serverPromise = runMcpServer(cwd, { stdin, stdout });

  for (const line of lines) {
    stdin.write(line + "\n");
  }
  stdin.end();

  const exitCode = await serverPromise;
  // The server's contract is "return when stdin closes"; it does not close the
  // caller-supplied stdout (closing process.stdout would break production use).
  // Since we own this PassThrough, we end it here so its async iterator yields
  // all buffered data then terminates.
  stdout.end();

  const chunks: Buffer[] = [];
  for await (const chunk of stdout) {
    chunks.push(chunk as Buffer);
  }
  assert.equal(exitCode, 0, "server should exit cleanly");

  const output = Buffer.concat(chunks).toString("utf8");
  return output
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as CapturedResponse);
}

let tempRoot: string;

before(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "repo-brief-mcp-"));
  await writeFile(
    join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "mcp-test-fixture",
        scripts: {
          build: "tsc",
          test: "node --test",
          deploy: "echo deploy",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
});

after(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("MCP server", () => {
  test("initialize returns capabilities and server info", async () => {
    const responses = await runSession(tempRoot, [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    ]);

    assert.equal(responses.length, 1);
    assert.equal(responses[0].id, 1);
    const result = responses[0].result as {
      protocolVersion: string;
      capabilities: { tools: unknown };
      serverInfo: { name: string; version: string };
    };
    assert.equal(result.serverInfo.name, "repo-brief");
    assert.ok(result.capabilities.tools !== undefined);

    // serverInfo.version must match the published package version. Regression
    // guard for the hardcoded-version drift bug. Uses process.cwd() because
    // tests run from the project root.
    const pkgVersion = JSON.parse(
      await readFile(join(process.cwd(), "package.json"), "utf8"),
    ).version;
    assert.equal(
      result.serverInfo.version,
      pkgVersion,
      "MCP serverInfo.version must match package.json version",
    );
  });

  test("tools/list returns all four tools", async () => {
    const responses = await runSession(tempRoot, [
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    ]);

    const result = responses[0].result as { tools: { name: string }[] };
    const names = result.tools.map((t) => t.name);
    assert.deepEqual(names.sort(), [
      "get_commands",
      "get_readiness_notes",
      "get_repo_map",
      "refresh",
    ]);
  });

  test("get_repo_map returns root, packageManager, frameworks, structure", async () => {
    const responses = await runSession(tempRoot, [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_repo_map" },
      }),
    ]);

    const result = responses[0].result as {
      content: { type: string; text: string }[];
    };
    const payload = JSON.parse(result.content[0].text) as {
      root: string;
      packageManager: string;
      frameworks: string[];
      structure: { directories: string[]; ciWorkflows: string[] };
    };
    assert.equal(payload.root, tempRoot);
  });

  test("get_commands returns commands and verification subset", async () => {
    const responses = await runSession(tempRoot, [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "get_commands" },
      }),
    ]);

    const result = responses[0].result as {
      content: { text: string }[];
    };
    const payload = JSON.parse(result.content[0].text) as {
      commands: { name: string }[];
      verification: { name: string }[];
    };
    const names = payload.commands.map((c) => c.name);
    assert.ok(names.includes("build"));
    assert.ok(names.includes("deploy"));

    const verificationNames = payload.verification.map((c) => c.name);
    assert.deepEqual(verificationNames.sort(), ["build", "test"]);
    assert.ok(!verificationNames.includes("deploy"), "deploy is not a verification script");
  });

  test("get_readiness_notes returns notes array", async () => {
    const responses = await runSession(tempRoot, [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "get_readiness_notes" },
      }),
    ]);

    const result = responses[0].result as { content: { text: string }[] };
    const payload = JSON.parse(result.content[0].text) as { notes: string[] };
    assert.ok(Array.isArray(payload.notes));
  });

  test("refresh rescans and returns scannedAt and root", async () => {
    const responses = await runSession(tempRoot, [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "refresh" },
      }),
    ]);

    const result = responses[0].result as { content: { text: string }[] };
    const payload = JSON.parse(result.content[0].text) as {
      scannedAt: string;
      root: string;
    };
    assert.equal(payload.root, tempRoot);
    assert.ok(typeof payload.scannedAt === "string");
  });

  test("unknown tool returns JSON-RPC error -32601", async () => {
    const responses = await runSession(tempRoot, [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "nonexistent_tool" },
      }),
    ]);

    assert.equal(responses[0].id, 7);
    assert.equal(responses[0].error?.code, -32601);
  });

  test("malformed JSON line returns parse error -32700", async () => {
    const responses = await runSession(tempRoot, ["{not valid json"]);

    assert.equal(responses[0].id, null);
    assert.equal(responses[0].error?.code, -32700);
  });

  test("notifications do not produce responses", async () => {
    const responses = await runSession(tempRoot, [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    ]);

    assert.deepEqual(responses.map((response) => response.id), [1, 2]);
  });
});
