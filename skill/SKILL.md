---
name: aiwiki
description: Agent-first AIWiki workflow for turning one URL/body into local Wiki knowledge files.
---

# AIWiki Skill

Use this skill when the user asks an Agent to process one URL, article body, or local text file with the `aiwiki` keyword, or says phrases like `入库 <url>` / `收录 <url>` / `从 AIWiki 里了解 <topic>`.

AIWiki CLI does not fetch webpages and does not call an LLM. The host Agent reads and understands the source; AIWiki validates, writes, links, tracks, queries, and lints local Markdown knowledge files.

## Ingest Flow

1. Read the URL, message, attachment, or user-provided body.
2. Build an `aiwiki.agent_payload.v1` payload with `source` and `request`.
3. If you understand the source, also provide `analysis` and/or `wiki_entry`.
4. Do not include output paths in the payload. The CLI decides where files are written.
5. If webpage reading fails, still build a payload with `source.fetch_status` set to `failed` and include `source.fetch_notes`.
6. Prefer stdin so the user does not need to save a payload file:

```bash
aiwiki ingest-agent --stdin
```

If the current shell or Agent bridge cannot guarantee UTF-8 stdin, write the payload as a UTF-8 JSON file and call:

```bash
aiwiki ingest-agent --payload <utf8-json-file>
```

For local files, call:

```bash
aiwiki ingest-file --file <file>
```

## Wiki Entry Generation Rules

AIWiki always creates a Wiki Entry for successful ingestion:

```text
05-wiki/source-knowledge/<slug>.md
```

There are two modes:

- `agent_enriched` / `enriched`: you provided `analysis` or `wiki_entry`; AIWiki writes those results into the Wiki Entry.
- `deterministic_fallback` / `scaffold`: you only provided source content; AIWiki writes title, source links, body preview, backlinks, and a "to be completed by Agent" section.

Because AIWiki CLI does not call an LLM, high-quality summary and knowledge extraction are the host Agent's responsibility. When possible, provide:

- `analysis.summary`
- `analysis.key_points`
- `analysis.reusable_knowledge`
- `analysis.related_concepts`
- `analysis.use_cases`
- `analysis.topic_candidates`
- `analysis.claims`
- `analysis.outline`
- `wiki_entry.title`
- `wiki_entry.sections`
- `wiki_entry.markdown`

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
  "analysis": {
    "summary": "One-sentence summary.",
    "key_points": ["Key point 1", "Key point 2"],
    "related_concepts": ["Concept A"]
  },
  "request": {
    "mode": "ingest",
    "outputs": ["source_card", "wiki_entry", "creative_assets", "topics", "draft_outline", "processing_summary"],
    "language": "zh-CN"
  }
}
```

## User Reply

After the CLI runs, read the command output and report these fields:

- `ingested`
- `recorded`
- `fetch_status`
- `fit_score` and `fit_level`
- `summary`
- `wiki_entry`
- `wiki_entry_generation_mode`
- `wiki_entry_quality`
- `source_card`
- `processing_summary`
- `run_dir`

Recommended success reply:

```text
AIWiki 已完成入库，并生成 Wiki 条目。
质量模式：<wiki_entry_quality> / <wiki_entry_generation_mode>
摘要：<summary>
Wiki 条目：<wiki_entry>
资料卡：<source_card>
处理记录：<processing_summary>
```

If `wiki_entry_quality` is `scaffold`, say clearly that this Wiki Entry is a traceable fallback and still needs Agent enrichment for high-quality knowledge extraction.

If `fetch_status` is `failed`, say that AIWiki recorded the failure reason but did not ingest readable content.

## Query Protocol

When the user asks to understand a topic from AIWiki, call:

```bash
aiwiki context "<topic>"
```

Use the returned JSON to answer. Prefer Wiki Entries first. Do not scan `02-raw` by default unless the Wiki result is insufficient, the user asks to verify the original text, or sources conflict.

## Lint Protocol

When the user asks to整理 / 检查 / lint the knowledge base, call:

```bash
aiwiki lint
```

Explain warnings and errors as structure-health feedback. Do not frame lint as a requirement that the user manually review every item.

## Obsidian + Dataview Boundary

- AIWiki can be used with plain Markdown.
- Obsidian is a useful viewing surface, not a hard dependency.
- Dataview is optional and only enhances generated dashboards.
- Do not install Dataview for the user.
- Do not edit `.obsidian`, `community-plugins.json`, or Obsidian plugin configuration.

## Prohibited

- Do not ask the user to save payload files.
- Do not ask the user to type `--path` every time.
- Do not claim AIWiki CLI fetches webpages.
- Do not claim AIWiki CLI automatically creates high-quality summaries without Agent-provided analysis.
