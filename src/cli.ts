#!/usr/bin/env node
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { scanRepository } from "./scanner.js";
import { renderOutputFiles } from "./render.js";

interface CliIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

interface ParsedArgs {
  command: "brief" | "doctor" | "fix" | "mcp";
  cwd: string;
  dryRun: boolean;
  apply: boolean;
}

const DEFAULT_IO: CliIo = {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
};

function parseArgs(args: string[]): ParsedArgs {
  let command: ParsedArgs["command"] = "brief";
  let cwd = process.cwd();
  let dryRun = false;
  let apply = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "brief" || arg === "doctor" || arg === "fix" || arg === "mcp") {
      command = arg;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--cwd") {
      const value = args[index + 1];
      if (!value) throw new Error("--cwd requires a path");
      cwd = resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { command, cwd, dryRun, apply };
}

async function writeOutputFiles(root: string, files: ReturnType<typeof renderOutputFiles>): Promise<void> {
  await Promise.all(
    files.map(async (file) => {
      const target = join(root, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }),
  );
}

export async function runCli(args: string[], io: CliIo = DEFAULT_IO): Promise<number> {
  try {
    const parsed = parseArgs(args);

    if (parsed.command === "mcp") {
      const { runMcpServer } = await import("./mcp/server.js");
      return runMcpServer(parsed.cwd);
    }

    if (parsed.command === "fix") {
      const { runFixCommand } = await import("./fix/index.js");
      return runFixCommand(parsed.cwd, { apply: parsed.apply }, io);
    }

    const brief = await scanRepository(parsed.cwd);
    const files = renderOutputFiles(brief);

    io.stdout("RepoBrief scanned your codebase.");
    io.stdout("");
    io.stdout("Detected:");
    io.stdout(`- Package manager: ${brief.packageManager}`);
    io.stdout(`- Frameworks: ${brief.frameworks.length > 0 ? brief.frameworks.join(", ") : "Not detected"}`);
    io.stdout("");
    io.stdout(`Generated at: ${brief.generatedAt}`);

    if (parsed.command === "doctor") {
      io.stdout("Agent readiness notes:");
      for (const note of brief.readinessNotes) io.stdout(`- ${note}`);
      if (brief.readinessNotes.length === 0) io.stdout("- No obvious agent readiness issues detected.");
      return 0;
    }

    io.stdout(parsed.dryRun ? "Would generate:" : "Generated:");

    for (const file of files) io.stdout(`- ${file.path}`);

    if (!parsed.dryRun) {
      await writeOutputFiles(parsed.cwd, files);
    }

    if (brief.readinessNotes.length > 0) {
      io.stdout("");
      io.stdout("Agent readiness notes:");
      for (const note of brief.readinessNotes) io.stdout(`- ${note}`);
    }

    return 0;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

const modulePath = await realpath(new URL(import.meta.url));
const invokedPath = process.argv[1] ? await realpath(process.argv[1]) : null;

if (invokedPath === modulePath) {
  process.exitCode = await runCli(process.argv.slice(2));
}
