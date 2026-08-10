# AIWiki Agent 合约

本合约定义 Agent 如何创建、检索、评估和维护本地 AIWiki 知识。它是构建在版本化公共 API（`aiwiki.public.v1`）、CLI 和 MCP 服务器之上的行为合约；它不授权 Agent 作出没有支持的事实断言。

## 生命周期流程

知识生命周期应是反馈环，而不是单向发布流水线：

```text
ingest
  → 在用户明确要求时 rebuild/index/graph
  → context/query
  → show
  → lint
  → health
  → 修复、重新导入或重新评估
  └───────────────────────────────────────→
```

1. **导入（ingest）** 含有已捕获原文和来源元数据的内联 Agent payload。保留溯源信息，并如实表示抓取失败。
2. **重建/index/graph** 仅在用户明确要求状态、构建或重建时执行。派生元数据缺失、过期或无效时，检索仍以 Markdown 为后端；日常回答中不要静默写入派生数据。
3. **上下文/查询（context/query）** 选择可复用知识。Agent 作结构化决策时优先 `context`，需要面向人的胶囊列表时使用 `query`。
4. **显示（show）** 当回答依赖一个胶囊的溯源、制品、生命周期或 OKF 就绪度时使用。
5. **检查（lint）** 在作出维护或清理判断前运行。通过类别、严重级别和建议动作定位问题根源。
6. **健康度（health）** 评估整个工作区并确定下一项维护动作的优先级。健康度结果必须反馈到修复、重新导入、生命周期复核或证据补充。

## 稳定结果合约

Agent 必须基于 `schema_version` 分支，而不是基于字段顺序或渲染文本等偶然特征。以下结果合约在 `aiwiki.public.v1` 内稳定：

| Schema 版本 | 产生者 | Agent 必须执行的行为 |
| --- | --- | --- |
| `aiwiki.context.v1` | simple context | 检查 `query_scope`、`result_quality`、匹配项的 grounding 字段、警告及 `recommended_next_action`。 |
| `aiwiki.context.capsule.v1` | capsule context | 复用前检查主制品、生命周期警告、`okf.ready`、`missing_context` 和建议。 |
| `aiwiki.context.v2` | graph context | 作出关系断言前检查图状态、关系路径/来源、证据状态、生命周期/风险、`must_not_claim`、缺失上下文及建议。 |
| `aiwiki.health.v1` | health | 用摘要/指标和建议动作安排维护优先级；不要把健康报告当作领域断言的来源证据。 |

兼容版本可能新增字段。Agent 必须忽略未知字段，也不能把被省略的可选字段视为正面信号。

## 检索与回答协议

1. 选择最窄的合适视图。一般知识问题从 `context` 开始；来源包、溯源、生命周期或就绪度问题使用 capsule context 或 `show`；仅在明确追溯关系且图状态 fresh 时使用 graph context。
2. 写答案前读取质量和缺口信号。无匹配、警告、过期图、缺失主制品或缺失证据，都必须收窄答案或触发建议的下一步。
3. 优先选择带主制品、没有生命周期警告且 `okf.ready: true` 的胶囊。无法达到该标准时必须说明。
4. 当其会实质影响答案时，应包含来源/溯源、置信度、已知缺口、生命周期/OKF 警告及下一步。
5. 不要自动构建或重建 index/graph。不要把关系路径、生成元数据或弱证据状态升级为没有支持的因果或事实断言。

详尽检索规则见 [`skill/QUERY_PROTOCOL.md`](../skill/QUERY_PROTOCOL.md)。维护和修复规则见 [`skill/LINT_PROTOCOL.md`](../skill/LINT_PROTOCOL.md)。

## OKF 就绪度协议

OKF 就绪度是从制品投影出的可复用知识质量门槛。胶囊仅在其投影没有就绪度警告时才算 ready。主制品应提供：

- `type`（缺失 type 是错误）；
- 标题；
- 描述或摘要；
- 适用时的 `resource` 或来源 URL；
- `timestamp` 或 `created_at`；以及
- 正文中的 `Citations` 章节或等价来源证据。

`okf.ready: false` 不代表内容自动被拒绝。它表示 Agent 必须报告缺少的就绪度证据，避免将胶囊描述为完全可复用，并遵循 `review_okf_readiness` 或 lint 指引。运行 `lint --okf --json`（或适用的 strict/maintenance lint）获取可执行发现项。

## 生命周期状态机

`KnowledgeStatus` 值为 `active`、`needs_review`、`stale`、`superseded`、`contradicted`、`archived` 和 `unknown`。AIWiki 会校验和投影这些状态，但不会推断没有记录的状态转换。修改生命周期 frontmatter 的 Agent 必须使转换有证据支撑，并同步更新关联引用。

```text
unknown ──(分类)────────────────────────────────→ active | needs_review
active ──(需要复核 / 证据过期)──────────────────→ needs_review | stale
needs_review ──(以证据确认)────────────────────→ active
needs_review ──(不再适用)──────────────────────→ stale | superseded | contradicted | archived
stale ──(重新确认)─────────────────────────────→ active | needs_review
active / needs_review / stale ──(被替换)────────→ superseded
active / needs_review / stale ──(被证伪)────────→ contradicted
任一非终态 ──(退役)────────────────────────────→ archived
```

`superseded`、`contradicted` 和 `archived` 对当前答案复用而言均为高风险。适用时在 `superseded_by` 或 `contradicted_by` 中记录对应目标。不要仅因知识匹配查询就重新激活这些条目：必须先复核替代、矛盾或归档理由。`unknown` 是解析/默认状态，需要明确限定。`isAnswerSafeByDefault` 仅对 `active` 和 `unknown` 为 true，不能替代证据审查。

## 证据要求（AD3）

证据随结果一同传递，必须在其出现的位置评估：

- 生命周期：检查 `evidenceCount`、`evidenceRefs`、置信度、陈旧度、有效期和警告。
- 简单上下文：检查每个匹配的 grounding 可用性/复核标志、grounding 标记、质量信号、匹配理由和警告。
- capsule context/show：检查主制品、生命周期、质量和 OKF 投影。
- 图上下文：检查每条关系的路径、`evidence_status`、生命周期状态、风险和 `must_not_claim` 列表。

一项断言必须能追溯到本地制品，或明确限定为缺少支持。生成元数据、胶囊归属或本地 wikilink 比显式 frontmatter 证据更弱。空或缺失的证据集合永远不赋予推断支持关系的权限。

## 关系语义（AD2）

一个类型化关系为 `{ type, target, evidence?, confidenceLevel?, note? }`。可接受的 `RelationshipType` 值如下：

| 类型 | 预期语义 |
| --- | --- |
| `derives_from` | 本条目从目标派生 |
| `derived_from` | “从目标派生”的兼容拼写 |
| `summarizes` | 本条目总结目标 |
| `supports` | 本条目为目标提供支持 |
| `contradicts` | 本条目与目标冲突 |
| `updates` | 本条目更新目标 |
| `supersedes` | 本条目取代目标 |
| `superseded_by` | 本条目被目标取代 |
| `related_to` | 存在关联，但不主张更强的方向 |
| `used_by` | 目标使用本条目 |
| `mentions_topic` | 本条目提及目标主题 |
| `uses` | 本条目使用目标 |
| `depends_on` | 本条目依赖目标 |
| `mentions` | 本条目提及目标 |

用 frontmatter codec 函数标准化关系，用 graph 操作物化/检查 `aiwiki.graph.v1`，再用 graph context v2 追溯它们。写入前必须校验每条关系。关系语法本身不证明断言；可用时应添加 `evidence`、置信度和 note。

## MCP 到 CLI 的映射

| MCP 工具 | 等价 CLI 意图 | 说明 |
| --- | --- | --- |
| `aiwiki_ingest` | `aiwiki ingest-agent --stdin --path <workspace>` | MCP 只接受内联 payload；CLI 可使用其支持的导入输入。 |
| `aiwiki_context` | `aiwiki context <query> --path <workspace>` | MCP `view: "graph"` 对应 `--view graph`；simple 为默认值。 |
| `aiwiki_query` | `aiwiki query <query> --path <workspace>` | 二者都渲染面向人的胶囊查询。 |
| `aiwiki_show` | `aiwiki show <query-or-id> --path <workspace>` | MCP 还支持受约束的 `artifactPath`。 |
| `aiwiki_lint` | `aiwiki lint --path <workspace> --json` | MCP 暴露基础工作区 lint。 |
| `aiwiki_health` | `aiwiki health --path <workspace> --json` | 二者都计算健康报告，而不写入仪表盘。 |

## 版本管理

所有面向 Agent 的合约都有版本。SDK 边界为 `aiwiki.public.v1`；机器可读结果 schema 自带 `schema_version`；MCP 协商协议版本 `2025-06-18`。使用结果前，必须确认其声明版本是 Agent 所理解的版本。遇到未知主版本合约时，应保留结果供检查，并拒绝据其作自动化决策。
