<p align="center">
  <img src="https://raw.githubusercontent.com/iTradingAI/aiwiki/main/docs/assets/aiwiki-hero.zh-CN.png" alt="AIWiki" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> |
  <a href="./docs/README.zh-CN.md">中文文档</a> |
  <a href="./docs/USAGE.zh-CN.md">使用指南</a> |
  <a href="./docs/FAQ.zh-CN.md">常见问题</a> |
  <a href="https://www.npmjs.com/package/@itradingai/aiwiki">npm</a>
</p>

# AIWiki

[![npm version](https://img.shields.io/npm/v/@itradingai/aiwiki.svg)](https://www.npmjs.com/package/@itradingai/aiwiki)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**把 AI 助手读过的资料，变成以后可以查询、复用、整理的本地知识库。**

AIWiki 是给 AI 助手使用的本地 Markdown 知识库。

你把链接、文章、文件或笔记交给 AI 助手；AI 助手负责读取和理解；AIWiki 负责把结果写成结构化、可追踪、可复用的 Markdown 知识文件。

## 快速开始

先选一个本地文件夹作为 AIWiki 知识库。示例：

```text
Windows: D:\AIWiki
macOS/Linux: ~/AIWiki
项目内测试: ./aiwiki-test
```

把下面这段复制给 Codex、Claude Code、QClaw、OpenClaw 或其他本地 AI 编程助手：

```text
请帮我安装并配置 AIWiki。

请先检查 Node.js 是否已安装，并确认 node --version >=20。
如果没有安装 Node.js，或版本低于 20，请先停止，并告诉我如何升级，不要继续运行 npm install。

我的知识库路径是：

<替换成我的 AIWiki 知识库路径>

请运行这些命令：

npm install -g @itradingai/aiwiki@latest
aiwiki setup --path "<替换成我的 AIWiki 知识库路径>" --yes
aiwiki agent sync --yes
aiwiki agent sync --path "<替换成我的 AIWiki 知识库路径>" --yes
aiwiki agent check --json
aiwiki agent check --path "<替换成我的 AIWiki 知识库路径>" --json
aiwiki doctor --path "<替换成我的 AIWiki 知识库路径>"
aiwiki status --path "<替换成我的 AIWiki 知识库路径>"

最后请告诉我：

1. AIWiki 是否安装成功
2. 哪些 AI 助手目标已经同步
3. 知识库根目录指导是否已经写入
4. 我是否需要重启或重新加载 AI 助手
5. 下一步应该怎么用
```

AIWiki 有两层接入：

- `aiwiki agent sync --yes`：把 AIWiki 的 skill / command 同步到本机支持的 AI 助手环境。
- `aiwiki agent sync --path "<workspace>" --yes`：在知识库根目录写入指导，让以后进入这个目录的 Agent 也知道要优先使用 `aiwiki` 命令。

同步后，如果助手没有立刻识别 AIWiki，需要重启或重新加载助手。

### 安装成功后应该看到什么

完成后，AI 助手应该能确认：

- `aiwiki` 已安装，并能输出版本号
- 知识库路径已经创建，并通过 `aiwiki doctor`
- Agent 接入状态是 `installed`、`updated` 或 `current`
- `aiwiki agent sync --path` 已经写入知识库根指导
- `aiwiki status` 能返回当前知识库状态和下一步动作

## 第一次使用

### 入库资料

对 AI 助手说：

```text
把这个资料入库到 AIWiki：
<url>
```

或者：

```text
把这段笔记保存到 AIWiki：
<粘贴你的笔记>
```

AI 助手读取资料后，会调用 AIWiki 写入本地知识库。

### 从知识库提问

对 AI 助手说：

```text
AIWiki 里关于 <主题> 有什么？
```

助手应该优先调用：

```bash
aiwiki context "<主题>"
```

如果人在终端里直接查询，可以用：

```bash
aiwiki query "<主题>"
```

### 检查知识库

对 AI 助手说：

```text
帮我检查并整理 AIWiki 知识库。
```

助手应该先调用：

```bash
aiwiki lint --json
```

如果只包含安全修复，并且你允许整理，可以继续调用：

```bash
aiwiki lint --fix-empty-dirs --json
aiwiki lint --json
```

## AIWiki 会生成什么

一次成功入库会生成一组可追踪的知识文件：

```text
02-raw/articles/                  原始资料记录
03-sources/article-cards/         资料卡
05-wiki/source-knowledge/         可复用 Wiki 条目
09-runs/<run-id>/                 本次处理记录
```

当 AI 助手提供了更丰富的结构化内容时，还可能生成：

```text
04-claims/_suggestions/           Claim 候选
06-assets/_suggestions/           可复用素材或写作资产
07-topics/ready/                  选题候选
08-outputs/outlines/              大纲草稿
```

Wiki Entry 是主要复用层；Raw 和 Source Card 保留来源和追踪关系，方便以后回查。

可直接查看：

- [`examples/demo-run/`](examples/demo-run/)
- [`examples/obsidian-vault-sample/`](examples/obsidian-vault-sample/)

## AIWiki 解决什么问题

很多资料最后都死在三个地方：

- 收藏夹里，再也没有打开
- AI 聊天记录里，后面无法复用
- 笔记软件里，保存了但没有变成产出

AIWiki 的作用是让 AI 助手把读过的资料整理成本地 Markdown 知识库。

你不只是保存链接，而是在沉淀以后能查询、能复用、能持续整理的知识资产。

## 典型场景

- **阅读时顺手沉淀资料**：把文章发给 AI 助手，让 AIWiki 生成资料卡、Wiki 条目和处理记录。
- **为后续写作做准备**：当助手提供了足够结构化内容时，把观点、概念、选题和大纲素材一起沉淀下来。
- **从自己的资料库里追问**：围绕某个主题提问，让助手先从 AIWiki 取回本地上下文，再组织回答。

## 工作原理

```text
用户给 URL / 文件 / 笔记 / 正文
  -> AI 助手读取并理解
  -> AIWiki 写入结构化 Markdown 文件
  -> 助手以后用 aiwiki context 取回上下文
  -> aiwiki lint 检查结构和一致性
```

AIWiki 分清职责：

- AI 助手负责读取和理解资料
- AIWiki 负责写入、链接、查询和检查本地知识库
- Markdown 保持可读、可编辑、可迁移、可版本管理

## 灵感来源

AIWiki 受两类思路启发：

- **LLM Wiki**：把原始资料编译成一个持续维护的 Wiki，而不是每次提问都重新从原文找答案。
- **内容工作流**：好的资料不应该只停留在摘要里，还应该变成素材、选题、大纲和后续表达的积木。

AIWiki 不是简单拼接两套方法。

它把这些思路整理成一条更容易执行的 AI 助手工作流：

```text
资料
  -> 资料卡
  -> Wiki 条目
  -> 可复用素材
  -> 选题
  -> 大纲
  -> 后续创作 / 研究 / 决策
```

## Agent 接入

AIWiki 面向 AI 助手驱动的工作流。

目前支持自动同步的本地助手目标包括：

- Codex
- Claude Code
- QClaw
- OpenClaw

让 AI 助手运行：

```bash
aiwiki agent sync --yes
aiwiki agent sync --path "<workspace>" --yes
aiwiki agent check --json
aiwiki agent check --path "<workspace>" --json
```

不支持自动写入的宿主，可以输出通用协议：

```bash
aiwiki prompt agent
```

`npm install` 不会偷偷修改 AI 助手配置。同步是显式动作，可重复执行，并会在覆盖已变化的 skill 前创建备份。

## Obsidian / Dataview

AIWiki 写的是普通 Markdown 和 frontmatter。

Obsidian 是推荐查看界面，但不是硬依赖。Dataview 是可选 dashboard 增强。

AIWiki 不会自动安装 Dataview，也不会修改 `.obsidian`。

## 设计边界

AIWiki 不是：

- 网页爬虫
- 微信公众号读取器
- 浏览器插件
- 内置 LLM
- 向量数据库
- 所有 RAG 系统的替代品
- Obsidian 插件
- 默认人工审核队列
- 多知识库管理器
- RSS 或定时采集系统

AIWiki 接收 AI 助手已经读到的内容，并把它变成本地 Markdown 知识库。

## 社区

AIWiki 由 iTradingAI 开源维护。

中文用户可以扫码加入交流群，或关注公众号获取更新、案例和使用讨论。

| 微信交流群 | 公众号 |
| --- | --- |
| ![加入微信群](https://raw.githubusercontent.com/iTradingAI/aiwiki/main/docs/assets/join-group.png) | ![微信公众号](https://raw.githubusercontent.com/iTradingAI/aiwiki/main/docs/assets/wechat-official-account.png) |

## 文档

- [中文文档首页](docs/README.zh-CN.md)
- [使用指南](docs/USAGE.zh-CN.md)
- [Agent 接入说明](docs/AGENT_HANDOFF.zh-CN.md)
- [常见问题](docs/FAQ.zh-CN.md)
- [案例展示](docs/SHOWCASE.zh-CN.md)
- [路线图](docs/ROADMAP.zh-CN.md)
- [发布说明](docs/RELEASE.zh-CN.md)

## 本地开发

```bash
npm install
npm run build
npm test
npm link
```

使用临时知识库测试：

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
