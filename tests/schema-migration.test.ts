import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { planSchemaMigration } from "../src/schema-migration.js";
import { initWorkspace } from "../src/workspace.js";
import { tempRoot } from "./helpers.js";

test("schema migration artifact scan v2 run handling", async () => {
  const root = await tempRoot("aiwiki-schema-migration-v2-run");
  try {
    await initWorkspace(root);
    const runDir = path.join(root, "09-runs", "v2-run");
    await mkdir(runDir);
    await writeFile(path.join(runDir, "manifest.json"), JSON.stringify({ schema_version: "aiwiki.run.v2" }), "utf8");
    await writeFile(path.join(runDir, "processing-summary.md"), "---\ntype: processing_summary\nrun_id: v2-run\n---\n\nSummary\n", "utf8");

    const report = await planSchemaMigration(root);

    assert.ok(report.findings.some((finding) => finding.path === "09-runs/v2-run/processing-summary.md" && finding.status === "compatible"));
    assert.equal(report.findings.some((finding) => finding.path.endsWith("manifest.json")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
