# 研究工作流

[English](RESEARCH.md) · [写作](WRITING.zh-CN.md) · [决策](DECISION.zh-CN.md) · [复盘 / 审查](REVIEW.zh-CN.md)

## 适用场景和输入

需要从 AIWiki 工作区既有知识回答研究问题、比较有来源支撑的资料，或判断还缺什么用户资料时，使用本工作流。输入是一个明确问题；所需资料尚未入库时，再提供本地 Markdown 来源。宿主 Agent 已读完资料时，也可以通过标准输入提交 `aiwiki.agent_payload.v1`。

对应的 `aiwiki.context.v1` 字段是 `reuse_guidance.research`。它指导研究复用，不会把保存的证据自动变成超出其范围的结论。

## 有序步骤

1. 工作区不存在时先创建。
2. 入库本地来源，或者入库宿主 Agent 已读完的资料。
3. 先检索研究上下文，评估返回的证据和质量信号。
4. 用查询结果做可读比较；得出依赖来源的结论前，先查看选中的产物。
5. 说明已检索资料支持什么、还缺什么，然后检查工作区。

```bash
aiwiki setup --path ./aiwiki-research --yes
aiwiki ingest-file --file ./research-input.md --path ./aiwiki-research
# 已由宿主 Agent 读取的资料可改用：
aiwiki ingest-agent --stdin --path ./aiwiki-research
aiwiki context "<研究问题>" --path ./aiwiki-research
aiwiki query "<研究问题>" --path ./aiwiki-research
aiwiki show "<选中的主题>" --path ./aiwiki-research
aiwiki lint --json --path ./aiwiki-research
```

## 预期输出

`setup` 会创建工作区目录。成功入库本地文件后，会写入 Raw 记录、Source Card、Wiki Entry 和运行产物，例如：

```text
02-raw/articles/<slug>.md
03-sources/article-cards/<slug>.md
05-wiki/source-knowledge/<slug>.md
09-runs/<run-id>/processing-summary.md
```

`context` 返回 `aiwiki.context.v1`；读取 `query_scope`、`result_quality`、`match_reasons`、`quality_signals`、`related_refs`、`recommended_next_action` 和 `reuse_guidance.research`。`query` 给出可读的检索结果，`show` 打开选中的单个产物或来源包，`lint --json` 报告结构问题。脚手架结果是可追踪的来源线索，可能仍需 Agent 补全或核对证据。

## 失败模式和安全回退

- 没有适合的匹配，或返回 `broaden_query_or_ingest_source`：扩大问题，或入库用户提供的资料。
- 有 grounding 或脚手架警告：区分可追踪线索和已确认结论，并用 `show` 检查。
- 支撑冲突或不完整：报告缺口，不能靠假设消除冲突。
- 入库或 lint 失败：报告失败，修正输入或工作区后再把产物视为可用。

严格按此顺序回退：`context` → `query` → `show` → 扩大主题或入库用户提供的资料 → 有边界地检查本地文件。只为未解决的问题检查文件，并说明哪个 AIWiki 命令不能回答。

不能以付费专属功能、自动抓取、语义索引或检索增强替代这条路径。

## “确实使用了 AIWiki”核对清单

交付研究回答前，确认：

- [ ] 至少一条上述命令已对目标工作区执行。
- [ ] 运行产生了可观察的 AIWiki 结果或产物路径。
- [ ] 回答点出了影响结论的 Wiki Entry、Source Card 或 `show` 产物。
- [ ] 回答在适用时解释了 `result_quality`、`match_reasons`、`quality_signals`、`related_refs` 和 `recommended_next_action`。
- [ ] 使用了 `reuse_guidance.research` 作为本工作流的专用指引。

## 边界

AIWiki 保存本地 Markdown 记录和检索信号；宿主 Agent 负责读资料并评估证据。不能把脚手架变成已验证发现，不能静默执行可选管理操作，也不能以宽泛文件检查替代命令路径。

## 可运行的公开试用场景

运行[研究场景：文章研究](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/input/article-research.md)。命令和成功证据见[公开试用场景包](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/README.md)。
