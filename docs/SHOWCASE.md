# AIWiki 示例展示

这页不是讲概念，直接看一次完整跑通会发生什么。

## 示例 1：一篇文章进知识库

### 用户输入

```text
入库 https://example.com/article
```

### 宿主 Agent 做的事

1. 读取网页正文或可访问内容。
2. 组装 `aiwiki.agent_payload.v1`，并尽量提供 `analysis` 或 `wiki_entry`。
3. 调用 `aiwiki ingest-agent --stdin`。
4. 把 AIWiki 的处理结果回复给用户。

### AIWiki 会写什么

```text
09-runs/<run-id>/payload.json
09-runs/<run-id>/raw.md
09-runs/<run-id>/source-card.md
09-runs/<run-id>/wiki-entry.md
09-runs/<run-id>/creative-assets.md
09-runs/<run-id>/topics.md
09-runs/<run-id>/draft-outline.md
09-runs/<run-id>/processing-summary.md
```

### 长期目录会出现什么

```text
02-raw/articles/
03-sources/article-cards/
04-claims/_suggestions/
05-wiki/source-knowledge/
06-assets/_suggestions/
07-topics/ready/
08-outputs/outlines/
dashboards/
```

### 用户在 Obsidian 里怎么看

- 打开 `dashboards/AIWiki Home.md`
- 查看 `05-wiki/source-knowledge/<slug>.md`
- 从 Wiki 条目回到资料卡、原文、选题、大纲和处理记录
- 需要结构检查时运行 `aiwiki lint`

## 示例 2：网页没读到正文

有些页面需要登录，或者宿主 Agent 暂时拿不到正文。这个时候 AIWiki 也不会装死，它会把失败原因记录下来。

### 用户输入

```text
入库 https://example.com/locked-page
```

### 结果

```text
09-runs/<run-id>/payload.json
09-runs/<run-id>/processing-summary.md
```

### 你会看到什么

- 失败原因会写进 `processing-summary.md`
- 用户仍然能在 Obsidian 里看到这次处理记录
- 下次只要宿主 Agent 能读到正文，就可以重新入库

## 这个示例页想说明什么

- AIWiki 不是网页爬虫本体
- 宿主 Agent 负责读取内容
- 宿主 Agent 负责高质量总结和知识提炼
- AIWiki 负责稳定写入本地知识库
- AIWiki 会创建 Wiki Entry；没有 Agent 分析字段时只生成可追溯脚手架
- 结果始终可追踪、可复盘、可继续写作
