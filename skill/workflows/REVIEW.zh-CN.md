# 复盘 / 审查工作流

[English](REVIEW.md) · [写作](WRITING.zh-CN.md) · [研究](RESEARCH.zh-CN.md) · [决策](DECISION.zh-CN.md)

## 适用场景和输入

需要复核已完成结果、评估证据与质量信号、记录缺口，或准备下一次复核时，使用本工作流。**复盘**是 review 工作流的别名，不是独立的检索类型。输入是一个明确的复核问题，以及包含既有结果、观察、缺口和下一次复核动作的本地 Markdown 记录。宿主 Agent 已读完并理解资料时，也可以通过标准输入提交 `aiwiki.agent_payload.v1`。

对应的 `aiwiki.context.v1` 字段是 `reuse_guidance.review`。它指导审查或复盘，不会替既有结果背书。

## 有序步骤

1. 工作区需要时先创建。
2. 入库复盘记录，或者入库宿主 Agent 已读完的资料。
3. 判断结果前先检索上下文，再读取质量和下一步信号。
4. 用查询结果做可读比较；需要检查来源链路、证据或警告时查看选中的产物。
5. 记录发生了什么、证据支持什么、未解决缺口和下一次复核动作，然后检查工作区。

```bash
aiwiki setup --path ./aiwiki-review --yes
aiwiki ingest-file --file ./review-input.md --path ./aiwiki-review
# 已由宿主 Agent 读取的资料可改用：
aiwiki ingest-agent --stdin --path ./aiwiki-review
aiwiki context "<复盘问题>" --path ./aiwiki-review
aiwiki query "<复盘问题>" --path ./aiwiki-review
aiwiki show "<选中的主题>" --path ./aiwiki-review
aiwiki lint --json --path ./aiwiki-review
```

## 预期输出

`setup` 会创建工作区目录。成功入库本地文件后，会写入 Raw 记录、Source Card、Wiki Entry 和运行产物，包括：

```text
02-raw/articles/<slug>.md
03-sources/article-cards/<slug>.md
05-wiki/source-knowledge/<slug>.md
09-runs/<run-id>/processing-summary.md
```

`context` 返回 `aiwiki.context.v1`；读取 `query_scope`、`result_quality`、`match_reasons`、`quality_signals`、`related_refs`、`recommended_next_action` 和 `reuse_guidance.review`。`query` 给出可读检索结果，`show` 打开选中的单个产物或来源包，`lint --json` 报告结构问题。脚手架结果是可追踪的复盘线索，不等于结果已经成功的证明。

## 失败模式和安全回退

- 没有相关匹配，或返回 `broaden_query_or_ingest_source`：扩大复盘主题，或入库用户提供的资料。
- 出现脚手架、grounding 警告或缺少结果证据：说明缺口，并用 `show` 检查选中的产物。
- 无法核实既有结果：保留不确定性，并记录下一次复核动作，不能声称已闭环。
- 入库或 lint 失败：报告失败，先修正输入或工作区问题。

严格按此顺序回退：`context` → `query` → `show` → 扩大主题或入库用户提供的资料 → 有边界地检查本地文件。只为未解决的问题检查文件，并说明 AIWiki 命令路径为何不足。

不能以付费专属功能、自动抓取、语义索引或检索增强替代这条路径。

## “确实使用了 AIWiki”核对清单

交付审查或复盘前，确认：

- [ ] 至少一条上述命令已对目标工作区执行。
- [ ] 运行产生了可观察的 AIWiki 结果或产物路径。
- [ ] 复盘点出了影响它的 Wiki Entry、Source Card 或 `show` 产物。
- [ ] 复盘在适用时体现了 `result_quality`、`match_reasons`、`quality_signals`、`related_refs` 和 `recommended_next_action`。
- [ ] 使用了 `reuse_guidance.review` 作为本工作流的专用指引。

## 边界

AIWiki 保存和检索本地 Markdown 上下文；宿主 Agent 评估结果并对复核判断负责。不能把脚手架当成已验证证明，不能静默执行可选管理操作，也不能以宽泛文件检查绕开命令路径。

## 可运行的公开试用场景

运行[审查 / 复盘场景](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/input/review-retrospective.md)。命令和成功证据见[公开试用场景包](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/README.md)。
