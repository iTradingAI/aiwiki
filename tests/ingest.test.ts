import assert from "node:assert/strict";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { ingestFile, ingestPayload } from "../src/ingest.js";
import { fixturePath, tempRoot } from "./helpers.js";

async function readFixture(name: string) {
  return JSON.parse(await readFile(fixturePath(name), "utf8"));
}

test("ingests agent payload into run and long-term files", async () => {
  const root = await tempRoot("aiwiki-ingest");
  try {
    const result = await ingestPayload(root, await readFixture("agent_payload.url.valid.json"));
    assert.equal(result.generatedFiles.some((file) => file.endsWith("processing-summary.md")), true);
    await assertGeneratedFilesExist(result.generatedFiles);
    assertAllUnderRoot(root, result.generatedFiles);

    const runFiles = await readdir(result.runDir);
    assert.deepEqual(runFiles.sort(), [
      "creative-assets.md",
      "draft-outline.md",
      "payload.json",
      "processing-summary.md",
      "raw.md",
      "source-card.md",
      "topics.md"
    ].sort());

    await stat(path.join(root, "03-sources", "article-cards", "ai-agent-workflow-notes.md"));
    await assertSourceCardFrontmatter(path.join(result.runDir, "source-card.md"));
    await assertSummaryContains(path.join(result.runDir, "processing-summary.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fetch failure writes only payload and summary", async () => {
  const root = await tempRoot("aiwiki-fetch-failed");
  try {
    const result = await ingestPayload(root, await readFixture("agent_payload.fetch_failed.valid.json"));
    const runFiles = await readdir(result.runDir);
    assert.deepEqual(runFiles.sort(), ["payload.json", "processing-summary.md"].sort());
    const summary = await readFile(path.join(result.runDir, "processing-summary.md"), "utf8");
    assert.match(summary, /没有自行抓取网页/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("target_kb is ignored and reported", async () => {
  const root = await tempRoot("aiwiki-target-kb");
  try {
    const result = await ingestPayload(root, await readFixture("agent_payload.target_kb.ignored.json"));
    const summary = await readFile(path.join(result.runDir, "processing-summary.md"), "utf8");
    assert.match(summary, /target_kb=career/);
    await assert.rejects(readdir(path.join(root, "knowledge_bases")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("long-term collisions append run id before extension", async () => {
  const root = await tempRoot("aiwiki-collision");
  try {
    await ingestPayload(root, await readFixture("agent_payload.url.valid.json"));
    const second = await ingestPayload(root, await readFixture("agent_payload.url.valid.json"));
    const claimsDir = path.join(root, "04-claims", "_suggestions");
    const files = await readdir(claimsDir);
    assert.equal(files.includes("ai-agent-workflow-notes-claims.md"), true);
    assert.equal(files.some((file) => /^ai-agent-workflow-notes-claims-.+\.md$/.test(file)), true);
    const summary = await readFile(path.join(second.runDir, "processing-summary.md"), "utf8");
    assert.match(summary, /collision renamed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingest file creates a run from local markdown", async () => {
  const root = await tempRoot("aiwiki-ingest-file");
  try {
    const result = await ingestFile(root, fixturePath("article.zh.md"));
    const payload = JSON.parse(await readFile(path.join(result.runDir, "payload.json"), "utf8")) as { source: { kind: string } };
    assert.equal(payload.source.kind, "file");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function assertGeneratedFilesExist(files: string[]) {
  for (const file of files) {
    await stat(file);
  }
}

function assertAllUnderRoot(root: string, files: string[]): void {
  const resolvedRoot = path.resolve(root);
  for (const file of files) {
    const relative = path.relative(resolvedRoot, file);
    assert.equal(relative.startsWith("..") || path.isAbsolute(relative), false, `${file} escaped workspace`);
  }
}

async function assertSourceCardFrontmatter(file: string) {
  const expected = JSON.parse(await readFile(fixturePath("expected", "source_card_frontmatter.json"), "utf8")) as {
    required_fields: string[];
  };
  const text = await readFile(file, "utf8");
  for (const field of expected.required_fields) {
    assert.match(text, new RegExp(`^${field}:`, "m"));
  }
}

async function assertSummaryContains(file: string) {
  const expected = await readFile(fixturePath("expected", "processing_summary_contains.txt"), "utf8");
  const text = (await readFile(file, "utf8")).toLowerCase();
  for (const fragment of expected.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
    assert.match(text, new RegExp(fragment));
  }
}
