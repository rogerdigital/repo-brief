import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandSummary, PackageManager, RepositoryBrief } from "./types.js";

const SCRIPT_ORDER = ["dev", "build", "test", "lint", "typecheck", "check", "verify"];
const PACKAGE_MANAGER_COMMANDS = new Set(["install", "add", "remove", "exec", "dlx", "ci"]);

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
  packageJson: PackageJson,
): Promise<string[]> {
  const notes: string[] = [];

  if (!files.has(join(root, "package.json"))) {
    notes.push("No package.json found.");
  }

  if (hasMultipleLockfiles(root, files)) {
    notes.push("Multiple package manager lockfiles found.");
  }

  const fieldMismatch = detectPackageManagerFieldMismatch(packageJson, packageManager);
  if (fieldMismatch) notes.push(fieldMismatch);

  if (!files.has(join(root, "AGENTS.md"))) {
    notes.push("No AGENTS.md found.");
  }

  if (!commands.some((command) => command.name === "test")) {
    notes.push("No test script found in package.json.");
  }

  if (!commands.some((command) => command.name === "build")) {
    notes.push("No build script found in package.json.");
  }

  if (readme) {
    const readmeMismatch = detectReadmeCommandMismatch(packageManager, readme);
    if (readmeMismatch) notes.push(readmeMismatch);
  }

  const ciMismatches = await detectCiScriptMismatches(root, commands);
  notes.push(...ciMismatches);

  return notes;
}

function detectPackageManagerFieldMismatch(packageJson: PackageJson, lockfileManager: PackageManager): string | null {
  const field = packageJson.packageManager;
  if (!field) return null;

  const match = field.match(/^(npm|pnpm|yarn|bun)@/);
  if (!match) return null;

  const declared = match[1] as PackageManager;
  if (declared !== lockfileManager && lockfileManager !== "unknown") {
    return `packageManager field declares ${declared}, but lockfile suggests ${lockfileManager}.`;
  }

  return null;
}

function detectReadmeCommandMismatch(packageManager: PackageManager, readme: string): string | null {
  const npmRe = /\bnpm (run )?(test|build|lint|dev)\b/;
  const pnpmRe = /\bpnpm (run )?(test|build|lint|dev)\b/;
  const yarnRe = /\byarn (test|build|lint|dev)\b/;
  const bunRe = /\bbun (run )?(test|build|lint|dev)\b/;

  const lockfileName: Record<PackageManager, string> = {
    pnpm: "pnpm-lock.yaml",
    yarn: "yarn.lock",
    bun: "bun.lock",
    npm: "package-lock.json",
    unknown: "lockfile",
  };

  if (packageManager !== "npm" && packageManager !== "unknown" && npmRe.test(readme)) {
    return `README mentions npm commands, but ${lockfileName[packageManager]} suggests ${packageManager}.`;
  }

  if (packageManager === "npm") {
    if (pnpmRe.test(readme)) {
      return "README mentions pnpm commands, but package-lock.json suggests npm.";
    }
    if (yarnRe.test(readme)) {
      return "README mentions yarn commands, but package-lock.json suggests npm.";
    }
    if (bunRe.test(readme)) {
      return "README mentions bun commands, but package-lock.json suggests npm.";
    }
  }

  return null;
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

    const scriptRunPatterns = [
      { prefix: "pnpm", pattern: /^pnpm (?:run )?(\S+)/ },
      { prefix: "npm run", pattern: /^npm run (\S+)/ },
      { prefix: "yarn", pattern: /^yarn (?:run )?(\S+)/ },
      { prefix: "bun run", pattern: /^bun run (\S+)/ },
    ];

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      const runValue = trimmed.startsWith("- run:")
        ? trimmed.slice("- run:".length).trim()
        : trimmed.startsWith("run:")
          ? trimmed.slice("run:".length).trim()
          : null;
      if (runValue === null) continue;

      for (const { prefix, pattern } of scriptRunPatterns) {
        const match = runValue.match(pattern);
        if (!match) continue;

        const scriptName = match[1];
        if (PACKAGE_MANAGER_COMMANDS.has(scriptName)) continue;

        if (!scriptNames.has(scriptName)) {
          notes.push(`GitHub Actions references ${prefix} ${scriptName}, but package.json has no ${scriptName} script.`);
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
  packageManager?: string;
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
    readinessNotes: await detectReadinessNotes(root, files, effectivePackageManager, readme, commands, packageJson),
    generatedAt: new Date().toISOString(),
  };
}
