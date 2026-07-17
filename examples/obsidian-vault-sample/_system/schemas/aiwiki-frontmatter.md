# AIWiki Frontmatter Schema

AIWiki 使用 Obsidian 原生 Properties 作为基础数据库层，Dataview 只作为可选增强。

## Schema Compatibility

- Workspace `schema_version: 1` is read as `aiwiki.workspace.v1` and is not rewritten.
- Optional artifact metadata can declare `aiwiki_schema: "aiwiki.artifact.v1"`; capsule, lifecycle, and relationship markers use their corresponding `aiwiki.*.v1` values.
- Agent JSON remains `aiwiki.context.v1` by default and `aiwiki.context.capsule.v1` for capsule view.
- Unknown future schema majors require manual review; CORE-0403 has no migration CLI or apply path.
- CORE-0403 does not change Skill matching. CORE-0407 owns future matching behavior.

## Shared Fields

- `aiwiki_id`: AIWiki 内部稳定标识。
- `type`: `source_card`, `raw_article`, `claim_suggestions`, `asset_suggestions`, `topic_candidates`, `draft_outline`, `processing_summary`。
- `status`: `to-review`, `ready`, `draft`, `reviewed`, `archived`, `fetch-failed`。
- `slug`: 来源标题或 URL 生成的 slug。
- `source_url`: 原始 URL，若没有则为空。
- `source_type`: `url`, `file`, `text` 等来源类型。
- `created_at`: AIWiki 写入时间。
- `captured_at`: 宿主 Agent 读取来源的时间。
- `run_id`: 本次处理记录目录名。
- `source_card`, `raw_note`, `claims_note`, `assets_note`, `topics_note`, `outline_note`, `run_summary`: Obsidian 内部链接字符串。
- `tags`: AIWiki 类型标签。

## Source Capsule Fields

- `capsule_id`: 同一来源包的稳定 ID。
- `artifact_role`: `primary`, `raw_source`, `source_card`, `claim_suggestions`, `asset_suggestions`, `topic_suggestions`, `outline`, `run_log`, `unknown`。
- `visibility`: `primary`, `supporting`, `debug`。
- `description`: 面向复用的简短说明。
- `resource`: OKF-ready 资源标识。
- `timestamp`: 当前 artifact 对应的时间戳。
- `knowledge_status`: `active`, `draft`, `stale`, `superseded`, `archived`。
- `confidence_level`: `low`, `medium`, `high`。
- `confidence_score`: 0 到 1 的置信分数。
- `last_confirmed`, `valid_from`, `valid_until`: 生命周期时间字段。
- `staleness`: `fresh`, `aging`, `stale`, `unknown`。
- `evidence_count`: 可追踪证据数量。
- `evidence_refs`: 指向证据 artifact 的链接。
- `access_count`, `last_accessed`: 复用观察字段。
- `supersedes`, `superseded_by`, `contradicted_by`: 关系字段。
- `relationships`: typed relationship 列表，用于 Agent 判断来源之间的关系。

## Rule

正文中的 wikilink 用于人工阅读；frontmatter 字段是 Dataview 查询和数据库筛选的来源。
