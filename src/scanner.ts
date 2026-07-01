import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { findManagerCommandsInMarkdown } from "./markdown.js";
import { extractWorkflowRunCommands } from "./workflow.js";
import type { CommandSummary, PackageManager, RepositoryBrief, RepositoryStructure } from "./types.js";

const SCRIPT_ORDER = ["dev", "build", "test", "lint", "typecheck", "check", "verify"];
const PACKAGE_MANAGER_COMMANDS = new Set(["install", "add", "remove", "exec", "dlx", "ci"]);
const STRUCTURE_DIRECTORIES = ["app", "pages", "src", "packages", "apps", "tests", "test", "docs"];

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
  packageJsonParseFailed: boolean,
): Promise<string[]> {
  const notes: string[] = [];

  if (!files.has(join(root, "package.json"))) {
    notes.push("No package.json found.");
  }

  if (packageJsonParseFailed) {
    notes.push("package.json could not be parsed.");
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

  const lintNotes = await detectLintConfigNotes(root, commands);
  notes.push(...lintNotes);

  const typecheckNotes = await detectTypecheckNote(root, commands);
  notes.push(...typecheckNotes);

  if (readme) {
    const readmeMismatch = detectReadmeCommandMismatch(packageManager, readme);
    if (readmeMismatch) notes.push(readmeMismatch);

    const readmeScriptMismatches = detectReadmeScriptMismatches(readme, commands);
    notes.push(...readmeScriptMismatches);
  }

  const ciMismatches = await detectCiScriptMismatches(root, commands, packageManager);
  notes.push(...ciMismatches);

  return notes;
}

const ESLINT_CONFIG_FILES = [
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.mjs",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
];

async function detectLintConfigNotes(root: string, commands: CommandSummary[]): Promise<string[]> {
  if (commands.some((c) => c.name === "lint")) return [];

  const hasConfig = await Promise.all(
    ESLINT_CONFIG_FILES.map((f) => exists(join(root, f))),
  );
  if (!hasConfig.some(Boolean)) return [];

  return ["ESLint config found but no lint script in package.json. Consider adding one."];
}

async function detectTypecheckNote(root: string, commands: CommandSummary[]): Promise<string[]> {
  if (commands.some((c) => c.name === "typecheck" || c.name === "check")) return [];

  if (!(await exists(join(root, "tsconfig.json")))) return [];

  return ["tsconfig.json found but no typecheck script in package.json. Consider adding one."];
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
  const lockfileName: Record<PackageManager, string> = {
    pnpm: "pnpm-lock.yaml",
    yarn: "yarn.lock",
    bun: "bun.lock",
    npm: "package-lock.json",
    unknown: "lockfile",
  };

  // Only commands inside code spans/blocks count — prose like "npm/pnpm scripts"
  // is not a command reference.
  const commandManagers = new Set(
    findManagerCommandsInMarkdown(readme).map((m) => m.manager),
  );

  const mentions = (manager: string): boolean => commandManagers.has(manager);

  if (packageManager !== "npm" && packageManager !== "unknown" && mentions("npm")) {
    return `README mentions npm commands, but ${lockfileName[packageManager]} suggests ${packageManager}.`;
  }

  if (packageManager === "npm") {
    if (mentions("pnpm")) {
      return "README mentions pnpm commands, but package-lock.json suggests npm.";
    }
    if (mentions("yarn")) {
      return "README mentions yarn commands, but package-lock.json suggests npm.";
    }
    if (mentions("bun")) {
      return "README mentions bun commands, but package-lock.json suggests npm.";
    }
  }

  return null;
}

function detectReadmeScriptMismatches(readme: string, commands: CommandSummary[]): string[] {
  const notes: string[] = [];
  const scriptNames = new Set(commands.map((command) => command.name));
  const seen = new Set<string>();

  // Only commands inside code spans/blocks count as references. Prose mentions
  // (e.g. "npm/pnpm scripts") are ignored, so they can't produce false notes.
  const matches = findManagerCommandsInMarkdown(readme);

  for (const { manager, name } of matches) {
    if (!name || PACKAGE_MANAGER_COMMANDS.has(name)) continue;
    if (scriptNames.has(name)) continue;

    const key = `${manager}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push(`README references ${manager} ${name}, but package.json has no ${name} script.`);
  }

  return notes;
}

async function detectCiScriptMismatches(root: string, commands: CommandSummary[], packageManager: PackageManager): Promise<string[]> {
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

  const scriptRunPatterns: {
    pm: PackageManager;
    pattern: RegExp;
    display: (scriptName: string) => string;
  }[] = [
    { pm: "pnpm", pattern: /^pnpm (?:run )?(\S+)/, display: (scriptName) => `pnpm ${scriptName}` },
    { pm: "npm", pattern: /^npm run (\S+)/, display: (scriptName) => `npm run ${scriptName}` },
    { pm: "npm", pattern: /^npm (test|build|lint|dev|verify|typecheck|check|ci|install|add|remove|exec|dlx)\b/, display: (scriptName) => `npm ${scriptName}` },
    { pm: "yarn", pattern: /^yarn (?:run )?(\S+)/, display: (scriptName) => `yarn ${scriptName}` },
    { pm: "bun", pattern: /^bun (?:run )?(\S+)/, display: (scriptName) => `bun ${scriptName}` },
  ];

  for (const file of workflowFiles) {
    const content = await readText(join(workflowsDir, file));
    if (!content) continue;

    const seenWrongPm = new Set<PackageManager>();

    for (const { command } of extractWorkflowRunCommands(content)) {
      for (const { pm: ciPm, pattern, display } of scriptRunPatterns) {
        const match = command.match(pattern);
        if (!match) continue;

        const scriptName = match[1];
        if (
          ciPm !== packageManager &&
          packageManager !== "unknown" &&
          !seenWrongPm.has(ciPm)
        ) {
          seenWrongPm.add(ciPm);
          notes.push(
            `GitHub Actions uses ${ciPm}, but lockfile suggests ${packageManager}.`,
          );
        }

        if (PACKAGE_MANAGER_COMMANDS.has(scriptName)) continue;

        if (!scriptNames.has(scriptName)) {
          notes.push(`GitHub Actions references ${display(scriptName)}, but package.json has no ${scriptName} script.`);
        }
      }
    }
  }

  return notes;
}

async function detectStructure(root: string): Promise<RepositoryStructure> {
  const directoryChecks = await Promise.all(
    STRUCTURE_DIRECTORIES.map(async (directory) => ({
      directory,
      exists: await exists(join(root, directory)),
    })),
  );

  return {
    directories: directoryChecks
      .filter((check) => check.exists)
      .map((check) => check.directory),
    ciWorkflows: await detectCiWorkflowFiles(root),
  };
}

async function detectCiWorkflowFiles(root: string): Promise<string[]> {
  const workflowsDir = join(root, ".github", "workflows");

  let entries: string[];
  try {
    entries = await readdir(workflowsDir);
  } catch {
    return [];
  }

  return entries
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .sort()
    .map((file) => `.github/workflows/${file}`);
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
}

function parsePackageJson(content: string | null): { packageJson: PackageJson; parseFailed: boolean } {
  if (!content) return { packageJson: {}, parseFailed: false };
  try {
    return { packageJson: JSON.parse(content) as PackageJson, parseFailed: false };
  } catch {
    return { packageJson: {}, parseFailed: true };
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
  const parsedPackageJson = parsePackageJson(await readText(join(root, "package.json")));
  const packageJson = parsedPackageJson.packageJson;
  const readme = await readText(join(root, "README.md"));
  const commands = detectCommands(effectivePackageManager, packageJson);

  return {
    root,
    packageManager: effectivePackageManager,
    frameworks: detectFrameworks(packageJson),
    commands,
    readinessNotes: await detectReadinessNotes(
      root,
      files,
      effectivePackageManager,
      readme,
      commands,
      packageJson,
      parsedPackageJson.parseFailed,
    ),
    structure: await detectStructure(root),
    generatedAt: new Date().toISOString(),
  };
}
