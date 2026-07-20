import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildGraphContext } from "../src/graph-context.js";
import { buildRelationshipGraph } from "../src/graph.js";
import { tempRoot } from "./helpers.js";

const FIXED_NOW = "2026-07-20T08:00:00.000Z";

test("graph context is read-only and reports missing, stale, and invalid graph state", async () => {
  const root = await createGraphContextFixture("aiwiki-graph-context-state");
  const graphPath = path.join(root, ".aiwiki", "state", "graph.json");
  try {
    const missing = await buildGraphContext(root, "Unique Seed", {}, FIXED_NOW);
    assert.equal(missing.schema_version, "aiwiki.context.v2");
    assert.equal(missing.graph.state, "missing");
    assert.deepEqual(missing.relationships, []);
    assert.ok(missing.missing_context.includes("relationship_graph_missing"));
    assert.equal(missing.recommended_next_action, "inspect_or_build_graph_explicitly");
    await assert.rejects(access(graphPath));

    await buildRelationshipGraph(root, FIXED_NOW);
    const freshGraph = await readFile(graphPath, "utf8");
    await writeMarkdown(root, "07-topics/ready/stale.md", topicMarkdown("Stale Graph", "05-wiki/source-knowledge/alpha.md"));
    const stale = await buildGraphContext(root, "Unique Seed", {}, FIXED_NOW);
    assert.equal(stale.graph.state, "stale");
    assert.deepEqual(stale.relationships, []);
    assert.equal(await readFile(graphPath, "utf8"), freshGraph);

    await writeFile(graphPath, "not json\n", "utf8");
    const invalid = await buildGraphContext(root, "Unique Seed", {}, FIXED_NOW);
    assert.equal(invalid.graph.state, "invalid");
    assert.deepEqual(invalid.relationships, []);
    assert.equal(await readFile(graphPath, "utf8"), "not json\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("graph context traces bounded inbound and outbound paths with evidence and lifecycle risk", async () => {
  const root = await createGraphContextFixture("aiwiki-graph-context-paths");
  try {
    await buildRelationshipGraph(root, FIXED_NOW);
    const depthOne = await buildGraphContext(root, "Unique Seed", { graphDepth: 1 }, FIXED_NOW);
    assert.equal(depthOne.graph.state, "fresh");
    assert.equal(depthOne.query_scope.graph_depth, 1);
    assert.equal(depthOne.recommended_next_action, "use_graph_context_for_answer");

    const raw = depthOne.relationships.find((item) => item.target.path === "02-raw/articles/raw.md");
    assert.ok(raw);
    assert.equal(raw.relationship_path[0]?.type, "derives_from");
    assert.equal(raw.relationship_path[0]?.traversal, "outbound");
    assert.equal(raw.evidence_status, "explicit_frontmatter");

    const review = depthOne.relationships.find((item) => item.target.path === "05-wiki/source-knowledge/review.md");
    assert.ok(review);
    assert.equal(review.relationship_path[0]?.type, "supports");
    assert.equal(review.relationship_path[0]?.traversal, "inbound");
    assert.equal(review.risk, "medium");
    assert.ok(review.must_not_claim.includes("lifecycle_needs_review"));
    assert.ok(review.must_not_claim.includes("evidence_or_grounding_needs_review"));

    assert.equal(depthOne.relationships.some((item) => item.target.path === "07-topics/ready/dependent.md"), false);
    const depthTwo = await buildGraphContext(root, "Unique Seed", { graphDepth: 2 }, FIXED_NOW);
    const dependent = depthTwo.relationships.find((item) => item.target.path === "07-topics/ready/dependent.md");
    assert.ok(dependent);
    assert.equal(dependent.relationship_path.length, 2);
    assert.deepEqual(await buildGraphContext(root, "Unique Seed", { graphDepth: 2 }, FIXED_NOW), depthTwo);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("graph context flags an explicit contradiction before an Agent can treat it as current evidence", async () => {
  const root = await createGraphContextFixture("aiwiki-graph-context-conflict");
  try {
    await writeMarkdown(root, "05-wiki/source-knowledge/conflict.md", [
      "---",
      'type: "wiki_entry"',
      'title: "Graph Conflict"',
      'capsule_id: "graph-conflict"',
      'knowledge_status: "active"',
      'confidence_level: "high"',
      'staleness: "fresh"',
      "evidence_count: 1",
      "relationships:",
      '  - type: "contradicts"',
      '    target: "05-wiki/source-knowledge/alpha.md"',
      "---",
      "",
      "Conflicting evidence"
    ].join("\n"));
    await buildRelationshipGraph(root, FIXED_NOW);
    const result = await buildGraphContext(root, "Unique Seed", { graphDepth: 1 }, FIXED_NOW);
    const conflict = result.relationships.find((item) => item.target.path === "05-wiki/source-knowledge/conflict.md");
    assert.ok(conflict);
    assert.equal(conflict.risk, "high");
    assert.ok(conflict.must_not_claim.includes("relationship_conflict_present"));
    assert.equal(result.recommended_next_action, "review_graph_context_before_answer");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("graph context marks relationship expansion when the bounded response is truncated", async () => {
  const root = await createGraphContextFixture("aiwiki-graph-context-truncation");
  try {
    for (let index = 0; index < 51; index += 1) {
      const file = `07-topics/ready/related-${String(index).padStart(2, "0")}.md`;
      await writeMarkdown(root, file, topicMarkdown(`Related ${index}`, "05-wiki/source-knowledge/alpha.md"));
    }
    await buildRelationshipGraph(root, FIXED_NOW);
    const result = await buildGraphContext(root, "Unique Seed", { graphDepth: 1 }, FIXED_NOW);
    assert.equal(result.seed_capsules.length, 1);
    assert.ok(result.graph.summary.edges >= 51);
    assert.equal(result.relationships.length, 50);
    assert.ok(result.missing_context.includes("relationship_expansion_truncated"));
    assert.equal(result.recommended_next_action, "review_graph_context_before_answer");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createGraphContextFixture(name: string): Promise<string> {
  const root = await tempRoot(name);
  await writeMarkdown(root, "02-raw/articles/raw.md", [
    "---",
    'type: "raw_article"',
    'title: "Graph Raw"',
    'capsule_id: "graph-raw"',
    "---",
    "",
    "Raw evidence"
  ].join("\n"));
  await writeMarkdown(root, "05-wiki/source-knowledge/alpha.md", [
    "---",
    'type: "wiki_entry"',
    'title: "Unique Seed"',
    'capsule_id: "graph-alpha"',
    'knowledge_status: "active"',
    'confidence_level: "high"',
    'staleness: "fresh"',
    "evidence_count: 1",
    "relationships:",
    '  - type: "derives_from"',
    '    target: "02-raw/articles/raw.md"',
    "---",
    "",
    "Graph Alpha"
  ].join("\n"));
  await writeMarkdown(root, "05-wiki/source-knowledge/review.md", [
    "---",
    'type: "wiki_entry"',
    'title: "Graph Review"',
    'capsule_id: "graph-review"',
    'knowledge_status: "needs_review"',
    'confidence_level: "low"',
    'staleness: "aging"',
    "evidence_count: 0",
    "relationships:",
    '  - type: "supports"',
    '    target: "05-wiki/source-knowledge/alpha.md"',
    "---",
    "",
    "Review evidence"
  ].join("\n"));
  await writeMarkdown(root, "07-topics/ready/dependent.md", topicMarkdown("Graph Dependent", "05-wiki/source-knowledge/review.md"));
  return root;
}

function topicMarkdown(title: string, target: string): string {
  return [
    "---",
    'type: "topic_candidates"',
    `title: "${title}"`,
    "relationships:",
    '  - type: "mentions_topic"',
    `    target: "${target}"`,
    "---",
    "",
    title
  ].join("\n");
}

async function writeMarkdown(root: string, vaultPath: string, content: string): Promise<void> {
  const target = path.join(root, vaultPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content + "\n", "utf8");
}
