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
  -> AIWiki 写入 Raw / Source Card / Wiki Entry / Run Summary；有明确内容或请求时再写 Claim / Topic / Outline / Asset
```

### Query：从 Wiki 调度知识

```bash
aiwiki context "AI Agent 出海机会"
aiwiki query "AI Agent 出海机会"
```

`context` 返回 JSON，主要给宿主 Agent 用；`query` 使用同一套检索结果，输出给人看的摘要。第一版是本地关键词检索，不是向量检索。

### Lint：检查知识库结构

```bash
aiwiki lint
```

`lint` 会检查缺失链接、重复来源、fallback Wiki 条目、enriched 条目缺字段等问题，并写入 `dashboards/Lint Report.md`。

## 示例

仓库内置了一个由当前 CLI 重新生成的样例：

- `examples/demo-run/`：输入材料、执行命令和关键 CLI 输出。
- `examples/obsidian-vault-sample/`：可直接查看的样例知识库。

样例展示了核心产物优先的约定：Raw、Source Card、Wiki Entry、Run Summary、Processing Summary 总是最先检查；Claim、Asset、Topic、Outline 只在 payload 有对应内容或明确请求时出现。

## 快速开始

### 第一步：安装 AIWiki CLI

让 AI 帮你安装时，可以把下面这段交给当前 Agent，改成自己的知识库路径：

```text
请帮我安装并配置 AIWiki。
安装命令：npm install -g @itradingai/aiwiki@latest
我的知识库路径：F:\knowledges

请检查 Node.js >=20，执行 aiwiki setup --path "我的知识库路径" --yes，
然后运行 aiwiki agent sync --yes 和 aiwiki agent check --json 完成宿主 Agent 对接。
最后执行 aiwiki doctor 和 aiwiki status，告诉我实际执行了哪些命令和还差什么手动步骤。
```

手动安装：

```bash
npx @itradingai/aiwiki@latest setup
aiwiki agent sync --yes
aiwiki agent check --json
```

### 第二步：接入宿主 Agent

```bash
aiwiki agent sync --yes
aiwiki agent check --json
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

人直接查询时可以运行：

```bash
aiwiki query "xxx"
```

## AIWiki 会生成什么

成功入库会生成：

```text
02-raw/articles/
03-sources/article-cards/
05-wiki/source-knowledge/
09-runs/<run-id>/
```

其中 `02-raw/articles/`、`03-sources/article-cards/`、`05-wiki/source-knowledge/` 和 `09-runs/<run-id>/` 是核心产物。`04-claims/_suggestions/`、`06-assets/_suggestions/`、`07-topics/ready/`、`08-outputs/outlines/` 只在 payload 有对应内容或 `request.outputs` 明确请求时生成。

### Agent-Enriched Wiki Entry

如果宿主 Agent 在 payload 中提供了 `analysis` 或 `wiki_entry`，AIWiki 会把这些总结、核心观点、知识点、概念、选题等内容写入 Wiki Entry。

frontmatter 会标记：

```yaml
generation_mode: "agent_enriched"
quality: "enriched"
generated_by: "host_agent"
llm_enriched: true
source_role: "input"
represents_user_view: false
```

### Deterministic Fallback Wiki Entry

如果宿主 Agent 只提供原文，AIWiki 仍会创建 Wiki Entry，但它只是可追溯脚手架，包含标题、来源、正文预览、反链和待补全区。

frontmatter 会标记：

```yaml
generation_mode: "deterministic_fallback"
quality: "scaffold"
generated_by: "aiwiki_cli"
llm_enriched: false
source_role: "input"
represents_user_view: false
```

AIWiki CLI 本身不调用 LLM，所以不会在没有 Agent 分析字段时承诺高质量提炼。

## 设计边界

AIWiki 做：

- 接收宿主 Agent payload。
- 写入本地 Markdown。
- 生成 frontmatter、wikilink、处理记录。
- 生成 Wiki Entry 容器。
- 支持 `context`、`query`、`next` 和 `lint`。

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

`source_role=output` 用于标记用户已发布文章、演讲稿、公众号文章等个人输出，并可配合 `represents_user_view: true`。外部资料默认是 `source_role: input`、`represents_user_view: false`。

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
aiwiki query "AI Agent" --path "F:\knowledge_data\aiwiki-test"
aiwiki next --path "F:\knowledge_data\aiwiki-test"
aiwiki lint --path "F:\knowledge_data\aiwiki-test"
```

## License

MIT. See [LICENSE](LICENSE).

## Query Filters

AIWiki retrieval is local Markdown/frontmatter search. It is intentionally lightweight: no vector search, no database, no external search, and no RAG-over-wiki.

```bash
aiwiki context "AI Agent" --type wiki_entries --source-role input --wiki-type source_knowledge --status active --limit 5
aiwiki query "AI Agent" --type source_cards --status to-review --limit 3
```

`context` returns Agent-readable JSON with `query_scope`, `result_quality`, `recommended_next_action`, `match_reasons`, `quality_signals`, and `related_refs`. `query` uses the same retrieval path and shows the match reasons and quality hints for humans.

## Agent Skill Sync and Upgrade

AIWiki is Agent-first: after installing or upgrading the npm package, sync the packaged AIWiki skill into the local Agent environment.

First install and later upgrades use the same safe command:

```bash
npm install -g @itradingai/aiwiki@latest
aiwiki agent sync --yes
aiwiki agent check
```

For one Agent:

```bash
aiwiki agent sync --agent codex --yes
aiwiki agent sync --agent claude --yes
```

`agent sync` is idempotent. Missing targets are installed, current targets are left unchanged, and changed old skill files are backed up before overwrite. Use `--dry-run` to preview and `--json` when an AI Agent needs stable machine-readable status.

After sync, restart or reload the target Agent so it reads the new AIWiki skill. To roll back, copy the generated `.bak-<timestamp>` file back over the target skill file.
