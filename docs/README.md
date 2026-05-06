# AIWiki Docs

AIWiki 是一个 Agent-first 的本地知识库工具，用来把宿主 Agent 已经读取到的文章、网页正文或本地文本写入单知识库。

完整实测手册见：[USAGE.md](USAGE.md)。

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

宿主 Agent 读取网页或附件。AIWiki 负责结构化内容并写入本地知识库。

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

CLI 不保证网页抓取成功。网页读取属于宿主 Agent。
