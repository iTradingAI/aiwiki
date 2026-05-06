# AIWiki

AIWiki is an Agent-first knowledge production tool for a single local knowledge base.

You send a URL or article body to a host Agent, add the `aiwiki` keyword, and AIWiki turns the Agent-provided content into local knowledge files for Obsidian review.

## Install

Quick run:

```bash
npx aiwiki init --path "F:\knowledge_data\aiwiki"
```

Global install:

```bash
npm install -g aiwiki
aiwiki init --path "F:\knowledge_data\aiwiki"
```

Local install:

```bash
npm install --save-dev aiwiki
npx aiwiki doctor --path "F:\knowledge_data\aiwiki"
```

## Scope

- Single knowledge base
- Single input per run
- Agent-fetched URL/body handoff
- Local filesystem writes through `aiwiki`
- Source Card, creative assets, topics, draft outline, processing summary

## Agent Boundary

AIWiki does not act as a general webpage scraper.

The host Agent is responsible for reading webpages, files, or messages. AIWiki receives the content and writes structured local files.

## Commands

Initial MVP commands:

```bash
aiwiki init
aiwiki config show
aiwiki doctor
aiwiki ingest-agent --payload <file>
aiwiki ingest-agent --stdin
aiwiki ingest-file --file <file>
```

## Out Of Scope

- Multi-knowledge-base routing
- Batch processing
- Scheduled or specified collection
- Formal state machine
- Technical support
- General webpage scraping inside the base CLI

## License

License will be finalized before the first public release.
