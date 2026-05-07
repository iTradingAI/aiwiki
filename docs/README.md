# AIWiki Docs

AIWiki 是一个 Agent-first 的本地知识库工具，用来把宿主 Agent 已经读取到的文章、网页正文或本地文本写入单知识库。

- 用户使用说明：[USAGE.md](USAGE.md)
- Agent 对接协议：[AGENT_HANDOFF.md](AGENT_HANDOFF.md)

## Quick Start

```bash
npx aiwiki setup
aiwiki skill install
aiwiki prompt agent
aiwiki doctor
```

Codex 用户优先运行 `aiwiki skill install`。其他宿主 Agent 可使用 `aiwiki prompt agent` 输出通用协议，再安装成 skill 或粘贴到项目/会话说明里。之后把链接发给宿主 Agent：

```text
入库 https://example.com/article
```

## Important Boundary

CLI 不保证网页抓取成功。网页读取属于宿主 Agent。
