import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { buildCapsules, buildCapsulesFromArtifacts, capsuleMetrics, capsuleToJson, searchCapsules } from "../src/capsule.js";
import type { AiwikiArtifact } from "../src/artifact.js";
import { tempRoot } from "./helpers.js";

test("capsules group explicit metadata and select a primary wiki entry", () => {
  const capsules = buildCapsulesFromArtifacts([
    artifact("05-wiki/source-knowledge/source.md", {
      type: "wiki_entry",
      title: "Runtime Capsules",
      capsule_id: "src_demo",
      knowledge_status: "active",
      confidence_level: "high",
      staleness: "fresh",
      evidence_refs: ["03-sources/article-cards/source.md"],
      timestamp: "2026-06-30T00:00:00.000Z",
      description: "A source capsule note.",
      resource: "https://example.com/source"
    }, "## 来源与证据\n\n- Source Card: source"),
    artifact("03-sources/article-cards/source.md", {
      type: "source_card",
      capsule_id: "src_demo",
      title: "Runtime Capsules"
    }, "# Source Card")
  ]);

  assert.equal(capsules.length, 1);
  assert.equal(capsules[0]?.id, "src_demo");
  assert.equal(capsules[0]?.primary?.vaultPath, "05-wiki/source-knowledge/source.md");
  assert.equal(capsules[0]?.supportingArtifacts.length, 1);
  assert.equal(capsules[0]?.okf.ready, true);
  assert.equal(searchCapsules(capsules, "Runtime").length, 1);
});

test("capsules infer legacy grouping from content fingerprint", async () => {
  const root = await tempRoot("aiwiki-capsule");
  try {
    await writeMarkdown(root, "05-wiki/source-knowledge/source.md", [
      "---",
      'type: "wiki_entry"',
      'title: "Legacy Capsule"',
      'content_fingerprint: "sha256:abcdef"',
      "---",
      "# Legacy Capsule"
    ].join("\n"));
    await writeMarkdown(root, "02-raw/articles/source.md", [
      "---",
      'type: "raw_article"',
      'title: "Legacy Capsule"',
      'content_fingerprint: "sha256:abcdef"',
      "---",
      "# Raw"
    ].join("\n"));

    const capsules = await buildCapsules(root);
    assert.equal(capsules.length, 1);
    assert.equal(capsules[0]?.groupingReason, "content_fingerprint");
    assert.equal(capsules[0]?.artifacts.length, 2);
    assert.equal(capsuleToJson(capsules[0]!).primary?.path, "05-wiki/source-knowledge/source.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("capsule metrics summarize entropy and OKF readiness", () => {
  const capsules = buildCapsulesFromArtifacts([
    artifact("09-runs/run/processing-summary.md", {
      type: "processing_summary",
      run_id: "run"
    }, "# Run")
  ]);

  const metrics = capsuleMetrics(capsules);
  assert.equal(metrics.capsule_count, 1);
  assert.equal(metrics.capsule_with_primary_count, 0);
  assert.equal(metrics.entropy_risk, "high");
  assert.equal(metrics.okf_ready_count, 0);
});

async function writeMarkdown(root: string, vaultPath: string, content: string): Promise<void> {
  const target = path.join(root, vaultPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${content}\n`, "utf8");
}

function artifact(vaultPath: string, frontmatter: AiwikiArtifact["frontmatter"], body: string): AiwikiArtifact {
  const kind = frontmatter.type === "source_card"
    ? "source_card"
    : frontmatter.type === "raw_article"
      ? "raw_article"
      : frontmatter.type === "processing_summary"
        ? "processing_summary"
        : "wiki_entry";
  return {
    absolutePath: `/tmp/${vaultPath}`,
    vaultPath,
    filename: path.basename(vaultPath),
    type: typeof frontmatter.type === "string" ? frontmatter.type : undefined,
    kind,
    role: kind === "wiki_entry" ? "primary" : kind === "processing_summary" ? "run_log" : kind === "source_card" ? "source_card" : "raw_source",
    visibility: kind === "wiki_entry" ? "primary" : kind === "processing_summary" ? "debug" : "supporting",
    title: typeof frontmatter.title === "string" ? frontmatter.title : undefined,
    capsuleId: typeof frontmatter.capsule_id === "string" ? frontmatter.capsule_id : undefined,
    sourceUrl: typeof frontmatter.source_url === "string" ? frontmatter.source_url : undefined,
    contentFingerprint: typeof frontmatter.content_fingerprint === "string" ? frontmatter.content_fingerprint : undefined,
    runId: typeof frontmatter.run_id === "string" ? frontmatter.run_id : undefined,
    frontmatter,
    bodyPreview: body,
    body
  };
}
