# 决策工作流

[English](DECISION.md) · [写作](WRITING.zh-CN.md) · [研究](RESEARCH.zh-CN.md) · [复盘 / 审查](REVIEW.zh-CN.md)

## 适用场景和输入

需要改变方向、比较选项，或重新审视一个必须考虑既有约束与被否决方案的选择时，使用本工作流。输入是一个明确的决策问题；记录尚未入库时，再提供本地 Markdown 决策说明。宿主 Agent 已读完并理解资料时，也可以通过标准输入提交 `aiwiki.agent_payload.v1`。

对应的 `aiwiki.context.v1` 字段是 `reuse_guidance.decision`。它帮助把检索上下文用于决策，不会自动替人做选择。

## 有序步骤

1. 工作区需要时先创建。
2. 入库决策说明，或者入库宿主 Agent 已读完的资料。
3. 先检索决策上下文，包括约束和过往判断。
4. 用查询结果做可读比较；依赖来源链路或已否决方案前，先查看选中的产物。
5. 说明决策、证据边界、未解决风险和下一次复核点，然后检查工作区。

```bash
aiwiki setup --path ./aiwiki-decision --yes
aiwiki ingest-file --file ./decision-input.md --path ./aiwiki-decision
# 已由宿主 Agent 读取的资料可改用：
aiwiki ingest-agent --stdin --path ./aiwiki-decision
aiwiki context "<决策问题>" --path ./aiwiki-decision
aiwiki query "<决策问题>" --path ./aiwiki-decision
aiwiki show "<选中的主题>" --path ./aiwiki-decision
aiwiki lint --json --path ./aiwiki-decision
```

## 预期输出

`setup` 会创建工作区目录。成功入库本地文件后，会写入 Raw 记录、Source Card、Wiki Entry 和运行产物，包括：

```text
02-raw/articles/<slug>.md
03-sources/article-cards/<slug>.md
05-wiki/source-knowledge/<slug>.md
09-runs/<run-id>/processing-summary.md
```

`context` 返回 `aiwiki.context.v1`；读取 `query_scope`、`result_quality`、`match_reasons`、`quality_signals`、`related_refs`、`recommended_next_action` 和 `reuse_guidance.decision`。`query` 展示可读的检索结果，`show` 展示选中的单个产物或来源包，`lint --json` 报告结构问题。脚手架结果保存了可追踪的决策线索，可能仍需 Agent 补全或核对证据。

## 失败模式和安全回退

- 没有相关匹配，或返回 `broaden_query_or_ingest_source`：扩大决策问题表述，或入库用户提供的资料。
- 出现脚手架、grounding 警告或缺少约束：说明不确定性；改变方向前查看选中的产物。
- 过去的判断互相冲突：保留分歧，并要求缺失的决策证据，不能声称已解决。
- 入库或 lint 失败：报告失败，先修正输入或工作区问题。

严格按此顺序回退：`context` → `query` → `show` → 扩大主题或入库用户提供的资料 → 有边界地检查本地文件。只为未解决的问题检查文件，并说明 AIWiki 路径为什么不足。

不能以付费专属功能、自动抓取、语义索引或检索增强替代这条路径。

## “确实使用了 AIWiki”核对清单

交付决策建议前，确认：

- [ ] 至少一条上述命令已对目标工作区执行。
- [ ] 运行产生了可观察的 AIWiki 结果或产物路径。
- [ ] 建议点出了影响它的 Wiki Entry、Source Card 或 `show` 产物。
- [ ] 建议在适用时体现了 `result_quality`、`match_reasons`、`quality_signals`、`related_refs` 和 `recommended_next_action`。
- [ ] 使用了 `reuse_guidance.decision` 作为本工作流的专用指引。

## 边界

AIWiki 保存和检索本地 Markdown 上下文；宿主 Agent 评估取舍并对决策负责。不能把脚手架当成已定证据，不能静默执行可选管理操作，也不能以宽泛文件检查绕开命令路径。

## 可运行的公开试用场景

运行[决策场景：项目决策](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/input/project-decision.md)。命令和成功证据见[公开试用场景包](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/README.md)。
