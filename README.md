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

2. Copy this prompt into Codex, Claude Code, QClaw, OpenClaw, or another local coding assistant.

```text
Please install and configure AIWiki for me.

First check that Node.js is installed and that node --version is >=20.
If Node.js is missing or older than 20, stop and tell me how to upgrade before running npm install.

Use this knowledge base path:

<replace-with-my-aiwiki-path>

Run these commands:

npm install -g @itradingai/aiwiki@latest
aiwiki setup --path "<replace-with-my-aiwiki-path>" --yes
aiwiki agent sync --yes
aiwiki agent sync --path "<replace-with-my-aiwiki-path>" --yes
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

### Ask your knowledge base

Tell your assistant:

```text
What does AIWiki know about <topic>?
```

The assistant should call:

```bash
aiwiki context "<topic>"
```

For direct terminal output, use:

```bash
aiwiki query "<topic>"
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

See:

- [`examples/demo-run/`](examples/demo-run/)
- [`examples/obsidian-vault-sample/`](examples/obsidian-vault-sample/)

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

AIWiki is built for assistant-driven workflows. `aiwiki agent sync --yes` syncs packaged AIWiki instructions into supported local assistant environments, and `aiwiki agent sync --path "<workspace>" --yes` writes workspace guidance so assistants entering the knowledge base use AIWiki commands first.

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
