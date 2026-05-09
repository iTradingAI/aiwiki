# AIWiki Docs

AIWiki 是一个 Agent-first 的本地知识库工具，用来把宿主 Agent 已经读取到的文章、网页正文或本地文本写入单知识库。

- 用户使用说明：[USAGE.md](USAGE.md)
- Agent 对接协议：[AGENT_HANDOFF.md](AGENT_HANDOFF.md)
- Obsidian + Dataview 方案：[OBSIDIAN_DATAVIEW_PLAN.md](OBSIDIAN_DATAVIEW_PLAN.md)
- 架构图：[architecture.svg](architecture.svg)

## Quick Start

```bash
npx @itradingai/aiwiki@latest setup
aiwiki agent list
aiwiki agent install
aiwiki prompt agent
aiwiki doctor
```

优先运行 `aiwiki agent install`，让 CLI 扫描本机 Codex、QClaw、OpenClaw、Claude Code 等宿主 Agent 并安装到所选目标。其他宿主 Agent 可使用 `aiwiki prompt agent` 输出通用协议，再安装成 skill 或粘贴到项目/会话说明里。之后把链接发给宿主 Agent：

```text
入库 https://example.com/article
```

## 重要边界

CLI 不保证网页抓取成功。网页读取属于宿主 Agent。
