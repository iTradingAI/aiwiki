import assert from "node:assert/strict";
import { test } from "node:test";

import { relationshipsFromFrontmatter, relationshipsToFrontmatter, validateRelationships } from "../src/relationships.js";

test("relationships parse explicit object arrays and compatibility arrays", () => {
  const relationships = relationshipsFromFrontmatter({
    relationships: [{
      type: "supports",
      target: "05-wiki/source-knowledge/base.md",
      evidence: "source quote",
      confidence_level: "high"
    }],
    supersedes: ["old.md"],
    superseded_by: ["new.md"],
    contradicted_by: ["counter.md"]
  });

  assert.deepEqual(relationships.map((item) => item.type), ["supports", "supersedes", "superseded_by", "contradicts"]);
  assert.equal(validateRelationships(relationships).length, 0);
});

test("relationships serialize flat object arrays", () => {
  assert.deepEqual(relationshipsToFrontmatter([{
    type: "derived_from",
    target: "02-raw/articles/base.md",
    confidenceLevel: "medium",
    note: "source trace"
  }]), [{
    type: "derived_from",
    target: "02-raw/articles/base.md",
    confidence_level: "medium",
    note: "source trace"
  }]);
});

test("relationships retain the Core 0.5 additive relation vocabulary", () => {
  const relationships = relationshipsFromFrontmatter({
    relationships: [
      { type: "derives_from", target: "02-raw/articles/base.md" },
      { type: "summarizes", target: "03-sources/article-cards/source.md" },
      { type: "updates", target: "05-wiki/source-knowledge/previous.md" },
      { type: "used_by", target: "08-outputs/articles/consumer.md" },
      { type: "mentions_topic", target: "07-topics/topic.md" }
    ]
  });

  assert.deepEqual(relationships.map((item) => item.type), [
    "derives_from",
    "summarizes",
    "updates",
    "used_by",
    "mentions_topic"
  ]);
  assert.deepEqual(validateRelationships(relationships), []);
});
