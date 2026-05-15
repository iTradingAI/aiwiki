![AIWiki 宣传图](https://raw.githubusercontent.com/iTradingAI/aiwiki/main/docs/assets/aiwiki-hero.png)

# AIWiki

AIWiki 是一个开源的 Agent-first 本地 LLM-wiki CLI。

你把文章链接、网页正文或本地文本交给宿主 Agent；宿主 Agent 负责读取和理解内容；AIWiki 负责把结果稳定写进本地 Markdown 知识库，并生成可追踪、可查询、可持续整理的 Wiki 条目。

一句话说：AIWiki 不是网页抓取器，而是宿主 Agent 的本地 LLM-wiki 后端。

## 它解决什么

- 链接和资料散在聊天记录里，后续很难复用。
- AI 总结过一次内容，但没有沉淀成可查询的知识条目。
- 想把资料卡、选题、大纲、Wiki 条目放进同一个本地知识库。
- 想让 Agent 负责理解内容，让 CLI 负责稳定落盘和追踪。

## 工作流

### Ingest：把资料写入本地 Wiki

```text
用户给 URL / 正文 / 文件
  -> 宿主 Agent 读取内容并尽量生成 analysis / wiki_entry
  -> aiwiki ingest-agent --stdin
  -> AIWiki 写入 Raw / Source Card / Wiki Entry / Claim / Topic / Outline / Run Log
```

### Query：从 Wiki 调度知识

```bash
aiwiki context "AI Agent 出海机会"
```

`context` 返回 JSON，主要给宿主 Agent 用。第一版是本地关键词检索，不是向量检索。

### Lint：检查知识库结构

```bash
aiwiki lint
```

`lint` 会检查缺失链接、重复来源、fallback Wiki 条目、enriched 条目缺字段等问题，并写入 `dashboards/Lint Report.md`。

## 快速开始

### 第一步：安装 AIWiki CLI

让 AI 帮你安装时，可以把下面这段交给当前 Agent，改成自己的知识库路径：

```text
请帮我安装并配置 AIWiki。
安装命令：npm install -g @itradingai/aiwiki@latest
我的知识库路径：F:\knowledges

请检查 Node.js >=20，执行 aiwiki setup --path "我的知识库路径" --yes，
然后运行 aiwiki agent list / aiwiki agent install 完成宿主 Agent 对接。
最后执行 aiwiki doctor 和 aiwiki status，告诉我实际执行了哪些命令和还差什么手动步骤。
```

手动安装：

```bash
npx @itradingai/aiwiki@latest setup
aiwiki agent list
aiwiki agent install
```

### 第二步：接入宿主 Agent

```bash
aiwiki agent list
aiwiki agent install
```

也可以直接输出通用协议：

```bash
aiwiki prompt agent
```

### 第三步：第一次入库

对宿主 Agent 发送：

```text
入库 https://example.com/article
```

宿主 Agent 读取正文后调用 `aiwiki ingest-agent --stdin`。用户不需要手动保存 payload，也不需要每次输入 `--path`。

### 第四步：从知识库提问

对宿主 Agent 说：

```text
从 AIWiki 里帮我了解 xxx
```

宿主 Agent 应优先调用：

```bash
aiwiki context "xxx"
```

## AIWiki 会生成什么

成功入库会生成：

```text
02-raw/articles/
03-sources/article-cards/
04-claims/_suggestions/
05-wiki/source-knowledge/
06-assets/_suggestions/
07-topics/ready/
08-outputs/outlines/
09-runs/<run-id>/
```

其中 `05-wiki/source-knowledge/<slug>.md` 是默认 Wiki Entry。

### Agent-Enriched Wiki Entry

如果宿主 Agent 在 payload 中提供了 `analysis` 或 `wiki_entry`，AIWiki 会把这些总结、核心观点、知识点、概念、选题等内容写入 Wiki Entry。

frontmatter 会标记：

```yaml
generation_mode: "agent_enriched"
quality: "enriched"
generated_by: "host_agent"
llm_enriched: true
```

### Deterministic Fallback Wiki Entry

如果宿主 Agent 只提供原文，AIWiki 仍会创建 Wiki Entry，但它只是可追溯脚手架，包含标题、来源、正文预览、反链和待补全区。

frontmatter 会标记：

```yaml
generation_mode: "deterministic_fallback"
quality: "scaffold"
generated_by: "aiwiki_cli"
llm_enriched: false
```

AIWiki CLI 本身不调用 LLM，所以不会在没有 Agent 分析字段时承诺高质量提炼。

## 设计边界

AIWiki 做：

- 接收宿主 Agent payload。
- 写入本地 Markdown。
- 生成 frontmatter、wikilink、处理记录。
- 生成 Wiki Entry 容器。
- 支持 `context` 和 `lint`。

AIWiki 不做：

- 通用网页抓取。
- 微信公众号读取。
- 伪造浏览器头。
- 浏览器插件。
- CLI 内置 LLM。
- 自动高质量总结。
- 默认人工审核流程。
- 企业级 RBAC。
- 多知识库。
- 批量采集 / 定时采集 / RSS。

## Obsidian / Dataview

AIWiki 生成的是标准 Markdown 和 frontmatter，不强依赖 Obsidian。

Obsidian 是推荐查看界面；Dataview 只是可选 dashboard 增强。AIWiki 不会自动安装 Dataview，也不会修改 `.obsidian`。

Review Queue 可以保留为回看入口，但不是 AIWiki 的主流程。

## 常见问题

### AIWiki 会自己抓网页吗？

不会。网页读取由宿主 Agent 完成，AIWiki 负责把 Agent 已经读到的内容写入本地知识库。

### 为什么会生成 05-wiki？

因为 AIWiki 的目标不是只保存资料，而是让资料进入可查询、可维护的 Wiki 知识层。

### 05-wiki 是否代表我的观点？

不一定。外部资料生成的 Wiki 条目默认代表“外部资料的结构化整理”，不代表你的个人观点。

### 什么内容才代表我的观点？

后续 `source_role=output` 会用于标记用户已发布文章、演讲稿、公众号文章等个人输出。本阶段外部资料默认是 `source_role: input`、`represents_user_view: false`。

### Dataview 必须安装吗？

不必须。没有 Dataview，也可以用普通 Markdown、Properties、Backlinks、Search 和 Graph View。

### Review Queue 还需要吗？

不是必需流程。它只适合低置信度、来源缺失、内容冲突、个人观点把关等回看场景。

## 文档

- [docs/USAGE.md](docs/USAGE.md)
- [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md)
- [docs/FAQ.md](docs/FAQ.md)
- [docs/SHOWCASE.md](docs/SHOWCASE.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [docs/RELEASE.md](docs/RELEASE.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)

## 本地开发

```bash
npm install
npm run build
npm test
npm link
aiwiki setup --path "F:\knowledge_data\aiwiki-test" --yes
aiwiki doctor
aiwiki ingest-agent --payload tests/fixtures/agent_payload.url.valid.json --path "F:\knowledge_data\aiwiki-test"
aiwiki context "AI Agent" --path "F:\knowledge_data\aiwiki-test"
aiwiki lint --path "F:\knowledge_data\aiwiki-test"
```

## License

MIT. See [LICENSE](LICENSE).
