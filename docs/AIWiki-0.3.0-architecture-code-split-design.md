# AIWiki 0.3.0 架构代码拆分设计（直接可开发版）

> 版本目标：`0.3.0`
> 方案类型：架构代码拆分 / 可直接交给 Codex、Claude Code、QClaw、OpenClaw 执行
> 适用仓库：`iTradingAI/aiwiki`
> 当前基线：`@itradingai/aiwiki@0.2.25`
> 设计目标：在尽量不影响已有客户的前提下，将 AIWiki 从“file-centric Markdown artifact 工具”升级为“object-centric、lifecycle-aware、OKF-ready 的 Agent-first 本地 LLM-wiki CLI”。

---

## 0. 一句话结论

AIWiki 0.3.0 不应该做目录大迁移，也不应该直接上 SQLite / 向量库 / 图数据库。

0.3.0 应该做的是：

```text
Object Layer      : Source Capsule 成为一等对象
Lifecycle Layer   : 引入最小知识生命周期状态
OKF Projection    : Wiki Entry 变成 OKF-ready concept
Interface Layer   : show / query / context / lint 都按 Capsule 使用
Compatibility    : 旧目录、旧文件、context v1、旧 Dashboard 全部兼容
```

最终效果：

```text
物理层仍然是多文件：
Raw / Source Card / Wiki Entry / Claim / Topic / Outline / Run Summary

用户和 Agent 默认看到的是一个对象：
Source Capsule
├─ primary: Wiki Entry
├─ evidence: Source Card + Raw
├─ derivatives: Claims / Assets / Topics / Outlines
├─ debug: Run Summary
├─ lifecycle: active / stale / superseded / contradicted
└─ okf: type / title / description / resource / tags / timestamp / citations
```

---

## 1. 当前基线判断

### 1.1 当前仓库事实

当前 `package.json` 显示：

```json
{
  "name": "@itradingai/aiwiki",
  "version": "0.2.25",
  "type": "module",
  "bin": {
    "aiwiki": "dist/src/cli.js"
  },
  "engines": {
    "node": ">=20"
  }
}
```

当前 `src/` 目录已经有以下核心模块：

```text
src/
├─ app.ts
├─ args.ts
├─ cli.ts
├─ context.ts
├─ encoding.ts
├─ frontmatter.ts
├─ grounding.ts
├─ ingest.ts
├─ lint.ts
├─ output.ts
├─ paths.ts
├─ payload.ts
├─ wiki-entry.ts
└─ workspace.ts
```

当前 `tests/` 目录已有：

```text
tests/
├─ fixtures/
├─ cli.test.ts
├─ helpers.ts
├─ ingest.test.ts
├─ payload.test.ts
└─ workspace.test.ts
```

当前 `skill/` 目录已有：

```text
skill/
├─ SKILL.md
├─ QUERY_PROTOCOL.md
├─ LINT_PROTOCOL.md
└─ UPGRADE_NOTES.md
```

### 1.2 关键判断

当前 AIWiki 不是“缺少 P0 能力”的状态。它已经有：

```text
05-wiki/source-knowledge
context
query
lint
status
doctor
agent sync/check
workspace seed
skill protocol
```

所以 0.3.0 的工作不是从零新增 Wiki / Query / Lint，而是：

```text
把现有 file groups 收敛成 Source Capsule 对象层。
把新增字段写入新 artifact。
让旧 artifact 通过 runtime inference 被识别成 Capsule。
让 show/query/context/lint/status 使用 Capsule。
```

---

## 2. 外部模型约束

### 2.1 OKF 的正确使用方式

OKF 是交换格式，不是 AIWiki 内部 runtime。

OKF v0.1 的核心是：

```text
directory of Markdown files
YAML frontmatter
required: type
recommended: title / description / resource / tags / timestamp
reserved: index.md / log.md
conventional: # Citations
unknown fields tolerated
broken links tolerated
```

所以 AIWiki 的正确做法不是“把内部结构改成 OKF”，而是：

```text
AIWiki Core Model
  ↓
OKF Projection Layer
  ↓
OKF-compatible concept documents / future export
```

### 2.2 LLM Wiki v2 的正确使用方式

LLM Wiki v2 的价值不是“马上实现完整 hybrid search / graph traversal”。

它对 0.3.0 最有价值的是：

```text
knowledge has lifecycle
confidence decays / reinforces
new claims can supersede old claims
contradictions must be visible
not all pages are equally valid forever
```

所以 0.3.0 要吸收的是最小生命周期字段：

```text
knowledge_status
confidence_level
last_confirmed
staleness
supersedes
superseded_by
contradicted_by
relationships
```

暂不做：

```text
automatic contradiction detection
automatic supersession
BM25/vector/graph hybrid search
event-driven background automation
retention curve scheduler
```

---

## 3. 0.3.0 设计原则

### 3.1 兼容优先

必须坚持：

```text
1. 不移动旧目录
2. 不重命名 _suggestions
3. 不删除 Review Queue
4. 不覆盖旧 Dashboard
5. 不批量改写旧 Markdown
6. 不破坏 aiwiki.context.v1
7. 不把 SQLite / vector / graph 作为依赖
8. 不实现网页抓取
```

### 3.2 Object-first

新能力围绕 Source Capsule：

```text
Source Capsule 是系统对象，不是 UI 包装。
```

所有新增能力都要围绕 Capsule 设计：

```text
aiwiki show       -> 单个 Capsule
aiwiki query      -> 人类视角 Capsule 列表
aiwiki context    -> Agent 视角 Capsule JSON
aiwiki lint       -> Capsule / Lifecycle / OKF 检查
aiwiki status     -> capsule_count / entropy_risk / lifecycle_risk
```

### 3.3 Lifecycle-aware

新生成的 Wiki Entry 必须携带生命周期字段。

旧文件没有这些字段，不报错，不强制迁移。

### 3.4 OKF-ready, not OKF-locked

新 Wiki Entry 要尽量满足 OKF 推荐字段，但 AIWiki 内部可以保留自定义字段：

```yaml
aiwiki_id:
capsule_id:
artifact_role:
visibility:
wiki_type:
source_role:
represents_user_view:
source_card:
raw_file:
run_id:
content_fingerprint:
knowledge_status:
```

---

## 4. 0.3.0 新增模块总览

建议新增这些模块，尽量保持当前 flat `src/` 风格，不在 0.3.0 做大规模目录重排。

```text
src/
├─ artifact.ts          # artifact 发现、角色推断、frontmatter 标准化
├─ capsule.ts           # Source Capsule 聚合、检索、选择、JSON 输出
├─ lifecycle.ts         # 生命周期字段、状态、rerank、lint helper
├─ okf.ts               # OKF-ready projection、readiness 检查、citations contract
├─ relationships.ts     # typed relationship 类型、校验、轻量解析
├─ show.ts              # aiwiki show 命令实现
├─ query-view.ts        # query capsule/files 两种人类输出视图
├─ capsule-context.ts   # context --view capsule 输出
└─ capsule-lint.ts      # lint --capsules / --lifecycle / --okf 检查项
```

为什么不建议一开始建立 `src/domain/`、`src/commands/` 等深目录？

```text
1. 当前项目是 flat src 风格。
2. 0.3.0 的首要目标是低风险落地。
3. 大目录重排会放大 review / merge / import path 成本。
4. 先新增模块，后续 0.4 或 0.5 再做目录分层。
```

---

## 5. TypeScript 类型设计

### 5.1 `src/artifact.ts`

```ts
export type ArtifactRole =
  | "primary"
  | "raw_source"
  | "source_card"
  | "claim_suggestions"
  | "asset_suggestions"
  | "topic_suggestions"
  | "outline"
  | "run_log"
  | "unknown";

export type ArtifactVisibility =
  | "primary"
  | "supporting"
  | "debug";

export type ArtifactKind =
  | "wiki_entry"
  | "raw_article"
  | "source_card"
  | "claim_suggestions"
  | "asset_suggestions"
  | "topic_candidates"
  | "draft_outline"
  | "processing_summary"
  | "unknown";

export type AiwikiArtifact = {
  absolutePath: string;
  vaultPath: string;
  filename: string;

  type?: string;
  kind: ArtifactKind;
  role: ArtifactRole;
  visibility: ArtifactVisibility;

  title?: string;
  description?: string;
  summary?: string;

  capsuleId?: string;
  slug?: string;
  sourceUrl?: string;
  contentFingerprint?: string;
  runId?: string;

  frontmatter: Record<string, unknown>;
  bodyPreview?: string;
  body?: string;
};
```

#### 必须实现函数

```ts
export async function discoverArtifacts(root: string): Promise<AiwikiArtifact[]>;

export async function readArtifact(
  root: string,
  absolutePath: string
): Promise<AiwikiArtifact>;

export function inferArtifactKind(
  vaultPath: string,
  frontmatter: Record<string, unknown>
): ArtifactKind;

export function inferArtifactRole(
  kind: ArtifactKind,
  vaultPath: string,
  frontmatter: Record<string, unknown>
): ArtifactRole;

export function inferArtifactVisibility(
  role: ArtifactRole,
  vaultPath: string,
  frontmatter: Record<string, unknown>
): ArtifactVisibility;

export function normalizeArtifactFrontmatter(
  artifact: AiwikiArtifact
): Record<string, unknown>;
```

#### 路径映射

0.3.0 必须保留现有路径，不重命名：

```ts
export const ARTIFACT_PATH_RULES = [
  {
    prefix: "05-wiki/source-knowledge/",
    kind: "wiki_entry",
    role: "primary",
    visibility: "primary"
  },
  {
    prefix: "02-raw/articles/",
    kind: "raw_article",
    role: "raw_source",
    visibility: "supporting"
  },
  {
    prefix: "03-sources/article-cards/",
    kind: "source_card",
    role: "source_card",
    visibility: "supporting"
  },
  {
    prefix: "04-claims/_suggestions/",
    kind: "claim_suggestions",
    role: "claim_suggestions",
    visibility: "supporting"
  },
  {
    prefix: "06-assets/_suggestions/",
    kind: "asset_suggestions",
    role: "asset_suggestions",
    visibility: "supporting"
  },
  {
    prefix: "07-topics/ready/",
    kind: "topic_candidates",
    role: "topic_suggestions",
    visibility: "supporting"
  },
  {
    prefix: "08-outputs/outlines/",
    kind: "draft_outline",
    role: "outline",
    visibility: "supporting"
  },
  {
    prefix: "09-runs/",
    kind: "processing_summary",
    role: "run_log",
    visibility: "debug"
  }
] as const;
```

---

### 5.2 `src/lifecycle.ts`

```ts
export type KnowledgeStatus =
  | "active"
  | "needs_review"
  | "stale"
  | "superseded"
  | "contradicted"
  | "archived"
  | "unknown";

export type ConfidenceLevel =
  | "low"
  | "medium"
  | "high"
  | "unknown";

export type Staleness =
  | "fresh"
  | "aging"
  | "stale"
  | "unknown";

export type KnowledgeLifecycle = {
  knowledgeStatus: KnowledgeStatus;
  confidenceLevel: ConfidenceLevel;
  confidenceScore?: number | null;

  lastConfirmed?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;

  staleness: Staleness;

  evidenceCount: number;
  evidenceRefs: string[];

  accessCount?: number;
  lastAccessed?: string | null;

  supersedes: string[];
  supersededBy: string[];
  contradictedBy: string[];

  warnings: string[];
};
```

#### 必须实现函数

```ts
export function defaultLifecycle(now: string): KnowledgeLifecycle;

export function lifecycleFromFrontmatter(
  frontmatter: Record<string, unknown>
): KnowledgeLifecycle;

export function lifecycleToFrontmatter(
  lifecycle: KnowledgeLifecycle
): Record<string, unknown>;

export function lifecyclePenalty(lifecycle: KnowledgeLifecycle): number;

export function lifecycleWarnings(lifecycle: KnowledgeLifecycle): string[];

export function isAnswerSafeByDefault(lifecycle: KnowledgeLifecycle): boolean;
```

#### 初始默认值

新生成 Wiki Entry 默认：

```yaml
knowledge_status: "active"
confidence_level: "medium"
confidence_score: null
last_confirmed: "<created_at>"
valid_from: "<created_at>"
valid_until: null
staleness: "fresh"
evidence_count: 1
evidence_refs: []
access_count: 0
last_accessed: null
supersedes: []
superseded_by: []
contradicted_by: []
```

#### 查询使用规则

```text
active        -> 正常参与排序
needs_review  -> 降权，但可返回
stale         -> 降权，并在结果 warnings 中提示
superseded    -> 默认不作为主答案依据，只在 debug/all 下返回
contradicted  -> 降权，并必须提示存在冲突
archived      -> 默认不返回，除非 --include-archived
unknown       -> 兼容旧库，正常返回但 confidence unknown
```

---

### 5.3 `src/relationships.ts`

```ts
export type RelationshipType =
  | "supports"
  | "contradicts"
  | "supersedes"
  | "superseded_by"
  | "related_to"
  | "uses"
  | "depends_on"
  | "derived_from"
  | "mentions";

export type TypedRelationship = {
  type: RelationshipType;
  target: string;
  evidence?: string;
  confidenceLevel?: ConfidenceLevel;
  note?: string;
};
```

#### 必须实现函数

```ts
export function relationshipsFromFrontmatter(
  frontmatter: Record<string, unknown>
): TypedRelationship[];

export function relationshipsToFrontmatter(
  relationships: TypedRelationship[]
): unknown[];

export function validateRelationships(
  relationships: TypedRelationship[]
): string[];
```

0.3.0 只做字段存储和 lint，不做图遍历。

---

### 5.4 `src/okf.ts`

```ts
export type OkfProjection = {
  ready: boolean;
  type?: string;
  title?: string;
  description?: string;
  resource?: string;
  tags: string[];
  timestamp?: string;
  citations: string[];
  warnings: string[];
};

export type OkfReadinessIssue = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  path?: string;
};
```

#### 必须实现函数

```ts
export function okfProjectionFromArtifact(
  artifact: AiwikiArtifact
): OkfProjection;

export function okfFrontmatterForWikiEntry(input: {
  title: string;
  description?: string;
  sourceUrl?: string;
  tags?: string[];
  timestamp: string;
}): Record<string, unknown>;

export function extractCitationsFromBody(body: string): string[];

export function hasCitationsSection(body: string): boolean;

export function okfReadinessIssues(
  artifact: AiwikiArtifact
): OkfReadinessIssue[];
```

#### OKF 字段映射

```yaml
type: wiki_entry
title: "标题"
description: "一句话总结"
resource: "https://source-url"
tags:
  - source-knowledge
timestamp: "2026-06-30T00:00:00.000Z"
```

AIWiki 保留扩展字段：

```yaml
aiwiki_id:
capsule_id:
artifact_role:
visibility:
wiki_type:
source_role:
represents_user_view:
source_card:
raw_file:
run_summary:
run_id:
content_fingerprint:
knowledge_status:
confidence_level:
last_confirmed:
```

---

### 5.5 `src/capsule.ts`

```ts
export type CapsuleQuality = {
  hasPrimary: boolean;
  hasSourceCard: boolean;
  hasRaw: boolean;
  hasRunSummary: boolean;

  primaryQuality?: string;
  groundingNeedsReview?: boolean;

  artifactCount: number;
  warnings: string[];
};

export type SourceCapsule = {
  capsuleId: string;
  title: string;
  description?: string;
  slug?: string;

  sourceUrl?: string;
  contentFingerprint?: string;
  runId?: string;

  primary?: AiwikiArtifact;
  sourceCard?: AiwikiArtifact;
  raw?: AiwikiArtifact;

  claims: AiwikiArtifact[];
  assets: AiwikiArtifact[];
  topics: AiwikiArtifact[];
  outlines: AiwikiArtifact[];
  runs: AiwikiArtifact[];
  artifacts: AiwikiArtifact[];

  lifecycle: KnowledgeLifecycle;
  relationships: TypedRelationship[];
  okf: OkfProjection;
  quality: CapsuleQuality;

  score?: number;
  nextActions: string[];
};
```

#### 必须实现函数

```ts
export async function buildCapsules(
  root: string,
  options?: {
    includeBody?: boolean;
    includeDebug?: boolean;
  }
): Promise<SourceCapsule[]>;

export function buildCapsulesFromArtifacts(
  artifacts: AiwikiArtifact[]
): SourceCapsule[];

export async function findCapsules(
  root: string,
  query: string,
  options?: {
    limit?: number;
    includeDebug?: boolean;
    includeArchived?: boolean;
  }
): Promise<SourceCapsule[]>;

export async function findCapsuleById(
  root: string,
  capsuleId: string
): Promise<SourceCapsule | undefined>;

export async function findCapsuleByPath(
  root: string,
  pathOrVaultPath: string
): Promise<SourceCapsule | undefined>;

export function capsuleToJson(capsule: SourceCapsule): unknown;
```

#### Capsule ID 生成

```ts
export function capsuleIdFor(input: {
  capsuleId?: string;
  sourceUrl?: string;
  contentFingerprint?: string;
  runId?: string;
  slug?: string;
  vaultPath?: string;
}): string {
  const seed =
    input.capsuleId ||
    normalizeUrl(input.sourceUrl) ||
    input.contentFingerprint ||
    input.runId ||
    input.slug ||
    input.vaultPath ||
    "unknown";

  return input.capsuleId ?? `src_${sha1(seed).slice(0, 12)}`;
}
```

#### 分组优先级

```text
1. frontmatter.capsule_id
2. content_fingerprint
3. normalized source_url
4. run_id
5. slug
6. path fallback
```

#### primary 选择规则

```text
1. 优先 role=primary 且 type=wiki_entry
2. 其次路径在 05-wiki/source-knowledge/
3. 其次任意 wiki_entry
4. 如果没有 primary，则 legacy capsule still valid，但 quality.hasPrimary=false
```

#### 质量规则

```text
hasPrimary=false         -> warning: missing_primary
multiple primary         -> warning/error in lint --capsules
hasSourceCard=false      -> warning
hasRaw=false             -> warning
run only capsule         -> debug only, query 默认不返回
superseded lifecycle     -> query 默认降权或隐藏
contradicted lifecycle   -> query 返回 warning
```

---

## 6. 新生成 frontmatter 规范

### 6.1 Wiki Entry

```yaml
---
aiwiki_id: "src_xxx:wiki-entry"
type: "wiki_entry"
title: "标题"
description: "一句话总结"
resource: "https://example.com/source"
tags:
  - source-knowledge
timestamp: "2026-06-30T00:00:00.000Z"

wiki_type: "source_knowledge"
source_role: "input"
represents_user_view: false
status: "active"

capsule_id: "src_xxx"
artifact_role: "primary"
visibility: "primary"

source_url: "https://example.com/source"
source_card: "03-sources/article-cards/xxx.md"
raw_file: "02-raw/articles/xxx.md"
run_summary: "09-runs/xxx/processing-summary.md"
run_id: "20260630-xxxx"
content_fingerprint: "sha256:..."

knowledge_status: "active"
confidence_level: "medium"
confidence_score: null
last_confirmed: "2026-06-30T00:00:00.000Z"
valid_from: "2026-06-30T00:00:00.000Z"
valid_until: null
staleness: "fresh"
evidence_count: 1
evidence_refs:
  - "03-sources/article-cards/xxx.md"
supersedes: []
superseded_by: []
contradicted_by: []
relationships: []

created_at: "2026-06-30T00:00:00.000Z"
updated_at: "2026-06-30T00:00:00.000Z"
---
```

### 6.2 Source Card

```yaml
---
type: "source_card"
title: "标题"
description: "来源、作者、可信度和追溯信息"
resource: "https://example.com/source"
tags:
  - source-card
timestamp: "2026-06-30T00:00:00.000Z"

capsule_id: "src_xxx"
artifact_role: "source_card"
visibility: "supporting"

source_url: "https://example.com/source"
wiki_entry: "05-wiki/source-knowledge/xxx.md"
raw_file: "02-raw/articles/xxx.md"
run_id: "20260630-xxxx"
content_fingerprint: "sha256:..."
---
```

### 6.3 Raw

```yaml
---
type: "raw_article"
title: "标题"
description: "Raw source record"
resource: "https://example.com/source"
tags:
  - raw-source
timestamp: "2026-06-30T00:00:00.000Z"

capsule_id: "src_xxx"
artifact_role: "raw_source"
visibility: "supporting"

source_url: "https://example.com/source"
wiki_entry: "05-wiki/source-knowledge/xxx.md"
source_card: "03-sources/article-cards/xxx.md"
run_id: "20260630-xxxx"
content_fingerprint: "sha256:..."
---
```

### 6.4 Run Summary

```yaml
---
type: "processing_summary"
title: "Processing Summary: 标题"
description: "AIWiki processing record"
tags:
  - run-log
timestamp: "2026-06-30T00:00:00.000Z"

capsule_id: "src_xxx"
artifact_role: "run_log"
visibility: "debug"

run_id: "20260630-xxxx"
wiki_entry: "05-wiki/source-knowledge/xxx.md"
source_card: "03-sources/article-cards/xxx.md"
raw_file: "02-raw/articles/xxx.md"
---
```

---

## 7. CLI 设计

### 7.1 新增 `aiwiki show`

#### 用法

```bash
aiwiki show "<query>"
aiwiki show --id src_xxx
aiwiki show --artifact-path 05-wiki/source-knowledge/xxx.md --path <workspace>
aiwiki show "<query>" --json
aiwiki show "<query>" --debug
aiwiki show "<query>" --all-artifacts
```

#### 输出结构

```text
Source Capsule: 标题

主入口:
- Wiki Entry: 05-wiki/source-knowledge/xxx.md

一句话总结:
...

生命周期:
- status: active
- confidence: medium
- last_confirmed: 2026-06-30
- staleness: fresh

OKF:
- type: wiki_entry
- description: yes
- resource: yes
- citations: yes

证据:
- Source Card: ...
- Raw: ...

派生材料:
- Claims: ...
- Topics: ...
- Outline: ...

调试材料:
- Run Summary: ...

下一步:
- aiwiki context "相关主题"
- aiwiki query "相关主题"
- aiwiki lint --capsules
```

#### 失败行为

```text
找不到匹配：
- 输出 no matching capsule
- 建议 aiwiki query "<query>"
- exit code 1

匹配多个：
- 输出 top 5
- 建议 aiwiki show --id src_xxx
- exit code 0
```

---

### 7.2 修改 `aiwiki query`

#### 默认行为

0.3.0 后：

```bash
aiwiki query "<topic>"
```

默认输出 Source Capsule 列表。

```text
找到 5 个相关 Source Capsules:

1. 标题
   主入口: 05-wiki/source-knowledge/xxx.md
   描述: ...
   生命周期: active / medium / fresh
   证据: Source Card / Raw
   下一步: aiwiki show --id src_xxx

2. ...
```

#### 保留旧视图

```bash
aiwiki query "<topic>" --view files
```

旧视图继续按文件类型：

```text
Wiki Entries
Source Cards
Claims
Topics
Outlines
Raw Refs
```

#### 支持 JSON

```bash
aiwiki query "<topic>" --json
```

可以输出 capsule JSON list。

---

### 7.3 修改 `aiwiki context`

#### 默认不变

```bash
aiwiki context "<topic>"
```

继续输出 `aiwiki.context.v1`，保持旧 Agent 兼容。

#### 新增 Capsule View

```bash
aiwiki context "<topic>" --view capsule
aiwiki context "<topic>" --capsules
```

输出：

```json
{
  "schema_version": "aiwiki.context.capsule.v1",
  "query": "主题",
  "generated_at": "2026-06-30T00:00:00.000Z",
  "capsules": [
    {
      "capsule_id": "src_xxx",
      "title": "标题",
      "description": "一句话总结",
      "score": 0.86,
      "primary_entry": "05-wiki/source-knowledge/xxx.md",
      "lifecycle": {
        "knowledge_status": "active",
        "confidence_level": "medium",
        "staleness": "fresh",
        "last_confirmed": "2026-06-30T00:00:00.000Z"
      },
      "okf": {
        "ready": true,
        "type": "wiki_entry",
        "resource": "https://example.com/source",
        "timestamp": "2026-06-30T00:00:00.000Z"
      },
      "evidence": {
        "source_card": "03-sources/article-cards/xxx.md",
        "raw": "02-raw/articles/xxx.md"
      },
      "supporting_artifacts": {
        "claims": [],
        "assets": [],
        "topics": [],
        "outlines": []
      },
      "debug": {
        "run_summary": "09-runs/xxx/processing-summary.md"
      },
      "warnings": []
    }
  ],
  "suggested_answer_structure": [
    "主题概览",
    "核心资料",
    "主要结论",
    "证据边界",
    "可复用判断",
    "下一步建议"
  ],
  "warnings": []
}
```

---

### 7.4 修改 `aiwiki lint`

#### 默认 `aiwiki lint`

保持现有行为，不因为旧文件缺新字段产生大量 warning。

#### 新增

```bash
aiwiki lint --capsules
aiwiki lint --lifecycle
aiwiki lint --okf
aiwiki lint --strict
```

#### `--capsules`

检查：

```text
missing primary
multiple primary
artifact role/path mismatch
visibility mismatch
orphan artifact
debug artifact exposed as primary
```

#### `--lifecycle`

检查：

```text
missing knowledge_status
missing last_confirmed
superseded but still active
contradicted but not needs_review/contradicted
high confidence with no evidence
stale but no warning
```

#### `--okf`

检查：

```text
missing type
missing title
missing description
missing resource when source_url exists
missing timestamp
missing Citations / 来源与证据
index/log structure readiness
```

#### `--strict`

只建议 CI 或新 workspace 使用：

```text
把新字段缺失提升为 warning/error。
```

---

### 7.5 修改 `aiwiki status`

新增：

```text
Capsules:
- capsule_count
- artifact_count
- average_artifacts_per_capsule
- orphan_artifact_count

Lifecycle:
- active_count
- stale_count
- superseded_count
- contradicted_count
- lifecycle_risk

OKF:
- okf_ready_count
- okf_missing_description
- okf_missing_citations

Entropy:
- entropy_risk: simple | growing | needs_capsule_view | needs_index
- suggested_action
```

建议判断：

```ts
function entropyRisk(capsuleCount: number, avgArtifacts: number) {
  if (capsuleCount < 50) return "simple";
  if (capsuleCount < 200) return "growing";
  if (capsuleCount < 1000) return "needs_capsule_view";
  return "needs_index";
}
```

---

## 8. 修改现有文件清单

### 8.1 `package.json`

必须：

```json
"version": "0.3.0"
```

确认 `files` 中包含：

```text
dist/src
README.md
README.zh-CN.md
docs
examples
skill
```

当前 package 已包含 `skill`、`examples` 和主要 docs。不要新增 root `schema/` 作为 npm 发布内容，除非同步更新 `files`。

---

### 8.2 `src/app.ts`

职责：

```text
1. 注册 show 命令
2. query 默认 capsule view
3. query --view files 旧视图
4. context --view capsule 路由
5. lint flags 路由
6. status 输出新增 metrics
7. ingest result 人类输出改为主入口 / 支撑材料 / 调试材料
```

建议不要继续把所有逻辑塞进 `app.ts`。`app.ts` 只做路由和组合：

```ts
import { runShowCommand } from "./show.js";
import { renderQueryCapsules, renderQueryFiles } from "./query-view.js";
import { buildCapsuleContext } from "./capsule-context.js";
import { runCapsuleLint } from "./capsule-lint.js";
```

---

### 8.3 `src/args.ts`

增加：

```text
--view capsule|files
--capsules
--id
--path
--debug
--all-artifacts
--include-archived
--strict
--lifecycle
--okf
```

如果当前 args 解析比较简单，不要引入新依赖，继续手写解析。

---

### 8.4 `src/context.ts`

保持 `aiwiki.context.v1` 默认不变。

新增导出：

```ts
export async function createCapsuleContext(
  root: string,
  query: string,
  options?: CapsuleContextOptions
): Promise<CapsuleContextResult>;
```

或把 capsule context 放在 `src/capsule-context.ts`，`context.ts` 只调用。

---

### 8.5 `src/ingest.ts`

新增：

```text
capsule_id
artifact_role
visibility
description
resource
timestamp
knowledge_status
confidence_level
last_confirmed
staleness
supersedes
superseded_by
contradicted_by
relationships
```

注意：

```text
1. 不删除旧字段
2. 不改旧路径
3. 不强制 optional artifacts 必须生成
4. buildAgentReport 保留 keyFiles.reviewQueue
5. 成功输出人类层级改为主入口 / 支撑材料 / 调试材料
```

建议在 `buildArtifactLinks` 或 payload normalization 后生成：

```ts
const capsuleId = createCapsuleId({
  sourceUrl: payload.source.url,
  contentFingerprint,
  slug
});
```

---

### 8.6 `src/wiki-entry.ts`

职责：

```text
1. Wiki Entry 模板加入 OKF-ready 字段
2. Wiki Entry 模板加入 lifecycle 字段
3. 正文加入 来源与证据 / Citations section
4. 不把外部资料误标为 represents_user_view=true
```

建议正文结构：

```md
# 标题

## 一句话总结

## 这篇资料解决什么问题

## 核心观点

## 可复用知识点

## 适合用于什么场景

## 相关概念

## 生命周期状态

- knowledge_status:
- confidence_level:
- last_confirmed:
- staleness:

## 来源与证据

- Source Card:
- Raw:
- Original URL:

# Citations

[1] Original Source
```

中文 `来源与证据` 可以保留；为了 OKF-ready，也可以同时保留 `# Citations` 或在 OKF export 时转换。0.3.0 建议正文里直接包含 `## 来源与证据`，lint --okf 接受它和 `# Citations` 两种形式。

---

### 8.7 `src/lint.ts`

保留原有 lint。

新增组合：

```ts
import { runCapsuleLint } from "./capsule-lint.js";
```

`lint --capsules`、`--lifecycle`、`--okf` 可以合并进同一个 report：

```ts
export type ExtendedLintReport = {
  base: LintReport;
  capsules?: CapsuleLintReport;
  lifecycle?: LifecycleLintReport;
  okf?: OkfLintReport;
};
```

旧 workspace 默认：

```text
aiwiki lint
```

不提示大量新字段缺失。

---

### 8.8 `src/workspace.ts`

新增 seed：

```text
dashboards/Source Capsules.md
```

修改新的 `AIWiki Home.md` seed：

```text
主入口：
- Source Capsules
- Wiki Entries
- Lint Report

支撑视图：
- Source Cards
- Topic Pipeline
- Recent Runs

兼容入口：
- Review Queue
```

不要覆盖老客户已有 dashboard。

新增 `_system/schemas/aiwiki-frontmatter.md` 字段说明：

```text
capsule_id
artifact_role
visibility
description
resource
timestamp
knowledge_status
confidence_level
last_confirmed
staleness
supersedes
superseded_by
contradicted_by
relationships
```

---

### 8.9 `src/frontmatter.ts`

确认：

```text
1. 能解析数组字段
2. 能保留 unknown fields
3. 能安全输出 null / [] / string
4. 不会破坏旧 frontmatter
```

如果当前 frontmatter writer 比较简化，需要新增安全 serializer。

---

### 8.10 `src/output.ts`

可以新增：

```ts
export function printSection(title: string, lines: string[]): string;
export function printKeyValue(label: string, value?: string): string;
```

或者让 `show.ts` 自己渲染。

---

## 9. 新模块实现伪代码

### 9.1 `buildCapsulesFromArtifacts`

```ts
export function buildCapsulesFromArtifacts(
  artifacts: AiwikiArtifact[]
): SourceCapsule[] {
  const groups = new Map<string, AiwikiArtifact[]>();

  for (const artifact of artifacts) {
    const key = groupKeyForArtifact(artifact);
    const list = groups.get(key) ?? [];
    list.push(artifact);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([key, group]) => {
    const primary = choosePrimary(group);
    const sourceCard = firstByRole(group, "source_card");
    const raw = firstByRole(group, "raw_source");

    const lifecycle = lifecycleFromFrontmatter(
      primary?.frontmatter ?? sourceCard?.frontmatter ?? {}
    );

    const relationships = relationshipsFromFrontmatter(
      primary?.frontmatter ?? {}
    );

    const okf = primary
      ? okfProjectionFromArtifact(primary)
      : {
          ready: false,
          tags: [],
          citations: [],
          warnings: ["missing_primary"]
        };

    return {
      capsuleId: capsuleIdFor({
        capsuleId: readString(primary?.frontmatter.capsule_id),
        sourceUrl: primary?.sourceUrl ?? sourceCard?.sourceUrl ?? raw?.sourceUrl,
        contentFingerprint:
          primary?.contentFingerprint ??
          sourceCard?.contentFingerprint ??
          raw?.contentFingerprint,
        runId: primary?.runId ?? sourceCard?.runId ?? raw?.runId,
        slug: primary?.slug ?? sourceCard?.slug ?? raw?.slug,
        vaultPath: primary?.vaultPath ?? sourceCard?.vaultPath ?? raw?.vaultPath
      }),
      title:
        primary?.title ??
        sourceCard?.title ??
        raw?.title ??
        "Untitled Source Capsule",
      description:
        primary?.description ??
        sourceCard?.description ??
        primary?.summary,
      slug: primary?.slug ?? sourceCard?.slug ?? raw?.slug,
      sourceUrl:
        primary?.sourceUrl ?? sourceCard?.sourceUrl ?? raw?.sourceUrl,
      contentFingerprint:
        primary?.contentFingerprint ??
        sourceCard?.contentFingerprint ??
        raw?.contentFingerprint,
      runId: primary?.runId ?? sourceCard?.runId ?? raw?.runId,

      primary,
      sourceCard,
      raw,

      claims: byRole(group, "claim_suggestions"),
      assets: byRole(group, "asset_suggestions"),
      topics: byRole(group, "topic_suggestions"),
      outlines: byRole(group, "outline"),
      runs: byRole(group, "run_log"),
      artifacts: group,

      lifecycle,
      relationships,
      okf,
      quality: capsuleQuality(group, primary, sourceCard, raw),
      nextActions: capsuleNextActions(primary)
    };
  });
}
```

### 9.2 `groupKeyForArtifact`

```ts
function groupKeyForArtifact(artifact: AiwikiArtifact): string {
  if (artifact.capsuleId) return `capsule:${artifact.capsuleId}`;
  if (artifact.contentFingerprint) return `fingerprint:${artifact.contentFingerprint}`;
  if (artifact.sourceUrl) return `url:${normalizeUrl(artifact.sourceUrl)}`;
  if (artifact.runId) return `run:${artifact.runId}`;
  if (artifact.slug) return `slug:${artifact.slug}`;
  return `path:${artifact.vaultPath}`;
}
```

### 9.3 `capsuleRerankScore`

```ts
export function capsuleRerankScore(
  textScore: number,
  capsule: SourceCapsule
): number {
  let score = textScore;

  if (capsule.primary) score += 0.15;
  if (capsule.sourceCard) score += 0.05;
  if (capsule.raw) score += 0.05;

  switch (capsule.lifecycle.knowledgeStatus) {
    case "active":
      score += 0.05;
      break;
    case "needs_review":
      score -= 0.05;
      break;
    case "stale":
      score -= 0.15;
      break;
    case "superseded":
      score -= 0.5;
      break;
    case "contradicted":
      score -= 0.25;
      break;
    case "archived":
      score -= 0.75;
      break;
  }

  switch (capsule.lifecycle.confidenceLevel) {
    case "high":
      score += 0.1;
      break;
    case "medium":
      score += 0.03;
      break;
    case "low":
      score -= 0.1;
      break;
  }

  return score;
}
```

---

## 10. 测试设计

### 10.1 新增测试文件

```text
tests/capsule.test.ts
tests/lifecycle.test.ts
tests/okf.test.ts
tests/context-capsule.test.ts
tests/capsule-lint.test.ts
```

如果不想一次加太多，可以至少加：

```text
tests/capsule.test.ts
tests/context.test.ts
tests/lint.test.ts
```

### 10.2 Fixtures

新增：

```text
tests/fixtures/legacy-workspace/
tests/fixtures/capsule-workspace/
tests/fixtures/lifecycle-workspace/
tests/fixtures/okf-workspace/
```

#### legacy workspace

没有：

```yaml
capsule_id
artifact_role
visibility
knowledge_status
description
resource
timestamp
```

但应该能：

```text
aiwiki show
aiwiki query
aiwiki context --view capsule
```

#### capsule workspace

有完整字段，应该通过：

```text
lint --capsules
```

#### lifecycle workspace

包含：

```text
active
stale
superseded
contradicted
```

用于测试 query 排序和 warnings。

#### okf workspace

测试：

```text
type/title/description/resource/tags/timestamp/citations
```

---

### 10.3 必须通过的测试

```text
1. 旧 workspace 没 capsule_id 也能 buildCapsules。
2. 旧 workspace 不因缺 lifecycle 字段导致 default lint 失败。
3. 新 ingest 生成的 Wiki Entry 有 capsule_id / artifact_role / visibility。
4. 新 ingest 生成的 Wiki Entry 有 description / resource / timestamp。
5. 新 ingest 生成的 Wiki Entry 有 knowledge_status / confidence_level / last_confirmed。
6. aiwiki show 能显示 primary / evidence / lifecycle / OKF。
7. aiwiki query 默认返回 capsule view。
8. aiwiki query --view files 保留旧输出。
9. aiwiki context 默认 schema_version 仍是 aiwiki.context.v1。
10. aiwiki context --view capsule 输出 aiwiki.context.capsule.v1。
11. aiwiki lint --capsules 能检测 missing primary。
12. aiwiki lint --lifecycle 能检测 superseded but active。
13. aiwiki lint --okf 能检测 missing description。
14. Review Queue 不被删除。
15. _suggestions 目录不被重命名。
```

---

## 11. 文档与 Skill 修改

### 11.1 README.md / README.zh-CN.md

必须新增：

```text
Source Capsule 是什么
为什么一篇资料会生成多个文件
默认看哪个
aiwiki show
query 默认胶囊化
context --view capsule
lifecycle metadata
OKF-ready
旧 workspace 是否需要迁移
```

英文示例：

```md
## Source Capsules

A successful ingest creates one Source Capsule.

A Source Capsule groups the files generated from one source:

- Wiki Entry — primary reusable knowledge surface
- Source Card and Raw — evidence and traceability
- Claims, Assets, Topics, Outlines — supporting artifacts
- Run Summary — debug/audit record

Use:

```bash
aiwiki show "<source title>"
aiwiki query "<topic>"
aiwiki context "<topic>" --view capsule
```
```

中文示例：

```md
## 资料胶囊 Source Capsule

一次成功入库会生成一个资料胶囊。

资料胶囊不是一个新文件，而是 AIWiki 对一篇资料的低熵对象视图：

- Wiki Entry：主知识入口
- Source Card / Raw：证据和追溯
- Claims / Assets / Topics / Outlines：支撑材料
- Run Summary：调试和审计记录
```

---

### 11.2 skill/SKILL.md

新增 Agent 规则：

```md
## Source Capsule Usage

When the user asks about one specific source, call:

```bash
aiwiki show "<title or topic>"
```

When the user asks about a topic, call:

```bash
aiwiki context "<topic>"
```

When the user needs a low-entropy object view, call:

```bash
aiwiki context "<topic>" --view capsule
```

Do not read Raw or Run Summary by default.
Only inspect Raw when:
- Wiki Entry is insufficient
- the user asks to verify original evidence
- there is a conflict
- exact citation is required
```

---

### 11.3 skill/QUERY_PROTOCOL.md

必须说明：

```text
context v1 remains default
context --view capsule is preferred for low-entropy retrieval
query is human-facing
show is single-source view
```

---

### 11.4 skill/LINT_PROTOCOL.md

新增：

```text
aiwiki lint --capsules
aiwiki lint --lifecycle
aiwiki lint --okf
```

规则：

```text
Do not treat missing capsule_id in legacy files as fatal.
Use strict mode only when the user asks for strict validation or CI.
```

---

### 11.5 docs/USAGE.md

新增命令示例：

```bash
aiwiki show "..."
aiwiki query "..."
aiwiki query "..." --view files
aiwiki context "..." --view capsule
aiwiki lint --capsules
aiwiki lint --lifecycle
aiwiki lint --okf
```

---

### 11.6 docs/FAQ.md

新增：

```md
### What is a Source Capsule?

### Does Source Capsule create new files?

### Do old workspaces need migration?

### What is lifecycle metadata?

### Does AIWiki automatically mark old knowledge as wrong?

### Is AIWiki OKF-compatible?

### Does AIWiki export OKF now?
```

建议回答：

```text
0.3.0 是 OKF-ready，不是完整 OKF export。
完整 export/import 放到后续版本。
```

---

## 12. Release 验收命令

发布前必须运行：

```bash
npm run build
npm test
npm run release:check
```

新增 smoke test：

```bash
aiwiki --version
aiwiki init --path ./tmp-v030
aiwiki ingest-agent --stdin < tests/fixtures/sample-payload.json
aiwiki show "sample"
aiwiki query "sample"
aiwiki query "sample" --view files
aiwiki context "sample"
aiwiki context "sample" --view capsule
aiwiki lint
aiwiki lint --capsules
aiwiki lint --lifecycle
aiwiki lint --okf
aiwiki status
```

---

## 13. 分阶段开发顺序

### Phase 1：类型与聚合层

```text
1. 新增 artifact.ts
2. 新增 lifecycle.ts
3. 新增 relationships.ts
4. 新增 okf.ts
5. 新增 capsule.ts
6. 单元测试 buildCapsules / lifecycle / okf
```

验收：

```text
旧 workspace 能被聚合成 capsule。
新 workspace 能识别 lifecycle / okf。
```

---

### Phase 2：新文件 frontmatter

```text
1. 修改 ingest.ts
2. 修改 wiki-entry.ts
3. 修改 source-card / raw / run summary frontmatter
4. 保持旧字段不变
```

验收：

```text
新 ingest 生成的所有 artifact 有 capsule_id / artifact_role / visibility。
Wiki Entry 有 lifecycle + OKF-ready 字段。
```

---

### Phase 3：CLI show/query/context

```text
1. 新增 show.ts
2. app.ts 注册 show
3. query 默认 capsule view
4. query --view files 旧视图
5. context --view capsule
6. context 默认 v1 不变
```

验收：

```text
show/query/context 全部可用。
旧 Agent 不受影响。
```

---

### Phase 4：Lint / Status

```text
1. 新增 capsule-lint.ts
2. lint.ts 接入 flags
3. status 增加 metrics
4. 默认 lint 不制造旧库噪声
```

验收：

```text
lint --capsules / --lifecycle / --okf 可用。
默认 lint 行为稳定。
```

---

### Phase 5：Workspace seed / Docs / Skill

```text
1. workspace.ts 新增 Source Capsules dashboard seed
2. Home seed 改成低熵入口
3. README / README.zh-CN
4. docs/*
5. skill/*
```

验收：

```text
新用户文档默认按 Source Capsule 理解 AIWiki。
Agent skill 默认知道 show/context --view capsule。
```

---

## 14. 兼容策略

### 14.1 旧文件

旧文件缺新字段：

```text
不报错
不迁移
runtime inference
```

### 14.2 旧命令

必须保留：

```bash
aiwiki context "<topic>"
```

默认 v1 不变。

### 14.3 旧 Dashboard

保留：

```text
Review Queue.md
Source Cards.md
Recent Runs.md
Topic Pipeline.md
```

新增：

```text
Source Capsules.md
```

### 14.4 旧路径

保留：

```text
04-claims/_suggestions
06-assets/_suggestions
```

不要改成：

```text
04-claims/suggestions
06-assets/suggestions
```

### 14.5 旧输出字段

保留：

```text
keyFiles.reviewQueue
keyFiles.dashboard
keyFiles.sourceCard
keyFiles.wikiEntry
```

可以改变人类展示顺序，但不要删除字段。

---

## 15. 不做项

0.3.0 不做：

```text
1. 不做 SQLite
2. 不做 vector index
3. 不做 BM25
4. 不做 graph traversal
5. 不做 automatic contradiction detection
6. 不做 automatic supersession
7. 不做 retention scheduler
8. 不做 OKF export/import
9. 不做 .aiwiki/capsules manifest 硬依赖
10. 不做旧 Markdown 批量重写
11. 不做目录重命名
12. 不做网页抓取
```

---

## 16. 0.4+ 路线

### 0.4.0：OKF Interop

```text
aiwiki export okf
aiwiki import okf
aiwiki lint --okf --strict
05-wiki/index.md 自动维护
05-wiki/log.md 自动维护
OKF conformance report
```

### 0.5.0：Lifecycle Operations

```text
aiwiki lifecycle report
aiwiki confirm <capsule>
aiwiki mark stale <capsule>
aiwiki supersede <old> <new>
aiwiki review contradictions
aiwiki topic promote
```

### 0.6.0：Index Layer

```text
.aiwiki/index/capsules.json
.aiwiki/index/links.json
aiwiki index build
aiwiki index doctor
BM25 optional
```

### 1.0：Stable Capsule Context

```text
context v2 默认返回 capsules
context --view files 保留旧格式
OKF export stable
Capsule manifest optional stable
```

---

## 17. 开发 Agent 执行提示词

```text
你正在实现 AIWiki 0.3.0。

目标：
把 AIWiki 从 file-centric Markdown artifact tool 升级为 object-centric, lifecycle-aware, OKF-ready local LLM-wiki CLI。

必须做：
1. package version 改为 0.3.0。
2. 新增 artifact.ts / capsule.ts / lifecycle.ts / okf.ts / relationships.ts。
3. 新增 aiwiki show。
4. aiwiki query 默认返回 Source Capsule 视图。
5. aiwiki query --view files 保留旧视图。
6. aiwiki context 默认 v1 不变。
7. 新增 aiwiki context --view capsule / --capsules。
8. 新生成 Markdown frontmatter 加：
   capsule_id / artifact_role / visibility。
9. 新 Wiki Entry frontmatter 加 OKF-ready 字段：
   description / resource / tags / timestamp。
10. 新 Wiki Entry frontmatter 加 lifecycle 字段：
   knowledge_status / confidence_level / last_confirmed / staleness / supersedes / superseded_by / contradicted_by / relationships。
11. 新增 lint --capsules / --lifecycle / --okf。
12. status 增加 capsule_count / entropy_risk / lifecycle_risk / okf_ready_count。
13. 新增 dashboards/Source Capsules.md seed。
14. README / docs / skill 更新。
15. 新增测试。

必须兼容：
1. 不移动旧目录。
2. 不重命名 _suggestions。
3. 不删除 Review Queue。
4. 不覆盖用户已有 Dashboard。
5. 不批量重写旧 Markdown。
6. 不破坏 aiwiki.context.v1。
7. 不引入 SQLite / vector / graph traversal。
8. 不做网页抓取。

验收：
1. npm run build 通过。
2. npm test 通过。
3. 旧 workspace 无 capsule_id 也能 aiwiki show。
4. aiwiki query 默认 capsule view。
5. aiwiki query --view files 保留旧输出。
6. aiwiki context 默认 schema_version 仍是 aiwiki.context.v1。
7. aiwiki context --view capsule 输出 aiwiki.context.capsule.v1。
8. 新 ingest 文件有 capsule/lifecycle/OKF-ready 字段。
9. lint 默认不对旧库制造噪声。
10. lint --capsules / --lifecycle / --okf 可用。
```

---

## 18. Definition of Done

AIWiki 0.3.0 完成后，必须达到：

```text
1. 一篇资料可以被系统识别为一个 Source Capsule。
2. 用户可以用 aiwiki show 查看单篇资料的低熵合成视图。
3. 用户可以用 aiwiki query 获取 Source Capsule 列表。
4. Agent 可以用 aiwiki context --view capsule 获取低熵 JSON。
5. 新生成 artifact 都有 capsule_id / artifact_role / visibility。
6. 新 Wiki Entry 都有 OKF-ready 字段。
7. 新 Wiki Entry 都有生命周期字段。
8. lint 可以检查文件、Capsule、Lifecycle、OKF-ready 四层问题。
9. 旧 workspace 不需要迁移也能继续使用。
10. 0.3.0 没有引入数据库、向量库、图数据库或自动后台任务。
```

---

## 19. 最终判断

0.3.0 的核心不是“多一个 show 命令”，也不是“README 解释清楚”。

0.3.0 的核心是：

```text
建立 AIWiki 的 Knowledge Object Layer。
```

没有 Object Layer：

```text
Capsule 是假的。
Lifecycle 是散字段。
OKF 是装饰。
Query 仍然是文件搜索。
Lint 仍然是文件检查。
```

有了 Object Layer：

```text
Capsule 成为对象。
Lifecycle 成为状态。
OKF 成为投影。
show/query/context/lint 成为对象操作。
```

最终定义：

> **AIWiki 0.3.0 = Source Capsule Object Layer + Minimal Lifecycle State + OKF-ready Projection + Compatible CLI Interface.**
