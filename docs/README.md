# AIWiki Docs

AIWiki is the public Agent-first tool for turning one Agent-provided article or note into local knowledge files.

## Quick Start

```bash
npx aiwiki init --path "F:\knowledge_data\aiwiki" --yes
aiwiki doctor --path "F:\knowledge_data\aiwiki"
```

## Installation Options

```bash
npm install -g aiwiki
```

or:

```bash
npm install --save-dev aiwiki
npx aiwiki doctor --path "F:\knowledge_data\aiwiki"
```

## Agent Usage

Send a link or text to your Agent and include the keyword:

```text
aiwiki
```

The Agent reads the webpage or attachment. AIWiki structures the content and writes it into your local knowledge base.

## Commands

```bash
aiwiki init --path <path> --yes
aiwiki config show --path <path>
aiwiki doctor --path <path>
aiwiki status --path <path>
aiwiki ingest-agent --payload <file> --path <path>
aiwiki ingest-agent --stdin --path <path>
aiwiki ingest-file --file <file> --path <path>
aiwiki ingest-url <url> --content-file <file> --path <path>
```

## Important Boundary

The CLI does not guarantee webpage scraping success. Webpage reading belongs to the host Agent.
