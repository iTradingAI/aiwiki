import assert from "node:assert/strict";
import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { ingestFile, ingestPayload } from "../src/ingest.js";
import { lintWorkspace } from "../src/lint.js";
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
      "wiki-entry.md",
      "topics.md"
    ].sort());

    await stat(path.join(root, "03-sources", "article-cards", "ai-agent-workflow-notes.md"));
    await stat(path.join(root, "05-wiki", "source-knowledge", "ai-agent-workflow-notes.md"));
    await assertSourceCardFrontmatter(path.join(result.runDir, "source-card.md"));
    await assertFallbackWikiEntry(path.join(root, "05-wiki", "source-knowledge", "ai-agent-workflow-notes.md"));
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

test("ingests analysis into enriched wiki entry", async () => {
  const root = await tempRoot("aiwiki-enriched");
  try {
    const result = await ingestPayload(root, await readFixture("agent_payload.analysis.valid.json"));
    const wikiEntry = await readFile(path.join(root, "05-wiki", "source-knowledge", "llm-wiki-notes.md"), "utf8");
    assert.match(wikiEntry, /^generation_mode: "agent_enriched"$/m);
    assert.match(wikiEntry, /^quality: "enriched"$/m);
    assert.match(wikiEntry, /LLM Wiki 把资料整理成可持续维护的本地知识层/);
    assert.match(wikiEntry, /Wiki Entry 是入库后的默认知识容器/);
    assert.equal(result.agentReport.wikiEntryQuality, "enriched");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("records grounding review without moving enrichment into source cards", async () => {
  const root = await tempRoot("aiwiki-grounding-review");
  try {
    const result = await ingestPayload(root, await readFixture("agent_payload.analysis.valid.json"));
    const wikiEntry = await readFile(path.join(root, "05-wiki", "source-knowledge", "llm-wiki-notes.md"), "utf8");
    const sourceCard = await readFile(path.join(root, "03-sources", "article-cards", "llm-wiki-notes.md"), "utf8");
    const claims = await readFile(path.join(root, "04-claims", "_suggestions", "llm-wiki-notes-claims.md"), "utf8");
    const summary = await readFile(path.join(result.runDir, "processing-summary.md"), "utf8");

    assert.match(wikiEntry, /^grounding_needs_review: true$/m);
    assert.match(wikiEntry, /^grounding_markers: \["unsupported_claims"\]$/m);
    assert.match(wikiEntry, /## Grounding 复核/);
    assert.match(claims, /evidence_status: needs_review/);
    assert.match(summary, /unsupported_claims/);
    assert.match(sourceCard, /## 摘要/);
    assert.match(sourceCard, /## Grounding 状态/);
    assert.doesNotMatch(sourceCard, /## 核心观点/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("records host supplied evidence as grounding without review markers", async () => {
  const root = await tempRoot("aiwiki-grounded-evidence");
  try {
    const result = await ingestPayload(root, await readFixture("agent_payload.analysis.grounded.json"));
    const wikiEntry = await readFile(path.join(root, "05-wiki", "source-knowledge", "grounded-notes.md"), "utf8");
    const claims = await readFile(path.join(root, "04-claims", "_suggestions", "grounded-notes-claims.md"), "utf8");

    assert.match(wikiEntry, /^grounding_evidence_available: true$/m);
    assert.match(wikiEntry, /^grounding_evidence_channel: "host_supplied"$/m);
    assert.match(wikiEntry, /^grounding_needs_review: false$/m);
    assert.doesNotMatch(wikiEntry, /## Grounding 复核/);
    assert.match(claims, /evidence_status: host_quote_found/);
    assert.equal(result.agentReport.grounding.evidence_available, true);
    assert.equal(result.agentReport.grounding.needs_review, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("counts reusable knowledge source quotes as host supplied evidence", async () => {
  const root = await tempRoot("aiwiki-reusable-grounding");
  try {
    await ingestPayload(root, {
      schema_version: "aiwiki.agent_payload.v1",
      source: {
        kind: "text",
        title: "Reusable Quote Only",
        content_format: "markdown",
        content: "CLI 负责落盘，Agent 负责理解。这个边界能降低入库时的漂移风险。",
        fetch_status: "ok",
        captured_at: "2026-05-19T00:00:00.000Z"
      },
      analysis: {
        summary: "AIWiki 通过职责边界降低漂移。",
        key_points: ["职责边界能降低入库时的漂移风险。"],
        reusable_knowledge: [
          {
            title: "Agent-first 边界",
            content: "理解与落盘分工。",
            source_quote: "CLI 负责落盘，Agent 负责理解。"
          }
        ],
        claims: []
      },
      request: { mode: "ingest", outputs: ["wiki_entry"], language: "zh-CN" }
    });

    const wikiEntry = await readFile(path.join(root, "05-wiki", "source-knowledge", "reusable-quote-only.md"), "utf8");
    assert.match(wikiEntry, /^grounding_evidence_available: true$/m);
    assert.match(wikiEntry, /^grounding_evidence_channel: "host_supplied"$/m);
    assert.match(wikiEntry, /^grounding_needs_review: false$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("marks sparse analysis coverage as heuristic suspicion only", async () => {
  const root = await tempRoot("aiwiki-grounding-sparse");
  try {
    const longContent = Array.from({ length: 80 }, (_, index) => `段落${index} 这是一段关于 Agent 工作流、资料整理、证据边界和复核策略的正文。`).join("\n");
    const result = await ingestPayload(root, {
      schema_version: "aiwiki.agent_payload.v1",
      source: {
        kind: "text",
        title: "Sparse Long Article",
        content_format: "markdown",
        content: longContent,
        fetch_status: "ok",
        captured_at: "2026-05-19T00:00:00.000Z"
      },
      analysis: {
        summary: "这是一篇长文。",
        key_points: ["只提取了一个点。"]
      },
      request: { mode: "ingest", outputs: ["wiki_entry"], language: "zh-CN" }
    });

    const wikiEntry = await readFile(path.join(root, "05-wiki", "source-knowledge", "sparse-long-article.md"), "utf8");
    const summary = await readFile(path.join(result.runDir, "processing-summary.md"), "utf8");
    assert.match(wikiEntry, /^coverage_suspected_incomplete: true$/m);
    assert.match(wikiEntry, /coverage_suspected_incomplete/);
    assert.match(summary, /coverage_suspected_incomplete/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("renders source role frontmatter for user-authored output", async () => {
  const root = await tempRoot("aiwiki-source-role-output");
  try {
    await ingestPayload(root, {
      schema_version: "aiwiki.agent_payload.v1",
      source: {
        kind: "text",
        title: "My Published Essay",
        source_role: "output",
        represents_user_view: true,
        content_format: "markdown",
        content: "This is a user-authored published essay.",
        fetch_status: "ok",
        captured_at: "2026-05-19T00:00:00.000Z"
      },
      request: {
        mode: "ingest",
        outputs: ["wiki_entry"],
        language: "zh-CN"
      }
    });

    const wikiEntry = await readFile(path.join(root, "05-wiki", "source-knowledge", "my-published-essay.md"), "utf8");
    assert.match(wikiEntry, /^source_role: "output"$/m);
    assert.match(wikiEntry, /^represents_user_view: true$/m);
    assert.match(wikiEntry, /^wiki_type: "personal_knowledge"$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lint accepts output user-view entries and warns on non-output user-view entries", async () => {
  const validRoot = await tempRoot("aiwiki-lint-output-user-view");
  const invalidRoot = await tempRoot("aiwiki-lint-input-user-view");
  try {
    await ingestPayload(validRoot, {
      schema_version: "aiwiki.agent_payload.v1",
      source: {
        kind: "text",
        title: "My Published Essay",
        source_role: "output",
        represents_user_view: true,
        content_format: "markdown",
        content: "This is a user-authored published essay.",
        fetch_status: "ok",
        captured_at: "2026-05-19T00:00:00.000Z"
      },
      request: { mode: "ingest", outputs: ["wiki_entry"], language: "zh-CN" }
    });
    const validReport = await lintWorkspace(validRoot, "2026-05-19T00:00:00.000Z");
    assert.equal(validReport.issues.some((issue) => issue.message.includes("只有 output")), false);

    await ingestPayload(invalidRoot, {
      schema_version: "aiwiki.agent_payload.v1",
      source: {
        kind: "text",
        title: "External Article",
        source_role: "input",
        represents_user_view: true,
        content_format: "markdown",
        content: "This external article should not represent the user's view.",
        fetch_status: "ok",
        captured_at: "2026-05-19T00:00:00.000Z"
      },
      request: { mode: "ingest", outputs: ["wiki_entry"], language: "zh-CN" }
    });
    const invalidReport = await lintWorkspace(invalidRoot, "2026-05-19T00:00:00.000Z");
    assert.equal(invalidReport.issues.some((issue) => issue.message.includes("只有 output")), true);
  } finally {
    await rm(validRoot, { recursive: true, force: true });
    await rm(invalidRoot, { recursive: true, force: true });
  }
});

test("preserves wiki_entry summary and sections when markdown is provided", async () => {
  const root = await tempRoot("aiwiki-wiki-entry-markdown");
  try {
    const result = await ingestPayload(root, await readFixture("agent_payload.wiki_entry.valid.json"));
    const wikiEntry = await readFile(path.join(root, "05-wiki", "source-knowledge", "agent-enriched-entry.md"), "utf8");
    assert.match(wikiEntry, /^summary: "宿主 Agent 提供了完整条目。"$/m);
    assert.match(wikiEntry, /## 一句话总结/);
    assert.match(wikiEntry, /宿主 Agent 提供了完整条目。/);
    assert.match(wikiEntry, /## Agent 生成正文/);
    assert.match(wikiEntry, /## 核心观点/);
    assert.match(wikiEntry, /完整 Wiki Entry 可以由宿主 Agent 传入/);
    assert.equal(result.agentReport.wikiEntryQuality, "enriched");
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

async function assertFallbackWikiEntry(file: string) {
  const text = await readFile(file, "utf8");
  assert.match(text, /^type: "wiki_entry"$/m);
  assert.match(text, /^generation_mode: "deterministic_fallback"$/m);
  assert.match(text, /^quality: "scaffold"$/m);
  assert.match(text, /未经过宿主 Agent 的深度分析/);
  assert.doesNotMatch(text, /## 核心观点/);
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
  assert.match(sourceCard, /\[\[05-wiki\/source-knowledge\/ai-agent-workflow-notes\|Wiki 条目\]\]/);
  assert.match(sourceCard, /\[\[02-raw\/articles\/ai-agent-workflow-notes\|原文\]\]/);
  assert.match(sourceCard, /\[\[04-claims\/_suggestions\/ai-agent-workflow-notes-claims\|Claim 建议\]\]/);
  assert.match(sourceCard, /\[\[08-outputs\/outlines\/ai-agent-workflow-notes-outline\|大纲\]\]/);
  assert.match(sourceCard, /^aiwiki_id: "ai-agent-workflow-notes:source-card"$/m);
  assert.match(sourceCard, /^slug: "ai-agent-workflow-notes"$/m);
  assert.match(sourceCard, /^source_card: "\[\[03-sources\/article-cards\/ai-agent-workflow-notes\|资料卡\]\]"$/m);
  assert.match(sourceCard, /^wiki_entry: "\[\[05-wiki\/source-knowledge\/ai-agent-workflow-notes\|Wiki 条目\]\]"$/m);
  assert.match(sourceCard, /^run_summary: "\[\[09-runs\/.+\/processing-summary\|处理记录\]\]"$/m);

  const claims = await readFile(path.join(root, "04-claims", "_suggestions", "ai-agent-workflow-notes-claims.md"), "utf8");
  assert.match(claims, /\[\[03-sources\/article-cards\/ai-agent-workflow-notes\|资料卡\]\]/);
  assert.match(claims, /^raw_note: "\[\[02-raw\/articles\/ai-agent-workflow-notes\|原文\]\]"$/m);

  const raw = await readFile(path.join(root, "02-raw", "articles", "ai-agent-workflow-notes.md"), "utf8");
  assert.match(raw, /\[\[05-wiki\/source-knowledge\/ai-agent-workflow-notes\|Wiki 条目\]\]/);
  assert.match(raw, /\[\[03-sources\/article-cards\/ai-agent-workflow-notes\|资料卡\]\]/);
  assert.match(raw, /^type: "raw_article"$/m);

  const summary = await readFile(path.join(runDir, "processing-summary.md"), "utf8");
  assert.match(summary, /^type: "processing_summary"$/m);
  assert.match(summary, /^status: "to-review"$/m);
  assert.match(summary, /\[\[05-wiki\/source-knowledge\/ai-agent-workflow-notes\|ai-agent-workflow-notes\]\]/);
  assert.match(summary, /\[\[09-runs\/.+\/source-card\|source-card\]\]/);
  assert.match(summary, /\[\[03-sources\/article-cards\/ai-agent-workflow-notes\|ai-agent-workflow-notes\]\]/);
}

