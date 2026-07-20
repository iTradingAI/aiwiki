# AIWiki Schema Compatibility

AIWiki Core 通过统一目录记录当前数据合同。该目录是内部兼容性边界，不是新的 CLI 能力；Extension API v0.1 另有独立文档。

## 当前目录

| 范围 | 规范版本 | 存储位置 | 规则 |
| --- | --- | --- | --- |
| 工作区 | `aiwiki.workspace.v1` | `aiwiki.yaml` | `schema_version: 1` 保持为兼容别名。 |
| Artifact | `aiwiki.artifact.v1` | Markdown frontmatter | 未识别的新增字段会被保留。 |
| Source Capsule | `aiwiki.capsule.v1` | Markdown frontmatter | 旧工作区可继续省略相关元数据。 |
| 生命周期 | `aiwiki.lifecycle.v1` | Markdown frontmatter | 现有生命周期字段保持可新增。 |
| 关系 | `aiwiki.relationships.v1` | Markdown frontmatter | 现有关联字段保持可新增。 |
| Context | `aiwiki.context.v1` | Agent JSON 输出 | 当前默认输出保持稳定。 |
| Capsule context | `aiwiki.context.capsule.v1` | Agent JSON 输出 | 显式 capsule view 保持稳定。 |
| Agent payload | `aiwiki.agent_payload.v1` | Agent JSON 输入 | 输入验证仍然严格。 |
| Agent sync/check | `aiwiki.agent_sync.v1`、`aiwiki.agent_check.v1` | Agent JSON 输出 | 现有输出合同保持稳定。 |
| 派生状态 | `aiwiki.state.*.v1` | `.aiwiki/state/*.json` | 仅为可重建缓存；见[派生状态 v1](STATE.zh-CN.md)。 |
| 结构化索引 | `aiwiki.index.v1` | `.aiwiki/state/index.json` | 显式构建的可删除元数据；不是语义或向量搜索。 |
| 关系图 | `aiwiki.graph.v1` | `.aiwiki/state/graph.json` | 显式构建的确定性本地关系元数据；不改变 Context v1。 |
| Extension 作者合同 | `aiwiki.extension.v1` | 公开包合同 | 声明 API 保持稳定；显式 Host 另有独立文档。 |
| Extension Host | `aiwiki.extension-host.v1` | 本地 Host 状态 | 显式 local/bundled 加载、状态和失败隔离；见 [Extension Host v0.1](EXTENSION_HOST.zh-CN.md)。 |

`aiwiki.context.v2` 已启用，作为显式的关系图 Context view；默认 Context 仍是 `aiwiki.context.v1`，且 Context v2 不会自动构建关系图 state。`aiwiki.extension.v1` 作为 [Extension API v0.1](EXTENSION_SCHEMA.zh-CN.md) 已启用。CORE-0405 只增加显式的 [Extension Host v0.1](EXTENSION_HOST.zh-CN.md)：通过 `plugin add` 与 `plugin enable` 启用 local 或 bundled extension；没有自动发现。

## 兼容与迁移

- 已有 `schema_version: 1` 的工作区会按 `aiwiki.workspace.v1` 读取；AIWiki 不会回写该配置。
- 未声明 frontmatter schema 的内容按当前 v1 合同读取。未知 frontmatter 字段会被容忍，本功能不会删除它们。
- 已声明但未知或未来主版本会被标记为不可写，必须人工复核。内部 `planSchemaMigration()` 报告始终为 `dry_run: true` 且 `would_write: false`。
- CORE-0403 不提供迁移 CLI 命令和 `--apply` 路径。后续迁移必须单独设计、审核和发布。

仅在生产者需要显式声明时，才使用以下可选 frontmatter 标记：

```yaml
aiwiki_schema: "aiwiki.artifact.v1"
aiwiki_capsule_schema: "aiwiki.capsule.v1"
aiwiki_lifecycle_schema: "aiwiki.lifecycle.v1"
aiwiki_relationships_schema: "aiwiki.relationships.v1"
```

## Skill 匹配边界

Extension API v0.1 不新增自然语言意图、命令或自动 Skill 匹配。既有命令优先匹配保持不变；CORE-0405 负责加载，CORE-0407 负责后续 Skill 匹配合同，包括示例、优先级、fallback 和验收测试。

派生状态只增加一个显式维护意图：当用户要求时检查或重建 `.aiwiki/state/`。它不改变日常 query、context、show、lint 或 status 的匹配方式。见[派生状态 v1](STATE.zh-CN.md)。

结构化索引是另一项独立的显式意图：只有用户要求时才检查、构建或重建 `.aiwiki/state/index.json`。它不改变检索，且不得从 query、context、show、lint、status、ingest 或泛化维护工作自动构建。见[派生状态 v1](STATE.zh-CN.md)。

关系图是另一项独立的显式意图：只有用户要求时才检查、构建或重建 `.aiwiki/state/graph.json`。它只记录确定性的本地关系，不改变 `aiwiki.context.v1`，且不得从 query、context、show、lint、status、ingest 或泛化维护工作自动构建。见[派生状态 v1](STATE.zh-CN.md)。
