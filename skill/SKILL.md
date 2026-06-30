---
name: aiwiki
description: Local Markdown knowledge base workflow for AI assistants.
---

<!-- aiwiki-skill-version: 0.3.0 -->

# AIWiki Skill

Use this skill when the user asks an Agent to process one URL, article body, or local text file with the `aiwiki` keyword, or says phrases like `入库 <url>` / `收录 <url>` / `从 AIWiki 里了解 <topic>`.

AIWiki is a local Markdown knowledge base for AI assistants. Save what the assistant reads, ask it later, and keep everything local.

AIWiki CLI does not fetch webpages and does not call an LLM. The host Agent reads and understands the source; AIWiki validates, writes, links, tracks, queries, and lints local Markdown knowledge files.

## Agent-First Setup and Upgrade

When the user asks you to install, update, or repair AIWiki Agent integration, prefer the idempotent sync command:

```bash
aiwiki agent sync --yes
```

For a specific host:

```bash
aiwiki agent sync --agent codex --yes
aiwiki agent sync --agent claude --yes
```

Use `--dry-run` to preview without writing, and `--json` when you need machine-readable status:

```bash
aiwiki agent sync --agent codex --dry-run
aiwiki agent sync --json --yes
aiwiki agent check --json
```

For a project or vault workspace, also sync root guidance so future Agents see the command contract before they inspect files:

```bash
aiwiki agent sync --path <workspace> --yes
aiwiki agent check --path <workspace> --json
```

Sync behavior:

- missing installed skill: install the packaged AIWiki skill
- current installed skill: leave unchanged
- different installed skill: backup the old file, then overwrite with the packaged skill
- workspace `AGENTS.md`: append or refresh the marker-bounded AIWiki block without removing user instructions
- unsupported host: do not write; use `aiwiki prompt agent` as a manual fallback

After sync, tell the user the target path, any backup path, and that the target Agent may need to restart or reload before the new skill is active. Never edit Agent config during `npm install`; sync is the explicit safe step.

## Required Command-First Loop

When the user asks you to organize, inspect, ingest, query, reuse, or maintain an AIWiki workspace, run the AIWiki command surface before generic file search or ad hoc note edits:

```bash
aiwiki setup --path <workspace> --yes
aiwiki agent sync --path <workspace> --yes
aiwiki agent check --path <workspace> --json
aiwiki lint --json --path <workspace>
aiwiki lint --fix-empty-dirs --json --path <workspace>
aiwiki ingest-file --file <file> --path <workspace>
aiwiki ingest-agent --stdin --path <workspace>
aiwiki status --path <workspace>
aiwiki query <topic> --path <workspace>
aiwiki context <topic> --path <workspace>
```

Use fallback shell/file search only after the relevant AIWiki command has been tried or when the command is unavailable. If you fall back, explain which AIWiki command was insufficient and why. If you skip the AIWiki commands entirely, the knowledge-base features are not being exercised.

## Knowledge Base Purpose

Before ingesting, querying, linting, or reorganizing material, read `_system/purpose.md` in the target AIWiki workspace when it exists. Treat it as the local contract for:

- what this knowledge base is trying to solve
- what material belongs here
- what material should stay out
- how uncertain or off-scope material should be handled
- how this knowledge base should remain separable from future knowledge bases

If the material does not fit the purpose file, do not force it into the knowledge base as confirmed knowledge. Record the mismatch, ask for review when needed, or keep it as a traceable source rather than a claim.

## Ingest Flow

For first-time public-trial users, keep the path small and concrete: setup the workspace, ingest one source, inspect the generated run summary / Source Card / Wiki Entry, retrieve with query or context, run lint/doctor, then capture feedback with `docs/TRIAL_FEEDBACK_TEMPLATE.md`. Do not invent a new CLI command for feedback.

1. Read the URL, message, attachment, or user-provided body.
2. Read `_system/purpose.md` and decide whether the material fits this knowledge base.
3. Build an `aiwiki.agent_payload.v1` payload with `source` and `request`.
4. If you understand the source, also provide `analysis` and/or `wiki_entry`.
5. Do not include output paths in the payload. The CLI decides where files are written.
6. If webpage reading fails, still build a payload with `source.fetch_status` set to `failed` and include `source.fetch_notes`.
7. Prefer stdin so the user does not need to save a payload file:

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

Call AIWiki context before writing, researching, deciding, or reviewing when the user asks you to reuse knowledge from this workspace. This includes drafting from prior notes, comparing evidence, recovering project constraints, checking rejected alternatives, or validating whether a match is strong enough to cite.

When the user asks to understand a topic from AIWiki, call:

```bash
aiwiki context "<topic>"
```

Default context remains `aiwiki.context.v1` for compatibility. When the user needs a low-entropy source package, provenance, lifecycle state, or OKF readiness, call:

```bash
aiwiki context "<topic>" --view capsule
```

For one-source inspection, use:

```bash
aiwiki show "<topic>"
aiwiki show --id <capsule_id>
aiwiki show --artifact-path <artifact.md> --path <workspace>
```

Use filters when the user's intent is clear:

```bash
aiwiki context "<topic>" --type wiki_entries --status active --limit 5
aiwiki context "<topic>" --source-role output --limit 5
aiwiki context "<topic>" --type source_cards --status to-review --limit 5
```

Use the returned JSON to answer. Prefer Wiki Entries first, but read these fields before responding:

- `query_scope`: filters, limit, and searched groups
- `result_quality`: total matches, best score, and whether a Wiki Entry was found
- `recommended_next_action`: whether to answer, broaden the query, enrich, or review grounding
- `match_reasons`: why each result matched
- `quality_signals`: scaffold, enriched, grounding, status, and relationship hints
- `related_refs`: local wikilinks and frontmatter relationships
- `reuse_guidance`: how to apply the result to writing, research, decisions, and review

For capsule context, read `capsules`, `result_quality.has_primary`, `result_quality.okf_ready_count`, `missing_context`, lifecycle warnings, and OKF readiness warnings before answering.

Do not scan `02-raw` by default unless the Wiki result is insufficient, the user asks to verify the original text, or sources conflict.

If `quality_signals` contains `quality:scaffold` or `grounding:needs_review`, tell the user the result is a traceable lead that needs enrichment or review. Do not present it as final confirmed knowledge.

For direct human terminal output, use:

```bash
aiwiki query "<topic>"
```

`query` defaults to Source Capsule view. Use `aiwiki query "<topic>" --view files` only when the user needs the older file-level match list for troubleshooting or detailed inspection.

## Lint Protocol

When the user asks to整理 / 检查 / lint the knowledge base, first call JSON lint:

```bash
aiwiki lint --json
```

Run capsule-aware checks only when the user asks for deeper health, release readiness, or Source Capsule validation:

```bash
aiwiki lint --capsules --json
aiwiki lint --lifecycle --json
aiwiki lint --okf --json
aiwiki lint --strict --json
```

If `safe_fixes.only_safe_fixes` is true and the user has allowed cleanup, apply the built-in safe fix and rerun JSON lint:

```bash
aiwiki lint --fix-empty-dirs --json
aiwiki lint --json
```

Only `remove_empty_optional_dir` is auto-safe today. It removes known empty optional enhancement directories and must not delete core directories, unknown directories, non-empty directories, or files. Explain warnings and errors as structure-health feedback. Do not frame lint as a requirement that the user manually review every item.

## Source Role

Use the default source role for external material:

```json
"source_role": "input",
"represents_user_view": false
```

Only use `source_role: "output"` with `represents_user_view: true` when the user is importing their own published writing, talk transcript, newsletter, or similar authored output. Do not mark external material as the user's view.

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
