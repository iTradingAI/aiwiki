# AIWiki Frontmatter Schema

AIWiki 使用 Obsidian 原生 Properties 作为基础数据库层，Dataview 只作为可选增强。

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
