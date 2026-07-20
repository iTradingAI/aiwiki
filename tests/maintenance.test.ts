import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { buildHealthReport } from "../src/health.js";
import { buildStructuredIndex } from "../src/indexing.js";
import { lintWorkspace } from "../src/lint.js";
import { buildRepairPlan } from "../src/repair-plan.js";
import { initWorkspace } from "../src/workspace.js";
import { tempRoot } from "./helpers.js";

const FIXED_NOW = "2026-07-20T09:00:00.000Z";
const MAINTENANCE_DOMAINS = ["structure", "capsule", "evidence", "lifecycle", "relationship", "index", "user_view", "quality"] as const;

test("maintenance facts classify evidence relationship lifecycle and index risks without writes", async () => {
  const root = await createMaintenanceFixture("aiwiki-maintenance-facts");
  try {
    const before = await workspaceFingerprint(root);
    const report = await lintWorkspace(root, FIXED_NOW, { capsules: true, lifecycle: true, okf: true, maintenance: true });

    assert.ok(report.issues.some((issue) => issue.category === "duplicate_content_fingerprint" && issue.domain === "evidence"));
    assert.ok(report.issues.some((issue) => issue.category === "relationship_missing_target" && issue.domain === "relationship"));
    assert.ok(report.issues.some((issue) => issue.category === "weak_evidence_strong_claim" && issue.domain === "quality"));
    assert.ok(report.issues.some((issue) => issue.category === "index_state" && issue.domain === "index"));
    assert.deepEqual(await workspaceFingerprint(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("maintenance duplicate fingerprints only flag distinct source capsules", async () => {
  const root = await tempRoot("aiwiki-maintenance-fingerprint-boundary");
  try {
    await initWorkspace(root);
    const cardDir = path.join(root, "03-sources", "article-cards");
    const wikiDir = path.join(root, "05-wiki", "source-knowledge");
    await mkdir(cardDir, { recursive: true });
    await mkdir(wikiDir, { recursive: true });
    const sharedFingerprint = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    await writeFile(path.join(cardDir, "same-capsule.md"), sourceCard("same-capsule", sharedFingerprint, "capsule-one"), "utf8");
    await writeFile(path.join(wikiDir, "same-capsule.md"), wikiEntry("same-capsule", sharedFingerprint, "capsule-one"), "utf8");

    const sameCapsule = await lintWorkspace(root, FIXED_NOW, { maintenance: true });
    assert.equal(sameCapsule.issues.some((issue) => issue.category === "duplicate_content_fingerprint"), false);

    await writeFile(path.join(cardDir, "different-capsule.md"), sourceCard("different-capsule", sharedFingerprint, "capsule-two"), "utf8");
    const duplicateCapsules = await lintWorkspace(root, FIXED_NOW, { maintenance: true });
    assert.equal(duplicateCapsules.issues.some((issue) => issue.category === "duplicate_content_fingerprint"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("maintenance relationships resolve existing run artifacts", async () => {
  const root = await tempRoot("aiwiki-maintenance-run-relationship");
  try {
    await initWorkspace(root);
    const wikiDir = path.join(root, "05-wiki", "source-knowledge");
    const runDir = path.join(root, "09-runs", "maintenance-run");
    await mkdir(wikiDir, { recursive: true });
    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(wikiDir, "linked.md"), [
      "---",
      'type: "wiki_entry"',
      "relationships:",
      '  - type: "supports"',
      '    target: "09-runs/maintenance-run/processing-summary.md"',
      "---",
      "",
      "Linked to its processing record.",
      ""
    ].join("\n"), "utf8");
    await writeFile(path.join(runDir, "processing-summary.md"), "# Processing summary\n", "utf8");

    const report = await lintWorkspace(root, FIXED_NOW, { maintenance: true });
    assert.equal(report.issues.some((issue) => issue.category === "relationship_missing_target" && issue.path === "05-wiki/source-knowledge/linked.md"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("maintenance profile includes Source Capsule facts without requiring extra flags", async () => {
  const root = await tempRoot("aiwiki-maintenance-capsule-profile");
  try {
    await initWorkspace(root);
    const cardDir = path.join(root, "03-sources", "article-cards");
    await mkdir(cardDir, { recursive: true });
    await writeFile(path.join(cardDir, "orphan-capsule.md"), sourceCard(
      "orphan-capsule",
      "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "orphan-capsule"
    ), "utf8");

    const report = await lintWorkspace(root, FIXED_NOW, { maintenance: true });
    assert.equal(report.issues.some((issue) => issue.category === "capsule_missing_primary" && issue.domain === "capsule"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("health reports every maintenance domain and never creates a report artifact", async () => {
  const root = await createMaintenanceFixture("aiwiki-maintenance-health");
  try {
    const before = await workspaceFingerprint(root);
    const report = await buildHealthReport(root, FIXED_NOW);

    assert.equal(report.schema_version, "aiwiki.health.v1");
    assert.deepEqual(Object.keys(report.summary.by_domain), [...MAINTENANCE_DOMAINS]);
    assert.equal(report.derived_state.index, "stale");
    assert.equal(report.derived_state.graph, "missing");
    assert.equal(report.recommended_next_action, "repair_structure");
    assert.equal(report.issues.some((issue) => issue.domain === "evidence"), true);
    assert.deepEqual(await workspaceFingerprint(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repair plan is deterministic advisory output and never modifies the workspace", async () => {
  const root = await createMaintenanceFixture("aiwiki-maintenance-repair-plan");
  try {
    const before = await workspaceFingerprint(root);
    const plan = await buildRepairPlan(root, FIXED_NOW);

    assert.equal(plan.schema_version, "aiwiki.repair_plan.v1");
    assert.equal(plan.dry_run, true);
    assert.equal(plan.would_write, false);
    assert.ok(plan.items.length > 0);
    for (const item of plan.items) {
      assert.ok(item.id);
      assert.ok(item.evidence.length > 0);
      assert.ok(item.suggested_changes.length > 0);
      assert.ok(item.affected_files.length > 0);
      assert.match(item.suggested_command, /^aiwiki /);
    }
    assert.deepEqual(await buildRepairPlan(root, FIXED_NOW), plan);
    assert.deepEqual(await workspaceFingerprint(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createMaintenanceFixture(name: string): Promise<string> {
  const root = await tempRoot(name);
  await initWorkspace(root);

  const cardDir = path.join(root, "03-sources", "article-cards");
  const wikiDir = path.join(root, "05-wiki", "source-knowledge");
  await mkdir(cardDir, { recursive: true });
  await mkdir(wikiDir, { recursive: true });

  for (const filename of ["duplicate-a.md", "duplicate-b.md"]) {
    await writeFile(path.join(cardDir, filename), [
      "---",
      'type: "source_card"',
      `title: "${filename}"`,
      'source_url: "https://example.com/duplicate"',
      'content_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
      "---",
      "",
      "Duplicate source evidence.",
      ""
    ].join("\n"), "utf8");
  }

  const entry = path.join(wikiDir, "weak.md");
  await writeFile(entry, [
    "---",
    'type: "wiki_entry"',
    'title: "Weak claim"',
    'capsule_id: "maintenance-fixture"',
    'knowledge_status: "contradicted"',
    'confidence_level: "high"',
    'staleness: "fresh"',
    "evidence_count: 0",
    "relationships:",
    '  - type: "supports"',
    '    target: "05-wiki/source-knowledge/missing.md"',
    "---",
    "",
    "[[05-wiki/source-knowledge/missing]]",
    ""
  ].join("\n"), "utf8");

  await buildStructuredIndex(root, FIXED_NOW);
  await writeFile(entry, (await readFile(entry, "utf8")) + "Changed after index build.\n", "utf8");
  return root;
}

function sourceCard(slug: string, fingerprint: string, capsuleId: string): string {
  return [
    "---",
    'type: "source_card"',
    `title: "${slug}"`,
    `capsule_id: "${capsuleId}"`,
    `content_fingerprint: "${fingerprint}"`,
    "---",
    "",
    "Source evidence.",
    ""
  ].join("\n");
}

function wikiEntry(slug: string, fingerprint: string, capsuleId: string): string {
  return [
    "---",
    'type: "wiki_entry"',
    `title: "${slug}"`,
    `capsule_id: "${capsuleId}"`,
    `content_fingerprint: "${fingerprint}"`,
    "---",
    "",
    "Knowledge entry.",
    ""
  ].join("\n");
}

async function workspaceFingerprint(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const file of await listFiles(root)) {
    hash.update(file);
    hash.update(await readFile(path.join(root, file)));
  }
  return hash.digest("hex");
}

async function listFiles(root: string, relative = ""): Promise<string[]> {
  const target = path.join(root, relative);
  const entries = await readdir(target, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, child));
    } else if (entry.isFile()) {
      files.push(child.replace(/\\/g, "/"));
    }
  }
  return files;
}
