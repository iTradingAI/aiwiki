import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultLifecycle, isAnswerSafeByDefault, lifecycleFromFrontmatter, lifecyclePenalty, lifecycleToFrontmatter } from "../src/lifecycle.js";

test("lifecycle defaults are safe active metadata for new artifacts", () => {
  const lifecycle = defaultLifecycle("2026-06-30T00:00:00.000Z");
  assert.equal(lifecycle.knowledgeStatus, "active");
  assert.equal(lifecycle.confidenceLevel, "medium");
  assert.equal(lifecycle.staleness, "fresh");
  assert.equal(lifecycle.evidenceCount, 1);
  assert.equal(isAnswerSafeByDefault(lifecycle), true);
});

test("lifecycle parser flags superseded and expired active states", () => {
  const superseded = lifecycleFromFrontmatter({
    knowledge_status: "superseded",
    confidence_level: "high",
    staleness: "fresh",
    evidence_refs: ["03-sources/article-cards/base.md"]
  });
  assert.equal(superseded.knowledgeStatus, "superseded");
  assert.ok(superseded.warnings.includes("superseded_without_target"));
  assert.equal(isAnswerSafeByDefault(superseded), false);
  assert.equal(lifecyclePenalty(superseded) >= 0.5, true);

  const expired = lifecycleFromFrontmatter({
    knowledge_status: "active",
    confidence_level: "medium",
    valid_until: "2000-01-01T00:00:00.000Z",
    staleness: "fresh",
    evidence_count: 1
  });
  assert.ok(expired.warnings.includes("active_but_valid_until_expired"));
});

test("lifecycle serializes AIWiki-owned fields", () => {
  const frontmatter = lifecycleToFrontmatter({
    knowledgeStatus: "active",
    confidenceLevel: "high",
    confidenceScore: 0.9,
    lastConfirmed: "2026-06-30T00:00:00.000Z",
    validFrom: "2026-06-30T00:00:00.000Z",
    validUntil: null,
    staleness: "fresh",
    evidenceCount: 2,
    evidenceRefs: ["raw.md", "source-card.md"],
    accessCount: 0,
    lastAccessed: null,
    supersedes: [],
    supersededBy: [],
    contradictedBy: [],
    warnings: []
  });
  assert.equal(frontmatter.knowledge_status, "active");
  assert.deepEqual(frontmatter.evidence_refs, ["raw.md", "source-card.md"]);
});
