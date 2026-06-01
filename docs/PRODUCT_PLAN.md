# RepoBrief Product Plan

## Positioning

RepoBrief makes any repository easier for humans and coding agents to understand before they edit it.

The project should stay narrow at first: generate a useful brief, then add readiness checks where they directly improve the brief.

## Command Model

Use one binary:

```bash
repo-brief
repo-brief brief
repo-brief doctor
repo-brief fix
```

Do not use `repo brief`, `repo doctor`, or `repo fix` as the primary interface. Those commands are elegant, but `repo` is a broad name with existing collisions. A future shell alias or separate package can be considered only after the core project has traction.

## Product Phases

### v0.1: Brief Generator

- Detect package manager.
- Detect common JavaScript/TypeScript frameworks.
- Detect common package scripts.
- Generate `AGENTS.md`.
- Generate `docs/agent/repo-map.md`.
- Generate `docs/agent/commands.md`.
- Generate `docs/agent/risk-zones.md`.
- Print shallow agent readiness notes.

### v0.2: Doctor Mode

- Expand readiness checks.
- Detect README command mismatches.
- Detect package-manager and lockfile inconsistencies.
- Detect CI workflow script references that do not exist in `package.json`.
- Detect missing verification commands.
- Keep checks explainable and deterministic.

### v0.3: GitHub Action

- Add an action that runs on PRs.
- Report stale brief files.
- Optionally open a patch with regenerated context files.

### v0.4: MCP Server

- Expose repo map, commands, and readiness notes through MCP.
- Let coding agents query context instead of reading every generated file.

### v0.5: Safe Fix Mode

- Generate missing context files.
- Update generated files.
- Suggest risky fixes without applying them by default.
- Apply only deterministic metadata fixes.

## Scope Guardrails

RepoBrief should not become a general linter, dependency scanner, CI repair agent, or framework migration assistant in the early product path.

Each new check must answer one question:

> Does this help a human or coding agent understand and safely work inside this repo?

If not, it belongs outside RepoBrief.
