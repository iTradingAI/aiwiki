import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { buildCapsuleContext } from "../../src/capsule-context.js";
import { buildContext } from "../../src/context.js";
import { AIWIKI_SCHEMAS, assessSchemaCompatibility } from "../../src/schema.js";
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

test("readiness command schemas are additive JSON output contracts", () => {
  assert.deepEqual(
    [AIWIKI_SCHEMAS.doctor, AIWIKI_SCHEMAS.status, AIWIKI_SCHEMAS.next].map(({ id, status, storage, compatibility }) => ({ id, status, storage, compatibility })),
    ["aiwiki.doctor.v1", "aiwiki.status.v1", "aiwiki.next.v1"].map((id) => ({
      id,
      status: "active",
      storage: "json_output",
      compatibility: "additive_fields_only"
    }))
  );
});

test("schema catalog freezes all 24 directory entries and their semantics", () => {
  assert.deepEqual(Object.keys(AIWIKI_SCHEMAS), [
    "workspace", "artifact", "capsule", "lifecycle", "relationships", "stateArtifacts",
    "stateCapsules", "stateRelationships", "stateLifecycle", "stateIndex", "stateGraph",
    "context", "capsuleContext", "agentPayload", "agentSync", "agentCheck", "contextV2",
    "health", "healthReport", "repairPlan", "doctor", "status", "next", "extension"
  ]);

  assert.deepEqual(
    Object.fromEntries(Object.entries(AIWIKI_SCHEMAS).map(([key, { id, status, aliases, storage, compatibility }]) => [
      key, { id, status, aliases, storage, compatibility }
    ])),
    {
      workspace: { id: "aiwiki.workspace.v1", status: "active", aliases: ["1"], storage: "workspace_config", compatibility: "additive_fields_only" },
      artifact: { id: "aiwiki.artifact.v1", status: "active", aliases: [], storage: "markdown_frontmatter", compatibility: "additive_fields_only" },
      capsule: { id: "aiwiki.capsule.v1", status: "active", aliases: [], storage: "markdown_frontmatter", compatibility: "additive_fields_only" },
      lifecycle: { id: "aiwiki.lifecycle.v1", status: "active", aliases: [], storage: "markdown_frontmatter", compatibility: "additive_fields_only" },
      relationships: { id: "aiwiki.relationships.v1", status: "active", aliases: [], storage: "markdown_frontmatter", compatibility: "additive_fields_only" },
      stateArtifacts: { id: "aiwiki.state.artifacts.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      stateCapsules: { id: "aiwiki.state.capsules.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      stateRelationships: { id: "aiwiki.state.relationships.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      stateLifecycle: { id: "aiwiki.state.lifecycle.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      stateIndex: { id: "aiwiki.index.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      stateGraph: { id: "aiwiki.graph.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      context: { id: "aiwiki.context.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      capsuleContext: { id: "aiwiki.context.capsule.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      agentPayload: { id: "aiwiki.agent_payload.v1", status: "active", aliases: [], storage: "json_input", compatibility: "strict_input_version" },
      agentSync: { id: "aiwiki.agent_sync.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      agentCheck: { id: "aiwiki.agent_check.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      contextV2: { id: "aiwiki.context.v2", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      health: { id: "aiwiki.health.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      healthReport: { id: "aiwiki.health_report.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      repairPlan: { id: "aiwiki.repair_plan.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      doctor: { id: "aiwiki.doctor.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      status: { id: "aiwiki.status.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      next: { id: "aiwiki.next.v1", status: "active", aliases: [], storage: "json_output", compatibility: "additive_fields_only" },
      extension: { id: "aiwiki.extension.v1", status: "active", aliases: [], storage: "extension_contract", compatibility: "additive_fields_only" }
    }
  );
});

test("schema compatibility preserves canonical, omitted, family-major, and invalid boundaries", () => {
  const cases = [
    {
      key: "workspace" as const,
      suppliedVersion: "aiwiki.workspace.v1",
      expected: { schemaId: "aiwiki.workspace.v1", suppliedVersion: "aiwiki.workspace.v1", status: "compatible", canonicalVersion: "aiwiki.workspace.v1", writable: true, reason: "accepted canonical schema version" }
    },
    {
      key: "workspace" as const,
      suppliedVersion: 1,
      expected: { schemaId: "aiwiki.workspace.v1", suppliedVersion: "1", status: "compatible", canonicalVersion: "aiwiki.workspace.v1", writable: true, reason: "accepted legacy alias" }
    },
    {
      key: "artifact" as const,
      suppliedVersion: undefined,
      expected: { schemaId: "aiwiki.artifact.v1", status: "compatible", canonicalVersion: "aiwiki.artifact.v1", writable: true, reason: "schema version omitted; active v1 reader is assumed" }
    },
    {
      key: "artifact" as const,
      suppliedVersion: "aiwiki.artifact.v2",
      expected: { schemaId: "aiwiki.artifact.v1", suppliedVersion: "aiwiki.artifact.v2", status: "unsupported_major", canonicalVersion: "aiwiki.artifact.v1", writable: false, reason: "unsupported schema major version" }
    },
    {
      key: "contextV2" as const,
      suppliedVersion: "aiwiki.context.v1",
      expected: { schemaId: "aiwiki.context.v2", suppliedVersion: "aiwiki.context.v1", status: "unsupported_major", canonicalVersion: "aiwiki.context.v2", writable: false, reason: "unsupported schema major version" }
    },
    {
      key: "workspace" as const,
      suppliedVersion: "2",
      expected: { schemaId: "aiwiki.workspace.v1", suppliedVersion: "2", status: "unsupported_major", canonicalVersion: "aiwiki.workspace.v1", writable: false, reason: "unsupported schema major version" }
    },
    {
      key: "artifact" as const,
      suppliedVersion: "aiwiki.capsule.v1",
      expected: { schemaId: "aiwiki.artifact.v1", suppliedVersion: "aiwiki.capsule.v1", status: "invalid", canonicalVersion: "aiwiki.artifact.v1", writable: false, reason: "unrecognized schema version" }
    },
    {
      key: "artifact" as const,
      suppliedVersion: "not-a-schema",
      expected: { schemaId: "aiwiki.artifact.v1", suppliedVersion: "not-a-schema", status: "invalid", canonicalVersion: "aiwiki.artifact.v1", writable: false, reason: "unrecognized schema version" }
    }
  ];

  for (const { key, suppliedVersion, expected } of cases) {
    assert.deepEqual(assessSchemaCompatibility(key, suppliedVersion), expected);
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
