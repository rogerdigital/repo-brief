# AGENTS.md

## Project Snapshot

- Package manager: pnpm
- Frameworks: Not detected

## Common Commands

- `pnpm dev`
- `pnpm build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm verify`
- `pnpm prepack`

## Verification

- Build: `pnpm build`
- Test: `pnpm test`
- Verify: `pnpm verify`

## Agent Readiness Notes

- README references pnpm scripts, but package.json has no scripts script.

## Working Guidelines

- Prefer the detected package manager when running commands.
- Run the relevant verification command before changing behavior.
- Keep edits scoped to the files needed for the requested change.
