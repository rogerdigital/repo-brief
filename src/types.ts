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
  structure: RepositoryStructure;
  generatedAt: string;
}

export interface RepositoryStructure {
  directories: string[];
  ciWorkflows: string[];
}

export interface OutputFile {
  path: string;
  content: string;
}

/** Shared CLI I/O interface used by runCli and runFixCommand. */
export interface CliIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}
