export type PackageManager = "pnpm" | "npm" | "yarn" | "bun" | "unknown";

export interface CommandSummary {
  name: string;
  command: string;
}

export interface RepositoryBrief {
  root: string;
  packageManager: PackageManager;
  frameworks: string[];
  commands: CommandSummary[];
  readinessNotes: string[];
  generatedAt: string;
}

export interface OutputFile {
  path: string;
  content: string;
}
