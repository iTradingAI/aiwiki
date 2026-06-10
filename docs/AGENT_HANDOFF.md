# AIWiki Agent Handoff

This document is for any host assistant that can read sources, produce structured content, and run local commands.

## Goal

When the user says:

```text
Ingest this into AIWiki:
https://example.com/article
```

The assistant should read the source, build an AIWiki payload, call the AIWiki CLI, and report the result to the user.

## Responsibility Boundary

```text
Assistant:
  reads sources, understands content, creates analysis/wiki_entry, calls CLI, replies to user

AIWiki CLI:
  validates payloads, writes local Markdown files, creates Wiki Entries, outputs run status

User:
  provides links, files, or notes, then reviews or reuses the result
```

AIWiki CLI does not fetch webpages and does not call an LLM. If source reading fails, the assistant should still call AIWiki with a failed-fetch payload so the attempt is traceable.

## Required Command-First Contract

When working inside an AIWiki workspace, call AIWiki commands before generic file search or ad hoc note edits.

First sync workspace guidance:

```bash
aiwiki agent sync --path <workspace> --yes
aiwiki agent check --path <workspace> --json
```

Use this command-first loop:

```bash
aiwiki setup --path <workspace> --yes
aiwiki lint --json --path <workspace>
aiwiki lint --fix-empty-dirs --json --path <workspace>
aiwiki ingest-file --file <file> --path <workspace>
aiwiki ingest-agent --stdin --path <workspace>
aiwiki status --path <workspace>
aiwiki query <topic> --path <workspace>
aiwiki context <topic> --path <workspace>
```

Use `rg`, `find`, direct file reading, or temporary scripts only after the relevant AIWiki command has been tried or when the command is unavailable. If you fall back, explain which AIWiki command was insufficient and why.

## Ingest Flow

For a first-time public trial, guide the user through one small loop: setup, one source ingest, generated-file inspection, query/context reuse, lint/doctor check, then feedback with `docs/TRIAL_FEEDBACK_TEMPLATE.md`. Do not introduce Pro-only flows, crawlers, vector search, or a new feedback command.

1. Read the URL, file, note, attachment, or user-provided body.
2. Read `_system/purpose.md` when it exists and decide whether the material fits the workspace.
3. Build an `aiwiki.agent_payload.v1` payload with `source` and `request`.
4. If you understand the source, also provide `analysis` and/or `wiki_entry`.
5. Do not include output paths in the payload. The CLI decides where files are written.
6. If source reading fails, set `source.fetch_status` to `failed` and include `source.fetch_notes`.
7. Prefer stdin:

```bash
aiwiki ingest-agent --stdin
```

If the current shell or assistant bridge cannot guarantee UTF-8 stdin, write a UTF-8 JSON file and call:

```bash
aiwiki ingest-agent --payload <utf8-json-file>
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
    "content": "Article body read by the host assistant.",
    "fetcher": "host-agent",
    "fetch_status": "ok",
    "captured_at": "2026-05-07T10:00:00+08:00",
    "source_role": "input",
    "represents_user_view": false
  },
  "analysis": {
    "summary": "One-sentence summary.",
    "key_points": ["Key point 1", "Key point 2"],
    "related_concepts": ["Concept A"]
  },
  "request": {
    "mode": "ingest",
    "outputs": ["source_card", "wiki_entry", "processing_summary"],
    "language": "zh-CN"
  }
}
```

## Optional Analysis Fields

When useful, provide:

- `entities`
- `concepts`
- `tensions`
- `reusable_judgments`
- `suggested_links`
- `claims` with `source_quote` when claims need evidence
- `wiki_entry.title`
- `wiki_entry.sections`
- `wiki_entry.markdown`

Do not invent unsupported facts. Treat AIWiki grounding warnings as review signals, not as confirmed proof that something is wrong.

## Failed Fetch Payload

```json
{
  "schema_version": "aiwiki.agent_payload.v1",
  "source": {
    "kind": "url",
    "url": "https://example.com/article",
    "title": "Unreadable article",
    "fetcher": "host-agent",
    "fetch_status": "failed",
    "fetch_notes": "The page requires login or the assistant could not access the body.",
    "captured_at": "2026-05-07T10:00:00+08:00"
  },
  "request": {
    "mode": "record_fetch_failure",
    "outputs": ["processing_summary"],
    "language": "en"
  }
}
```

## User Reply

After the CLI runs, read the command output and report:

- ingest status
- source title or URL
- summary
- Wiki Entry path
- Wiki Entry quality mode
- Source Card path
- Processing Summary path
- warnings, if any

Recommended success reply:

```text
AIWiki completed the ingest and created a Wiki Entry.
Quality: <wiki_entry_quality> / <wiki_entry_generation_mode>
Summary: <summary>
Wiki Entry: <wiki_entry>
Source Card: <source_card>
Processing Summary: <processing_summary>
```

If `wiki_entry_quality` is `scaffold`, say clearly that the entry is a traceable fallback and still needs assistant enrichment.

If `fetch_status` is `failed`, say that AIWiki recorded the failure reason but did not ingest readable content.

## Query Protocol

When the user asks what AIWiki knows about a topic, call:

```bash
aiwiki context "<topic>"
```

Use filters when intent is narrow:

```bash
aiwiki context "<topic>" --type wiki_entries --status active --limit 5
aiwiki context "<topic>" --source-role output --limit 5
aiwiki context "<topic>" --type source_cards --status to-review --limit 5
```

Read these fields before responding:

- `query_scope`
- `result_quality`
- `recommended_next_action`
- `match_reasons`
- `quality_signals`
- `related_refs`

Do not scan `02-raw` by default unless the Wiki result is insufficient, the user asks to verify the original text, or sources conflict.

## Lint Protocol

When the user asks to check, organize, or lint the knowledge base, first call:

```bash
aiwiki lint --json
```

If `safe_fixes.only_safe_fixes` is true and the user allows cleanup:

```bash
aiwiki lint --fix-empty-dirs --json
aiwiki lint --json
```

Only `remove_empty_optional_dir` is auto-safe today. It removes known empty optional enhancement directories and must not delete core directories, unknown directories, non-empty directories, or files.

## Source Role

Use the default role for external material:

```json
"source_role": "input",
"represents_user_view": false
```

Use `source_role: "output"` with `represents_user_view: true` only when the user is importing their own published writing, talk transcript, newsletter, or similar authored output.

## Agent Skill Upgrade Flow

When the user asks you to install, update, upgrade, or repair AIWiki integration, run:

```bash
aiwiki agent sync --yes
aiwiki agent sync --path <workspace> --yes
aiwiki agent check --json
aiwiki agent check --path <workspace> --json
```

Interpret sync results:

- `installed`: target did not exist and now has the packaged skill or guidance.
- `current`: target already matches the packaged version.
- `updated`: target differed; the old file was backed up and replaced.
- `would_install` / `would_update`: dry-run preview only.
- `unsupported`: no safe automatic target is known; use `aiwiki prompt agent`.

After sync, report the target path, backup path when present, and whether the assistant needs restart or reload. Do not claim the new skill is active until the assistant has reloaded it.

## Prohibited

- Do not ask the user to save payload files.
- Do not ask the user to type `--path` every time.
- Do not claim AIWiki fetches webpages.
- Do not claim AIWiki automatically creates high-quality summaries without assistant-provided analysis.
- Do not install Dataview for the user.
- Do not edit `.obsidian`, `community-plugins.json`, or Obsidian plugin configuration.
