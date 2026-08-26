# AIWiki SDK 参考

支持的 Node.js SDK 入口是 `@itradingai/aiwiki`。兼容性边界由 API 版本常量定义：

```ts
import * as aiwiki from "@itradingai/aiwiki";

if (aiwiki.AIWIKI_PUBLIC_API_VERSION !== "aiwiki.public.v1") {
  throw new Error("Unsupported AIWiki public API");
}
```

`aiwiki.public.v1` 自 AIWiki 0.7.0 起保持稳定并遵循增量演进。兼容版本可以新增导出、可选字段、枚举值或结果字段，但不会删除既有公共导出，也不会改变其语义。消费者必须忽略无法识别的结果字段，并应保留未知的 frontmatter 字段。破坏性变更须留待未来的 v2 公共 API。

除非另有说明，所有路径参数都表示工作区根目录。读取工作区的操作均为异步操作，因为它们会遍历本地 Markdown 制品。

## 安装与入口

```ts
import {
  buildContext,
  buildGraphContext,
  buildHealthReport,
  ingestPayload,
  lintWorkspace,
  createAiwikiCli
} from "@itradingai/aiwiki";
import type { ContextResult, GraphContextResult, HealthReport } from "@itradingai/aiwiki/contracts";
```

`/contracts` 入口导出完整的公共类型面，包括图、健康度、关系、生命周期和选项类型。根入口会再导出[公共类型](#公共类型)中列出的常用类型。

## 导入

```ts
function ingestPayload(rootPath: string, rawPayload: unknown): Promise<IngestResult>
function ingestFile(rootPath: string, filePath: string): Promise<IngestResult>
```

`ingestPayload` 校验并保存内联的、兼容 `aiwiki.agent_payload.v1` 的 payload。`ingestFile` 从非空 UTF-8 文件创建 payload，适合 SDK/CLI 调用方；它有意不通过 MCP 暴露。二者都返回 `IngestResult`，其中含有 `runId`、`runDir`、`generatedFiles`、`warnings` 和 `agentReport`。

```ts
const result = await ingestPayload("./knowledge", {
  schema_version: "aiwiki.agent_payload.v1",
  source: {
    kind: "web",
    title: "示例来源",
    url: "https://example.test/article",
    content_format: "markdown",
    content: "已捕获的原文",
    fetcher: "host-agent",
    fetch_status: "ok",
    captured_at: new Date().toISOString()
  },
  request: { mode: "ingest", outputs: ["source_card", "wiki_entry"], language: "zh-CN" }
});
console.log(result.generatedFiles);
```

## 上下文与查询

```ts
function buildContext(rootPath: string, query: string, options?: ContextOptions, now?: string): Promise<ContextResult>
function buildCapsuleContext(rootPath: string, query: string, options?: CapsuleContextOptions, now?: string): Promise<CapsuleContextResult>
function renderCapsuleQuery(rootPath: string, query: string, options?: CapsuleQueryOptions): Promise<string>
function showCapsule(rootPath: string, options: ShowCapsuleOptions): Promise<string>
function resolveCapsule(rootPath: string, options: ShowCapsuleOptions): Promise<SourceCapsule | undefined>
function renderCapsule(capsule: SourceCapsule, options?: Pick<ShowCapsuleOptions, "debug" | "allArtifacts">): string
```

`buildContext` 返回稳定的 `aiwiki.context.v1` 结构化检索结果。`ContextOptions` 接受 `filters`（`type`、`source_role`、`wiki_type`、`status`）以及正整数 `limit`。`buildCapsuleContext` 返回 `aiwiki.context.capsule.v1`，包含胶囊就绪度和缺失上下文建议。`renderCapsuleQuery` 与 `showCapsule` 返回面向人的 Markdown/文本；需要序列化胶囊时在 `ShowCapsuleOptions` 中设定 `json`。

```ts
const context = await buildContext("./knowledge", "检索评估", {
  filters: { status: "active", type: "wiki_entry" },
  limit: 5
});
for (const item of context.matches.wiki_entries) console.log(item.path, item.score);

const capsule = await showCapsule("./knowledge", { id: "capsule-id", json: true });
```

## Source Capsule 与制品

```ts
function discoverArtifacts(root: string): Promise<AiwikiArtifact[]>
function readArtifact(root: string, absolutePath: string): Promise<AiwikiArtifact>
function buildCapsules(rootPath: string, now?: string): Promise<SourceCapsule[]>
```

制品是 AIWiki 识别的本地 Markdown 文件；胶囊把相关制品分组为可复用的来源单元。`readArtifact` 需要绝对制品路径。通过 `SourceCapsule` 与 `AiwikiArtifact` 可检查标准化元数据、主制品、生命周期、质量和 OKF 就绪度。

## Lint 与健康度

```ts
function lintWorkspace(rootPath: string, now?: string, options?: CapsuleLintOptions): Promise<LintReport>
function buildHealthReport(rootPath: string, now?: string): Promise<HealthReport>
```

`lintWorkspace` 报告结构、胶囊、证据、生命周期、关系、索引、用户视图与质量问题。`buildHealthReport` 返回稳定的 `aiwiki.health.v1` 报告，其中包含摘要、指标、比率、来自 lint 的问题和建议动作。

`writeHealthReport(rootPath, report, now?)` 是刻意保留的**内部**函数。它会写入仪表盘，并未由 `aiwiki.public.v1` 导出；调用方应消费 `buildHealthReport`，并自行决定是否及在哪里持久化报告。

## 生命周期与证据

```ts
function defaultLifecycle(now: string): KnowledgeLifecycle
function lifecycleFromFrontmatter(frontmatter: Record<string, FrontmatterValue>): KnowledgeLifecycle
function lifecycleToFrontmatter(lifecycle: KnowledgeLifecycle): Record<string, FrontmatterValue>
function lifecyclePenalty(lifecycle: KnowledgeLifecycle): number
function lifecycleWarnings(lifecycle: KnowledgeLifecycle): string[]
function isAnswerSafeByDefault(lifecycle: KnowledgeLifecycle): boolean
```

生命周期元数据包括 `knowledgeStatus`、置信度、有效期、陈旧度、证据数量/引用、取代/矛盾引用和警告。`isAnswerSafeByDefault` 仅对 `active` 与 `unknown` 返回 true；它是保守默认值，不是事实正确性的证明。

### 证据 API（AD3）

证据是返回知识的属性，不是一个脱离结果的查询 API。应在消费结果时检查：

- `KnowledgeLifecycle` 包含 `evidenceCount`、`evidenceRefs`、置信度、陈旧度和警告。
- `ContextResult` 的匹配条目提供 `grounding_evidence_available`、`grounding_needs_review`、`grounding_markers`、质量信号和警告。
- `GraphContextResult.relationships` 包含 `evidence_status`、完整的 `relationship_path`、生命周期状态、风险和 `must_not_claim` 限制。
- `SourceCapsule` 携带生命周期、质量、主制品和 OKF 数据。

Agent 必须据此引用或限定断言；缺少证据字段不等于存在支持。

## 关系与图上下文

```ts
function relationshipsFromFrontmatter(frontmatter: Record<string, FrontmatterValue>): TypedRelationship[]
function relationshipsToFrontmatter(relationships: TypedRelationship[]): unknown[]
function validateRelationships(relationships: TypedRelationship[]): string[]
function isRelationshipType(value: string | undefined): value is RelationshipType

function buildRelationshipGraph(rootPath: string, now?: string): Promise<RelationshipGraph>
function inspectRelationshipGraph(rootPath: string): Promise<RelationshipGraphStatus>
function readRelationshipGraph(rootPath: string): Promise<RelationshipGraphRead>
function buildGraphContext(rootPath: string, query: string, options?: GraphContextOptions, now?: string): Promise<GraphContextResult>
```

### 关系 API（AD2）：三层

1. **编解码层。** `relationshipsFromFrontmatter` 与 `relationshipsToFrontmatter` 在标准 frontmatter 和 `TypedRelationship[]` 间转换；`validateRelationships` 会在持久化之前返回校验警告代码。
2. **图引擎层。** `buildRelationshipGraph` 物化 `aiwiki.graph.v1`；`readRelationshipGraph` 同时返回图和新鲜度状态，`inspectRelationshipGraph` 仅返回状态。边保留其来源（frontmatter、兼容 frontmatter、wikilink、胶囊归属或生成元数据）。
3. **图上下文 v2 层。** `buildGraphContext` 消费检索种子和图，返回 `aiwiki.context.v2`。传入 `graphDepth: 1 | 2 | 3`；回答前应检查 `graph.state`、`missing_context`、关系证据/风险和 `recommended_next_action`。

```ts
const graph = await buildRelationshipGraph("./knowledge");
const context = await buildGraphContext("./knowledge", "限流", { graphDepth: 2, limit: 5 });
if (context.graph.state === "fresh") {
  for (const relationship of context.relationships) {
    console.log(relationship.target.id, relationship.evidence_status, relationship.risk);
  }
}
```

## CLI 适配器与工作区解析

```ts
function createAiwikiCli(): AiwikiCli
function resolveWorkspace(rootPath: string): string
```

`createAiwikiCli()` 返回一个不可变适配器，其中有 `apiVersion` 与 `run(argv, streams?)`；`run` 解析为 CLI 退出码。`resolveWorkspace` 按照与 CLI 相同的工作区规则解析显式根目录。

```ts
const cli = createAiwikiCli();
const exitCode = await cli.run(["lint", "--path", "./knowledge", "--json"]);
```

## 公共类型

根入口导出：`AiwikiArtifact`、`AiwikiCli`、`AiwikiCliStreams`、`CapsuleContextResult`、`ContextFilters`、`ContextResult`、`IngestResult`、`KnowledgeLifecycle`、`LintReport` 和 `SourceCapsule`。

`@itradingai/aiwiki/contracts` 还导出 `FrontmatterValue`；图类型（`RelationshipGraph`、状态/读取/节点/边/摘要类型及 `GraphEdgeOrigin`）；`GraphContextOptions` 与 `GraphContextResult`；健康度类型；`KnowledgeStatus`、`ConfidenceLevel`、`Staleness`；`CapsuleQueryOptions`；`RelationshipType`、`TypedRelationship`；以及 `ShowCapsuleOptions`。
