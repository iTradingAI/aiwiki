import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const contractTests = [
  "public-api.test.ts",
  "cli-compatibility.test.ts",
  "skill-matching.test.ts",
  "extension-api.test.ts",
  "schema-compatibility.test.ts",
  "extension-failure-isolation.test.ts",
  "release-gate.test.ts"
];

test("release and handoff documentation define the reusable contract test matrix", async () => {
  const documents = await Promise.all([
    readFile("docs/RELEASE.md", "utf8"),
    readFile("docs/RELEASE.zh-CN.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.zh-CN.md", "utf8")
  ]);

  for (const document of documents) {
    assert.match(document, /npm run test:contracts/);
    for (const contractTest of contractTests) assert.match(document, new RegExp(contractTest.replace(".", "\\.")));
    assert.match(document, /CORE-0406/);
    assert.match(document, /CORE-0407/);
    assert.match(document, /CORE-0501/);
  }
  assert.match(documents[0], /Contract Test Matrix/);
  assert.match(documents[1], /合同测试矩阵/);
  assert.match(documents[2], /Contract Test Matrix/);
  assert.match(documents[3], /合同测试矩阵/);
});
