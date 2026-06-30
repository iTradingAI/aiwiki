# AIWiki 案例展示

这页直接展示一次真实 AIWiki 运行会生成什么。

公开试用结束后，先按 [运营反馈闭环](OPERATING_FEEDBACK_LOOP.zh-CN.md) 把反馈归类为安装、首次使用、入库结果、目录理解、查询和复用、功能请求，再判断是否进入开发队列。

## 场景 1：入库一篇文章

用户说：

```text
把这个资料入库到 AIWiki：
https://example.com/article
```

助手会：

1. 读取资料
2. 生成 `aiwiki.agent_payload.v1`
3. 能理解时提供 `analysis` 或 `wiki_entry`
4. 调用 `aiwiki ingest-agent --stdin`
5. 汇报生成文件

核心产物：

```text
09-runs/<run-id>/payload.json
09-runs/<run-id>/raw.md
09-runs/<run-id>/source-card.md
09-runs/<run-id>/wiki-entry.md
09-runs/<run-id>/processing-summary.md
02-raw/articles/<slug>.md
03-sources/article-cards/<slug>.md
05-wiki/source-knowledge/<slug>.md
```

可选产物只在助手提供对应内容时出现：

```text
09-runs/<run-id>/creative-assets.md
09-runs/<run-id>/topics.md
09-runs/<run-id>/draft-outline.md
04-claims/_suggestions/
06-assets/_suggestions/
07-topics/ready/
08-outputs/outlines/
```

## 场景 2：资料暂时读不到

有些页面需要登录，或助手暂时无法访问正文。

AIWiki 仍然应该记录这次尝试：

```text
09-runs/<run-id>/payload.json
09-runs/<run-id>/processing-summary.md
```

失败原因会被保留，之后助手能读到正文时可以重新入库。

## 场景 3：以后复用知识

用户问：

```text
AIWiki 里关于 AI Agent 有什么？
```

助手应该调用：

```bash
aiwiki context "AI Agent"
```

助手回答前应读取返回 JSON 里的匹配原因和质量信号。

## 样例文件

- [`../examples/demo-run/`](../examples/demo-run/)：输入、命令和 CLI 输出。
- [`../examples/obsidian-vault-sample/`](../examples/obsidian-vault-sample/)：已经生成好的样例知识库。

这个样例不依赖爬虫、向量检索、RAG-over-wiki 或 Pro 自动化，只展示基础 CLI 的真实落盘结果。
