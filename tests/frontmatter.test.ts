import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatFrontmatter,
  frontmatterArray,
  frontmatterNullableString,
  frontmatterNumber,
  frontmatterObjectArray,
  parseFrontmatter
} from "../src/frontmatter.js";

test("frontmatter parser handles AIWiki 0.3 scalar and relationship values", () => {
  const parsed = parseFrontmatter([
    'title: "Capsule Note"',
    "active: true",
    "confidence_score: 0.82",
    "valid_until: null",
    'tags: ["aiwiki", "capsule"]',
    "relationships:",
    '  - type: "supports"',
    '    target: "05-wiki/source-knowledge/base.md"',
    '    confidence_level: "high"'
  ].join("\n"));

  assert.equal(parsed.title, "Capsule Note");
  assert.equal(parsed.active, true);
  assert.equal(frontmatterNumber(parsed, "confidence_score"), 0.82);
  assert.equal(frontmatterNullableString(parsed, "valid_until"), null);
  assert.deepEqual(frontmatterArray(parsed, "tags"), ["aiwiki", "capsule"]);
  assert.deepEqual(frontmatterArray(parsed, "relationships"), []);
  assert.deepEqual(frontmatterObjectArray(parsed, "relationships"), [{
    type: "supports",
    target: "05-wiki/source-knowledge/base.md",
    confidence_level: "high"
  }]);
});

test("frontmatter serializer emits deterministic flat object arrays", () => {
  const markdown = formatFrontmatter({
    title: "Capsule Note",
    active: true,
    confidence_score: 0.82,
    valid_until: null,
    tags: ["aiwiki", "capsule"],
    relationships: [{
      type: "supports",
      target: "05-wiki/source-knowledge/base.md",
      confidence_level: "high"
    }]
  });

  assert.equal(markdown, [
    "---",
    'title: "Capsule Note"',
    "active: true",
    "confidence_score: 0.82",
    "valid_until: null",
    'tags: ["aiwiki", "capsule"]',
    "relationships:",
    '  - type: "supports"',
    '    target: "05-wiki/source-knowledge/base.md"',
    '    confidence_level: "high"',
    "---"
  ].join("\n"));
});
