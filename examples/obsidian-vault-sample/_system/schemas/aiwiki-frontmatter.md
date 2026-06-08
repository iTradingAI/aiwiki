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

## Rule

正文中的 wikilink 用于人工阅读；frontmatter 字段是 Dataview 查询和数据库筛选的来源。
