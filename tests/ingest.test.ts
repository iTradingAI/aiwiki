import assert from "node:assert/strict";
import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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
    await assertObsidianLinks(root, result.runDir);
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

test("ingest file uses the file title instead of content headings", async () => {
  const root = await tempRoot("aiwiki-ingest-file");
  try {
    const inputFile = path.join(root, "2025-12-31-cursor-dev-log.md");
    await writeFile(
      inputFile,
      [
        "# Totally Different Title",
        "",
        "This body intentionally uses a different heading so we can verify the file name wins.",
        ""
      ].join("\n"),
      "utf8"
    );

    const result = await ingestFile(root, inputFile);
    const payload = JSON.parse(await readFile(path.join(result.runDir, "payload.json"), "utf8")) as {
      source: { kind: string; title: string };
    };
    assert.equal(payload.source.kind, "file");
    assert.equal(payload.source.title, "2025-12-31-cursor-dev-log");

    const expectedSlug = "2025-12-31-cursor-dev-log";
    await stat(path.join(root, "02-raw", "articles", `${expectedSlug}.md`));
    await stat(path.join(root, "03-sources", "article-cards", `${expectedSlug}.md`));
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

async function assertObsidianLinks(root: string, runDir: string) {
  const sourceCard = await readFile(path.join(root, "03-sources", "article-cards", "ai-agent-workflow-notes.md"), "utf8");
  assert.match(sourceCard, /\[\[02-raw\/articles\/ai-agent-workflow-notes\|原文\]\]/);
  assert.match(sourceCard, /\[\[04-claims\/_suggestions\/ai-agent-workflow-notes-claims\|Claim 建议\]\]/);
  assert.match(sourceCard, /\[\[08-outputs\/outlines\/ai-agent-workflow-notes-outline\|大纲\]\]/);
  assert.match(sourceCard, /^aiwiki_id: "ai-agent-workflow-notes:source-card"$/m);
  assert.match(sourceCard, /^slug: "ai-agent-workflow-notes"$/m);
  assert.match(sourceCard, /^source_card: "\[\[03-sources\/article-cards\/ai-agent-workflow-notes\|资料卡\]\]"$/m);
  assert.match(sourceCard, /^run_summary: "\[\[09-runs\/.+\/processing-summary\|处理记录\]\]"$/m);

  const claims = await readFile(path.join(root, "04-claims", "_suggestions", "ai-agent-workflow-notes-claims.md"), "utf8");
  assert.match(claims, /\[\[03-sources\/article-cards\/ai-agent-workflow-notes\|资料卡\]\]/);
  assert.match(claims, /^raw_note: "\[\[02-raw\/articles\/ai-agent-workflow-notes\|原文\]\]"$/m);

  const raw = await readFile(path.join(root, "02-raw", "articles", "ai-agent-workflow-notes.md"), "utf8");
  assert.match(raw, /\[\[03-sources\/article-cards\/ai-agent-workflow-notes\|资料卡\]\]/);
  assert.match(raw, /^type: "raw_article"$/m);

  const summary = await readFile(path.join(runDir, "processing-summary.md"), "utf8");
  assert.match(summary, /^type: "processing_summary"$/m);
  assert.match(summary, /^status: "to-review"$/m);
  assert.match(summary, /\[\[09-runs\/.+\/source-card\|source-card\]\]/);
  assert.match(summary, /\[\[03-sources\/article-cards\/ai-agent-workflow-notes\|ai-agent-workflow-notes\]\]/);
}

