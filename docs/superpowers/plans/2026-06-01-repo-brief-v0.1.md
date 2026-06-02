# RepoBrief v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small TypeScript CLI that scans a repository and generates agent-ready context files.

**Architecture:** The CLI stays deterministic and local-only. `src/scanner.ts` reads repo signals, `src/render.ts` converts the scan result into Markdown files, and `src/cli.ts` handles arguments, output, and file writes.

**Tech Stack:** Node.js 20+, TypeScript, Node built-in test runner, pnpm.

---

## File Structure

- `src/types.ts`: shared scan result and output file types.
- `src/scanner.ts`: repository detection logic.
- `src/render.ts`: Markdown renderers for generated files.
- `src/cli.ts`: CLI argument parsing, command dispatch, dry-run, and file writing.
- `tests/scanner.test.ts`: scanner behavior tests.
- `tests/render.test.ts`: renderer behavior tests.
- `tests/cli.test.ts`: CLI behavior tests.
- `examples/sample-output.txt`: copyable terminal output for README and launch posts.
- `docs/PRODUCT_PLAN.md`: product positioning and roadmap.

## Task 1: Stabilize v0.1 CLI Contract

**Files:**
- Modify: `src/cli.ts`
- Modify: `tests/cli.test.ts`
- Modify: `README.md`

- [x] Confirm default command behavior.

Run:

```bash
pnpm dev -- --dry-run
```

Expected:

```text
RepoBrief scanned your codebase.
Would generate:
- AGENTS.md
```

- [x] Add tests for explicit `brief`, `doctor`, and `fix --dry-run`.

Test cases:

```ts
await runCli(["brief", "--dry-run", "--cwd", root], io);
await runCli(["doctor", "--cwd", root], io);
await runCli(["fix", "--dry-run", "--cwd", root], io);
```

Expected:

- `brief` lists generated files.
- `doctor` lists readiness notes and writes no files.
- `fix --dry-run` says it is conservative and lists files it would generate.

- [x] Run tests and verify they fail before changing production code if the cases are not implemented.

Run:

```bash
pnpm test
```

- [x] Update `src/cli.ts` only as needed to pass the new tests.

- [x] Run verification.

```bash
pnpm test
```

Expected: all tests pass.

## Task 2: Improve Repository Scanner

**Files:**
- Modify: `src/scanner.ts`
- Modify: `tests/scanner.test.ts`

- [x] Add failing tests for lockfile conflicts.

Create a temp repo with both `pnpm-lock.yaml` and `package-lock.json`.

Expected readiness note:

```text
Multiple package manager lockfiles found.
```

- [x] Add failing tests for missing `package.json`.

Expected:

```ts
packageManager === "unknown"
commands === []
readinessNotes includes "No package.json found."
```

- [x] Add failing tests for GitHub Actions script mismatches.

Create:

```text
.github/workflows/ci.yml
```

with:

```yaml
run: pnpm verify
```

and a `package.json` without `verify`.

Expected readiness note:

```text
GitHub Actions references pnpm verify, but package.json has no verify script.
```

- [x] Implement the minimal scanner changes.

Implementation notes:

- Keep YAML parsing shallow with text matching for v0.1.
- Do not add a YAML dependency yet.
- Only inspect `.github/workflows/*.yml` and `.github/workflows/*.yaml`.

- [x] Run verification.

```bash
pnpm test
```

## Task 3: Make Generated Markdown More Useful

**Files:**
- Modify: `src/render.ts`
- Modify: `tests/render.test.ts`

- [x] Add failing tests for section order.

Expected `AGENTS.md` section order:

```text
# AGENTS.md
## Project Snapshot
## Common Commands
## Agent Readiness Notes
## Working Guidelines
```

- [x] Add failing tests for empty command output.

Expected:

```text
- No package scripts detected.
```

- [x] Add a `Verification` section when a `test`, `build`, `lint`, or `verify` command exists.

Expected examples:

```text
- Test: `pnpm test`
- Build: `pnpm build`
```

- [x] Implement renderer changes.

- [x] Run verification.

```bash
pnpm test
```

## Task 4: Add Release-Ready Project Metadata

**Files:**
- Modify: `package.json`
- Create: `.npmignore` if needed
- Modify: `README.md`

- [x] Add repository metadata.

Use:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/rogerdigital/repo-brief.git"
}
```

- [x] Add bugs and homepage metadata.

Use:

```json
"bugs": {
  "url": "https://github.com/rogerdigital/repo-brief/issues"
},
"homepage": "https://github.com/rogerdigital/repo-brief#readme"
```

- [x] Run package dry run.

```bash
pnpm build
npm pack --dry-run
```

Expected: package includes `dist`, `README.md`, `LICENSE`, `examples`, and no `src` unless intentionally included.

## Task 5: Add Launch Demo Fixtures

**Files:**
- Create: `examples/fixtures/nextjs/package.json`
- Create: `examples/fixtures/nextjs/README.md`
- Modify: `examples/sample-output.txt`

- [x] Create a tiny fixture project.

`examples/fixtures/nextjs/package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "15.0.0",
    "react": "19.0.0"
  }
}
```

- [x] Run RepoBrief against the fixture.

```bash
pnpm dev -- --dry-run --cwd examples/fixtures/nextjs
```

- [x] Copy the output into `examples/sample-output.txt`.

- [x] Run verification.

```bash
pnpm test
```

## Task 6: Prepare First Public Push

**Files:**
- Inspect all changed files.

- [x] Run full verification.

```bash
pnpm test
git diff --check
```

- [x] Review README first screen.

Check that a visitor can answer within 10 seconds:

- What does this do?
- How do I run it?
- What files does it generate?
- Why does this help coding agents?

- [x] Commit.

```bash
git add .
git commit -m "feat: initialize repo-brief cli"
```

- [x] Push.

```bash
git push origin main
```

## Self-Review

- The plan covers scanner, renderer, CLI, docs, examples, package metadata, and release preparation.
- No cloud service or LLM dependency is required.
- `doctor` and `fix` remain intentionally conservative.
- The first version can be published without becoming a general repo repair platform.
