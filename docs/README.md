# AIWiki Docs

AIWiki 是一个 Agent-first 的本地知识库工具，用来把宿主 Agent 已经读取到的文章、网页正文或本地文本写入单知识库。

- 用户使用说明：[USAGE.md](USAGE.md)
- Agent 对接协议：[AGENT_HANDOFF.md](AGENT_HANDOFF.md)

## Quick Start

```bash
npx aiwiki setup --path "F:\knowledge_data\aiwiki" --yes
aiwiki doctor
```

之后把链接发给宿主 Agent：

```text
aiwiki 处理这篇文章：https://example.com/article
```

## Important Boundary

CLI 不保证网页抓取成功。网页读取属于宿主 Agent。
