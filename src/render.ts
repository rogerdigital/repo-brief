import type { OutputFile, RepositoryBrief } from "./types.js";

function listOrFallback(items: string[], fallback: string): string {
  return items.length > 0 ? items.join(", ") : fallback;
}

export const VERIFICATION_SCRIPTS = ["test", "build", "lint", "verify"];

function renderVerificationSection(brief: RepositoryBrief): string | null {
  const entries = brief.commands
    .filter((c) => VERIFICATION_SCRIPTS.includes(c.name))
    .map((c) => `- ${c.name.charAt(0).toUpperCase() + c.name.slice(1)}: \`${c.command}\``);

  if (entries.length === 0) return null;
  return `## Verification\n\n${entries.join("\n")}`;
}

function renderCommandList(brief: RepositoryBrief): string {
  if (brief.commands.length === 0) {
    return "- No package scripts detected.";
  }

  return brief.commands
    .map((command) => `- ${command.name}: \`${command.command}\``)
    .join("\n");
}

function renderInlineCodeList(items: string[], fallback: string): string {
  return items.length > 0 ? items.map((item) => `\`${item}\``).join(", ") : fallback;
}

function renderReadinessNotes(brief: RepositoryBrief): string {
  if (brief.readinessNotes.length === 0) {
    return "- No obvious agent readiness issues detected.";
  }

  return brief.readinessNotes.map((note) => `- ${note}`).join("\n");
}

export function renderAgentsMd(brief: RepositoryBrief): string {
  const verification = renderVerificationSection(brief);
  const verificationBlock = verification ? `\n${verification}\n` : "";

  return `# AGENTS.md

## Project Snapshot

- Package manager: ${brief.packageManager}
- Frameworks: ${listOrFallback(brief.frameworks, "Not detected")}

## Common Commands

${brief.commands.length === 0 ? "- No package scripts detected." : brief.commands.map((command) => `- \`${command.command}\``).join("\n")}
${verificationBlock}
## Agent Readiness Notes

${renderReadinessNotes(brief)}

## Working Guidelines

- Prefer the detected package manager when running commands.
- Run the relevant verification command before changing behavior.
- Keep edits scoped to the files needed for the requested change.
`;
}

export function renderRepoMap(brief: RepositoryBrief): string {
  return `# Repo Map

## Snapshot

- Root: \`${brief.root}\`
- Package manager: ${brief.packageManager}
- Frameworks: ${listOrFallback(brief.frameworks, "Not detected")}

## Structure

- Directories: ${renderInlineCodeList(brief.structure.directories, "Not detected")}
- CI workflows: ${renderInlineCodeList(brief.structure.ciWorkflows, "Not detected")}

## Commands

${renderCommandList(brief)}

## Agent Readiness Notes

${renderReadinessNotes(brief)}
`;
}

export function renderCommandsMd(brief: RepositoryBrief): string {
  return `# Commands

Use these commands from the repository root.

${renderCommandList(brief)}
`;
}

export function renderRiskZonesMd(brief: RepositoryBrief): string {
  return `# Risk Zones

This file records early signals that may confuse humans or coding agents.

## Current Notes

${renderReadinessNotes(brief)}
`;
}

export function renderOutputFiles(brief: RepositoryBrief): OutputFile[] {
  return [
    { path: "AGENTS.md", content: renderAgentsMd(brief) },
    { path: "docs/agent/repo-map.md", content: renderRepoMap(brief) },
    { path: "docs/agent/commands.md", content: renderCommandsMd(brief) },
    { path: "docs/agent/risk-zones.md", content: renderRiskZonesMd(brief) },
  ];
}
