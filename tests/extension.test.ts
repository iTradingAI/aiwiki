import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { addLocalExtension, enableExtension, evaluateExtensionLintFindings } from "../src/extension/host.js";
import { initWorkspace } from "../src/workspace.js";
import { tempRoot } from "./helpers.js";

test("extension discoverArtifacts v2 run handling", async () => {
  const root = await tempRoot("aiwiki-extension-v2-run");
  try {
    await initWorkspace(root);
    const runDir = path.join(root, "09-runs", "v2-run");
    const extensionDir = path.join(root, "extension");
    await mkdir(runDir);
    await mkdir(extensionDir);
    await writeFile(path.join(runDir, "manifest.json"), JSON.stringify({ schema_version: "aiwiki.run.v2" }), "utf8");
    await writeFile(path.join(runDir, "processing-summary.md"), "---\ntype: processing_summary\nrun_id: v2-run\n---\n\nSummary\n", "utf8");
    await writeFile(path.join(extensionDir, "aiwiki-extension.json"), JSON.stringify({
      schema_version: "aiwiki.extension.v1",
      id: "example.v2-run",
      name: "V2 run observer",
      version: "0.1.0",
      api_version: "aiwiki.extension.v1",
      entry: "index.mjs"
    }), "utf8");
    await writeFile(path.join(extensionDir, "index.mjs"), `export default {
  id: "example.v2-run",
  name: "V2 run observer",
  version: "0.1.0",
  apiVersion: "aiwiki.extension.v1",
  lintRules: [{ kind: "lint_rule", id: "example.v2-run.lint", defaultSeverity: "info", async evaluate({ artifacts }) {
    return [{ severity: "info", message: artifacts.map((artifact) => artifact.vaultPath).join(",") }];
  }}]
};\n`, "utf8");

    await addLocalExtension(root, extensionDir);
    await enableExtension(root, "example.v2-run");
    const findings = await evaluateExtensionLintFindings(root);

    assert.deepEqual(findings.map((finding) => finding.finding.message), ["09-runs/v2-run/processing-summary.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
