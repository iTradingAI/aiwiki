import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { buildHealthReport, writeHealthReport } from "../src/health.js";
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

test("health reports deterministic Core 0.5 knowledge metrics", async () => {
  const root = await createMaintenanceFixture("aiwiki-maintenance-health-metrics");
  try {
    const report = await buildHealthReport(root, FIXED_NOW);

    assert.deepEqual(report.metrics, {
      capsules: {
        total: 3,
        with_primary: 2,
        primary_completeness: { numerator: 2, denominator: 3 }
      },
      evidence: {
        capsules_with_evidence: 2,
        coverage: { numerator: 2, denominator: 3 }
      },
      relationships: {
        edge_count: 2,
        per_capsule: { numerator: 2, denominator: 3 }
      },
      orphaned_capsules: {
        count: 1,
        rate: { numerator: 1, denominator: 3 }
      },
      lifecycle: {
        stale_count: 1,
        contradiction_count: 1,
        scaffold_count: 1
      },
      index_freshness: "stale",
      recent_growth_topics: [
        {
          title: "Newer maintenance topic",
          path: "07-topics/ready/newer-topic.md",
          created_at: "2026-07-19T09:00:00.000Z"
        },
        {
          title: "Older maintenance topic",
          path: "07-topics/ready/older-topic.md",
          created_at: "2026-07-18T09:00:00.000Z"
        }
      ]
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("health report write creates only a managed dashboard and JSON run artifact", async () => {
  const root = await createMaintenanceFixture("aiwiki-maintenance-health-write");
  try {
    const beforeFiles = await listFiles(root);
    const report = await buildHealthReport(root, FIXED_NOW);
    const written = await writeHealthReport(root, report, FIXED_NOW);

    assert.equal(written.schema_version, "aiwiki.health_report.v1");
    assert.equal(written.dashboard_path, "dashboards/Knowledge Health.md");
    assert.equal(written.run_path, "09-runs/health-20260720T090000000Z/health-report.json");
    assert.deepEqual(written.health, report);

    const afterFiles = await listFiles(root);
    assert.deepEqual(afterFiles.filter((file) => !beforeFiles.includes(file)), [
      "09-runs/health-20260720T090000000Z/health-report.json",
      "dashboards/Knowledge Health.md"
    ]);
    assert.equal(JSON.parse(await readFile(path.join(root, written.run_path), "utf8")).schema_version, "aiwiki.health_report.v1");
    const dashboard = await readFile(path.join(root, written.dashboard_path), "utf8");
    assert.match(dashboard, /<!-- AIWIKI:HEALTH:START -->/);
    assert.match(dashboard, /<!-- AIWIKI:HEALTH:END -->/);
    assert.match(dashboard, /主条目完整度\s*\|\s*2\/3/);
    assert.match(dashboard, /Newer maintenance topic/);

    await writeFile(path.join(root, written.dashboard_path), `${dashboard}\n## Manual note\nKeep this text.\n`, "utf8");
    const secondReport = await buildHealthReport(root, "2026-07-20T09:01:00.000Z");
    const secondWrite = await writeHealthReport(root, secondReport, "2026-07-20T09:01:00.000Z");
    assert.equal(secondWrite.run_path, "09-runs/health-20260720T090100000Z/health-report.json");
    assert.match(await readFile(path.join(root, secondWrite.dashboard_path), "utf8"), /Keep this text\./);
    await assert.rejects(readFile(path.join(root, ".aiwiki", "state", "artifacts.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("health report write refuses to overwrite an unmanaged dashboard", async () => {
  const root = await tempRoot("aiwiki-maintenance-health-dashboard-collision");
  try {
    await initWorkspace(root);
    const dashboardPath = path.join(root, "dashboards", "Knowledge Health.md");
    const original = "# Personal dashboard\nDo not replace.\n";
    await writeFile(dashboardPath, original, "utf8");

    await assert.rejects(
      writeHealthReport(root, await buildHealthReport(root, FIXED_NOW), FIXED_NOW),
      /managed health markers/
    );
    assert.equal(await readFile(dashboardPath, "utf8"), original);
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
  const topicDir = path.join(root, "07-topics", "ready");
  await mkdir(cardDir, { recursive: true });
  await mkdir(wikiDir, { recursive: true });
  await mkdir(topicDir, { recursive: true });

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

  await writeFile(path.join(cardDir, "scaffold-source.md"), sourceCard(
    "scaffold-source",
    "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "scaffold-fixture"
  ), "utf8");
  await writeFile(path.join(wikiDir, "scaffold.md"), [
    "---",
    'type: "wiki_entry"',
    'title: "Scaffold entry"',
    'capsule_id: "scaffold-fixture"',
    'knowledge_status: "stale"',
    'confidence_level: "medium"',
    'staleness: "stale"',
    "evidence_count: 1",
    'quality: "scaffold"',
    "relationships:",
    '  - type: "supports"',
    '    target: "05-wiki/source-knowledge/weak.md"',
    "---",
    "",
    "Scaffold knowledge entry.",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(topicDir, "older-topic.md"), topicCandidate(
    "Older maintenance topic",
    "2026-07-18T09:00:00.000Z"
  ), "utf8");
  await writeFile(path.join(topicDir, "newer-topic.md"), topicCandidate(
    "Newer maintenance topic",
    "2026-07-19T09:00:00.000Z"
  ), "utf8");

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

function topicCandidate(title: string, createdAt: string): string {
  return [
    "---",
    'type: "topic_candidates"',
    `title: "${title}"`,
    'capsule_id: "scaffold-fixture"',
    `created_at: "${createdAt}"`,
    "---",
    "",
    title,
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
