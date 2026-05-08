---
name: aiwiki
description: Agent-first AIWiki workflow for turning one URL/body into local knowledge production files.
---

# AIWiki Skill

Use this skill when the user asks an Agent to process one URL, article body, or local text file with the `aiwiki` keyword.

The host Agent reads the webpage or user-provided body, then passes structured content to the `aiwiki` CLI. The base CLI writes files and does not own webpage fetching stability.

## Agent Handoff

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

## User Reply

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

## Obsidian + Dataview Boundary

- AIWiki works with Obsidian native Markdown, Properties, Backlinks, Search, and Graph View.
- Dataview is optional. It only enhances the generated dashboards.
- Do not install Dataview for the user.
- Do not edit `.obsidian`, `community-plugins.json`, or Obsidian plugin settings.
- If the user asks about Dataview, explain that they can install it manually from Obsidian Community plugins, then open `dashboards/AIWiki Home.md`.

## Minimal Payload

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
