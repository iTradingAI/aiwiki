import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { compactRuns, inspectRuns } from "../src/cli/commands/runs.js";
import { buildHealthReport } from "../src/health.js";
import { initWorkspace } from "../src/workspace.js";
import { tempRoot } from "./helpers.js";

test("health run inspect never compact", async () => {
  const root = await tempRoot("aiwiki-health-run");
  try {
    await initWorkspace(root);
    const runDir = path.join(root, "09-runs", "health-20260830T000000000Z");
    await mkdir(runDir);
    await writeFile(path.join(runDir, "health-report.json"), "{}\n", "utf8");

    const inspected = await inspectRuns(root);
    const health = inspected.runs.find((record) => record.dirName === path.basename(runDir));
    const compacted = await compactRuns(root, true);
    const report = await buildHealthReport(root, "2026-08-30T00:00:00.000Z");

    assert.equal(health?.classification, "health");
    assert.equal(health?.compactAction, "health_never_compact");
    assert.deepEqual(compacted.healthRuns, [path.basename(runDir)]);
    assert.equal(compacted.executed_actions, 0);
    assert.deepEqual(report.metrics.run_storage, {
      runs: 0,
      health_runs: 1,
      total_bytes: 3,
      oversized_files: 0,
      legacy_duplicate_artifacts: 0,
      compactable_runs: 0
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
