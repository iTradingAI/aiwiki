import assert from "node:assert/strict";
import { test } from "node:test";

import type { AiwikiArtifact } from "../src/artifact.js";
import { okfFrontmatterForWikiEntry, okfProjectionFromArtifact, okfReadinessIssues } from "../src/okf.js";

test("OKF projection reads wiki entry metadata and source evidence", () => {
  const artifact = wikiArtifact({
    type: "wiki_entry",
    title: "Source Capsule",
    description: "Reusable source knowledge.",
    resource: "https://example.com/source",
    timestamp: "2026-06-30T00:00:00.000Z",
    tags: ["aiwiki/wiki-entry"]
  }, [
    "# Source Capsule",
    "",
    "## 来源与证据",
    "",
    "- Source Card: [[03-sources/article-cards/source|source]]",
    "- Raw: [[02-raw/articles/source|raw]]"
  ].join("\n"));

  const projection = okfProjectionFromArtifact(artifact);
  assert.equal(projection.ready, true);
  assert.equal(projection.resource, "https://example.com/source");
  assert.equal(projection.citations.length, 2);
});

test("OKF readiness reports missing fields without requiring export/import", () => {
  const issues = okfReadinessIssues(wikiArtifact({ type: "wiki_entry" }, "# Untitled"));
  assert.ok(issues.some((issue) => issue.code === "okf_missing_description"));
  assert.ok(issues.some((issue) => issue.code === "okf_missing_timestamp"));
  assert.ok(issues.some((issue) => issue.code === "okf_missing_citations"));

  assert.deepEqual(okfFrontmatterForWikiEntry({
    title: "Entry",
    description: "Description",
    sourceUrl: "https://example.com",
    timestamp: "2026-06-30T00:00:00.000Z"
  }).resource, "https://example.com");
});

function wikiArtifact(frontmatter: AiwikiArtifact["frontmatter"], body: string): AiwikiArtifact {
  return {
    absolutePath: "/tmp/source.md",
    vaultPath: "05-wiki/source-knowledge/source.md",
    filename: "source.md",
    type: "wiki_entry",
    kind: "wiki_entry",
    role: "primary",
    visibility: "primary",
    title: typeof frontmatter.title === "string" ? frontmatter.title : "Untitled",
    frontmatter,
    bodyPreview: body,
    body
  };
}
