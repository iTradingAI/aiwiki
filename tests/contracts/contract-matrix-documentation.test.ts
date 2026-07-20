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

test("rebuild documentation keeps derived state explicit, removable, and out of normal retrieval", async () => {
  const [state, stateZh, usage, usageZh, handoff, handoffZh, skill] = await Promise.all([
    readFile("docs/schema/STATE.md", "utf8"),
    readFile("docs/schema/STATE.zh-CN.md", "utf8"),
    readFile("docs/USAGE.md", "utf8"),
    readFile("docs/USAGE.zh-CN.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.zh-CN.md", "utf8"),
    readFile("skill/SKILL.md", "utf8")
  ]);

  for (const document of [state, usage, handoff, skill]) {
    assert.match(document, /aiwiki rebuild --check --json/);
    assert.match(document, /aiwiki rebuild --dry-run --json/);
  }
  for (const document of [stateZh, usageZh, handoffZh]) {
    assert.match(document, /aiwiki rebuild --check --json/);
    assert.match(document, /aiwiki rebuild --dry-run --json/);
  }

  for (const stateFile of [state, stateZh]) {
    assert.match(stateFile, /artifacts\.json/);
    assert.match(stateFile, /capsules\.json/);
    assert.match(stateFile, /relationships\.json/);
    assert.match(stateFile, /lifecycle\.json/);
    assert.match(stateFile, /snapshot_id/);
  }
  assert.match(state, /not a source of truth/i);
  assert.match(state, /does not modify Markdown/i);
  assert.match(state, /lock conflict/i);
  assert.match(stateZh, /不是事实来源/);
  assert.match(stateZh, /不会修改 Markdown/);
  assert.match(stateZh, /锁冲突/);
  assert.match(handoff, /only when the user explicitly asks to inspect or rebuild derived state/i);
  assert.match(handoffZh, /只有用户明确要求检查或重建派生状态时/);
  assert.match(skill, /Only match rebuild when the user explicitly asks to inspect or rebuild derived state/i);
});
