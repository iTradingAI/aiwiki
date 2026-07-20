import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { AIWIKI_SCHEMAS } from "../src/schema.js";
import { buildRebuildProjection } from "../src/state/projection.js";
import { tempRoot } from "./helpers.js";

test("state projection registers four derived-state schemas", () => {
  assert.equal(AIWIKI_SCHEMAS.stateArtifacts.id, "aiwiki.state.artifacts.v1");
  assert.equal(AIWIKI_SCHEMAS.stateArtifacts.status, "active");
  assert.equal(AIWIKI_SCHEMAS.stateCapsules.id, "aiwiki.state.capsules.v1");
  assert.equal(AIWIKI_SCHEMAS.stateRelationships.id, "aiwiki.state.relationships.v1");
  assert.equal(AIWIKI_SCHEMAS.stateLifecycle.id, "aiwiki.state.lifecycle.v1");
});

test("state projection derives four sanitized state snapshots from markdown", async () => {
  const root = await createProjectionFixture("aiwiki-state-projection");
  try {
    const projection = await buildRebuildProjection(root, "2026-07-20T08:00:00.000Z");

    assert.equal(projection.snapshotId, projection.artifacts.snapshot_id);
    assert.equal(projection.snapshotId, projection.capsules.snapshot_id);
    assert.equal(projection.snapshotId, projection.relationships.snapshot_id);
    assert.equal(projection.snapshotId, projection.lifecycle.snapshot_id);

    assert.equal(projection.artifacts.schema_version, "aiwiki.state.artifacts.v1");
    assert.equal(projection.capsules.schema_version, "aiwiki.state.capsules.v1");
    assert.equal(projection.relationships.schema_version, "aiwiki.state.relationships.v1");
    assert.equal(projection.lifecycle.schema_version, "aiwiki.state.lifecycle.v1");

    assert.equal(projection.artifacts.root, ".");
    assert.equal(projection.capsules.root, ".");
    assert.equal(projection.relationships.root, ".");
    assert.equal(projection.lifecycle.root, ".");

    const artifactPaths = projection.artifacts.data.map((item: any) => item.path);
    assert.deepEqual(artifactPaths, [...artifactPaths].sort());
    assert.equal(projection.artifacts.summary.total, projection.artifacts.data.length);
    assert.equal(projection.capsules.summary.total, projection.capsules.data.length);
    assert.equal(projection.relationships.summary.total, projection.relationships.data.length);
    assert.equal(projection.lifecycle.summary.total, projection.lifecycle.data.length);

    const wikiPath = "05-wiki/source-knowledge/alpha-entry.md";
    const wikiArtifact = projection.artifacts.data.find((item: any) => item.path === wikiPath);
    assert.ok(wikiArtifact);
    assert.equal(wikiArtifact.kind, "wiki_entry");
    assert.equal(wikiArtifact.role, "primary");
    assert.equal(wikiArtifact.visibility, "primary");
    assert.equal(wikiArtifact.capsule_id, "src_projection_demo");
    assert.equal(wikiArtifact.run_id, "run-demo-001");
    assert.equal(
      wikiArtifact.content_hash,
      createHash("sha256").update(await readFile(path.join(root, wikiPath), "utf8")).digest("hex")
    );

    const capsule = projection.capsules.data.find((item: any) => item.id === "src_projection_demo");
    assert.ok(capsule);
    assert.equal(capsule.primary_path, wikiPath);
    assert.deepEqual(capsule.artifact_paths, [...capsule.artifact_paths].sort());
    assert.equal(capsule.grouping_reason, "explicit_capsule_id");
    assert.equal(capsule.okf.ready, true);
    assert.equal(capsule.lifecycle.knowledge_status, "active");

    assert.deepEqual(
      projection.relationships.data.map((item: any) => `${item.source_path}:${item.type}:${item.target}`),
      [
        "05-wiki/source-knowledge/alpha-entry.md:related_to:07-topics/ready/topic-alpha.md",
        "05-wiki/source-knowledge/alpha-entry.md:supersedes:05-wiki/source-knowledge/legacy-entry.md",
        "05-wiki/source-knowledge/alpha-entry.md:superseded_by:05-wiki/source-knowledge/future-entry.md",
        "05-wiki/source-knowledge/alpha-entry.md:contradicts:05-wiki/source-knowledge/counter-entry.md"
      ]
    );

    const lifecycle = projection.lifecycle.data.find((item: any) => item.path === wikiPath);
    assert.ok(lifecycle);
    assert.equal(lifecycle.knowledge_status, "active");
    assert.equal(lifecycle.confidence_level, "high");
    assert.equal(lifecycle.staleness, "fresh");
    assert.deepEqual(lifecycle.evidence_refs, ["03-sources/article-cards/zeta-source-card.md"]);

    const serialized = JSON.stringify(projection);
    assert.equal(serialized.includes("absolutePath"), false);
    assert.equal(serialized.includes("bodyPreview"), false);
    assert.equal(serialized.includes("body"), false);
    assert.equal(serialized.includes("SECRET_BODY_ALPHA"), false);
    assert.equal(serialized.includes("SECRET_BODY_RAW"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("state projection keeps snapshot ids stable across repeated runs and generated_at changes only", async () => {
  const root = await createProjectionFixture("aiwiki-state-stable");
  try {
    const first = await buildRebuildProjection(root, "2026-07-20T08:00:00.000Z");
    const second = await buildRebuildProjection(root, "2026-07-20T08:00:00.000Z");
    const later = await buildRebuildProjection(root, "2026-07-20T09:00:00.000Z");

    assert.equal(first.snapshotId, second.snapshotId);
    assert.equal(first.snapshotId, later.snapshotId);
    assert.equal(first.artifacts.generated_at, "2026-07-20T08:00:00.000Z");
    assert.equal(later.artifacts.generated_at, "2026-07-20T09:00:00.000Z");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("state projection changes snapshot ids when markdown content changes", async () => {
  const root = await createProjectionFixture("aiwiki-state-mutation");
  try {
    const before = await buildRebuildProjection(root, "2026-07-20T08:00:00.000Z");
    await writeMarkdown(root, "05-wiki/source-knowledge/alpha-entry.md", [
      "---",
      'type: "wiki_entry"',
      'title: "Projection Alpha Updated"',
      'summary: "Updated summary for projection"',
      'description: "Primary entry for rebuildable state"',
      'capsule_id: "src_projection_demo"',
      'slug: "projection-alpha"',
      'source_url: "https://example.com/projection-alpha"',
      'content_fingerprint: "sha256:projection-alpha"',
      'run_id: "run-demo-001"',
      'knowledge_status: "active"',
      'confidence_level: "high"',
      'confidence_score: 0.93',
      'staleness: "fresh"',
      'evidence_refs: ["03-sources/article-cards/zeta-source-card.md"]',
      'evidence_count: 1',
      'timestamp: "2026-07-18T00:00:00.000Z"',
      "relationships:",
      '  - type: "related_to"',
      '    target: "07-topics/ready/topic-alpha.md"',
      '    evidence: "topic linkage"',
      '    confidence_level: "medium"',
      'supersedes: ["05-wiki/source-knowledge/legacy-entry.md"]',
      'superseded_by: ["05-wiki/source-knowledge/future-entry.md"]',
      'contradicted_by: ["05-wiki/source-knowledge/counter-entry.md"]',
      "---",
      "",
      "SECRET_BODY_ALPHA",
      "",
      "Updated body text changes the projection fingerprint.",
      "",
      "- Source Card: 03-sources/article-cards/zeta-source-card.md"
    ].join("\n"));

    const after = await buildRebuildProjection(root, "2026-07-20T08:00:00.000Z");
    assert.notEqual(before.snapshotId, after.snapshotId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("state projection ignores filesystem timestamp drift in snapshot ids", async () => {
  const root = await createProjectionFixture("aiwiki-state-mtime");
  try {
    const artifactPath = path.join(root, "05-wiki/source-knowledge/alpha-entry.md");
    const before = await buildRebuildProjection(root, "2026-07-20T08:00:00.000Z");
    const beforeMtime = (await stat(artifactPath)).mtime;
    await utimes(artifactPath, beforeMtime, new Date(beforeMtime.getTime() + 60_000));

    const after = await buildRebuildProjection(root, "2026-07-20T08:00:00.000Z");
    const beforeArtifact = before.artifacts.data.find((item) => item.path === "05-wiki/source-knowledge/alpha-entry.md");
    const afterArtifact = after.artifacts.data.find((item) => item.path === "05-wiki/source-knowledge/alpha-entry.md");

    assert.ok(beforeArtifact);
    assert.ok(afterArtifact);
    assert.notEqual(beforeArtifact.modified_at, afterArtifact.modified_at);
    assert.equal(before.snapshotId, after.snapshotId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("state projection snapshot ids cover relationship and lifecycle frontmatter changes", async () => {
  const root = await createProjectionFixture("aiwiki-state-semantic-change");
  try {
    const artifactPath = path.join(root, "05-wiki/source-knowledge/alpha-entry.md");
    const before = await buildRebuildProjection(root, "2026-07-20T08:00:00.000Z");
    const original = await readFile(artifactPath, "utf8");
    await writeFile(
      artifactPath,
      original
        .replace('knowledge_status: "active"', 'knowledge_status: "archived"')
        .replace('type: "related_to"', 'type: "supports"'),
      "utf8"
    );

    const after = await buildRebuildProjection(root, "2026-07-20T08:00:00.000Z");
    assert.notEqual(before.snapshotId, after.snapshotId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("state projection tolerates missing optional discovery directories", async () => {
  const root = await tempRoot("aiwiki-state-minimal");
  try {
    await writeMarkdown(root, "03-sources/article-cards/source.md", [
      "---",
      'type: "source_card"',
      'title: "Minimal Source"',
      'capsule_id: "src_minimal"',
      'source_url: "https://example.com/minimal"',
      "---",
      "",
      "Minimal source body"
    ].join("\n"));
    await writeMarkdown(root, "05-wiki/source-knowledge/entry.md", [
      "---",
      'type: "wiki_entry"',
      'title: "Minimal Entry"',
      'capsule_id: "src_minimal"',
      'knowledge_status: "active"',
      'confidence_level: "medium"',
      'staleness: "fresh"',
      'evidence_refs: ["03-sources/article-cards/source.md"]',
      'evidence_count: 1',
      "---",
      "",
      "Minimal entry body"
    ].join("\n"));

    const projection = await buildRebuildProjection(root, "2026-07-20T08:00:00.000Z");
    assert.equal(projection.artifacts.data.length, 2);
    assert.equal(projection.capsules.data.length, 1);
    assert.equal(projection.relationships.data.length, 0);
    assert.equal(projection.lifecycle.data.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("state projection sorts capsule and relationship output deterministically", async () => {
  const root = await tempRoot("aiwiki-state-sort");
  try {
    await writeMarkdown(root, "05-wiki/source-knowledge/zeta-entry.md", [
      "---",
      'type: "wiki_entry"',
      'title: "Zeta Entry"',
      'capsule_id: "zeta"',
      "relationships:",
      '  - type: "related_to"',
      '    target: "05-wiki/source-knowledge/target-zeta.md"',
      "---",
      "",
      "Zeta body"
    ].join("\n"));
    await writeMarkdown(root, "03-sources/article-cards/alpha-source.md", [
      "---",
      'type: "source_card"',
      'title: "Alpha Source"',
      'capsule_id: "alpha"',
      "relationships:",
      '  - type: "related_to"',
      '    target: "03-sources/article-cards/target-alpha.md"',
      "---",
      "",
      "Alpha body"
    ].join("\n"));

    const projection = await buildRebuildProjection(root, "2026-07-20T08:00:00.000Z");
    const capsuleIds = projection.capsules.data.map((item) => item.id);
    const relationshipKeys = projection.relationships.data.map((item) => `${item.source_path}:${item.type}:${item.target}`);

    assert.deepEqual(capsuleIds, [...capsuleIds].sort());
    assert.deepEqual(relationshipKeys, [...relationshipKeys].sort());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createProjectionFixture(name: string): Promise<string> {
  const root = await tempRoot(name);

  await writeMarkdown(root, "02-raw/articles/zeta-raw.md", [
    "---",
    'type: "raw_article"',
    'title: "Projection Alpha Raw"',
    'summary: "Raw import summary"',
    'capsule_id: "src_projection_demo"',
    'source_url: "https://example.com/projection-alpha"',
    'content_fingerprint: "sha256:projection-alpha"',
    'run_id: "run-demo-001"',
    "---",
    "",
    "SECRET_BODY_RAW",
    "",
    "Raw source body"
  ].join("\n"));

  await writeMarkdown(root, "03-sources/article-cards/zeta-source-card.md", [
    "---",
    'type: "source_card"',
    'title: "Projection Alpha Source Card"',
    'summary: "Source card summary"',
    'capsule_id: "src_projection_demo"',
    'source_url: "https://example.com/projection-alpha"',
    'content_fingerprint: "sha256:projection-alpha"',
    'run_id: "run-demo-001"',
    'knowledge_status: "active"',
    'confidence_level: "high"',
    'staleness: "fresh"',
    'evidence_refs: ["02-raw/articles/zeta-raw.md"]',
    'evidence_count: 1',
    "---",
    "",
    "Source card body"
  ].join("\n"));

  await writeMarkdown(root, "04-claims/_suggestions/claims-alpha.md", [
    "---",
    'type: "claim_suggestions"',
    'title: "Projection Alpha Claims"',
    'capsule_id: "src_projection_demo"',
    'run_id: "run-demo-001"',
    "---",
    "",
    "Claim suggestion body"
  ].join("\n"));

  await writeMarkdown(root, "05-wiki/source-knowledge/alpha-entry.md", [
    "---",
    'type: "wiki_entry"',
    'title: "Projection Alpha"',
    'summary: "Stable summary for projection"',
    'description: "Primary entry for rebuildable state"',
    'capsule_id: "src_projection_demo"',
    'slug: "projection-alpha"',
    'source_url: "https://example.com/projection-alpha"',
    'content_fingerprint: "sha256:projection-alpha"',
    'run_id: "run-demo-001"',
    'knowledge_status: "active"',
    'confidence_level: "high"',
    'confidence_score: 0.91',
    'staleness: "fresh"',
    'evidence_refs: ["03-sources/article-cards/zeta-source-card.md"]',
    'evidence_count: 1',
    'timestamp: "2026-07-18T00:00:00.000Z"',
    "relationships:",
    '  - type: "related_to"',
    '    target: "07-topics/ready/topic-alpha.md"',
    '    evidence: "topic linkage"',
    '    confidence_level: "medium"',
    'supersedes: ["05-wiki/source-knowledge/legacy-entry.md"]',
    'superseded_by: ["05-wiki/source-knowledge/future-entry.md"]',
    'contradicted_by: ["05-wiki/source-knowledge/counter-entry.md"]',
    "---",
    "",
    "SECRET_BODY_ALPHA",
    "",
    "Primary wiki body",
    "",
    "## Citations",
    "",
    "- Source Card: 03-sources/article-cards/zeta-source-card.md"
  ].join("\n"));

  await writeMarkdown(root, "07-topics/ready/topic-alpha.md", [
    "---",
    'type: "topic_candidates"',
    'title: "Projection Alpha Topic"',
    'capsule_id: "src_projection_demo"',
    'run_id: "run-demo-001"',
    "---",
    "",
    "Topic suggestion body"
  ].join("\n"));

  await writeMarkdown(root, "08-outputs/outlines/outline-alpha.md", [
    "---",
    'type: "draft_outline"',
    'title: "Projection Alpha Outline"',
    'capsule_id: "src_projection_demo"',
    'run_id: "run-demo-001"',
    "---",
    "",
    "Outline body"
  ].join("\n"));

  await writeMarkdown(root, "09-runs/run-demo-001/processing-summary.md", [
    "---",
    'type: "processing_summary"',
    'title: "Projection Alpha Run"',
    'capsule_id: "src_projection_demo"',
    'run_id: "run-demo-001"',
    "---",
    "",
    "Run summary body"
  ].join("\n"));

  return root;
}

async function writeMarkdown(root: string, vaultPath: string, content: string): Promise<void> {
  const target = path.join(root, vaultPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${content}\n`, "utf8");
}
