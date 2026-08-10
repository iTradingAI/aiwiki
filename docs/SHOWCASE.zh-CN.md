# AIWiki 案例展示

本页展示四种面向工作流的本地 Markdown 知识复用方式。遵循 [Core Intent Matrix](AGENT_HANDOFF.zh-CN.md#core-intent-matrix)：先把请求匹配到 AIWiki 命令，再解释命令输出；只有命令不能回答时才使用有边界的回退。

## 通用试用路径

```bash
aiwiki setup --path ./aiwiki-trial --yes
aiwiki ingest-file --file ./my-input.md --path ./aiwiki-trial
aiwiki context "<主题>" --path ./aiwiki-trial
aiwiki query "<主题>" --path ./aiwiki-trial
aiwiki show "<选中的主题>" --path ./aiwiki-trial
aiwiki lint --json --path ./aiwiki-trial
```

成功入库本地文件后会生成 Raw 记录、Source Card、Wiki Entry 和运行产物。`context` 返回稳定的 Agent JSON，`query` 提供可读检索结果，`show` 检查选中的产物，`lint --json` 检查工作区。使用结果前先读取质量信号。

## 1. 写作：保留主题规划

**试用：**使用[主题规划输入](../examples/public-trial-scenarios/input/topic-planning.md)，再询问已经记录了哪些主题方向。

**展示内容：**写作工作流在起草前取回既有受众、角度和质量警告。助手会指出影响草稿的 Wiki Entry 或 Source Card，而不是只依赖当前聊天。

**协议：**[写作工作流](workflows/WRITING.zh-CN.md)。

## 2. 研究：追溯文章回答

**试用：**使用[文章研究输入](../examples/public-trial-scenarios/input/article-research.md)，再询问保存了哪些证据。

**展示内容：**研究工作流先检索上下文，比较可读匹配结果；需要来源细节时使用 `show`。回答会区分可追踪脚手架和经 Agent 补全的结果。

**协议：**[研究工作流](workflows/RESEARCH.zh-CN.md)。

## 3. 决策：改变方向前找回约束

**试用：**使用[项目决策输入](../examples/public-trial-scenarios/input/project-decision.md)，再询问此前为什么做出该选择。

**展示内容：**决策工作流在建议改变前找回约束和被否决方案。匹配不完整时记录不确定性，不能假装已解决取舍。

**协议：**[决策工作流](workflows/DECISION.zh-CN.md)。

## 4. 审查 / 复盘：记录下一次检查

**试用：**使用[审查与复盘输入](../examples/public-trial-scenarios/input/review-retrospective.md)，再询问验证了什么、还缺什么、下一次该复核什么。

**展示内容：**审查工作流保留既有结果、证据与质量观察、缺口和下一次复核动作。复盘是 review 工作流的别名，不是独立检索类型。

**协议：**[审查工作流](workflows/REVIEW.zh-CN.md)。

## 公开试用场景包

[公开试用场景包](../examples/public-trial-scenarios/)提供四个可独立运行的示例：研究、写作、决策和审查 / 复盘。每个示例都有输入资料、setup 和检索命令、预期 Raw/Source Card/Wiki Entry/运行产物、复用问题、长期维护价值和成功证据。

检索不足时，显式遵循以下顺序：`context` → `query` → `show` → 扩大主题或入库用户提供的资料 → 有边界地检查本地文件。说明哪个命令不足；不能把本地检查当作默认路径。
