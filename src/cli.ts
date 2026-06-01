#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { scanRepository } from "./scanner.js";
import { renderOutputFiles } from "./render.js";

interface CliIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

interface ParsedArgs {
  command: "brief" | "doctor" | "fix";
  cwd: string;
  dryRun: boolean;
}

const DEFAULT_IO: CliIo = {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
};

function parseArgs(args: string[]): ParsedArgs {
  let command: ParsedArgs["command"] = "brief";
  let cwd = process.cwd();
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "brief" || arg === "doctor" || arg === "fix") {
      command = arg;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
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

  return { command, cwd, dryRun };
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
    const brief = await scanRepository(parsed.cwd);
    const files = renderOutputFiles(brief);

    io.stdout("RepoBrief scanned your codebase.");
    io.stdout("");
    io.stdout("Detected:");
    io.stdout(`- Package manager: ${brief.packageManager}`);
    io.stdout(`- Frameworks: ${brief.frameworks.length > 0 ? brief.frameworks.join(", ") : "Not detected"}`);
    io.stdout("");

    if (parsed.command === "doctor") {
      io.stdout("Agent readiness notes:");
      for (const note of brief.readinessNotes) io.stdout(`- ${note}`);
      if (brief.readinessNotes.length === 0) io.stdout("- No obvious agent readiness issues detected.");
      return 0;
    }

    if (parsed.command === "fix") {
      io.stdout("Fix mode is intentionally conservative in v0.1.");
      io.stdout(parsed.dryRun ? "Would generate:" : "Generated:");
    } else {
      io.stdout(parsed.dryRun ? "Would generate:" : "Generated:");
    }

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

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runCli(process.argv.slice(2));
}
