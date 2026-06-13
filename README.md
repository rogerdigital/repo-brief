# RepoBrief

Generate an AI-ready project brief for any codebase.

RepoBrief scans a repository, detects the project stack and common commands, then writes lightweight context files that help humans and coding agents understand the repo before editing it.

```bash
npx @rogerdigital/repo-brief --dry-run
```

## What It Generates

```text
AGENTS.md
docs/agent/repo-map.md
docs/agent/commands.md
docs/agent/risk-zones.md
```

## Example

```text
RepoBrief scanned your codebase.

Detected:
- Package manager: unknown
- Frameworks: Next.js

Would generate:
- AGENTS.md
- docs/agent/repo-map.md
- docs/agent/commands.md
- docs/agent/risk-zones.md

Agent readiness notes:
- No AGENTS.md found.
```

## Commands

```bash
repo-brief
repo-brief brief
repo-brief doctor
repo-brief fix --dry-run
```

`repo-brief` defaults to `brief`.

- `brief`: generates agent-ready repo context files.
- `doctor`: prints agent readiness notes without writing files.
- `fix`: conservative generation mode. In v0.1 it only writes the same low-risk context files as `brief`.

The binary is intentionally `repo-brief`, not `repo`. `repo brief`, `repo doctor`, and `repo fix` read well, but `repo` is too generic and conflicts with existing developer tooling.

## Readiness Checks

`doctor` and `brief` detect common issues that confuse humans and coding agents:

- Missing `package.json` or `AGENTS.md`
- Multiple package manager lockfiles in the same repo
- README mentioning `npm` commands while a different lockfile is present
- README referencing package scripts that do not exist
- GitHub Actions workflows referencing undefined npm/pnpm scripts
- GitHub Actions workflows using a package manager that conflicts with the lockfile
- Missing `test` or `build` scripts
- ESLint or TypeScript config without a matching package script

## Repo Map Signals

`docs/agent/repo-map.md` summarizes shallow repository structure:

- Common project directories such as `src`, `app`, `packages`, `apps`, `tests`, and `docs`
- GitHub Actions workflow files under `.github/workflows`
- Detected package manager, frameworks, commands, and readiness notes

## Local Development

```bash
pnpm install
pnpm test
pnpm dev -- --dry-run
```

Fixture projects live under `examples/fixtures`. They cover package-manager detection, no-package metadata, and shallow monorepo structure signals.

## Product Direction

RepoBrief starts as a brief generator, not a broad code quality platform.

The near-term path:

1. Generate useful agent context from static repo signals.
2. Add shallow readiness checks that catch command, docs, and package-manager mismatches.
3. Add a GitHub Action to keep generated context fresh.
4. Add an MCP server so agents can query repo context on demand.
5. Add safe fix mode only for low-risk generated files and obvious metadata mismatches.

Non-goals for the first releases:

- Full CI repair.
- Dependency vulnerability scanning.
- Framework migration automation.
- Cloud-only analysis.
- Deep code quality linting.
