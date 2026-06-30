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
