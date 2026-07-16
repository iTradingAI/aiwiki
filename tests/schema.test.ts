import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { buildCapsuleContext } from "../src/capsule-context.js";
import { buildContext } from "../src/context.js";
import { planSchemaMigration } from "../src/schema-migration.js";
import { AIWIKI_SCHEMAS, assessSchemaCompatibility } from "../src/schema.js";
import { initWorkspace, readConfig } from "../src/workspace.js";
import { tempRoot } from "./helpers.js";

test("schema catalog keeps active v1 contracts and activates the extension contract", () => {
  assert.equal(AIWIKI_SCHEMAS.workspace.id, "aiwiki.workspace.v1");
  assert.deepEqual(AIWIKI_SCHEMAS.workspace.aliases, ["1"]);
  assert.equal(AIWIKI_SCHEMAS.context.id, "aiwiki.context.v1");
  assert.equal(AIWIKI_SCHEMAS.capsuleContext.id, "aiwiki.context.capsule.v1");
  assert.equal(AIWIKI_SCHEMAS.contextV2.status, "reserved");
  assert.equal(AIWIKI_SCHEMAS.extension.id, "aiwiki.extension.v1");
  assert.equal(AIWIKI_SCHEMAS.extension.status, "active");
  assert.equal(AIWIKI_SCHEMAS.extension.storage, "extension_contract");
  assert.equal(AIWIKI_SCHEMAS.extension.compatibility, "additive_fields_only");

  assert.deepEqual(assessSchemaCompatibility("workspace", "1"), {
    schemaId: "aiwiki.workspace.v1",
    suppliedVersion: "1",
    status: "compatible",
    canonicalVersion: "aiwiki.workspace.v1",
    writable: true,
    reason: "accepted legacy alias"
  });
  assert.equal(assessSchemaCompatibility("workspace", "aiwiki.workspace.v2").status, "unsupported_major");
  assert.equal(assessSchemaCompatibility("workspace", "aiwiki.workspace.v2").writable, false);
  assert.equal(assessSchemaCompatibility("workspace", "2").status, "unsupported_major");
  assert.equal(assessSchemaCompatibility("workspace", 2).status, "unsupported_major");
  assert.equal(assessSchemaCompatibility("workspace", "2").writable, false);
  assert.equal(assessSchemaCompatibility("workspace", "\"1\"").status, "compatible");
  assert.equal(assessSchemaCompatibility("workspace", "\"2\"").status, "unsupported_major");
  assert.equal(assessSchemaCompatibility("workspace", "unexpected").status, "invalid");
});

test("schema migration planning is read-only for legacy config and additive frontmatter", async () => {
  const root = await tempRoot("aiwiki-schema-plan");
  try {
    await initWorkspace(root);
    const configPath = path.join(root, "aiwiki.yaml");
    const artifactPath = path.join(root, "05-wiki", "source-knowledge", "schema-note.md");
    const defaultConfig = await readFile(configPath, "utf8");
    await writeFile(configPath, `${defaultConfig.replace("schema_version: 1", "schema_version: \"1\"")}custom_config: keep\n`, "utf8");
    await writeFile(artifactPath, `---\ntitle: Schema note\ntype: wiki_entry\naiwiki_schema: "aiwiki.artifact.v1"\nfuture_metadata: keep\n---\n\nSchema compatibility evidence.\n`, "utf8");
    const before = await workspaceFingerprint(root, [configPath, artifactPath]);

    const config = await readConfig(root);
    assert.equal(config.schemaVersion, "1");
    assert.equal(config.schema.status, "compatible");
    assert.equal(config.schema.canonicalVersion, "aiwiki.workspace.v1");

    const report = await planSchemaMigration(root);
    assert.equal(report.schema_version, "aiwiki.schema_migration_report.v1");
    assert.equal(report.dry_run, true);
    assert.equal(report.would_write, false);
    assert.equal(report.summary.manual_review, 0);
    assert.ok(report.findings.some((finding) => finding.path === "aiwiki.yaml" && finding.schemaId === "aiwiki.workspace.v1" && finding.status === "compatible"));
    assert.ok(report.findings.some((finding) => finding.path === "05-wiki/source-knowledge/schema-note.md" && finding.schemaId === "aiwiki.artifact.v1" && finding.status === "compatible"));
    assert.deepEqual(await workspaceFingerprint(root, [configPath, artifactPath]), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("schema migration planning sends unknown major versions to manual review without changing files", async () => {
  const root = await tempRoot("aiwiki-schema-major");
  try {
    await initWorkspace(root);
    const configPath = path.join(root, "aiwiki.yaml");
    const artifactPath = path.join(root, "05-wiki", "source-knowledge", "future-schema.md");
    const original = await readFile(configPath, "utf8");
    await writeFile(configPath, original.replace("schema_version: 1", "schema_version: \"2\""), "utf8");
    await writeFile(artifactPath, `---\ntitle: Future schema\ntype: wiki_entry\naiwiki_schema: "aiwiki.artifact.v2"\n---\n\nFuture schema marker.\n`, "utf8");
    const before = await workspaceFingerprint(root, [configPath, artifactPath]);

    const report = await planSchemaMigration(root);
    assert.equal(report.would_write, false);
    assert.equal(report.summary.manual_review, 2);
    assert.deepEqual(report.findings[0], {
      path: "aiwiki.yaml",
      schemaId: "aiwiki.workspace.v1",
      suppliedVersion: "2",
      status: "unsupported_major",
      action: "manual_review",
      reason: "unsupported schema major version"
    });
    assert.ok(report.findings.some((finding) => finding.path === "05-wiki/source-knowledge/future-schema.md" && finding.schemaId === "aiwiki.artifact.v1" && finding.status === "unsupported_major" && finding.action === "manual_review"));
    assert.deepEqual(await workspaceFingerprint(root, [configPath, artifactPath]), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("schema catalog integration preserves existing context v1 output contracts", async () => {
  const root = await tempRoot("aiwiki-schema-context");
  try {
    await initWorkspace(root);
    const context = await buildContext(root, "schema");
    const capsuleContext = await buildCapsuleContext(root, "schema");
    assert.equal(context.schema_version, "aiwiki.context.v1");
    assert.equal(capsuleContext.schema_version, "aiwiki.context.capsule.v1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("schema compatibility guidance is packaged across docs, Skill, and workspace templates", async () => {
  const [packageJson, catalog, catalogChinese, readme, readmeChinese, usage, usageChinese, handoff, handoffChinese, release, releaseChinese, skill, exampleSchema] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("docs/schema/README.md", "utf8"),
    readFile("docs/schema/README.zh-CN.md", "utf8"),
    readFile("README.md", "utf8"),
    readFile("README.zh-CN.md", "utf8"),
    readFile("docs/USAGE.md", "utf8"),
    readFile("docs/USAGE.zh-CN.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.zh-CN.md", "utf8"),
    readFile("docs/RELEASE.md", "utf8"),
    readFile("docs/RELEASE.zh-CN.md", "utf8"),
    readFile("skill/SKILL.md", "utf8"),
    readFile("examples/obsidian-vault-sample/_system/schemas/aiwiki-frontmatter.md", "utf8")
  ]);
  assert.match(packageJson, /"docs\/schema"/);
  assert.match(catalog, /aiwiki\.workspace\.v1/);
  assert.match(catalog, /manual review/i);
  assert.match(catalogChinese, /aiwiki\.workspace\.v1/);
  assert.match(catalogChinese, /人工复核/);
  for (const text of [readme, readmeChinese, usage, usageChinese, handoff, handoffChinese, release, releaseChinese, skill, exampleSchema]) {
    assert.match(text, /aiwiki\.context\.v1/);
    assert.match(text, /CORE-0407/);
  }

  const root = await tempRoot("aiwiki-schema-seed");
  try {
    await initWorkspace(root);
    const seededSchema = await readFile(path.join(root, "_system", "schemas", "aiwiki-frontmatter.md"), "utf8");
    assert.match(seededSchema, /aiwiki\.artifact\.v1/);
    assert.match(seededSchema, /CORE-0407/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function workspaceFingerprint(root: string, files: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(path.relative(root, file));
    hash.update(await readFile(file));
  }
  return hash.digest("hex");
}
