import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandSummary, PackageManager, RepositoryBrief } from "./types.js";

const SCRIPT_ORDER = ["dev", "build", "test", "lint", "typecheck", "check", "verify"];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function detectPackageManager(root: string, files: Set<string>): PackageManager {
  if (files.has(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (files.has(join(root, "package-lock.json"))) return "npm";
  if (files.has(join(root, "yarn.lock"))) return "yarn";
  if (files.has(join(root, "bun.lockb")) || files.has(join(root, "bun.lock"))) return "bun";
  return "unknown";
}

function hasMultipleLockfiles(root: string, files: Set<string>): boolean {
  const lockfilePaths = [
    join(root, "pnpm-lock.yaml"),
    join(root, "package-lock.json"),
    join(root, "yarn.lock"),
    join(root, "bun.lockb"),
    join(root, "bun.lock"),
  ];
  return lockfilePaths.filter((p) => files.has(p)).length > 1;
}

function commandPrefix(packageManager: PackageManager): string {
  if (packageManager === "unknown") return "npm run";
  if (packageManager === "npm") return "npm run";
  return packageManager;
}

function scriptCommand(packageManager: PackageManager, name: string): string {
  if (packageManager === "npm") {
    return name === "test" ? "npm test" : `npm run ${name}`;
  }
  if (packageManager === "unknown") {
    return name === "test" ? "npm test" : `npm run ${name}`;
  }
  return `${commandPrefix(packageManager)} ${name}`;
}

function detectFrameworks(packageJson: PackageJson): string[] {
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  const frameworks: string[] = [];

  if (deps.next) frameworks.push("Next.js");
  if (deps["@vitejs/plugin-react"] || deps.vite) frameworks.push("Vite");
  if (deps.react && !frameworks.includes("Next.js")) frameworks.push("React");
  if (deps.vue) frameworks.push("Vue");
  if (deps.svelte) frameworks.push("Svelte");
  if (deps.astro) frameworks.push("Astro");

  return frameworks;
}

function detectCommands(packageManager: PackageManager, packageJson: PackageJson): CommandSummary[] {
  const scripts = packageJson.scripts ?? {};
  const known = SCRIPT_ORDER.filter((name) => scripts[name]);
  const extra = Object.keys(scripts)
    .filter((name) => !SCRIPT_ORDER.includes(name))
    .sort();

  return [...known, ...extra].map((name) => ({
    name,
    command: scriptCommand(packageManager, name),
  }));
}

async function detectReadinessNotes(
  root: string,
  files: Set<string>,
  packageManager: PackageManager,
  readme: string | null,
  commands: CommandSummary[],
): Promise<string[]> {
  const notes: string[] = [];

  if (!files.has(join(root, "package.json"))) {
    notes.push("No package.json found.");
  }

  if (hasMultipleLockfiles(root, files)) {
    notes.push("Multiple package manager lockfiles found.");
  }

  if (!files.has(join(root, "AGENTS.md"))) {
    notes.push("No AGENTS.md found.");
  }

  if (!commands.some((command) => command.name === "test")) {
    notes.push("No test script found in package.json.");
  }

  if (!commands.some((command) => command.name === "build")) {
    notes.push("No build script found in package.json.");
  }

  if (packageManager === "pnpm" && readme && /\bnpm (run )?(test|build|lint|dev)\b/.test(readme)) {
    notes.push("README mentions npm commands, but pnpm-lock.yaml suggests pnpm.");
  }

  const ciMismatches = await detectCiScriptMismatches(root, commands);
  notes.push(...ciMismatches);

  return notes;
}

async function detectCiScriptMismatches(root: string, commands: CommandSummary[]): Promise<string[]> {
  const notes: string[] = [];
  const workflowsDir = join(root, ".github", "workflows");

  let entries: string[];
  try {
    entries = await readdir(workflowsDir);
  } catch {
    return notes;
  }

  const scriptNames = new Set(commands.map((c) => c.name));
  const workflowFiles = entries.filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

  for (const file of workflowFiles) {
    const content = await readText(join(workflowsDir, file));
    if (!content) continue;

    const pmPrefixes = ["pnpm ", "npm run ", "yarn ", "bun run "];
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      const runValue = trimmed.startsWith("- run:")
        ? trimmed.slice("- run:".length).trim()
        : trimmed.startsWith("run:")
          ? trimmed.slice("run:".length).trim()
          : null;
      if (runValue === null) continue;

      for (const prefix of pmPrefixes) {
        const match = runValue.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\S+)`));
        if (match) {
          const scriptName = match[1];
          if (!scriptNames.has(scriptName)) {
            notes.push(
              `GitHub Actions references ${prefix.trim()}${scriptName}, but package.json has no ${scriptName} script.`,
            );
          }
        }
      }
    }
  }

  return notes;
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function parsePackageJson(content: string | null): PackageJson {
  if (!content) return {};
  try {
    return JSON.parse(content) as PackageJson;
  } catch {
    return {};
  }
}

export async function scanRepository(root: string): Promise<RepositoryBrief> {
  const knownPaths = [
    "package.json",
    "pnpm-lock.yaml",
    "package-lock.json",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
    "README.md",
    "AGENTS.md",
  ];
  const files = new Set<string>();

  await Promise.all(
    knownPaths.map(async (path) => {
      const fullPath = join(root, path);
      if (await exists(fullPath)) files.add(fullPath);
    }),
  );

  const packageManager = detectPackageManager(root, files);
  const hasPackageJson = files.has(join(root, "package.json"));
  const effectivePackageManager = hasPackageJson ? packageManager : "unknown" as PackageManager;
  const packageJson = parsePackageJson(await readText(join(root, "package.json")));
  const readme = await readText(join(root, "README.md"));
  const commands = detectCommands(effectivePackageManager, packageJson);

  return {
    root,
    packageManager: effectivePackageManager,
    frameworks: detectFrameworks(packageJson),
    commands,
    readinessNotes: await detectReadinessNotes(root, files, effectivePackageManager, readme, commands),
    generatedAt: new Date().toISOString(),
  };
}
