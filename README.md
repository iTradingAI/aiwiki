<p align="center">
  <img src="https://raw.githubusercontent.com/iTradingAI/aiwiki/main/docs/assets/aiwiki-hero.png" alt="AIWiki" width="100%" />
</p>

<p align="center">
  <a href="./README.zh-CN.md">Chinese</a> |
  <a href="./docs/README.md">Docs</a> |
  <a href="./docs/USAGE.md">Usage</a> |
  <a href="./docs/FAQ.md">FAQ</a> |
  <a href="https://www.npmjs.com/package/@itradingai/aiwiki">npm</a>
</p>

# AIWiki

[![npm version](https://img.shields.io/npm/v/@itradingai/aiwiki.svg)](https://www.npmjs.com/package/@itradingai/aiwiki)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Save what your AI reads. Ask it later. Keep everything local.**

AIWiki is a local Markdown knowledge base for AI assistants.

Give your AI assistant a URL, article, file, or note. The assistant reads and understands it. AIWiki turns the result into structured, traceable, reusable Markdown knowledge files.

Use it to build a local AI knowledge base that can be queried, checked, maintained, and reused later.

## Quick Start

Ask your AI assistant to install and configure AIWiki.

1. Choose a local folder for your knowledge base.

```text
Windows: D:\AIWiki
macOS/Linux: ~/AIWiki
Project test: ./aiwiki-test
```

2. Start with a short, natural-language request to Codex, Claude Code, QClaw, OpenClaw, or another local coding assistant:

```text
Install AIWiki, use <my-local-aiwiki-path> as the workspace, sync the supported Agent integration, and tell me what needs attention.
```

The assistant should use `aiwiki setup`, `aiwiki agent sync/check`, `doctor`, and `status` in that order, then explain the resulting workspace and Agent state. The [Usage Guide](docs/USAGE.md) and [Agent Handoff](docs/AGENT_HANDOFF.md#core-intent-matrix) define the command contract, result interpretation, and fallback rules.

Use the following detailed installation checklist only when the assistant needs explicit environment troubleshooting:

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

Then tell me:

1. whether AIWiki was installed successfully
2. which assistant targets were synced
3. whether workspace guidance was written
4. whether I need to restart or reload my assistant
5. what I should do next
```

3. Restart or reload your assistant if needed.

If assistant sync fails, open an [Agent Integration issue](https://github.com/iTradingAI/aiwiki/issues/new?template=agent_integration.md) and include the output of `aiwiki agent check --json` and `aiwiki doctor --path "<workspace>"`.

## First Use

Trying AIWiki for the first time? Use the short trial route in the [Usage Guide](docs/USAGE.md#3-ingest-a-source).

### Ingest a source

Tell your assistant:

```text
Ingest this into AIWiki:
<url>
```

Or:

```text
Save this note into AIWiki:
<paste your note here>
```

The assistant reads the source and calls AIWiki to write the result into your local knowledge base.

For the preferred command, expected artifacts, and readable-source fallback, see the [Core Intent Matrix](docs/AGENT_HANDOFF.md#core-intent-matrix). You do not need to create or save an AIWiki payload yourself.

### Ask your knowledge base

Tell your assistant:

```text
What does AIWiki know about <topic>?
```

The assistant should call:

```bash
aiwiki context "<topic>"
```

For Source Capsule JSON, use:

```bash
aiwiki context "<topic>" --view capsule
```

For direct terminal output, use:

```bash
aiwiki query "<topic>"
```

`query` defaults to the low-entropy Source Capsule view. Use `aiwiki query "<topic>" --view files` when you need the older file-group view for troubleshooting or detailed inspection.

The assistant should inspect result quality and recommended next action before answering. It should only search files directly after the relevant AIWiki query command is insufficient, and should explain that fallback.

To inspect one source package directly:

```bash
aiwiki show "<topic>"
aiwiki show --id <capsule_id>
aiwiki show --artifact-path <artifact.md> --path <workspace>
```

### Check your workspace

Tell your assistant:

```text
Check and organize my AIWiki workspace.
```

The assistant should call:

```bash
aiwiki lint --json
```

For the 0.3.0 Source Capsule layer, deeper checks are opt-in:

```bash
aiwiki lint --capsules --json
aiwiki lint --lifecycle --json
aiwiki lint --okf --json
aiwiki lint --strict --json
```

### Review workspace health

When you explicitly ask for a health review or maintenance plan, the assistant can run:

```bash
aiwiki health --json
aiwiki health --write --json
aiwiki repair --plan --json
```

`aiwiki.health.v1` is a read-only eight-domain snapshot. When you explicitly ask your Agent to generate or save a health report, `aiwiki health --write --json` returns `aiwiki.health_report.v1`, refreshes only the managed section of `dashboards/Knowledge Health.md`, and writes one JSON report under `09-runs/`. It does not change knowledge Markdown or derived state. `aiwiki.repair_plan.v1` remains a read-only list of evidence, affected files, risk, and suggested commands; it never runs repairs on your behalf.

### Inspect your structured index

Tell your assistant:

```text
Check whether my AIWiki structured index is current.
```

The assistant should inspect it without writing first:

```bash
aiwiki index status --path <workspace> --json
```

The index is a small local map of content categories, duplicate source URLs, and local wiki links. It helps an Agent report the organization of a large knowledge base, but it is not a vector database or a replacement for your Markdown files. If it is missing or outdated, `query` and `context` still work from Markdown. The assistant builds it only when you explicitly ask it to build or rebuild the index.

### Inspect your relationship graph

Tell your assistant:

```text
Check whether my AIWiki relationship graph is current.
```

The assistant checks it without writing first:

```bash
aiwiki graph status --path <workspace> --json
```

The relationship graph is a small local map of explicit links between your knowledge files. It records only deterministic local connections, such as a source supporting a wiki entry or a note linking to another note. It does not use an LLM to invent facts, does not replace your Markdown files, and does not change normal `context` or `query` results. If it is missing or outdated, those commands still work from Markdown; the assistant builds or rebuilds the graph only when you explicitly ask it to do so.

### Trace how knowledge is related

Tell your assistant:

```text
Trace the relationship between this topic and its source, including any upstream dependency or conflict.
```

When an existing relationship graph is fresh, the assistant can return the explicit graph-aware context view:

```bash
aiwiki context <topic> --view graph --graph-depth 1 --path <workspace>
```

This produces `aiwiki.context.v2` with bounded relationship paths, evidence state, and lifecycle/risk warnings. It is used only for an explicit relationship request; ordinary context stays on `aiwiki.context.v1`. The assistant never builds or rebuilds the graph automatically for this command.

## What AIWiki Creates

A successful ingest creates a traceable knowledge package:

```text
02-raw/articles/                  Raw source record
03-sources/article-cards/         Source card
05-wiki/source-knowledge/         Reusable wiki entry
09-runs/<run-id>/                 Processing record
```

Optional files may also be created when the assistant provides enough structured content:

```text
04-claims/_suggestions/           Claim candidates
06-assets/_suggestions/           Reusable ideas or writing assets
07-topics/ready/                  Topic candidates
08-outputs/outlines/              Draft outlines
```

The Wiki Entry is the main reusable knowledge surface. The raw record and source card preserve traceability, so you can always go back from a summary to the source.

AIWiki 0.3.0 also treats those files as one logical Source Capsule. A capsule groups the Wiki Entry, Source Card, Raw file, optional suggestions, and run record around the same source. New artifacts include additive metadata such as `capsule_id`, `artifact_role`, `visibility`, lifecycle status, relationship fields, and OKF-ready fields. Old workspaces do not need a bulk migration; AIWiki can infer capsules from the existing Markdown layout.

## Schema Compatibility

Legacy workspace `schema_version: 1` is read as `aiwiki.workspace.v1` without rewriting the file. Default Agent JSON remains `aiwiki.context.v1` and capsule view remains `aiwiki.context.capsule.v1`; declared unknown future majors require manual review. See the [Schema Compatibility catalog](docs/schema/README.md).

CORE-0403 does not change existing Skill matching. CORE-0407 owns the future matching contract, including precedence, fallback, and acceptance tests.

The structured index uses the additive `aiwiki.index.v1` metadata contract. It is explicitly built, removable, and does not change the default `aiwiki.context.v1` retrieval output. See [Derived State v1](docs/schema/STATE.md).

The relationship graph uses the additive `aiwiki.graph.v1` metadata contract. It is explicitly built, removable, and does not change the default `aiwiki.context.v1` retrieval output. Its separately requested graph-aware view is `aiwiki.context.v2`, with `--graph-depth` limited to `1`, `2`, or `3`. See [Derived State v1](docs/schema/STATE.md).

The additive `aiwiki.health.v1` and `aiwiki.repair_plan.v1` JSON contracts remain read-only in Core: health reports risks and repair only proposes reviewed next steps. `aiwiki.health_report.v1` is available only through the explicit `aiwiki health --write --json` report-generation path; it refreshes the managed dashboard section and stores an immutable JSON run record without changing knowledge Markdown or derived state.

See:

- [`examples/demo-run/`](examples/demo-run/)
- [`examples/obsidian-vault-sample/`](examples/obsidian-vault-sample/)
- [`examples/public-trial-scenarios/`](examples/public-trial-scenarios/)

## Why AIWiki

Most useful information dies in one of three places:

- bookmarks you never reopen
- chat summaries you cannot reuse
- notes that never become output

AIWiki helps your assistant turn reading into a durable local knowledge base.

Instead of saving links and losing context, you get Markdown files that your assistant can query, maintain, and reuse later.

## Practical Scenarios

- **Build a personal research wiki** from articles, PDFs, files, and notes.
- **Turn useful reading into reusable ideas** such as concepts, claims, topics, and outlines.
- **Give Codex, Claude Code, or QClaw a stable local knowledge layer** it can query before answering.
- **Keep summaries traceable** with raw records, source cards, Wiki Entries, and run records.

For a guided first trial, use the [public-trial scenario pack](examples/public-trial-scenarios/). It includes article research, topic planning, and project decision memory samples, with commands, expected artifacts, query/context reuse examples, and WeChat-group-ready usage copy.

## How It Works

```text
User gives a URL, file, note, or text
  -> AI assistant reads and understands it
  -> AIWiki writes structured Markdown files
  -> Assistant retrieves context later with aiwiki context
  -> AIWiki lint checks structure and consistency
```

AIWiki separates responsibilities:

- the assistant reads and understands sources
- AIWiki writes, links, queries, and checks the local knowledge base
- Markdown remains inspectable, editable, portable, and versionable

Technically, AIWiki is Agent-first: the host assistant reads and understands sources; AIWiki writes, links, queries, and checks the local Markdown knowledge base.

## Inspired By

AIWiki is inspired by two useful ideas:

- **LLM Wiki**, popularized by Andrej Karpathy: compile sources into a persistent, maintainable wiki instead of rediscovering knowledge from raw documents every time.
- **Content workflow thinking**, seen in creator systems such as Dan Koe's: useful ideas should become reusable building blocks for topics, outlines, writing, and future work.

AIWiki does not simply copy either approach.

It turns them into a practical assistant-driven workflow:

```text
source
  -> source card
  -> wiki entry
  -> reusable assets
  -> topics
  -> outlines
  -> future work
```

The goal is simple: make what your assistant reads useful again later.

## Agent Integration

AIWiki is built for assistant-driven workflows. `aiwiki setup --path "<workspace>" --yes` creates or repairs the knowledge base and refreshes workspace guidance in `AGENTS.md`. `aiwiki agent sync --yes` syncs packaged AIWiki instructions into supported local assistant environments. Use `aiwiki agent sync --path "<workspace>" --yes` only when you want to manually refresh workspace guidance without running setup.

See [Agent Handoff](docs/AGENT_HANDOFF.md) for the full command-first contract.

## Obsidian and Dataview

AIWiki writes plain Markdown and frontmatter.

Obsidian is optional but useful as a viewing surface. Dataview is an optional dashboard enhancement.

AIWiki does not require Obsidian, does not auto-install Dataview, and does not edit `.obsidian`.

Review Queue is not the main workflow. AIWiki creates Wiki entries first, then uses lint and assistant workflows to keep the workspace clean.

## Security and Privacy

- AIWiki writes local Markdown and JSON files.
- AIWiki does not upload your knowledge base.
- AIWiki does not include a built-in LLM.
- AIWiki does not crawl the web by itself.
- `npm install` does not modify assistant configuration.
- Agent integration is explicit through `aiwiki agent sync`.

## Current Status

AIWiki currently focuses on:

- one local AIWiki knowledge base
- local Markdown and frontmatter retrieval
- assistant-driven ingest
- Source Cards and Wiki Entries
- `context`, `query`, `lint`, `status`, and `doctor` workflows

Semantic search, vector indexing, browser clipping, RSS collection, and enterprise permissions are intentionally out of scope for now.

## Boundaries

AIWiki is not:

- a web crawler
- a WeChat reader
- a browser extension
- a built-in LLM
- a vector database
- a replacement for every RAG system
- an Obsidian plugin
- a default manual review queue
- a multi-knowledge-base manager
- an RSS or scheduled collection system

AIWiki receives content already read by your assistant and turns it into a local Markdown knowledge base.

## Community

AIWiki is developed by iTradingAI.

For Chinese users, scan the QR codes below to join the WeChat group or follow the official account.

<p>
  <img src="https://raw.githubusercontent.com/iTradingAI/aiwiki/main/docs/assets/join-group.png" alt="Join WeChat group" width="220" />
  <img src="https://raw.githubusercontent.com/iTradingAI/aiwiki/main/docs/assets/wechat-official-account.png" alt="WeChat official account" width="220" />
</p>

## Documentation

- [Docs](docs/README.md)
- [Usage Guide](docs/USAGE.md)
- [Agent Handoff](docs/AGENT_HANDOFF.md)
- [FAQ](docs/FAQ.md)
- [Showcase](docs/SHOWCASE.md)
- [Public Trial Scenarios](examples/public-trial-scenarios/)
- [Trial Feedback Template](docs/TRIAL_FEEDBACK_TEMPLATE.md)
- [Roadmap](docs/ROADMAP.md)
- [Release Notes](docs/RELEASE.md)

## Development

For local development:

```bash
npm install
npm run build
npm test
npm link
```

Use a temporary workspace for local testing:

```bash
aiwiki setup --path "./aiwiki-test" --yes
aiwiki doctor --path "./aiwiki-test"
aiwiki status --path "./aiwiki-test"
aiwiki ingest-agent --payload tests/fixtures/agent_payload.url.valid.json --path "./aiwiki-test"
aiwiki context "AI Agent" --path "./aiwiki-test"
aiwiki query "AI Agent" --path "./aiwiki-test"
aiwiki lint --path "./aiwiki-test"
```

## License

MIT. See [LICENSE](LICENSE).
