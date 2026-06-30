# AIWiki FAQ

## What is AIWiki?

AIWiki is a local Markdown knowledge base for AI assistants. Your assistant reads and understands sources; AIWiki writes structured, traceable, reusable Markdown knowledge files.

## Is AIWiki a web crawler?

No. Web reading belongs to the host assistant. AIWiki receives content the assistant already read and turns it into a local knowledge base.

## Does AIWiki call an LLM?

No. AIWiki CLI does not call an LLM. High-quality summaries and analysis come from the host assistant through `analysis` or `wiki_entry` fields.

## Why does installation fail?

Check Node.js first:

```bash
node --version
```

AIWiki requires Node.js 20 or newer. If `node` is missing or older than 20, upgrade Node.js before running `npm install -g @itradingai/aiwiki@latest`.

## Why does AIWiki create `05-wiki`?

Because the goal is not just to save source material. AIWiki creates reusable Wiki Entries that assistants can query later.

## What are the two Wiki Entry quality modes?

- `agent_enriched` / `enriched`: the assistant provided analysis or wiki content.
- `deterministic_fallback` / `scaffold`: AIWiki created a traceable shell from source content only.

## Does a Wiki Entry represent my personal opinion?

Not by default. External sources use `source_role: input` and `represents_user_view: false`. Use `source_role: output` and `represents_user_view: true` only for your own published writing, scripts, talks, newsletters, or similar authored output.

## Do I need Obsidian?

No. AIWiki writes plain Markdown and frontmatter. Obsidian is a useful viewing surface, not a requirement.

## Do I need Dataview?

No. Dataview is optional. AIWiki does not install Dataview and does not edit `.obsidian`.

## Why should I sync the assistant first?

Because the intended workflow is assistant-driven. You send a source or question to the assistant; the assistant calls AIWiki commands. Without sync, the assistant may fall back to generic file search and skip AIWiki's ingest, query, status, and lint surfaces.

## Where should I start?

Ask your assistant to run the Quick Start prompt in the main [README](../README.md). Then read the [Usage Guide](USAGE.md).

## What should my first 10-minute trial include?

Use one temporary knowledge base, one source, one query, and one health check:

```bash
aiwiki setup --path <workspace> --yes
aiwiki doctor --path <workspace>
aiwiki ingest-file --file <file> --path <workspace>
aiwiki query "<topic>" --path <workspace>
aiwiki context "<topic>" --path <workspace>
aiwiki lint --json --path <workspace>
```

If the source is a URL, your assistant should read the URL and then call `aiwiki ingest-agent`; AIWiki does not crawl the URL itself.

## Why is my assistant still reading files directly?

Usually the assistant has not loaded the AIWiki skill, or the workspace root is missing AIWiki guidance. Run:

```bash
aiwiki agent sync --yes
aiwiki agent sync --path <workspace> --yes
aiwiki agent check --path <workspace> --json
```

Then restart or reload the assistant if needed.

## How do I query the knowledge base?

Ask your assistant:

```text
What does AIWiki know about <topic>?
```

The assistant should call:

```bash
aiwiki context "<topic>"
```

For grouped Source Capsule JSON:

```bash
aiwiki context "<topic>" --view capsule
```

For human terminal output:

```bash
aiwiki query "<topic>"
```

`aiwiki query` defaults to Source Capsule view. Use `aiwiki query "<topic>" --view files` when you need the older file-level match list.

To inspect one source package:

```bash
aiwiki show "<topic>"
aiwiki show --id <capsule_id>
aiwiki show --artifact-path <artifact.md> --path <workspace>
```

## What is a Source Capsule?

A Source Capsule is AIWiki's logical object for one source. It groups the Wiki Entry, Source Card, Raw file, optional claim/topic/outline/assets files, and run record that came from the same source.

Old workspaces do not need migration. If explicit `capsule_id` metadata is missing, AIWiki infers grouping from paths, source URLs, content fingerprints, and run IDs.

## How do I check the workspace?

Ask your assistant to run:

```bash
aiwiki lint --json
```

`aiwiki doctor --path <workspace>` checks whether the workspace is ready and reports actionable setup problems.

When safe fixes are allowed:

```bash
aiwiki lint --fix-empty-dirs --json
aiwiki lint --json
```

For capsule-aware checks:

```bash
aiwiki lint --capsules --json
aiwiki lint --lifecycle --json
aiwiki lint --okf --json
```

Use `aiwiki lint --strict --json` for release or CI-style validation, not as the default cleanup path for normal users.

## How do I send useful trial feedback?

Use [TRIAL_FEEDBACK_TEMPLATE.md](TRIAL_FEEDBACK_TEMPLATE.md). Focus on whether setup worked, whether the assistant called AIWiki commands, whether generated files were easy to inspect, whether query/context helped, and what real scenario you wanted to use.

Classify feedback before turning it into a task. The operating categories are installation, first-use, ingest-result, directory, query-reuse, and feature-request. See [Operating Feedback Loop](OPERATING_FEEDBACK_LOOP.md).

## Does feedback automatically become a feature?

No. Feedback is first classified as keep, defer, Pro, reject, or no-change. A base-queue candidate must improve first-use success, reduce understanding cost, improve local reuse, improve command-first Agent behavior, reduce repeated support, or preserve the base boundary. Crawling, vector search, browser plugins, multi-KB, RSS, RBAC, and telemetry do not enter the base queue without a separate plan.

## What is out of scope?

AIWiki is not a web crawler, WeChat reader, browser extension, built-in LLM, vector database, RAG replacement, Obsidian plugin, default manual review queue, multi-knowledge-base manager, RSS tool, or scheduled collection system.
