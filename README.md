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
repo-brief fix
repo-brief fix --apply
repo-brief mcp
```

`repo-brief` defaults to `brief`.

- `brief`: generates agent-ready repo context files.
- `doctor`: prints agent readiness notes without writing files.
- `fix`: detects fixable issues from readiness notes and proposes patches. Default is dry-run (prints diffs); pass `--apply` to write changes. Fixes are labeled `[deterministic]` (safe, unambiguous) or `[assumed-standard]` (uses conventional commands like `eslint .` / `tsc --noEmit`).

  ```bash
  # See what would change
  repo-brief fix

  # Apply
  repo-brief fix --apply
  # Applied 2 fix(es) to 2 file(s): package.json, README.md
  # Review with: git diff
  # Rollback with: git checkout -- <file>
  ```

  The 4 fixable issue classes: `packageManager` field mismatch, README package-manager commands, CI workflow package-manager commands, missing `lint`/`typecheck` scripts.

The binary is intentionally `repo-brief`, not `repo`. `repo brief`, `repo doctor`, and `repo fix` read well, but `repo` is too generic and conflicts with existing developer tooling.

## GitHub Action

Keep brief files fresh on every PR. Add this workflow to `.github/workflows/brief-check.yml` in any repo:

```yaml
name: Brief Check
on:
  pull_request:
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: rogerdigital/repo-brief/.github/actions/repo-brief-check@v0.5
```

The check fails if any committed brief file (`AGENTS.md`, `docs/agent/*.md`) differs from freshly generated content. Run `repo-brief brief` locally and commit the changes to fix it.

## MCP Server

Query repo context on demand from any MCP-compatible coding agent (Claude Code, Cursor, Codex) instead of reading the generated files.

Configure the stdio MCP server in your agent:

**Claude Code** (`.mcp.json` in project root, or `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "repo-brief": {
      "command": "npx",
      "args": ["-y", "@rogerdigital/repo-brief", "mcp"]
    }
  }
}
```

**Cursor** (`.cursor/mcp.json` in project root):

```json
{
  "mcpServers": {
    "repo-brief": {
      "command": "npx",
      "args": ["-y", "@rogerdigital/repo-brief", "mcp"]
    }
  }
}
```

Once configured, the agent can call four tools:

- `get_repo_map` — root path, package manager, frameworks, structure
- `get_commands` — package scripts + verification subset
- `get_readiness_notes` — agent readiness notes
- `refresh` — rescan the repo after files change

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

RepoBrief is a brief generator, not a broad code quality platform.

The shipped milestones:

1. ✅ Generate useful agent context from static repo signals. (v0.1)
2. ✅ Add shallow readiness checks that catch command, docs, and package-manager mismatches. (v0.2)
3. ✅ Add a GitHub Action to keep generated context fresh. (v0.3)
4. ✅ Add an MCP server so agents can query repo context on demand. (v0.4)
5. ✅ Add safe fix mode for low-risk generated files and obvious metadata mismatches. (v0.5)

Non-goals for the first releases:

- Full CI repair.
- Dependency vulnerability scanning.
- Framework migration automation.
- Cloud-only analysis.
- Deep code quality linting.
