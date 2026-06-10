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

Choose a local folder for your knowledge base. Examples:

```text
Windows: D:\AIWiki
macOS/Linux: ~/AIWiki
Project test: ./aiwiki-test
```

Copy this prompt into Codex, Claude Code, QClaw, OpenClaw, or another local coding assistant:

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

AIWiki has two integration layers:

- `aiwiki agent sync --yes` syncs AIWiki instructions into supported local assistant environments.
- `aiwiki agent sync --path "<workspace>" --yes` writes workspace-level guidance so assistants entering the knowledge base know to use AIWiki commands first.

After syncing, restart or reload your assistant if needed.

### Expected result

After setup, your assistant should be able to confirm:

- `aiwiki` is installed and reports a version
- the knowledge base path exists and passes `aiwiki doctor`
- assistant integration is `installed`, `updated`, or `current`
- workspace guidance was written by `aiwiki agent sync --path`
- `aiwiki status` reports the workspace state and next action

## First Use

### 10-minute public trial path

Use this path when you are trying AIWiki for the first time:

1. Run the Quick Start prompt above with a temporary knowledge base path.
2. Send one article, file, or note to your assistant and ask it to ingest the source into AIWiki.
3. Ask one question about the ingested topic so the assistant calls `aiwiki context`.
4. Run `aiwiki query "<topic>"` when you want a direct terminal view.
5. Ask the assistant to check the workspace with `aiwiki lint --json` and `aiwiki doctor`.
6. Share feedback with the short template in [`docs/TRIAL_FEEDBACK_TEMPLATE.md`](docs/TRIAL_FEEDBACK_TEMPLATE.md).

The point of the first trial is not to build a large archive. It is to confirm that one source can move from reading, to traceable Markdown files, to later reuse.

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

When only safe fixes are reported and you allow cleanup, the assistant may run:

```bash
aiwiki lint --fix-empty-dirs --json
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

A successful first run should leave you with:

- a new folder under `09-runs/`
- `payload.json` and `processing-summary.md` inside that run folder
- a Source Card under `03-sources/article-cards/`
- a reusable Wiki Entry under `05-wiki/source-knowledge/`
- `aiwiki query "<topic>"` or `aiwiki context "<topic>"` returning a relevant match
- `aiwiki lint --json` returning structure feedback instead of requiring manual file inspection first

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

- **Save research while reading**: send an article to your assistant and let AIWiki create a source card, Wiki Entry, and processing record.
- **Prepare future writing**: turn useful ideas into reusable concepts, claims, topics, and outline material when the assistant provides enough structure.
- **Ask across your own archive**: ask what AIWiki knows about a topic and let the assistant retrieve local context before answering.

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

AIWiki is built for assistant-driven workflows.

Supported local assistant targets may include:

- Codex
- Claude Code
- QClaw
- OpenClaw

Your assistant should run:

```bash
aiwiki agent sync --yes
aiwiki agent sync --path "<workspace>" --yes
aiwiki agent check --json
aiwiki agent check --path "<workspace>" --json
```

For unsupported hosts, ask AIWiki to print the generic assistant protocol:

```bash
aiwiki prompt agent
```

`npm install` does not silently modify assistant configuration. Sync is explicit, idempotent, and backs up changed installed skill files before overwrite.

After syncing, restart or reload the assistant if needed.

## Obsidian and Dataview

AIWiki writes plain Markdown and frontmatter.

Obsidian is optional but useful as a viewing surface. Dataview is an optional dashboard enhancement.

AIWiki does not require Obsidian, does not auto-install Dataview, and does not edit `.obsidian`.

Review Queue is not the main workflow. AIWiki creates Wiki entries first, then uses lint and assistant workflows to keep the workspace clean.

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

| WeChat Group | Official Account |
| --- | --- |
| ![Join WeChat group](https://raw.githubusercontent.com/iTradingAI/aiwiki/main/docs/assets/join-group.png) | ![WeChat official account](https://raw.githubusercontent.com/iTradingAI/aiwiki/main/docs/assets/wechat-official-account.png) |

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
