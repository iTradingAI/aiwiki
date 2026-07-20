import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { buildContext } from "../src/context.js";
import { buildStructuredIndex, inspectStructuredIndex } from "../src/indexing.js";
import { tempRoot } from "./helpers.js";

const FIXED_NOW = "2026-07-20T08:00:00.000Z";

test("structured index stores deterministic relative metadata and local wikilink counts", async () => {
  const root = await createIndexFixture("aiwiki-index-projection");
  try {
    const first = await buildStructuredIndex(root, FIXED_NOW);
    const second = await buildStructuredIndex(root, "2026-07-20T09:00:00.000Z");

    assert.equal(first.schema_version, "aiwiki.index.v1");
    assert.equal(first.root, ".");
    assert.equal(first.source_snapshot_id, second.source_snapshot_id);
    assert.deepEqual(first.records, second.records);
    assert.deepEqual(first.records.map((entry) => entry.path), [...first.records.map((entry) => entry.path)].sort());
    assert.equal(first.records.every((entry) => !entry.path.startsWith("/") && !entry.path.includes(":")), true);
    assert.equal(first.records.every((entry) => entry.outbound_paths.every((target) => !target.startsWith("/") && !target.includes(":"))), true);
    assert.equal(first.summary.total, 6);
    assert.equal(first.summary.primary, 2);
    assert.equal(first.summary.supporting, 4);
    assert.equal(first.summary.debug, 0);
    assert.equal(first.summary.source_urls, 1);
    assert.equal(first.summary.duplicate_source_urls, 1);
    assert.equal(first.summary.outbound_links, 5);
    assert.equal(first.summary.inbound_links, 5);

    const source = record(first, "03-sources/article-cards/source.md");
    const claims = record(first, "04-claims/_suggestions/claims.md");
    const alpha = record(first, "05-wiki/source-knowledge/alpha.md");
    const assets = record(first, "06-assets/_suggestions/assets.md");
    const beta = record(first, "05-wiki/source-knowledge/beta.md");
    assert.equal(claims.kind, "claim_suggestions");
    assert.equal(assets.kind, "asset_suggestions");
    assert.deepEqual(alpha.outbound_paths, ["03-sources/article-cards/source.md", "05-wiki/source-knowledge/beta.md"]);
    assert.deepEqual(source.inbound_paths, ["04-claims/_suggestions/claims.md", "05-wiki/source-knowledge/alpha.md"]);
    assert.deepEqual(beta.outbound_paths, ["05-wiki/source-knowledge/alpha.md"]);
    assert.deepEqual(alpha.inbound_paths, ["05-wiki/source-knowledge/beta.md", "06-assets/_suggestions/assets.md"]);
    assert.deepEqual(beta.inbound_paths, ["05-wiki/source-knowledge/alpha.md"]);

    const serialized = JSON.stringify(first);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes("SECRET_INDEX_BODY"), false);

    const persisted = JSON.parse(await readFile(path.join(root, ".aiwiki", "state", "index.json"), "utf8")) as typeof first;
    assert.deepEqual(persisted, second);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structured index classifies missing fresh stale and invalid without breaking Markdown context", async () => {
  const root = await createIndexFixture("aiwiki-index-status");
  const indexPath = path.join(root, ".aiwiki", "state", "index.json");
  try {
    const missing = await inspectStructuredIndex(root);
    assert.equal(missing.schema_version, "aiwiki.index_status.v1");
    assert.equal(missing.state, "missing");
    assert.equal(missing.source_snapshot_id.length, 64);
    assert.deepEqual(missing.summary, emptySummary());
    assert.equal(missing.file, ".aiwiki/state/index.json");
    await assert.rejects(access(indexPath));

    const before = await buildContext(root, "alpha", {}, FIXED_NOW);
    const built = await buildStructuredIndex(root, FIXED_NOW);
    const fresh = await inspectStructuredIndex(root);
    assert.equal(fresh.state, "fresh");
    assert.equal(fresh.source_snapshot_id, built.source_snapshot_id);
    assert.equal(fresh.indexed_snapshot_id, built.source_snapshot_id);
    assert.deepEqual(fresh.summary, built.summary);

    const alphaPath = path.join(root, "05-wiki", "source-knowledge", "alpha.md");
    const alphaStat = await stat(alphaPath);
    await utimes(alphaPath, alphaStat.atime, new Date(alphaStat.mtime.getTime() + 60_000));
    assert.equal((await inspectStructuredIndex(root)).state, "fresh");

    const alphaContent = await readFile(alphaPath, "utf8");
    await writeFile(alphaPath, alphaContent + "\nMarkdown mutation makes the index stale.\n", "utf8");
    assert.equal((await inspectStructuredIndex(root)).state, "stale");

    await buildStructuredIndex(root, FIXED_NOW);
    await writeFile(indexPath, "{", "utf8");
    assert.equal((await inspectStructuredIndex(root)).state, "invalid");

    await buildStructuredIndex(root, FIXED_NOW);
    const tampered = JSON.parse(await readFile(indexPath, "utf8")) as { records: Array<{ kind: string }> };
    tampered.records[0]!.kind = "pro_only_kind";
    await writeFile(indexPath, JSON.stringify(tampered), "utf8");
    assert.equal((await inspectStructuredIndex(root)).state, "invalid");

    await rm(indexPath);
    assert.equal((await inspectStructuredIndex(root)).state, "missing");
    const afterDelete = await buildContext(root, "alpha", {}, FIXED_NOW);
    assert.deepEqual(afterDelete, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structured index rejects an existing index lock without replacing it", async () => {
  const root = await createIndexFixture("aiwiki-index-lock");
  const lockPath = path.join(root, ".aiwiki", "locks", "index.lock");
  try {
    await mkdir(path.dirname(lockPath), { recursive: true });
    await writeFile(lockPath, '{"pid": 1}\n', "utf8");
    await assert.rejects(buildStructuredIndex(root, FIXED_NOW), /index lock already exists/i);
    assert.equal(await readFile(lockPath, "utf8"), '{"pid": 1}\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createIndexFixture(name: string): Promise<string> {
  const root = await tempRoot(name);
  await writeMarkdown(root, "03-sources/article-cards/source.md", [
    "---",
    'type: "source_card"',
    'title: "Shared Source"',
    'summary: "Source summary"',
    'source_url: "https://example.com/shared"',
    "---",
    "",
    "Source body"
  ].join("\n"));
  await writeMarkdown(root, "04-claims/_suggestions/claims.md", [
    "---",
    'type: "claim_suggestions"',
    'title: "Claims"',
    "---",
    "",
    "[[03-sources/article-cards/source|Source]]"
  ].join("\n"));
  await writeMarkdown(root, "05-wiki/source-knowledge/alpha.md", [
    "---",
    'type: "wiki_entry"',
    'title: "Alpha"',
    'summary: "Alpha summary"',
    'source_url: "https://example.com/shared"',
    "---",
    "",
    "SECRET_INDEX_BODY",
    "",
    "[[03-sources/article-cards/source|Source]]",
    "[[05-wiki/source-knowledge/beta|Beta]]",
    "[[05-wiki/source-knowledge/beta#section]]",
    "[[05-wiki/source-knowledge/beta|Beta alias]]",
    "[[05-wiki/source-knowledge/missing.md]]",
    "[[https://example.com/external]]"
  ].join("\n"));
  await writeMarkdown(root, "05-wiki/source-knowledge/beta.md", [
    "---",
    'type: "wiki_entry"',
    'title: "Beta"',
    "---",
    "",
    "[[05-wiki/source-knowledge/alpha|Alpha]]"
  ].join("\n"));
  await writeMarkdown(root, "06-assets/_suggestions/assets.md", [
    "---",
    'type: "asset_suggestions"',
    'title: "Assets"',
    "---",
    "",
    "[[05-wiki/source-knowledge/alpha|Alpha]]"
  ].join("\n"));
  await writeMarkdown(root, "08-outputs/outlines/outline.md", [
    "---",
    'type: "draft_outline"',
    'title: "Outline"',
    "---",
    "",
    "Outline body"
  ].join("\n"));
  return root;
}

async function writeMarkdown(root: string, vaultPath: string, content: string): Promise<void> {
  const target = path.join(root, vaultPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content + "\n", "utf8");
}

function record(index: Awaited<ReturnType<typeof buildStructuredIndex>>, vaultPath: string) {
  const found = index.records.find((entry) => entry.path === vaultPath);
  assert.ok(found, "missing index record: " + vaultPath);
  return found;
}

function emptySummary() {
  return {
    total: 0,
    primary: 0,
    supporting: 0,
    debug: 0,
    source_urls: 0,
    duplicate_source_urls: 0,
    outbound_links: 0,
    inbound_links: 0
  };
}
