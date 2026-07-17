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

First ensure the workspace and its root guidance are current. `setup` refreshes the marker-bounded `AGENTS.md` guidance automatically:

```bash
aiwiki setup --path <workspace> --yes
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

## Core Intent Matrix

Use this matrix as the command contract for matching natural-language requests. Public guides may show shorter scenarios, but they must not change the preferred command, result interpretation, or fallback boundary below.

| User intent | Preferred command | Interpret the result | Fallback condition |
| --- | --- | --- | --- |
| Install, initialize, or repair a workspace | `aiwiki setup --path <workspace> --yes`, then `aiwiki agent check --path <workspace> --json` | Report workspace readiness and whether root guidance is current | If the command is unavailable, explain the environment problem; do not edit the workspace structure by hand first |
| Sync, upgrade, or repair host-Agent integration | `aiwiki agent check --json`, `aiwiki agent sync --dry-run`, then `aiwiki agent sync --yes` | Explain `installed`, `current`, `different`, backup paths, and any restart/reload requirement | Unsupported hosts must not be written automatically; use `aiwiki prompt agent` for a manual handoff |
| Ingest a local file or material already read by the host Agent | `aiwiki ingest-file --file <file>` or `aiwiki ingest-agent --stdin` | Report ingest status, Wiki Entry quality, Source Card, Processing Summary, and warnings | Record unreadable sources as failed-fetch payloads; never require the user to write or save a payload |
| Query, cite, or reuse local knowledge | `aiwiki query <topic>` for human output or `aiwiki context <topic>` for Agent JSON; use `aiwiki show <topic>` or capsule view for one source package | Read `result_quality`, `recommended_next_action`, provenance, and known gaps before answering | Try the relevant AIWiki command first; only then use file search and state why the command was insufficient |
| Check, organize, or safely repair a workspace | `aiwiki lint --json`; when allowed and only safe fixes exist, `aiwiki lint --fix-empty-dirs --json` followed by `aiwiki lint --json` | Explain errors, warnings, safe-fix scope, and the lint report path | Leave non-safe issues traceable for review; do not make ad hoc Markdown edits as a default repair path |

## Schema Compatibility Boundary

Keep the current command-first intent mapping unchanged. `aiwiki.context.v1` and `aiwiki.context.capsule.v1` remain the supported Agent JSON outputs; legacy workspace `schema_version: 1` remains readable as `aiwiki.workspace.v1` without a rewrite. Unknown future schema majors require manual review and have no CLI migration path. See [Schema Compatibility](schema/README.md).

CORE-0404 exposes the declaration-only Extension API v0.1. CORE-0405 now provides only explicit extension administration: `aiwiki plugin list`, `aiwiki plugin add <directory>`, and `aiwiki plugin enable <id>`. Do not infer these commands from natural language, discover extensions, or describe the Host as a sandbox. CORE-0407 owns extension intent precedence, fallback behavior, and automatic Skill matching.

## Contract Test Matrix

Maintainers run `npm run test:contracts` when changing a Core compatibility boundary. The suite covers `public-api.test.ts`, `cli-compatibility.test.ts`, `extension-api.test.ts`, `schema-compatibility.test.ts`, and `extension-failure-isolation.test.ts`. It verifies only documented public imports and explicit Core CLI surfaces; it does not change this handoff's command-first intent mapping or introduce Pro behavior, extension discovery, or automatic Skill matching. Rebuildability coverage is deferred to `CORE-0501`, when a rebuildable state model exists.

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

Call AIWiki context before writing, researching, deciding, or reviewing when the user asks you to reuse knowledge from this workspace. This includes drafting from prior notes, comparing evidence, recovering project constraints, checking rejected alternatives, or validating whether a match is strong enough to cite.

When the user asks what AIWiki knows about a topic, call:

```bash
aiwiki context "<topic>"
```

Default context stays on `aiwiki.context.v1` for compatibility. When the answer should be source-object oriented, call the capsule view:

```bash
aiwiki context "<topic>" --view capsule
```

Use direct capsule inspection when the user asks for the source package, provenance, lifecycle state, or OKF readiness of a result:

```bash
aiwiki show "<topic>"
aiwiki show --id <capsule_id>
aiwiki show --artifact-path <artifact.md> --path <workspace>
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
- `reuse_guidance`

For capsule context, read:

- `capsules`
- `result_quality.has_primary`
- `result_quality.okf_ready_count`
- `missing_context`
- lifecycle warnings and OKF readiness warnings inside each capsule

Do not scan `02-raw` by default unless the Wiki result is insufficient, the user asks to verify the original text, or sources conflict.

## Lint Protocol

When the user asks to check, organize, or lint the knowledge base, first call:

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
aiwiki setup --path <workspace> --yes
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
