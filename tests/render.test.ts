import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderAgentsMd, renderRepoMap } from "../src/render.js";
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

  test("renders a compact repo map", () => {
    const output = renderRepoMap(brief);

    assert.match(output, /# Repo Map/);
    assert.match(output, /- Frameworks: Next\.js/);
    assert.match(output, /- build: `pnpm build`/);
  });
});
