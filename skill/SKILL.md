---
name: aiwiki
description: Agent-first AIWiki workflow for turning one URL/body into local knowledge production files.
---

# AIWiki Skill

Use this skill when the user asks an Agent to process one URL, article body, or local text file with the `aiwiki` keyword.

The host Agent reads the webpage or user-provided body, then passes structured content to the `aiwiki` CLI. The base CLI writes files and does not own webpage fetching stability.

## Agent 对接流程

1. Read the URL, message, attachment, or user-provided body.
2. Build an `aiwiki.agent_payload.v1` payload with `source` and `request`.
3. Do not include output paths in the payload. The CLI decides where files are written.
4. If webpage reading fails, still build a payload with `source.fetch_status` set to `failed` and include `source.fetch_notes`.
5. Prefer stdin so the user does not need to save a payload file:

```bash
aiwiki ingest-agent --stdin
```

For local files, call:

```bash
aiwiki ingest-file --file <file>
```

## 用户回复

After the CLI runs, read the command output and report these fields to the user:

- `ingested`: whether readable content was written into the knowledge base.
- `recorded`: whether AIWiki wrote a run record.
- `fetch_status`: whether the host Agent supplied readable content.
- `fit_score` and `fit_level`: lightweight fit feedback for review priority.
- `summary`: short content summary or fetch-failure note.
- `run_dir` and `processing_summary`: local result entry points.
- `source_card`: Obsidian source-card entry when ingestion succeeded.
- `dashboard` and `review_queue`: Obsidian review database entry points.

Recommended reply shape:

```text
已加入 Obsidian 审阅队列。
契合度：<fit_score> / <fit_level>
摘要：<summary>
资料卡：<source_card>
处理记录：<processing_summary>
Obsidian 入口：<dashboard>
待审队列：<review_queue>
```

If `fetch_status` is `failed`, say that AIWiki recorded the failure reason but did not ingest readable content.

## Obsidian + Dataview 边界

- AIWiki 默认使用中文提示和中文审阅流程。
- AIWiki 可直接配合 Obsidian 原生 Markdown、Properties、Backlinks、Search 和 Graph View 使用。
- Dataview 是可选增强，只用于渲染生成的 dashboards。
- 不要替用户安装 Dataview。
- 不要编辑 `.obsidian`、`community-plugins.json` 或 Obsidian 插件配置。
- 如果用户问 Dataview，说明可以在 Obsidian Community plugins 中手动安装并启用，然后打开 `dashboards/AIWiki Home.md`。

## 最小 Payload

```json
{
  "schema_version": "aiwiki.agent_payload.v1",
  "source": {
    "kind": "url",
    "url": "https://example.com/article",
    "title": "Article title",
    "content_format": "markdown",
    "content": "Article body read by the host Agent.",
    "fetcher": "host-agent",
    "fetch_status": "ok",
    "captured_at": "2026-05-07T10:00:00+08:00"
  },
  "request": {
    "mode": "ingest",
    "outputs": ["source_card", "creative_assets", "topics", "draft_outline", "processing_summary"],
    "language": "zh-CN"
  }
}
```
