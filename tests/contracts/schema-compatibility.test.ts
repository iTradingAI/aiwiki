import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { buildCapsuleContext } from "../../src/capsule-context.js";
import { buildContext } from "../../src/context.js";
import { planSchemaMigration } from "../../src/schema-migration.js";
import { initWorkspace, readConfig } from "../../src/workspace.js";
import { tempRoot } from "../helpers.js";

test("schema compatibility keeps legacy state readable and migration planning read-only", async () => {
  const root = await tempRoot("aiwiki-schema-contract");
  try {
    await initWorkspace(root);
    const configPath = path.join(root, "aiwiki.yaml");
    const artifactPath = path.join(root, "05-wiki", "source-knowledge", "schema-note.md");
    const initialConfig = await readFile(configPath, "utf8");
    await writeFile(configPath, initialConfig.replace("schema_version: 1", "schema_version: '1'") + "custom_config: keep\n", "utf8");
    await writeFile(artifactPath, "---\ntitle: Schema note\ntype: wiki_entry\naiwiki_schema: 'aiwiki.artifact.v1'\nfuture_metadata: keep\n---\n\nSchema compatibility evidence.\n", "utf8");
    const beforeConfig = await readFile(configPath, "utf8");
    const beforeArtifact = await readFile(artifactPath, "utf8");

    const config = await readConfig(root);
    const report = await planSchemaMigration(root);
    const context = await buildContext(root, "schema");
    const capsule = await buildCapsuleContext(root, "schema");

    assert.equal(config.schemaVersion, "1");
    assert.equal(config.schema.canonicalVersion, "aiwiki.workspace.v1");
    assert.equal(report.dry_run, true);
    assert.equal(report.would_write, false);
    assert.equal(report.summary.manual_review, 0);
    assert.equal(context.schema_version, "aiwiki.context.v1");
    assert.equal(capsule.schema_version, "aiwiki.context.capsule.v1");
    assert.equal(await readFile(configPath, "utf8"), beforeConfig);
    assert.equal(await readFile(artifactPath, "utf8"), beforeArtifact);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("schema compatibility sends future majors to manual review without writes", async () => {
  const root = await tempRoot("aiwiki-schema-major-contract");
  try {
    await initWorkspace(root);
    const configPath = path.join(root, "aiwiki.yaml");
    const artifactPath = path.join(root, "05-wiki", "source-knowledge", "future-schema.md");
    const initialConfig = await readFile(configPath, "utf8");
    await writeFile(configPath, initialConfig.replace("schema_version: 1", "schema_version: '2'"), "utf8");
    await writeFile(artifactPath, "---\ntitle: Future schema\ntype: wiki_entry\naiwiki_schema: 'aiwiki.artifact.v2'\n---\n\nFuture schema marker.\n", "utf8");
    const beforeConfig = await readFile(configPath, "utf8");
    const beforeArtifact = await readFile(artifactPath, "utf8");

    const report = await planSchemaMigration(root);

    assert.equal(report.would_write, false);
    assert.equal(report.summary.manual_review, 2);
    assert.ok(report.findings.some((finding) => finding.path === "aiwiki.yaml" && finding.status === "unsupported_major" && finding.action === "manual_review"));
    assert.ok(report.findings.some((finding) => finding.path === "05-wiki/source-knowledge/future-schema.md" && finding.status === "unsupported_major" && finding.action === "manual_review"));
    assert.equal(await readFile(configPath, "utf8"), beforeConfig);
    assert.equal(await readFile(artifactPath, "utf8"), beforeArtifact);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
