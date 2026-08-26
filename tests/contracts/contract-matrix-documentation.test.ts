import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  }
  assert.match(documents[0], /Contract Test Matrix/);
  assert.match(documents[1], /合同测试矩阵/);
  assert.match(documents[2], /Contract Test Matrix/);
  assert.match(documents[3], /合同测试矩阵/);
  assert.doesNotMatch(documents[2], /CORE-[0-9]+/);
  assert.doesNotMatch(documents[3], /CORE-[0-9]+/);
});

test("bilingual Core 1.0 freeze matrices lock every declared readiness boundary", () => {
  const release = readFileSync("docs/RELEASE.md", "utf8");
  const releaseZh = readFileSync("docs/RELEASE.zh-CN.md", "utf8");

  assert.match(release, /^\| Schema catalog \| The `docs\/schema\/` catalog is frozen as additive-only with exactly 24 keys\. Existing keys are not renamed or removed\. \| None\. \|$/m);
  assert.match(releaseZh, /^\| Schema 目录 \| `docs\/schema\/` 目录冻结为仅可新增，且恰有 24 个键。既有键不得重命名或删除。 \| 无。 \|$/m);
  assert.match(release, /^\| Public API \| The public barrel has exactly 30 exports, and the stable version marker is `aiwiki\.public\.v1`\. \| None\. \|$/m);
  assert.match(releaseZh, /^\| Public API \| 公开 barrel 恰有 30 个导出，稳定版本标记为 `aiwiki\.public\.v1`。 \| 无。 \|$/m);
  assert.match(release, /^\| Legacy commands \| `init`, `ingest-url`, `agent install`, and `next` are all keep-compatible; this release does not change their behavior\. \| None\. \|$/m);
  assert.match(releaseZh, /^\| legacy 命令 \| `init`、`ingest-url`、`agent install` 和 `next` 全部保持兼容；本发布不改变其行为。 \| 无。 \|$/m);
  assert.match(release, /^\| Extension API \| The package boundary remains explicit and declaration-only\. \| The planned 1\.0 Extension API scope is formally reduced to declaration-only v0\.1\. Production invocation of `contextProviders` and `artifactGenerators` is deferred to the Pro-resumption decision track; Core 1\.0 makes no production-invocation commitment\. \|$/m);
  assert.match(releaseZh, /^\| Extension API \| 包边界保持显式且仅声明。 \| 源计划的 1\.0 Extension API 范围正式降级为仅声明的 v0\.1。`contextProviders` 和 `artifactGenerators` 的生产调用延后至 Pro 恢复决策轨道；Core 1\.0 不承诺生产调用。 \|$/m);
});

test("readiness documentation keeps diagnostics read-only and command ownership separate", async () => {
  const [usage, usageZh, handoff, handoffZh, schema, schemaZh, skill] = await Promise.all([
    readFile("docs/USAGE.md", "utf8"),
    readFile("docs/USAGE.zh-CN.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.zh-CN.md", "utf8"),
    readFile("docs/schema/README.md", "utf8"),
    readFile("docs/schema/README.zh-CN.md", "utf8"),
    readFile("skill/SKILL.md", "utf8")
  ]);
  for (const document of [usage, usageZh, handoff, handoffZh, schema, schemaZh, skill]) {
    for (const command of ["aiwiki doctor --json", "aiwiki status --json", "aiwiki next --json"]) assert.match(document, new RegExp(command));
    for (const state of ["repair_required", "setup_required", "first_ingest_required", "review_required", "ready"]) assert.match(document, new RegExp(state));
    assert.match(document, /would_write/);
  }
  assert.match(usage, /readiness.*health.*repair.*agent check/is);
  assert.match(usageZh, /readiness.*health.*repair.*agent check/is);
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

test("structured index documentation keeps metadata explicit and Markdown retrieval independent", async () => {
  const [state, stateZh, usage, usageZh, handoff, handoffZh, skill, readme, readmeZh] = await Promise.all([
    readFile("docs/schema/STATE.md", "utf8"),
    readFile("docs/schema/STATE.zh-CN.md", "utf8"),
    readFile("docs/USAGE.md", "utf8"),
    readFile("docs/USAGE.zh-CN.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.zh-CN.md", "utf8"),
    readFile("skill/SKILL.md", "utf8"),
    readFile("README.md", "utf8"),
    readFile("README.zh-CN.md", "utf8")
  ]);

  for (const document of [state, usage, handoff, skill]) {
    assert.match(document, /aiwiki index status --path <workspace> --json/);
    assert.match(document, /aiwiki index build --path <workspace> --json/);
    assert.match(document, /aiwiki index rebuild --path <workspace> --json/);
    assert.match(document, /Do not automatically build or rebuild the index/i);
    assert.match(document, /Markdown-backed retrieval remains available/i);
  }
  for (const document of [stateZh, usageZh, handoffZh]) {
    assert.match(document, /aiwiki index status --path <workspace> --json/);
    assert.match(document, /aiwiki index build --path <workspace> --json/);
    assert.match(document, /aiwiki index rebuild --path <workspace> --json/);
    assert.match(document, /不要自动构建或重建索引/);
    assert.match(document, /仍可直接从 Markdown 检索/);
  }
  assert.match(state, /aiwiki\.index\.v1/);
  assert.match(state, /not semantic or vector/i);
  assert.match(stateZh, /aiwiki\.index\.v1/);
  assert.match(stateZh, /不是语义或向量索引/);
  assert.match(readme, /not a vector database/i);
  assert.match(readmeZh, /不是向量数据库/);
});

test("graph-aware context documentation keeps v2 opt-in while Context v1 remains independent", async () => {
  const [state, stateZh, usage, usageZh, handoff, handoffZh, skill, readme, readmeZh] = await Promise.all([
    readFile("docs/schema/STATE.md", "utf8"),
    readFile("docs/schema/STATE.zh-CN.md", "utf8"),
    readFile("docs/USAGE.md", "utf8"),
    readFile("docs/USAGE.zh-CN.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.zh-CN.md", "utf8"),
    readFile("skill/SKILL.md", "utf8"),
    readFile("README.md", "utf8"),
    readFile("README.zh-CN.md", "utf8")
  ]);

  for (const document of [state, usage, handoff, skill]) {
    assert.match(document, /aiwiki graph status --path <workspace> --json/);
    assert.match(document, /aiwiki graph build --path <workspace> --json/);
    assert.match(document, /aiwiki graph rebuild --path <workspace> --json/);
    assert.match(document, /Do not automatically build or rebuild the graph/i);
    assert.match(document, /Markdown-backed retrieval remains available/i);
    assert.match(document, /aiwiki context <topic> --view graph --graph-depth 1 --path <workspace>/);
    assert.match(document, /aiwiki\.context\.v2/);
    assert.match(document, /only when the user explicitly asks.*relationship/i);
  }
  for (const document of [stateZh, usageZh, handoffZh]) {
    assert.match(document, /aiwiki graph status --path <workspace> --json/);
    assert.match(document, /aiwiki graph build --path <workspace> --json/);
    assert.match(document, /aiwiki graph rebuild --path <workspace> --json/);
    assert.match(document, /不要自动构建或重建关系图/);
    assert.match(document, /仍可直接从 Markdown 检索/);
    assert.match(document, /aiwiki context <topic> --view graph --graph-depth 1 --path <workspace>/);
    assert.match(document, /aiwiki\.context\.v2/);
    assert.match(document, /只有在用户明确要求.*关系/);
  }
  assert.match(state, /aiwiki\.graph\.v1/);
  assert.match(state, /does not change `aiwiki\.context\.v1`/i);
  assert.match(state, /`aiwiki\.context\.v2` is an explicit graph-aware context view/i);
  assert.match(stateZh, /aiwiki\.graph\.v1/);
  assert.match(stateZh, /不改变 `aiwiki\.context\.v1`/);
  assert.match(stateZh, /`aiwiki\.context\.v2` 是显式的关系图上下文视图/);
  assert.match(readme, /relationship graph/i);
  assert.match(readmeZh, /关系图/);
});

test("maintenance documentation and Skill keep health and repair advisory-only", async () => {
  const [readme, readmeZh, usage, usageZh, handoff, handoffZh, catalog, catalogZh, skill, lintProtocol] = await Promise.all([
    readFile("README.md", "utf8"),
    readFile("README.zh-CN.md", "utf8"),
    readFile("docs/USAGE.md", "utf8"),
    readFile("docs/USAGE.zh-CN.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.zh-CN.md", "utf8"),
    readFile("docs/schema/README.md", "utf8"),
    readFile("docs/schema/README.zh-CN.md", "utf8"),
    readFile("skill/SKILL.md", "utf8"),
    readFile("skill/LINT_PROTOCOL.md", "utf8")
  ]);

  for (const document of [readme, usage, handoff, catalog, skill, lintProtocol]) {
    assert.match(document, /aiwiki health --json/);
    assert.match(document, /aiwiki health --write --json/);
    assert.match(document, /aiwiki repair --plan --json/);
    assert.match(document, /aiwiki\.health\.v1/);
    assert.match(document, /aiwiki\.health_report\.v1/);
    assert.match(document, /aiwiki\.repair_plan\.v1/);
    assert.match(document, /read-only/i);
    assert.doesNotMatch(document, /repair --apply/);
  }
  for (const document of [readmeZh, usageZh, handoffZh, catalogZh]) {
    assert.match(document, /aiwiki health --json/);
    assert.match(document, /aiwiki health --write --json/);
    assert.match(document, /aiwiki repair --plan --json/);
    assert.match(document, /aiwiki\.health\.v1/);
    assert.match(document, /aiwiki\.health_report\.v1/);
    assert.match(document, /aiwiki\.repair_plan\.v1/);
    assert.match(document, /只读/);
    assert.doesNotMatch(document, /repair --apply/);
  }
});
