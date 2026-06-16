import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderAgentsMd, renderRepoMap, renderOutputFiles } from "../src/render.js";
import type { RepositoryBrief } from "../src/types.js";

const brief: RepositoryBrief = {
  root: "/tmp/demo",
  packageManager: "pnpm",
  frameworks: ["Next.js"],
  commands: [
    { name: "build", command: "pnpm build" },
    { name: "test", command: "pnpm test" },
  ],
  readinessNotes: ["No AGENTS.md found."],
  structure: {
    directories: ["src", "tests", "docs"],
    ciWorkflows: [".github/workflows/ci.yml"],
  },
  generatedAt: "2026-06-01T00:00:00.000Z",
};

describe("renderers", () => {
  test("renders agent instructions with commands and readiness notes", () => {
    const output = renderAgentsMd(brief);

    assert.match(output, /# AGENTS\.md/);
    assert.match(output, /## Project Snapshot/);
    assert.match(output, /- Package manager: pnpm/);
    assert.match(output, /- `pnpm test`/);
    assert.match(output, /No AGENTS\.md found\./);
  });

  test("renders AGENTS.md sections in correct order", () => {
    const output = renderAgentsMd(brief);

    const snapshotIdx = output.indexOf("## Project Snapshot");
    const commandsIdx = output.indexOf("## Common Commands");
    const readinessIdx = output.indexOf("## Agent Readiness Notes");
    const guidelinesIdx = output.indexOf("## Working Guidelines");

    assert.ok(snapshotIdx < commandsIdx, "Project Snapshot before Common Commands");
    assert.ok(commandsIdx < readinessIdx, "Common Commands before Agent Readiness Notes");
    assert.ok(readinessIdx < guidelinesIdx, "Agent Readiness Notes before Working Guidelines");
  });

  test("renders empty command fallback in AGENTS.md", () => {
    const emptyBrief: RepositoryBrief = {
      ...brief,
      commands: [],
    };
    const output = renderAgentsMd(emptyBrief);

    assert.match(output, /- No package scripts detected\./);
  });

  test("renders Verification section when test/build/lint/verify exist", () => {
    const output = renderAgentsMd(brief);

    assert.match(output, /## Verification/);
    assert.match(output, /- Build: `pnpm build`/);
    assert.match(output, /- Test: `pnpm test`/);
  });

  test("omits Verification section when no verification scripts exist", () => {
    const noVerifyBrief: RepositoryBrief = {
      ...brief,
      commands: [{ name: "start", command: "pnpm start" }],
    };
    const output = renderAgentsMd(noVerifyBrief);

    assert.equal(output.includes("## Verification"), false);
  });

  test("renders a compact repo map", () => {
    const output = renderRepoMap(brief);

    assert.match(output, /# Repo Map/);
    assert.match(output, /- Frameworks: Next\.js/);
    assert.match(output, /- build: `pnpm build`/);
  });

  test("renders detected structure in repo map", () => {
    const output = renderRepoMap(brief);

    assert.match(output, /## Structure/);
    assert.match(output, /- Directories: `src`, `tests`, `docs`/);
    assert.match(output, /- CI workflows: `.github\/workflows\/ci.yml`/);
  });

  test("does not include Generated timestamp in AGENTS.md", () => {
    const output = renderAgentsMd(brief);

    assert.equal(output.includes("Generated:"), false);
  });

  test("renders identical output for the same brief (determinism)", () => {
    const first = renderOutputFiles(brief).map((f) => `${f.path}\n${f.content}`);
    const second = renderOutputFiles(brief).map((f) => `${f.path}\n${f.content}`);

    assert.deepEqual(first, second);
  });
});
