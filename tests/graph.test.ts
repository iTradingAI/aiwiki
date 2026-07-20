import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { buildContext } from "../src/context.js";
import { buildRelationshipGraph, inspectRelationshipGraph } from "../src/graph.js";
import { tempRoot } from "./helpers.js";

const FIXED_NOW = "2026-07-20T08:00:00.000Z";

test("relationship graph projects deterministic evidence-backed edges without Markdown bodies", async () => {
  const root = await createGraphFixture("aiwiki-graph-projection");
  try {
    const graph = await buildRelationshipGraph(root, FIXED_NOW);

    assert.equal(graph.schema_version, "aiwiki.graph.v1");
    assert.equal(graph.root, ".");
    assert.equal(graph.summary.artifact_nodes, 6);
    assert.equal(graph.summary.capsule_nodes, 3);
    assert.equal(graph.nodes.every((node, index) => index === 0 || graph.nodes[index - 1]!.id.localeCompare(node.id) < 0), true);
    assert.equal(graph.edges.every((edge, index) => index === 0 || edgeKey(graph.edges[index - 1]!).localeCompare(edgeKey(edge)) < 0), true);

    assert.ok(hasEdge(graph, {
      source: "05-wiki/source-knowledge/alpha.md",
      target: "02-raw/articles/raw.md",
      type: "derives_from",
      origin: "frontmatter"
    }));
    assert.ok(hasEdge(graph, {
      source: "05-wiki/source-knowledge/alpha.md",
      target: "03-sources/article-cards/source.md",
      type: "related_to",
      origin: "wikilink"
    }));
    assert.ok(hasEdge(graph, {
      source: "05-wiki/source-knowledge/alpha.md",
      target: "02-raw/articles/raw.md",
      type: "derived_from",
      origin: "generated_metadata"
    }));
    assert.ok(hasEdge(graph, {
      source: "05-wiki/source-knowledge/alpha.md",
      target: "03-sources/article-cards/source.md",
      type: "supports",
      origin: "generated_metadata"
    }));
    assert.ok(hasEdge(graph, {
      source: "05-wiki/source-knowledge/alpha.md",
      target: "05-wiki/source-knowledge/beta.md",
      type: "supersedes",
      origin: "compatibility_frontmatter"
    }));
    assert.ok(graph.edges.some((edge) => edge.source_id === "artifact:05-wiki/source-knowledge/alpha.md"
      && edge.target_id === "capsule:shared-capsule"
      && edge.origin === "capsule_membership"));

    assert.deepEqual(graph.unresolved_edges, [
      {
        source_path: "05-wiki/source-knowledge/alpha.md",
        raw_target: "05-wiki/source-knowledge/missing.md",
        origin: "wikilink",
        reason: "missing_target"
      },
      {
        source_path: "05-wiki/source-knowledge/alpha.md",
        raw_target: "https://example.com/external",
        origin: "wikilink",
        reason: "invalid_target"
      }
    ]);

    const serialized = JSON.stringify(graph);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes("SECRET_GRAPH_BODY"), false);

    const persisted = JSON.parse(await readFile(path.join(root, ".aiwiki", "state", "graph.json"), "utf8")) as typeof graph;
    assert.deepEqual(persisted, graph);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("relationship graph excludes unsafe capsule identifiers", async () => {
  const root = await tempRoot("aiwiki-graph-unsafe-capsule");
  try {
    await writeMarkdown(root, "05-wiki/source-knowledge/unsafe.md", [
      "---",
      'type: "wiki_entry"',
      'title: "Unsafe capsule fixture"',
      'capsule_id: "../outside"',
      "---",
      "",
      "Body"
    ].join("\n"));

    const graph = await buildRelationshipGraph(root, FIXED_NOW);
    assert.equal(graph.summary.capsule_nodes, 0);
    assert.equal(JSON.stringify(graph).includes("../outside"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("relationship graph classifies missing fresh stale and invalid without breaking Markdown context", async () => {
  const root = await createGraphFixture("aiwiki-graph-status");
  const graphPath = path.join(root, ".aiwiki", "state", "graph.json");
  try {
    const missing = await inspectRelationshipGraph(root);
    assert.equal(missing.schema_version, "aiwiki.graph_status.v1");
    assert.equal(missing.state, "missing");
    assert.equal(missing.source_snapshot_id.length, 64);
    await assert.rejects(access(graphPath));

    const before = await buildContext(root, "alpha", {}, FIXED_NOW);
    const built = await buildRelationshipGraph(root, FIXED_NOW);
    const fresh = await inspectRelationshipGraph(root);
    assert.equal(fresh.state, "fresh");
    assert.equal(fresh.source_snapshot_id, built.source_snapshot_id);
    assert.equal(fresh.graph_snapshot_id, built.source_snapshot_id);
    assert.deepEqual(fresh.summary, built.summary);

    const alphaPath = path.join(root, "05-wiki", "source-knowledge", "alpha.md");
    const alphaStat = await stat(alphaPath);
    await utimes(alphaPath, alphaStat.atime, new Date(alphaStat.mtime.getTime() + 60_000));
    assert.equal((await inspectRelationshipGraph(root)).state, "fresh");

    await writeFile(alphaPath, (await readFile(alphaPath, "utf8")) + "\nMutation makes graph stale.\n", "utf8");
    assert.equal((await inspectRelationshipGraph(root)).state, "stale");

    await buildRelationshipGraph(root, FIXED_NOW);
    await writeFile(graphPath, "{", "utf8");
    assert.equal((await inspectRelationshipGraph(root)).state, "invalid");

    await buildRelationshipGraph(root, FIXED_NOW);
    const tampered = JSON.parse(await readFile(graphPath, "utf8")) as { summary: { edges: number } };
    tampered.summary.edges += 1;
    await writeFile(graphPath, JSON.stringify(tampered), "utf8");
    assert.equal((await inspectRelationshipGraph(root)).state, "invalid");

    await rm(graphPath);
    assert.equal((await inspectRelationshipGraph(root)).state, "missing");
    const afterDelete = await buildContext(root, "alpha", {}, FIXED_NOW);
    assert.deepEqual(afterDelete, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("relationship graph rejects an existing graph lock without replacing it", async () => {
  const root = await createGraphFixture("aiwiki-graph-lock");
  const lockPath = path.join(root, ".aiwiki", "locks", "graph.lock");
  try {
    await mkdir(path.dirname(lockPath), { recursive: true });
    await writeFile(lockPath, '{"pid":1}\n', "utf8");
    await assert.rejects(buildRelationshipGraph(root, FIXED_NOW), /graph lock already exists/i);
    assert.equal(await readFile(lockPath, "utf8"), '{"pid":1}\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createGraphFixture(name: string): Promise<string> {
  const root = await tempRoot(name);
  await writeMarkdown(root, "02-raw/articles/raw.md", [
    "---",
    'type: "raw_article"',
    'title: "Raw"',
    'capsule_id: "shared-capsule"',
    "---",
    "",
    "Raw body"
  ].join("\n"));
  await writeMarkdown(root, "03-sources/article-cards/source.md", [
    "---",
    'type: "source_card"',
    'title: "Source"',
    'capsule_id: "shared-capsule"',
    "---",
    "",
    "Source body"
  ].join("\n"));
  await writeMarkdown(root, "04-claims/_suggestions/claims.md", [
    "---",
    'type: "claim_suggestions"',
    'title: "Claims"',
    'capsule_id: "shared-capsule"',
    "relationships:",
    '  - type: "supports"',
    '    target: "03-sources/article-cards/source.md"',
    "---",
    "",
    "Claims body"
  ].join("\n"));
  await writeMarkdown(root, "05-wiki/source-knowledge/alpha.md", [
    "---",
    'type: "wiki_entry"',
    'title: "Alpha"',
    'capsule_id: "shared-capsule"',
    'raw_file: "02-raw/articles/raw.md"',
    'source_card: "[[03-sources/article-cards/source|Source]]"',
    "supersedes:",
    '  - "05-wiki/source-knowledge/beta.md"',
    "relationships:",
    '  - type: "derives_from"',
    '    target: "02-raw/articles/raw.md"',
    '  - type: "contradicts"',
    '    target: "03-sources/article-cards/source.md"',
    "---",
    "",
    "SECRET_GRAPH_BODY",
    "",
    "[[03-sources/article-cards/source|Source]]",
    "[[05-wiki/source-knowledge/beta#section]]",
    "[[05-wiki/source-knowledge/beta|Beta alias]]",
    "[[05-wiki/source-knowledge/missing.md]]",
    "[[https://example.com/external]]"
  ].join("\n"));
  await writeMarkdown(root, "05-wiki/source-knowledge/beta.md", [
    "---",
    'type: "wiki_entry"',
    'title: "Beta"',
    'capsule_id: "other-capsule"',
    "---",
    "",
    "Beta body"
  ].join("\n"));
  await writeMarkdown(root, "07-topics/ready/topic.md", [
    "---",
    'type: "topic_candidates"',
    'title: "Topic"',
    "relationships:",
    '  - type: "mentions_topic"',
    '    target: "05-wiki/source-knowledge/alpha.md"',
    "---",
    "",
    "Topic body"
  ].join("\n"));
  return root;
}

async function writeMarkdown(root: string, vaultPath: string, content: string): Promise<void> {
  const target = path.join(root, vaultPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content + "\n", "utf8");
}

function hasEdge(
  graph: Awaited<ReturnType<typeof buildRelationshipGraph>>,
  expected: { source: string; target: string; type: string; origin: string }
): boolean {
  return graph.edges.some((edge) => edge.source_id === `artifact:${expected.source}`
    && edge.target_id === `artifact:${expected.target}`
    && edge.type === expected.type
    && edge.origin === expected.origin);
}

function edgeKey(edge: Awaited<ReturnType<typeof buildRelationshipGraph>>["edges"][number]): string {
  return [edge.source_id, edge.target_id, edge.type, edge.origin, edge.evidence_ref ?? ""].join("\u0000");
}
