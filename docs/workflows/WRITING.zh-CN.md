# 写作工作流

[English](WRITING.md) · [研究](RESEARCH.zh-CN.md) · [决策](DECISION.zh-CN.md) · [复盘 / 审查](REVIEW.zh-CN.md)

## 适用场景和输入

在起草、改写或规划需要复用 AIWiki 工作区既有知识的内容前，使用本工作流。输入是一个明确的写作问题；资料尚未入库时，再提供本地 Markdown 文件。宿主 Agent 已经读完并理解资料时，也可以通过标准输入提交 `aiwiki.agent_payload.v1`。

对应的 `aiwiki.context.v1` 字段是 `reuse_guidance.writing`。它用于指导如何应用检索结果，不是自动生成的草稿。

## 有序步骤

1. 工作区不存在时，先创建临时工作区或项目工作区。
2. 入库本地输入；或者入库宿主 Agent 已读完的资料。
3. 先检索写作上下文，读取结果质量和下一步字段。
4. 用人类可读的查询结果比较候选项；需要来源链路或原始产物时查看单项。
5. 只从已检索且质量已说明的资料起草，随后检查工作区结构。

```bash
aiwiki setup --path ./aiwiki-writing --yes
aiwiki ingest-file --file ./writing-input.md --path ./aiwiki-writing
# 已由宿主 Agent 读取的资料可改用：
aiwiki ingest-agent --stdin --path ./aiwiki-writing
aiwiki context "<写作问题>" --path ./aiwiki-writing
aiwiki query "<写作问题>" --path ./aiwiki-writing
aiwiki show "<选中的主题>" --path ./aiwiki-writing
aiwiki lint --json --path ./aiwiki-writing
```

## 预期输出

`setup` 会创建工作区目录。成功入库本地文件后，会写入 Raw 记录、Source Card、Wiki Entry 和运行产物，路径包括：

```text
02-raw/articles/<slug>.md
03-sources/article-cards/<slug>.md
05-wiki/source-knowledge/<slug>.md
09-runs/<run-id>/processing-summary.md
```

`context` 返回机器可读的 `aiwiki.context.v1`；读取 `query_scope`、`result_quality`、`match_reasons`、`quality_signals`、`related_refs`、`recommended_next_action` 和 `reuse_guidance.writing`。`query` 给出人类可读结果，`show` 展示选中的单个产物或来源包，`lint --json` 报告结构问题。脚手架质量的 Wiki Entry 是可追踪线索，不等于经 Agent 补全的写作知识。

## 失败模式和安全回退

- 没有相关匹配，或下一步是 `broaden_query_or_ingest_source`：扩大问题表述，或入库用户提供的资料。
- 出现脚手架或 grounding 警告：明确说明限制；将其用作支持前先核对选中的产物。
- 需要来源链路或细节：提出结论前先用 `show`。
- 入库失败或 lint 有问题：报告命令结果，修正输入或工作区问题后再使用。

严格按此顺序回退：`context` → `query` → `show` → 扩大主题或入库用户提供的资料 → 有边界地检查本地文件。本地检查只处理未解决的问题，并说明哪个 AIWiki 命令不足。

不能以付费专属功能、自动抓取、语义索引或检索增强替代这条路径。

## “确实使用了 AIWiki”核对清单

交付草稿或计划前，确认：

- [ ] 至少一条上述命令已对目标工作区执行。
- [ ] 运行产生了可观察的 AIWiki 结果或产物路径。
- [ ] 回复指出了影响草稿的 Wiki Entry、Source Card 或 `show` 产物。
- [ ] 回复在适用时体现了 `result_quality`、`match_reasons`、`quality_signals`、`related_refs` 和 `recommended_next_action`。
- [ ] 使用了 `reuse_guidance.writing` 作为本工作流的专用指引。

## 边界

AIWiki 负责保存和检索本地 Markdown；宿主 Agent 负责读资料和做写作判断。不能把脚手架当成已验证证据，不能静默执行可选管理操作，也不能以宽泛文件检查取代命令路径。

## 可运行的公开试用场景

运行[写作场景：主题规划](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/input/topic-planning.md)。命令和成功证据见[公开试用场景包](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/README.md)。
