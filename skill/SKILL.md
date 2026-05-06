---
name: aiwiki
description: Agent-first AIWiki workflow for turning one URL/body into local knowledge production files.
---

# AIWiki Skill

Use this skill when the user asks an Agent to process one URL, article body, or local text file with the `aiwiki` keyword.

The host Agent reads the webpage or user-provided body, then passes structured content to the `aiwiki` CLI.

The base CLI writes files and does not own webpage fetching stability.

## Agent Handoff

1. Read the URL, message, attachment, or user-provided body.
2. Build an `aiwiki.agent_payload.v1` payload with `source` and `request`.
3. Do not include output paths in the payload. The CLI decides where files are written.
4. If webpage reading fails, still build a payload with `source.fetch_status` set to `failed` and include `source.fetch_notes`.
5. Call:

```bash
aiwiki ingest-agent --payload <payload.json> --path <aiwiki-path>
```

For local files, call:

```bash
aiwiki ingest-file --file <file> --path <aiwiki-path>
```

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
    "captured_at": "2026-05-06T10:00:00+08:00"
  },
  "request": {
    "mode": "ingest",
    "outputs": ["source_card", "creative_assets", "topics", "draft_outline", "processing_summary"],
    "language": "zh-CN"
  }
}
```
