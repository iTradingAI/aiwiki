# AIWiki 常见问题

## AIWiki 是什么？

AIWiki 是给 AI 助手使用的本地 Markdown 知识库。AI 助手负责读取和理解资料；AIWiki 负责写入结构化、可追踪、可复用的 Markdown 知识文件。

## AIWiki 是网页爬虫吗？

不是。网页读取属于宿主 AI 助手。AIWiki 接收助手已经读到的内容，并把它变成本地知识库。

## AIWiki 会调用 LLM 吗？

不会。AIWiki CLI 本身不调用 LLM。高质量总结和分析来自宿主助手提供的 `analysis` 或 `wiki_entry`。

## 为什么安装失败？

先检查 Node.js：

```bash
node --version
```

AIWiki 需要 Node.js 20 或更新版本。如果没有 `node` 命令，或版本低于 20，请先升级 Node.js，再运行 `npm install -g @itradingai/aiwiki@latest`。

## 为什么会生成 `05-wiki`？

因为 AIWiki 的目标不是只保存资料，而是创建以后能被助手查询和复用的 Wiki Entry。

## Wiki Entry 的两种质量模式是什么？

- `agent_enriched` / `enriched`：助手提供了分析或 Wiki 内容。
- `deterministic_fallback` / `scaffold`：AIWiki 只根据来源内容生成可追踪脚手架。

## Wiki Entry 代表我的观点吗？

默认不代表。外部资料使用 `source_role: input` 和 `represents_user_view: false`。只有导入自己的已发布文章、演讲稿、公众号文章等个人输出时，才使用 `source_role: output` 和 `represents_user_view: true`。

## 一定要用 Obsidian 吗？

不一定。AIWiki 写的是普通 Markdown 和 frontmatter。Obsidian 只是好用的查看界面。

## 一定要安装 Dataview 吗？

不需要。Dataview 是可选增强。AIWiki 不会安装 Dataview，也不会修改 `.obsidian`。

## 为什么要先同步助手？

因为 AIWiki 的主路径是助手驱动。你把资料或问题交给助手，助手调用 AIWiki 命令。如果没有同步，助手可能只会直接翻文件，绕过 AIWiki 的入库、查询、状态和 lint 能力。

## 从哪里开始？

先把主 [README](../README.zh-CN.md) 里的 Quick Start 提示词复制给 AI 助手，再阅读 [使用指南](USAGE.zh-CN.md)。

## 为什么我的助手还是直接翻文件？

通常是助手没有加载 AIWiki skill，或者知识库根目录缺少 AIWiki 指导。运行：

```bash
aiwiki agent sync --yes
aiwiki agent sync --path <workspace> --yes
aiwiki agent check --path <workspace> --json
```

必要时重启或重新加载助手。

## 怎么查询知识库？

对 AI 助手说：

```text
AIWiki 里关于 <主题> 有什么？
```

助手应该调用：

```bash
aiwiki context "<主题>"
```

人在终端里查询可以用：

```bash
aiwiki query "<主题>"
```

## 怎么检查知识库？

让助手运行：

```bash
aiwiki lint --json
```

允许安全修复时：

```bash
aiwiki lint --fix-empty-dirs --json
aiwiki lint --json
```

## 哪些能力不在范围内？

AIWiki 不是网页爬虫、微信读取器、浏览器插件、内置 LLM、向量数据库、RAG 替代品、Obsidian 插件、默认人工审核队列、多知识库管理器、RSS 工具或定时采集系统。
