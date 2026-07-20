# AIWiki Usage Guide

AIWiki is meant to be used through an AI assistant.

The target experience is simple:

```text
set up once
  -> send links, files, or notes to your assistant
  -> the assistant calls AIWiki
  -> AIWiki writes reusable local Markdown knowledge
```

AIWiki does not fetch webpages and does not call an LLM. The host assistant reads and understands sources; AIWiki validates, writes, links, queries, and checks the local knowledge base.

## 1. Ask Your Assistant to Install AIWiki

Start with this short request:

```text
Install AIWiki, use <my-local-aiwiki-path> as the workspace, sync the supported Agent integration, and report the workspace and Agent status.
```

The assistant should use `setup`, `agent sync/check`, `doctor`, and `status`, then explain the observed state. The [Core Intent Matrix](AGENT_HANDOFF.md#core-intent-matrix) is the normative mapping for the preferred command, output interpretation, and fallback condition.

Use the following detailed checklist only when installation needs explicit environment troubleshooting:

Before sending it, replace every `<replace-with-my-aiwiki-path>` with your own local folder path, such as `D:\AIWiki` or `~/AIWiki`. Do not leave the placeholder in the commands.

```text
Please install and configure AIWiki for me.

First check that Node.js is installed and that node --version is >=20.
If Node.js is missing or older than 20, stop and tell me how to upgrade before running npm install.

Use this knowledge base path:

<replace-with-my-aiwiki-path>

Replace every `<replace-with-my-aiwiki-path>` below with my own local folder path before running commands. If I left the placeholder unchanged, stop and ask me for the real path.

Run these commands:

npm install -g @itradingai/aiwiki@latest
aiwiki setup --path "<replace-with-my-aiwiki-path>" --yes
aiwiki agent sync --yes
aiwiki agent check --json
aiwiki agent check --path "<replace-with-my-aiwiki-path>" --json
aiwiki doctor --path "<replace-with-my-aiwiki-path>"
aiwiki status --path "<replace-with-my-aiwiki-path>"

Then summarize what was installed, what was synced, whether workspace guidance exists, and whether I need to restart or reload the assistant.
```

Example knowledge base paths:

```text
Windows: D:\AIWiki
macOS/Linux: ~/AIWiki
Project test: ./aiwiki-test
```

`aiwiki setup` creates or repairs the knowledge base and refreshes workspace-level `AGENTS.md` guidance. `aiwiki agent sync --yes` syncs the complete packaged AIWiki `skill/` directory into supported Skill hosts. `agent check --json` and `agent sync --json --yes` report the per-file bundle state; changed bundle files are backed up and unrelated target files stay unchanged. Claude Code uses the manual `AGENT_HANDOFF.md` prompt rather than a copied Skill bundle.

Expected result:

- `aiwiki --version` works
- `aiwiki doctor --path <workspace>` passes or reports actionable fixes
- `aiwiki agent check --json` reports supported targets as `installed`, `updated`, or `current`
- `aiwiki agent check --path <workspace> --json` reports workspace guidance as current
- `aiwiki status --path <workspace>` shows the workspace state and next action

## 2. Agent Sync Layers

AIWiki has two Agent-facing layers:

```bash
aiwiki agent sync --yes
```

Syncs AIWiki instructions into supported local assistant targets such as Codex, Claude Code, QClaw, and OpenClaw.

Workspace guidance is refreshed automatically by:

```bash
aiwiki setup --path <workspace> --yes
```

Use the explicit workspace sync command only when you want to refresh `AGENTS.md` without running setup:

```bash
aiwiki agent sync --path <workspace> --yes
```

This writes marker-bounded guidance into the knowledge base root so future assistants entering that workspace know to use AIWiki commands before generic file search.

Extensions are never selected or activated from a vague natural-language request. Use `aiwiki plugin list --json --path <workspace>` only when the user explicitly asks to list them, `aiwiki plugin add <directory> --path <workspace>` only for a directory the user supplied, and `aiwiki plugin enable <id> --path <workspace>` only for an exact user-supplied ID. See `skill/EXTENSION_PROTOCOL.md` in the installed package.

Verify both layers:

```bash
aiwiki agent check --json
aiwiki agent check --path <workspace> --json
```

For unsupported hosts, print the generic assistant protocol:

```bash
aiwiki prompt agent
```

Do not write unknown host configuration as a fallback. Report that the host is unsupported, use `aiwiki prompt agent`, and keep the manual instructions scoped to that host.

## 3. Ingest a Source

### 10-minute trial route

For a first public trial, keep the loop deliberately small:

```text
setup
  -> first source ingest
  -> inspect generated artifacts
  -> query/context reuse
  -> lint/doctor check
  -> short feedback note
```

Concrete command surface:

```bash
aiwiki setup --path <workspace> --yes
aiwiki doctor --path <workspace>
aiwiki ingest-file --file <file> --path <workspace>
aiwiki query "<topic>" --path <workspace>
aiwiki context "<topic>" --path <workspace>
aiwiki lint --json --path <workspace>
```

When the source is a URL, the assistant reads it first and then calls `aiwiki ingest-agent`; AIWiki itself does not crawl the page.

### Public-trial scenarios

If you do not have a source ready, use the runnable scenario pack:

```bash
aiwiki setup --path ./aiwiki-trial --yes
aiwiki ingest-file --file examples/public-trial-scenarios/input/article-research.md --path ./aiwiki-trial
aiwiki query "source card" --path ./aiwiki-trial
aiwiki context "article research" --path ./aiwiki-trial
aiwiki lint --json --path ./aiwiki-trial
```

The pack includes:

- article research memory
- topic planning memory
- project decision memory

See [`../examples/public-trial-scenarios/`](../examples/public-trial-scenarios/) for sample inputs, expected generated artifacts, query/context reuse examples, maintenance value, and WeChat-group-ready copy for each scenario.

Tell your assistant:

```text
Ingest this into AIWiki:
https://example.com/article
```

The assistant should:

1. read the source
2. build an `aiwiki.agent_payload.v1` payload
3. provide `analysis` or `wiki_entry` when it understands the source
4. call `aiwiki ingest-agent --stdin`
5. report the generated Wiki Entry, Source Card, and Processing Summary

For local files, the assistant may call:

```bash
aiwiki ingest-file --file <file>
```

If webpage reading fails, the assistant should still record the failure with `fetch_status: "failed"` so the run is traceable.

## 4. Ask the Knowledge Base

Tell your assistant:

```text
What does AIWiki know about <topic>?
```

The assistant should call:

```bash
aiwiki context "<topic>"
```

Default `context` returns the stable `aiwiki.context.v1` JSON for assistants. It includes query scope, result quality, match reasons, quality signals, and related references.

For the 0.3.0 Source Capsule object view, call:

```bash
aiwiki context "<topic>" --view capsule
```

Capsule context returns `aiwiki.context.capsule.v1` with grouped source packages, lifecycle warnings, OKF readiness, missing context, and the recommended next action.

For human-readable terminal output:

```bash
aiwiki query "<topic>"
```

`query` defaults to Source Capsule view. It groups the Wiki Entry, Source Card, Raw file, optional suggestions, and run record for the same source. Use the file view only when you need the older file-group output:

```bash
aiwiki query "<topic>" --view files
```

To inspect one capsule:

```bash
aiwiki show "<topic>"
aiwiki show --id <capsule_id>
aiwiki show --artifact-path <artifact.md> --path <workspace>
aiwiki show "<topic>" --json
```

Use query/context before the assistant writes, researches, decides, or reviews:

- Writing: retrieve prior angles, outlines, source-backed points, and quality warnings before drafting.
- Research: start from Wiki Entries, then follow `related_refs` and Source Cards when evidence matters.
- Decisions: recover constraints, prior judgments, and rejected alternatives before changing direction.
- Review: check `result_quality`, `match_reasons`, `quality_signals`, and warnings before treating a match as reusable knowledge.

Useful filters:

```bash
aiwiki context "AI Agent" --type wiki_entries --source-role input --wiki-type source_knowledge --status active --limit 5
aiwiki query "AI Agent" --view files --type source_cards --status to-review --limit 3
```

AIWiki retrieval is local Markdown/frontmatter search. It is not vector search, external search, or RAG-over-wiki.

## 5. Check and Maintain the Workspace

Tell your assistant:

```text
Check and organize my AIWiki workspace.
```

The assistant should run:

```bash
aiwiki lint --json
```

Default lint stays file/structure-oriented and remains quiet for legacy workspaces that do not yet have capsule metadata.

For 0.3.0 checks:

```bash
aiwiki lint --capsules --json
aiwiki lint --lifecycle --json
aiwiki lint --okf --json
aiwiki lint --strict --json
```

Use `--strict` for release or CI-style checks, not as the default user cleanup pass.

If only safe fixes are available and you allow cleanup:

```bash
aiwiki lint --fix-empty-dirs --json
aiwiki lint --json
```

Current automatic safe fix:

- remove known empty optional enhancement directories

AIWiki must not delete core directories, unknown directories, non-empty directories, or files as a safe fix.

### Inspect Or Rebuild Derived State

Use rebuild only when you explicitly ask the assistant to inspect or rebuild derived state. It is not a regular lint step and is not required before `query`, `context`, `show`, `lint`, or `status`.

```bash
aiwiki rebuild --dry-run --json --path <workspace>
aiwiki rebuild --check --json --path <workspace>
aiwiki rebuild --path <workspace> --json
```

`--dry-run` previews the current Markdown-derived snapshot without writing. `--check` exits 1 for missing, stale, or invalid state. The default command writes only the four removable files under `.aiwiki/state/`; it does not modify Markdown. If another rebuild is active, report the lock conflict and wait rather than deleting the lock. Deleting state is safe because it can be explicitly rebuilt later. See [Derived State v1](schema/STATE.md).

### Inspect Or Rebuild The Structured Index

The structured index is a removable local metadata file for artifact categories, source-URL duplication signals, and resolved local wiki links. It is not semantic search or a vector index, and it does not replace the Markdown records used by `query` and `context`.

```bash
aiwiki index status --path <workspace> --json
aiwiki index build --path <workspace> --json
aiwiki index rebuild --path <workspace> --json
```

Use `index status` only when the user explicitly asks whether the index is current. It reports `fresh`, `missing`, `stale`, or `invalid`; only `fresh` exits 0. Run `index build` or `index rebuild` only when the user explicitly asks to write the metadata. Do not automatically build or rebuild the index from query, context, show, lint, status, ingest, or generic maintenance work. Markdown-backed retrieval remains available when the index is missing, stale, or invalid.

## 6. Generated Artifacts

Core artifacts:

```text
09-runs/<run-id>/payload.json
09-runs/<run-id>/raw.md
09-runs/<run-id>/source-card.md
09-runs/<run-id>/wiki-entry.md
09-runs/<run-id>/processing-summary.md
02-raw/articles/
03-sources/article-cards/
05-wiki/source-knowledge/
```

Optional artifacts appear only when the assistant provides matching content or explicitly requests them:

```text
09-runs/<run-id>/creative-assets.md
09-runs/<run-id>/topics.md
09-runs/<run-id>/draft-outline.md
04-claims/_suggestions/
06-assets/_suggestions/
07-topics/ready/
08-outputs/outlines/
```

Wiki Entry quality modes:

- `agent_enriched` / `enriched`: the assistant provided analysis or wiki content.
- `deterministic_fallback` / `scaffold`: AIWiki created a traceable shell from source content only.

Source Capsule metadata is additive. New artifacts may include:

- `capsule_id`, `artifact_role`, `visibility`
- `knowledge_status`, `confidence_level`, `confidence_score`, `staleness`
- `evidence_refs`, `evidence_count`, `last_confirmed`
- `relationships`, `supersedes`, `superseded_by`, `contradicted_by`
- OKF-ready fields such as `resource`, `description`, and `timestamp`

Old workspaces do not need a bulk migration. Capsule commands can infer grouping from paths, source URLs, content fingerprints, and run IDs when explicit `capsule_id` is absent.

First-run success checklist:

- `09-runs/<run-id>/processing-summary.md` exists
- a raw record exists under `02-raw/articles/`
- a Source Card exists under `03-sources/article-cards/`
- a Wiki Entry exists under `05-wiki/source-knowledge/`
- `aiwiki query "<topic>" --path <workspace>` returns a relevant match
- `aiwiki show "<topic>" --path <workspace>` opens one Source Capsule
- `aiwiki context "<topic>" --path <workspace>` returns machine-readable context for the assistant
- `aiwiki context "<topic>" --view capsule --path <workspace>` returns capsule JSON for the assistant
- `aiwiki lint --json --path <workspace>` returns structured workspace feedback

## 7. Obsidian and Dataview

AIWiki writes plain Markdown and frontmatter.

Obsidian is optional. Dataview is optional. AIWiki does not edit `.obsidian`, install plugins, or require Dataview to query the knowledge base.

`aiwiki setup` creates dashboard and schema files when missing and preserves user-edited files.

## Schema Compatibility

AIWiki reads legacy workspace `schema_version: 1` as `aiwiki.workspace.v1` without rewriting `aiwiki.yaml`. Current Agent JSON remains `aiwiki.context.v1` by default and `aiwiki.context.capsule.v1` for the capsule view. Unknown additive frontmatter remains readable; a declared unknown future major requires manual review and has no automatic migration command.

See the [Schema Compatibility catalog](schema/README.md) and [Derived State v1](schema/STATE.md) for optional marker fields, the migration boundary, and removable state behavior. CORE-0404 exposes the declaration-only [Extension API v0.1](schema/EXTENSION_SCHEMA.md). CORE-0405 adds the explicit [Extension Host v0.1](schema/EXTENSION_HOST.md):

```text
aiwiki plugin list --json
aiwiki plugin add <directory> --path <workspace>
aiwiki plugin enable <id> --path <workspace>
```

These commands do not discover packages or create an automatic Skill match. The Host is not a sandbox; it only contains Host-managed state and disables failed extensions while Core continues. CORE-0407 owns natural-language extension matching, precedence, and fallback.

## 8. Troubleshooting

### The `aiwiki` command is missing

Ask your assistant to reinstall globally:

```bash
npm install -g @itradingai/aiwiki@latest
aiwiki --version
```

### The assistant still searches files directly

Run:

```bash
aiwiki agent sync --yes
aiwiki setup --path <workspace> --yes
aiwiki agent check --path <workspace> --json
```

Then restart or reload the assistant if needed.

The assistant should use `aiwiki lint`, `aiwiki status`, `aiwiki query`, `aiwiki context`, `aiwiki ingest-file`, or `aiwiki ingest-agent` before falling back to generic file search.

### The assistant cannot read a webpage

That is a host assistant access issue, not an AIWiki crawler failure. Ask the assistant to record a failed fetch payload so the attempt remains traceable.

### You want to move the default workspace

Run:

```bash
aiwiki setup --path <new-workspace> --yes
aiwiki agent check --path <new-workspace> --json
```

### You want to give trial feedback

Use [`TRIAL_FEEDBACK_TEMPLATE.md`](TRIAL_FEEDBACK_TEMPLATE.md). The template captures setup, first ingest, query/context reuse, lint/doctor clarity, and the user's practical scenario without adding a new AIWiki command.

## 9. Local Development

For repository development:

```bash
npm install
npm run build
npm test
npm link
```

Use a temporary test workspace:

```bash
aiwiki setup --path "./aiwiki-test" --yes
aiwiki doctor --path "./aiwiki-test"
aiwiki status --path "./aiwiki-test"
```
