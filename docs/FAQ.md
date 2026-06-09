# AIWiki FAQ

## AIWiki 是什么？

AIWiki 是一个开源的 Agent-first 本地 LLM-wiki CLI。宿主 Agent 负责读取和理解内容，AIWiki 负责把结果稳定写成本地 Markdown 知识库。

## AIWiki 是网页爬虫吗？

不是。网页读取主要交给宿主 Agent，AIWiki 专注于校验结构化输入、写本地文件、生成 Wiki Entry、提供 context 和 lint。

## AIWiki 会自动高质量总结吗？

不会。AIWiki CLI 本身不调用 LLM。高质量 Wiki Entry 来自宿主 Agent 在 payload 中提供的 `analysis` 或 `wiki_entry`。

## 为什么会生成 05-wiki？

因为 AIWiki 的目标不是只保存资料，而是让资料进入可查询、可维护的 Wiki 知识层。成功入库会生成 `05-wiki/source-knowledge/<slug>.md`。

## Wiki Entry 的两种质量模式是什么？

- `agent_enriched` / `enriched`：宿主 Agent 提供了总结、核心观点、知识点等分析结果。
- `deterministic_fallback` / `scaffold`：AIWiki 只生成标题、来源、正文预览、反链和待补全区。

## 05-wiki 是否代表我的观点？

不一定。外部资料生成的 Wiki Entry 默认代表外部资料的结构化整理，不代表用户个人观点。

## 一定要用 Obsidian 吗？

不一定。AIWiki 生成的是标准 Markdown 和 frontmatter，Obsidian 只是最适合它的审阅界面之一。

## 一定要装 Dataview 吗？

不一定。没有 Dataview，也可以用 Obsidian 原生的 Properties、Backlinks、Search 和 Graph View。

## 宿主 Agent 和 AIWiki 各负责什么？

- 宿主 Agent 负责读取网页、正文或附件，并尽量生成 `analysis` / `wiki_entry`
- AIWiki 负责校验 payload、写本地知识库、生成 Wiki Entry、输出处理记录
- 用户负责提供链接或正文，并在需要时让 Agent 继续查询或补全

## 为什么要先让 Agent 学会 AIWiki？

因为大多数用户不想每次手动跑命令。更顺的方式是：把链接发给宿主 Agent，Agent 自动把内容交给 AIWiki，AIWiki 再把结果写进本地知识库。

## 我能不能把它当成一个通用爬虫用？

不建议。AIWiki 的边界不是“抓全网”，而是“把宿主 Agent 已经读到的内容稳定沉淀下来”。

## 我从哪里开始最好？

先跑：

```bash
npx @itradingai/aiwiki@latest setup
aiwiki agent sync --yes
aiwiki agent check --json
aiwiki agent sync --path <workspace> --yes
aiwiki agent check --path <workspace> --json
```

然后去看：

- [USAGE.md](USAGE.md)
- [SHOWCASE.md](SHOWCASE.md)
- [AGENT_HANDOFF.md](AGENT_HANDOFF.md)

## 有没有可以直接看的样例？

有。`examples/demo-run/` 记录输入、命令和 CLI 输出；`examples/obsidian-vault-sample/` 是已经生成好的样例知识库。它展示了核心产物优先，以及可选增强目录只在有内容时出现。

## 怎么从知识库里查询？

让宿主 Agent 调用：

```bash
aiwiki context "主题"
```

## 怎么检查知识库结构？

运行：

```bash
aiwiki lint
```

如果只是清理旧版本留下的空可选增强目录，可以让 Agent 先运行 `aiwiki lint --json`，确认只有 safe fix 后再运行 `aiwiki lint --fix-empty-dirs --json`。

## 为什么我的 Agent 还是在直接翻文件？

通常是它没有加载 AIWiki skill，或者知识库根目录缺少 AIWiki 的 `AGENTS.md` 指导。先运行：

```bash
aiwiki agent sync --yes
aiwiki agent sync --path <workspace> --yes
aiwiki agent check --path <workspace> --json
```

之后再让 Agent 处理 AIWiki 任务。它应该优先调用 `aiwiki lint --json`、`aiwiki status`、`aiwiki query`、`aiwiki context`、`aiwiki ingest-file` 或 `aiwiki ingest-agent`。只有这些命令不够用时，才退回到通用文件搜索。
