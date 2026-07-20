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

## 场景优先的命令契约

首次使用时，先用一句自然语言请求：

```text
请安装 AIWiki，使用 <我的本地-aiwiki-路径> 作为工作区，同步支持的 Agent 接入，并告诉我工作区和 Agent 状态。
```

Agent 应按 `aiwiki setup`、`aiwiki agent sync/check`、`doctor`、`status` 的路径执行，并解释结果。完整的首选命令、输出解释和 fallback 条件见 [Core Intent Matrix](docs/AGENT_HANDOFF.zh-CN.md#core-intent-matrix)。长提示只用于安装排障，不是首次使用的主路径。

[![npm version](https://img.shields.io/npm/v/@itradingai/aiwiki.svg)](https://www.npmjs.com/package/@itradingai/aiwiki)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**把 AI 助手读过的资料，变成以后可以查询、复用、整理的本地知识库。**

AIWiki 是给 AI 助手使用的本地 Markdown 知识库。

你把链接、文章、文件或笔记交给 AI 助手；AI 助手负责读取和理解；AIWiki 负责把结果写成结构化、可追踪、可复用的 Markdown 知识文件。

## 快速开始

1. 先选一个本地文件夹作为 AIWiki 知识库。示例：

```text
Windows: D:\AIWiki
macOS/Linux: ~/AIWiki
项目内测试: ./aiwiki-test
```

2. 把下面这段复制给 Codex、Claude Code、QClaw、OpenClaw 或其他本地 AI 编程助手：

发送前，请把所有 `<替换成我的 AIWiki 知识库路径>` 替换成你自己的本地文件夹路径，例如 `D:\AIWiki` 或 `~/AIWiki`。不要把这个占位符原样留在命令里。

```text
请帮我安装并配置 AIWiki。

请先检查 Node.js 是否已安装，并确认 node --version >=20。
如果没有安装 Node.js，或版本低于 20，请先停止，并告诉我如何升级，不要继续运行 npm install。

我的知识库路径是：

<替换成我的 AIWiki 知识库路径>

运行命令前，请把下面所有 `<替换成我的 AIWiki 知识库路径>` 替换成我的真实本地文件夹路径。如果我没有替换，占位符仍然原样存在，请停止并向我询问真实路径。

请运行这些命令：

npm install -g @itradingai/aiwiki@latest
aiwiki setup --path "<替换成我的 AIWiki 知识库路径>" --yes
aiwiki agent sync --yes
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

3. 如有需要，重启或重新加载你的 AI 助手。

如果 Agent 同步失败，可以提交 [Agent Integration issue](https://github.com/iTradingAI/aiwiki/issues/new?template=agent_integration.md)，并附上 `aiwiki agent check --json` 和 `aiwiki doctor --path "<workspace>"` 的输出。

## 第一次使用

第一次试用 AIWiki，建议先按 [使用指南](docs/USAGE.zh-CN.md#3-入库资料) 里的短路径跑一遍。

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

如果需要 Source Capsule 结构化 JSON，使用：

```bash
aiwiki context "<主题>" --view capsule
```

如果人在终端里直接查询，可以用：

```bash
aiwiki query "<主题>"
```

`query` 默认显示低噪音的 Source Capsule 视图。如果需要旧的文件分组视图用于排查或细看文件匹配，使用 `aiwiki query "<主题>" --view files`。

如果要直接查看某一个来源包：

```bash
aiwiki show "<主题>"
aiwiki show --id <capsule_id>
aiwiki show --artifact-path <artifact.md> --path <workspace>
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

0.3.0 的 Source Capsule 层检查是显式开启的：

```bash
aiwiki lint --capsules --json
aiwiki lint --lifecycle --json
aiwiki lint --okf --json
aiwiki lint --strict --json
```

### 查看知识库健康度

只有用户明确要求健康检查或维护建议时，助手才可以运行：

```bash
aiwiki health --json
aiwiki health --write --json
aiwiki repair --plan --json
```

`aiwiki.health.v1` 是覆盖八个维护域的只读快照。只有在你明确要求 Agent 生成或保存健康报告时，才运行 `aiwiki health --write --json`：它会返回 `aiwiki.health_report.v1`，只刷新 `dashboards/Knowledge Health.md` 中受控的报告区块，并在 `09-runs/` 写入一份 JSON 运行记录。它不会修改知识 Markdown 或派生 state。`aiwiki.repair_plan.v1` 仍是只读的证据、受影响文件、风险和建议命令清单；它不会代替用户执行修复。

如果你想让助手进一步整理知识库，可以参考 [使用指南](docs/USAGE.zh-CN.md) 里的检查流程。

### 检查结构化索引

对 AI 助手说：

```text
帮我确认 AIWiki 的结构化索引是不是最新。
```

助手应先只读检查：

```bash
aiwiki index status --path <workspace> --json
```

索引是一份小型本地目录，记录内容分类、重复来源 URL 和本地 wiki 链接。它能帮助 Agent 说明大型知识库的组织情况，但不是向量数据库，也不会替代 Markdown 文件。索引缺失或过期时，`query` 和 `context` 仍可直接从 Markdown 工作。只有你明确要求构建或重建索引时，助手才会写入它。

### 检查关系图

对 AI 助手说：

```text
帮我确认 AIWiki 的关系图是不是最新。
```

助手应先只读检查：

```bash
aiwiki graph status --path <workspace> --json
```

关系图是一份小型本地关系图，记录知识文件之间已经明确存在的连接，例如资料支持某个 Wiki 条目、或一个笔记链接到另一个笔记。它只记录确定性的本地关系，不会用 LLM 编造事实，不会替代 Markdown 文件，也不改变日常 `context` 或 `query` 结果。关系图缺失或过期时，这些命令仍可直接从 Markdown 工作；只有你明确要求构建或重建关系图时，助手才会写入它。

### 追溯知识之间的关系

对 AI 助手说：

```text
帮我追溯这个主题和它的资料之间有什么关系，包括上游依赖或冲突。
```

当已有关系图是 fresh 时，助手可以返回显式的关系图上下文 view：

```bash
aiwiki context <topic> --view graph --graph-depth 1 --path <workspace>
```

这个命令会返回 `aiwiki.context.v2`，包含受限的关系路径、evidence 状态和生命周期/风险提示。只有明确的关系追溯请求才使用它；日常 context 仍保持 `aiwiki.context.v1`。助手不会因为这个命令自动构建或重建关系图。

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

AIWiki 0.3.0 还会把这些文件视为一个逻辑 Source Capsule。一个 capsule 会把同一来源的 Wiki Entry、Source Card、Raw、可选建议文件和运行记录组织在一起。新生成文件会增加 `capsule_id`、`artifact_role`、`visibility`、生命周期状态、关系字段和 OKF-ready 字段。旧知识库不需要批量迁移；AIWiki 会从现有 Markdown 目录推断 capsule。

## Schema 兼容性

旧工作区的 `schema_version: 1` 会在不重写文件的前提下读取为 `aiwiki.workspace.v1`。默认 Agent JSON 仍是 `aiwiki.context.v1`，capsule view 仍是 `aiwiki.context.capsule.v1`；已启用的显式关系图 view 是 `aiwiki.context.v2`。未知的未来 major 需要人工审查。详见[Schema 兼容目录](docs/schema/README.zh-CN.md)。

CORE-0403 不改变既有 Skill 匹配。CORE-0407 约束匹配优先级、fallback 和验收测试。

结构化索引使用附加的 `aiwiki.index.v1` 元数据合同。它需显式构建、可删除，并且不改变默认 `aiwiki.context.v1` 检索输出。详见[派生状态 v1](docs/schema/STATE.zh-CN.md)。

关系图使用附加的 `aiwiki.graph.v1` 元数据合同。它需显式构建、可删除，并且不改变默认 `aiwiki.context.v1` 检索输出。单独明确请求的关系图 view 是 `aiwiki.context.v2`，`--graph-depth` 只能是 `1`、`2` 或 `3`。详见[派生状态 v1](docs/schema/STATE.zh-CN.md)。

附加的 `aiwiki.health.v1` 与 `aiwiki.repair_plan.v1` JSON 合同都保持只读：health 报告维护风险，repair 只给出需要人工复核的下一步。只有显式的 `aiwiki health --write --json` 报告生成路径会产生 `aiwiki.health_report.v1`：刷新 dashboard 的受控区块并保存不可变 JSON 运行记录，不会修改知识 Markdown 或派生 state。

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

- **建立个人研究 Wiki**：把文章、PDF、文件和笔记沉淀成本地 Markdown 知识库。
- **把有价值的阅读变成可复用想法**：沉淀概念、观点、选题、大纲和后续创作素材。
- **给 Codex、Claude Code 或 QClaw 一个稳定的本地知识层**：让助手回答前先查自己的 AIWiki。
- **保留可追溯的知识链路**：Raw、Source Card、Wiki Entry 和运行记录都能回查。

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

AIWiki 面向 AI 助手驱动的工作流。`aiwiki setup --path "<workspace>" --yes` 会创建或修复知识库，并刷新知识库根目录的 `AGENTS.md` 指导。`aiwiki agent sync --yes` 会把 AIWiki 的说明同步到支持的本地助手环境。只有想手动刷新根指导、但不需要重新 setup 时，才需要运行 `aiwiki agent sync --path "<workspace>" --yes`。

完整的命令优先协作约定见 [Agent 接入说明](docs/AGENT_HANDOFF.zh-CN.md)。

## Obsidian / Dataview

AIWiki 写的是普通 Markdown 和 frontmatter。

Obsidian 是推荐查看界面，但不是硬依赖。Dataview 是可选 dashboard 增强。

AIWiki 不会自动安装 Dataview，也不会修改 `.obsidian`。

## 安全和隐私

- AIWiki 写入本地 Markdown 和 JSON 文件。
- AIWiki 不会上传你的知识库。
- AIWiki 不内置 LLM。
- AIWiki 不会自行爬取网页。
- `npm install` 不会修改 AI 助手配置。
- Agent 接入需要显式运行 `aiwiki agent sync`。

## 当前状态

AIWiki 当前聚焦于：

- 单个本地 AIWiki 知识库
- 本地 Markdown 和 frontmatter 检索
- AI 助手驱动的入库流程
- Source Card 和 Wiki Entry
- `context`、`query`、`lint`、`status`、`doctor` 等工作流

语义搜索、向量索引、浏览器剪藏、RSS 采集和企业权限管理目前都不在当前范围内。

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

<p>
  <img src="https://raw.githubusercontent.com/iTradingAI/aiwiki/main/docs/assets/join-group.png" alt="加入微信群" width="220" />
  <img src="https://raw.githubusercontent.com/iTradingAI/aiwiki/main/docs/assets/wechat-official-account.png" alt="微信公众号" width="220" />
</p>

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
