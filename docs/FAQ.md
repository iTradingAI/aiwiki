# AIWiki FAQ

## AIWiki 是什么？

AIWiki 是一个开源的 Agent-first AI 知识库 CLI。它把文章链接、网页正文和本地文本整理成本地知识资产，方便在 Obsidian 里继续审阅和写作。

## AIWiki 是网页爬虫吗？

不是。网页读取主要交给宿主 Agent，AIWiki 专注于校验结构化输入、写本地文件和生成审阅产物。

## 一定要用 Obsidian 吗？

不一定。AIWiki 生成的是标准 Markdown 和 frontmatter，Obsidian 只是最适合它的审阅界面之一。

## 一定要装 Dataview 吗？

不一定。没有 Dataview，也可以用 Obsidian 原生的 Properties、Backlinks、Search 和 Graph View。

## 宿主 Agent 和 AIWiki 各负责什么？

- 宿主 Agent 负责读取网页、正文或附件，并组装 payload
- AIWiki 负责校验 payload、写本地知识库、输出处理记录
- 用户负责提供链接或正文，最后在 Obsidian 里审阅结果

## 为什么要先让 Agent 学会 AIWiki？

因为大多数用户不想每次手动跑命令。更顺的方式是：把链接发给宿主 Agent，Agent 自动把内容交给 AIWiki，AIWiki 再把结果写进本地知识库。

## 我能不能把它当成一个通用爬虫用？

不建议。AIWiki 的边界不是“抓全网”，而是“把宿主 Agent 已经读到的内容稳定沉淀下来”。

## 我从哪里开始最好？

先跑：

```bash
npx @itradingai/aiwiki@latest setup
aiwiki agent list
aiwiki agent install
```

然后去看：

- [USAGE.md](USAGE.md)
- [SHOWCASE.md](SHOWCASE.md)
- [AGENT_HANDOFF.md](AGENT_HANDOFF.md)
