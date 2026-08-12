# Public Trial Scenario Pack / 公开试用场景包

This pack gives first-time AIWiki users four small, repeatable workflows. Each
scenario is runnable with the base CLI and labels its workflow type in English
and Chinese. / 本场景包提供四个小型、可重复的工作流；每个场景都标注中英文工作流类型，并且只使用基础 CLI。

For a clean comparison, create a new temporary workspace for each scenario or
remove only your own temporary `./aiwiki-trial` folder after inspection. / 为便于比较，每个场景使用新的临时工作区；检查完后只删除自己的 `./aiwiki-trial` 目录。

## Shared Command Pattern / 通用命令模式

Each scenario uses the same command sequence with its own input and retrieval
question:

```bash
aiwiki setup --path ./aiwiki-trial --yes
aiwiki agent check --path ./aiwiki-trial --json
aiwiki doctor --json --path ./aiwiki-trial
aiwiki status --json --path ./aiwiki-trial
aiwiki ingest-file --file examples/public-trial-scenarios/input/<input>.md --path ./aiwiki-trial
aiwiki status --json --path ./aiwiki-trial
aiwiki next --json --path ./aiwiki-trial
aiwiki context "<scenario question>" --path ./aiwiki-trial
aiwiki query "<scenario question>" --path ./aiwiki-trial
aiwiki show "<scenario topic>" --path ./aiwiki-trial
aiwiki lint --json --path ./aiwiki-trial
```

This is a 5-10 minute first-use route. `setup` creates the workspace; `agent check` independently verifies workspace guidance; and the three read-only diagnostic commands expose `repair_required`, `setup_required`, `first_ingest_required`, `review_required`, or `ready`. They return `would_write: false`; `next` returns `actions_executed: false` and only recommends action IDs such as `ingest_first_source` or `query_knowledge`. Successful local-file ingestion produces a Raw
record, Source Card, Wiki Entry, and run artifacts. `context` returns
`aiwiki.context.v1`; `query` gives readable retrieval output; `show` inspects a
selected artifact or source package; `lint --json` reports structural findings.

## 1. Article Research Memory / 文章研究记忆

**Workflow type / 工作流类型:** Research / 研究

**Input / 输入:** [`input/article-research.md`](input/article-research.md)

Use this when one article should remain traceable for a later source-backed
answer. / 适用于希望一篇文章在之后仍可追溯并支撑回答的场景。

```bash
aiwiki setup --path ./aiwiki-trial --yes
aiwiki ingest-file --file examples/public-trial-scenarios/input/article-research.md --path ./aiwiki-trial
aiwiki context "source evidence" --path ./aiwiki-trial
aiwiki query "source evidence" --path ./aiwiki-trial
aiwiki show "article research" --path ./aiwiki-trial
aiwiki lint --json --path ./aiwiki-trial
```

**Expected artifacts / 预期产物:**

```text
02-raw/articles/article-research.md
03-sources/article-cards/article-research.md
05-wiki/source-knowledge/article-research.md
09-runs/<run-id>/processing-summary.md
```

**Reuse request / 复用请求:** “What does AIWiki remember about preserving source evidence?” / “AIWiki 记住了哪些关于保留来源证据的信息？”

**Maintenance value / 长期维护价值:** The source, evidence boundary, and later
writing angles remain inspectable rather than disappearing into a chat. / 来源、证据边界和后续写作角度可以持续检查，不会消失在聊天记录中。

**Success evidence / 成功证据:** `context` or `query` returns the scenario topic;
identify the matching Wiki Entry or Source Card, read its quality signals, and
confirm the artifacts and lint JSON exist. / `context` 或 `query` 返回场景主题；指出匹配的 Wiki Entry 或 Source Card，读取质量信号，并确认产物和 lint JSON。

## 2. Topic Planning Memory / 主题规划记忆

**Workflow type / 工作流类型:** Writing / 写作

**Input / 输入:** [`input/topic-planning.md`](input/topic-planning.md)

Use this before drafting from prior content angles and audience notes. / 适用于从既有内容角度和受众说明开始写作前。

```bash
aiwiki setup --path ./aiwiki-trial --yes
aiwiki ingest-file --file examples/public-trial-scenarios/input/topic-planning.md --path ./aiwiki-trial
aiwiki context "content calendar" --path ./aiwiki-trial
aiwiki query "topic planning" --path ./aiwiki-trial
aiwiki show "topic planning" --path ./aiwiki-trial
aiwiki lint --json --path ./aiwiki-trial
```

**Expected artifacts / 预期产物:**

```text
02-raw/articles/topic-planning.md
03-sources/article-cards/topic-planning.md
05-wiki/source-knowledge/topic-planning.md
09-runs/<run-id>/processing-summary.md
```

**Reuse request / 复用请求:** “What topic directions are already captured for public trial content?” / “公开试用内容已经记录了哪些主题方向？”

**Maintenance value / 长期维护价值:** Reasons, audiences, and angles remain
available before the next draft. / 下次起草前仍能找到理由、受众和角度。

**Success evidence / 成功证据:** `context` or `query` returns the planning topic;
identify the selected artifact and its quality signals, then confirm the artifacts
and lint JSON exist. / `context` 或 `query` 返回规划主题；指出选中的产物和质量信号，再确认产物和 lint JSON。

## 3. Project Decision Memory / 项目决策记忆

**Workflow type / 工作流类型:** Decision / 决策

**Input / 输入:** [`input/project-decision.md`](input/project-decision.md)

Use this when a project choice needs its constraints, rejected alternatives, and
review trigger kept together. / 适用于需要把项目选择、约束、被否决方案和复核触发点放在一起保存的场景。

```bash
aiwiki setup --path ./aiwiki-trial --yes
aiwiki ingest-file --file examples/public-trial-scenarios/input/project-decision.md --path ./aiwiki-trial
aiwiki context "constraints and rejected alternatives" --path ./aiwiki-trial
aiwiki query "decision memory" --path ./aiwiki-trial
aiwiki show "project decision" --path ./aiwiki-trial
aiwiki lint --json --path ./aiwiki-trial
```

**Expected artifacts / 预期产物:**

```text
02-raw/articles/project-decision.md
03-sources/article-cards/project-decision.md
05-wiki/source-knowledge/project-decision.md
09-runs/<run-id>/processing-summary.md
```

**Reuse request / 复用请求:** “Why did the project choose a local Markdown knowledge base first?” / “项目为什么先选择本地 Markdown 知识库？”

**Maintenance value / 长期维护价值:** The team can recover earlier tradeoffs
instead of reopening the same choice without its constraints. / 团队可以找回此前取舍，而不是脱离约束重复讨论同一选择。

**Success evidence / 成功证据:** `context` or `query` returns the decision topic;
identify the retrieved artifact, its constraints, and its quality signals, then
confirm the artifacts and lint JSON exist. / `context` 或 `query` 返回决策主题；指出检索产物、约束和质量信号，再确认产物和 lint JSON。

## 4. Review / Retrospective Memory / 审查与复盘记忆

**Workflow type / 工作流类型:** Review / retrospective（审查 / 复盘）

**Input / 输入:** [`input/review-retrospective.md`](input/review-retrospective.md)

Use this after an outcome to preserve observations, evidence limits, gaps, and a
next review action. Retrospective is the review workflow alias. / 适用于在结果发生后保存观察、证据边界、缺口和下一次复核动作；复盘是 review 工作流的别名。

```bash
aiwiki setup --path ./aiwiki-trial --yes
aiwiki ingest-file --file examples/public-trial-scenarios/input/review-retrospective.md --path ./aiwiki-trial
aiwiki context "next review action" --path ./aiwiki-trial
aiwiki query "public trial review" --path ./aiwiki-trial
aiwiki show "review retrospective" --path ./aiwiki-trial
aiwiki lint --json --path ./aiwiki-trial
```

**Expected artifacts / 预期产物:**

```text
02-raw/articles/review-retrospective.md
03-sources/article-cards/review-retrospective.md
05-wiki/source-knowledge/review-retrospective.md
09-runs/<run-id>/processing-summary.md
```

**Reuse request / 复用请求:** “What did the first public trial verify, what gaps remain, and what should be reviewed next?” / “首次公开试用验证了什么、还缺什么、下一次该复核什么？”

**Maintenance value / 长期维护价值:** A later reviewer can distinguish observed
results from unverified assumptions and continue from an explicit next action. /
之后的复核者可以区分已观察结果与未验证假设，并从明确的下一步继续。

**Success evidence / 成功证据:** `context` or `query` returns the review topic;
identify the retrieved artifact, quality signals, gaps, and next review action,
then confirm the artifacts and lint JSON exist. / `context` 或 `query` 返回复盘主题；指出检索产物、质量信号、缺口和下一次复核动作，再确认产物和 lint JSON。

## Boundaries / 边界

These scenarios use local Markdown inputs and the base CLI. The host Agent reads
and understands a source before using `ingest-agent`; the CLI does not perform
that reading. If retrieval is insufficient, use `context` → `query` → `show` →
broaden the topic or ingest user-provided material → bounded local inspection,
and state which command was insufficient. / 这些场景使用本地 Markdown 输入和基础 CLI。使用 `ingest-agent` 前由宿主 Agent 读取并理解资料；CLI 不负责这一读取。检索不足时遵循 `context` → `query` → `show` → 扩大主题或入库用户提供的资料 → 有边界地检查本地文件，并说明哪个命令不足。
