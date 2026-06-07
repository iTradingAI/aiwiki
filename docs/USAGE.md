# AIWiki 使用说明

目标体验：

```text
用户只做一次 setup -> 之后只把链接发给 Agent -> Agent 自动调用 AIWiki 入库
```

AIWiki CLI 不负责网页抓取。Qclaw、Codex、Claude Code、Cursor、Gemini CLI 等都只是宿主 Agent 的例子；这份文档面向的是通用宿主 Agent 协作。

AIWiki CLI 也不调用 LLM。高质量 Wiki Entry 来自宿主 Agent 提供的 `analysis` 或 `wiki_entry`；如果没有这些字段，AIWiki 会生成可追溯的 deterministic fallback 条目，只包含来源、反链、正文预览和待补全区。

AIWiki 会把证据通道和疑似风险分开记录。`source_quote` 等宿主 Agent 提供的原文引用属于证据通道；`coverage_suspected_incomplete`、`unsupported_claims`、`needs_review` 等属于 AIWiki 生成的启发式复核信号，不等于已经证明内容遗漏。

成功入库的正文会写入稳定的 `content_fingerprint`。如果同一来源同一正文重复入库，AIWiki 会保留新的 run 记录、给出重复 fingerprint warning，并把长期文件改名保存，避免静默覆盖已有知识资产。

## 1. 一次性设置

发布后直接运行交互式 setup：

```bash
npx @itradingai/aiwiki@latest setup
```

CLI 会询问知识库路径。直接回车会使用默认目录；输入 `y` 后会创建或补齐目录，并设置为默认知识库。

如果你想一行命令完成，也可以运行：

```bash
npx @itradingai/aiwiki@latest setup --path "F:\knowledge_data\aiwiki" --yes
```

本地仓库测试时：

```bash
cd "<AIWiki 仓库路径>"
npm install
npm run build
npm link
aiwiki setup --path "F:\knowledge_data\aiwiki-test" --yes
```

验证：

```bash
aiwiki doctor
aiwiki status
```

`setup` 会做两件事：

- 创建或补齐知识库目录。
- 写入默认知识库配置到用户目录，例如 `%USERPROFILE%\.aiwiki\config.json`。

之后大多数命令都可以省略 `--path`。

## 2. 让宿主 Agent 学会 AIWiki

初始化知识库之后，先让宿主 Agent 学会 AIWiki。推荐先扫描本机支持的宿主 Agent：

```bash
aiwiki agent list
aiwiki agent check
```

再启动安装向导：

```bash
aiwiki agent install
```

也可以跳过选择，直接指定目标：

```bash
aiwiki agent install --agent codex --yes
aiwiki agent install --agent qclaw --yes
aiwiki agent install --agent openclaw --yes
aiwiki agent install --agent claude --yes
```

当前自动复制范围：

- `codex`：复制到 Codex 用户 skills 目录。
- `qclaw`：复制到 QClaw skills 目录。
- `openclaw`：复制到 OpenClaw workspace skills 目录。
- `claude`：复制为 Claude Code slash-command 提示文件。

`opencode` 和 `hermes` 会被扫描出来，但 AIWiki 暂不自动写入它们的配置。确认官方用户提示/skill 目录后再开放自动安装。现在可先输出通用对接协议：

```bash
aiwiki prompt agent
```

把输出内容安装成宿主 Agent 的 skill，或粘贴到宿主 Agent 的项目/会话说明里。不同 Agent 的安装入口不同，所以 AIWiki 提供自动安装向导和通用协议两条路径。

`aiwiki agent check` 用来确认本机检测到哪些宿主 Agent、哪些已经安装 AIWiki 对接文件、哪些还需要运行 `aiwiki agent install --agent <id> --yes`。

## 3. 日常使用

宿主 Agent 已经加载 AIWiki 协议后，把下面的话发给它，并替换链接：

```text
入库 https://example.com/article
```

宿主 Agent 应该自动完成：

1. 读取网页正文。
2. 生成 `aiwiki.agent_payload.v1`。
3. 通过 stdin 调用 `aiwiki ingest-agent --stdin`。
4. 把 AIWiki CLI 输出的入库结果摘要回复给用户。

用户不需要保存 JSON，不需要手动运行 `ingest-agent`，也不需要每次输入知识库路径。

## 4. 宿主 Agent 端应回复什么

AIWiki CLI 会输出 key-value 信息。成功入库时类似：

```text
ingested: yes
recorded: yes
fetch_status: ok
fit_score: 90
fit_level: high
source_title: 文章标题
source_url: https://example.com/article
summary: 这里是文章前段摘要，方便 Agent 快速告诉用户文章大意。
run_id: 20260507-153012-abc123
run_dir: F:\knowledge_data\aiwiki\09-runs\20260507-153012-abc123
files: 15
processing_summary: 09-runs/20260507-153012-abc123/processing-summary.md
wiki_entry: 05-wiki/source-knowledge/article-slug.md
wiki_entry_generation_mode: agent_enriched
wiki_entry_quality: enriched
grounding_evidence_available: yes
grounding_evidence_channel: host_supplied
grounding_needs_review: no
grounding_markers: none
grounding_claims_with_quotes: 1/1
source_card: 03-sources/article-cards/article-slug.md
draft_outline: 09-runs/20260507-153012-abc123/draft-outline.md
dashboard: dashboards/AIWiki Home.md
review_queue: dashboards/Review Queue.md
warnings: 0
```

宿主 Agent 回复用户时建议展示：

```text
AIWiki 已完成入库，并生成 Wiki 条目。
契合度：90 / high
摘要：……
Wiki 条目：……
质量模式：enriched / agent_enriched
资料卡：……
处理记录：……
```

网页读取失败但已记录原因时类似：

```text
ingested: no
recorded: yes
fetch_status: failed
fit_score: 0
fit_level: fetch_failed
summary: 网页需要登录或宿主 Agent 无法访问正文。
run_id: 20260507-153012-abc123-fetch-failed
run_dir: F:\knowledge_data\aiwiki\09-runs\20260507-153012-abc123-fetch-failed
files: 2
processing_summary: 09-runs/20260507-153012-abc123-fetch-failed/processing-summary.md
dashboard: dashboards/AIWiki Home.md
review_queue: dashboards/Review Queue.md
warnings: 0
```

宿主 Agent 回复用户时建议展示：

```text
未成功入库正文，但已记录失败原因。
原因：……
记录目录：……
处理记录：……
Obsidian 入口：dashboards/AIWiki Home.md
```

## 5. 成功后会生成什么

每次 run 会写入：

```text
09-runs/<run-id>/payload.json
09-runs/<run-id>/raw.md
09-runs/<run-id>/source-card.md
09-runs/<run-id>/creative-assets.md
09-runs/<run-id>/topics.md
09-runs/<run-id>/draft-outline.md
09-runs/<run-id>/processing-summary.md
```

同时写入长期目录：

```text
02-raw/articles/
03-sources/article-cards/
04-claims/_suggestions/
05-wiki/source-knowledge/
06-assets/_suggestions/
07-topics/ready/
08-outputs/outlines/
```

`05-wiki/source-knowledge` 是默认知识层；`09-runs` 用于追溯每次处理。

Wiki Entry 有两种质量模式：

- `agent_enriched` / `enriched`：宿主 Agent 提供了 `analysis` 或 `wiki_entry`。
- `deterministic_fallback` / `scaffold`：AIWiki 只生成来源、反链、正文预览和待补全区。

`analysis` 可以继续只传旧字段，也可以补充 `entities`、`concepts`、`tensions`、`reusable_judgments`、`suggested_links`。这些字段会进入 Wiki Entry，帮助用户区分“实体/概念”“可复用判断”“证据边界”和“后续可链接条目”，但不会被 AIWiki 当作已经证实的事实。

Artifact 角色保持固定：

- `03-sources/article-cards` 是 trace-first 的资料卡：保留来源、反链、原文预览和 grounding 状态，不承担完整知识正文。
- `05-wiki/source-knowledge` 是 enriched knowledge surface：宿主 Agent 的 `analysis` / `wiki_entry` 会进入这里。
- `02-raw/articles` 是原始证据层，后续摘要、Claim 和复核都应能回查这里。

Grounding 字段都是 additive，可被旧工具忽略：

- `grounding_evidence_available`：是否存在可回查的宿主证据。
- `grounding_evidence_channel`：`host_supplied` 或 `none`。
- `grounding_needs_review`：是否需要复核。
- `grounding_markers`：例如 `unsupported_claims`、`source_quote_not_found`、`coverage_suspected_incomplete`。
- `coverage_suspected_incomplete`：长文提取过少时的启发式疑似标记，不是确定遗漏结论。

Wiki Entry 还会记录来源角色：

- `source_role: input`：默认值，外部文章、网页、书籍、视频等资料；`represents_user_view: false`。
- `source_role: output`：用户已发布文章、演讲稿、公众号文章等个人输出；通常可配合 `represents_user_view: true`。
- `source_role: processing`：用户自己的草稿、笔记、思考过程；默认不直接代表最终观点。

### Obsidian 链接规则

AIWiki 生成的 Markdown 按 Obsidian vault 内路径组织，文件正文会使用 wikilink：

```text
[[03-sources/article-cards/article-slug|资料卡]]
[[05-wiki/source-knowledge/article-slug|Wiki 条目]]
[[02-raw/articles/article-slug|原文]]
[[09-runs/20260507-153012-abc123/processing-summary|处理记录]]
```

链接规则：
- wikilink 使用 vault 相对路径，统一为 `/`，并去掉 `.md` 后缀。
- `05-wiki/source-knowledge` 是默认知识入口；`03-sources/article-cards` 会链接到 Wiki 条目、原文、Claim 建议、素材建议、选题、大纲和本次处理记录。
- `02-raw/articles`、`04-claims/_suggestions`、`06-assets/_suggestions`、`07-topics/ready`、`08-outputs/outlines` 会回链到资料卡，Obsidian 的 Backlinks/Graph View 可以串起同一篇资料。
- `09-runs/<run-id>/processing-summary.md` 会把本次生成的 Markdown 文件列成可点击 wikilink；`payload.json` 不是 Markdown，保留普通路径。
- frontmatter 会写入 `aiwiki_id`、`type`、`status`、`slug`、`source_url`、`content_fingerprint`、`created_at`、`captured_at`、`run_id`、`source_card`、`raw_note`、`claims_note`、`assets_note`、`topics_note`、`outline_note`、`run_summary`、`tags` 等字段，便于后续用 Obsidian Search / Properties / Dataview 做筛选。

### Obsidian 数据库入口

`setup` 会创建或补齐 Obsidian 数据库资产：

```text
dashboards/AIWiki Home.md
dashboards/Wiki Entries.md
dashboards/Source Cards.md
dashboards/Review Queue.md
dashboards/Recent Runs.md
dashboards/Topic Pipeline.md
_system/schemas/aiwiki-frontmatter.md
_system/templates/source-card.md
_system/templates/review-note.md
```

这些文件只在缺失时创建；如果你已经在 Obsidian 中改过 dashboard 或模板，重新运行 `aiwiki setup` 不会覆盖。

不安装 Dataview 也可以使用：
- 用 `dashboards/AIWiki Home.md` 作为入口。
- 用 Obsidian Properties 查看字段。
- 用 Backlinks / Graph View 查看资料卡和原文、Claim、素材、选题、大纲之间的关系。

安装 Dataview 后，dashboard 中的 `dataview` 代码块会渲染成表格，用来查看最近入库、待审队列、选题管线和处理记录。

Dataview 是可选增强，不是 AIWiki 的必需依赖。AIWiki 不会自动修改 `.obsidian` 或安装社区插件；需要时请在 Obsidian 的 Community plugins 中自行安装并启用 Dataview。

## 6. Agent 对接协议

给任意宿主 Agent 的详细协议见：

```text
docs/AGENT_HANDOFF.md
```

核心要求：

- Agent 负责读取网页正文。
- Agent 应尽量提供 `analysis` 或 `wiki_entry`，让 Wiki Entry 进入 enriched 模式。
- Agent 不要让用户保存 payload。
- Agent 不要让用户手动运行 `ingest-agent`。
- Agent 生成 payload 后优先通过 stdin 调用 `aiwiki ingest-agent --stdin`。
- Agent 最后向用户汇报入库状态、摘要、Wiki 条目、质量模式、资料卡和处理记录。

## 7. 查询和整理

从知识库调度内容：

```bash
aiwiki context "AI Agent"
aiwiki query "AI Agent"
```

`context` 返回 JSON 给宿主 Agent 使用；`query` 使用同一套检索结果，输出给人看的分组摘要。

检查知识库结构：

```bash
aiwiki lint
```

常用工作台模式：

```bash
aiwiki lint --severity warning
aiwiki lint --json
aiwiki lint --no-write
```

`lint` 会先输出 `lint_summary`、`top_issue` 和报告路径，再按 Errors / Warnings / Info 分组展示问题。每个问题会尽量给出建议动作，例如 `enrich`、`fix_link`、`reingest`、`archive` 或 `mark_reviewed`。`--severity` 只查看指定级别，`--json` 给宿主 Agent 使用，`--no-write` 只在终端检查而不更新 `dashboards/Lint Report.md`。

查看下一步建议：

```bash
aiwiki next
```

默认情况下，`lint` 输出报告并写入 `dashboards/Lint Report.md`。

## 8. 高级调试

如果 Agent 只能输出 JSON，才需要手动保存 payload：

```bash
aiwiki ingest-agent --payload "F:\knowledge_data\payload.json"
```

也可以用 stdin：

```bash
type "F:\knowledge_data\payload.json" | aiwiki ingest-agent --stdin
```

本地 Markdown 文件：

```bash
aiwiki ingest-file --file "F:\knowledge_data\article.md"
```

命名规则：
- 本地 `md` 导入时，AIWiki 优先使用文件标题或文件名生成外部文件名。
- 不会优先从正文内容里的 `# 一级标题` 反推文件名，避免整理后的文件名失去来源可追踪性。
- 如果文件名本身没有语义，才会继续回退到更弱的兜底命名。

链接加正文文件：

```bash
aiwiki ingest-url "https://example.com/article" --content-file "F:\knowledge_data\article.md"
```

注意：`ingest-url` 不会抓网页，只会读取 `--content-file`。

## 9. 常见问题

### 找不到 `aiwiki` 命令

本地仓库测试时重新执行：

```bash
cd "<AIWiki 仓库路径>"
npm run build
npm link
```

### `doctor` 提示没有默认知识库

运行：

```bash
aiwiki setup --path "F:\knowledge_data\aiwiki" --yes
```

### 宿主 Agent 抓不到网页

这是宿主 Agent 的网页读取问题，不是 AIWiki CLI 的问题。让宿主 Agent 生成 `fetch_status=failed` 的 payload，AIWiki 会记录失败原因。

### 想换默认知识库目录

重新运行：

```bash
aiwiki setup --path "新的知识库路径" --yes
```

## 10. 最小验收清单

完成一次 Agent 入库测试后，检查：

```bash
aiwiki status
```

验收标准：

- `run_count` 增加。
- `09-runs` 下出现新目录。
- `processing-summary.md` 存在。
- 成功读取时，`03-sources/article-cards` 下出现资料卡。
- 成功读取时，`05-wiki/source-knowledge` 下出现 Wiki Entry。
- 抓取失败时，`09-runs/<run-id>-fetch-failed` 下出现失败记录。
# System Purpose Files

`aiwiki setup` now also seeds `_system/purpose.md`, `_system/index.md`, and `_system/log.md` when they are missing. These files give humans and host Agents a stable entry point for the knowledge-base goal, scope, common folders, common commands, and lightweight event notes. Re-running setup preserves user edits.

## Diagnostic Commands

`aiwiki doctor` checks the workspace directories, write permission, and required system files: `_system/purpose.md`, `_system/index.md`, and `_system/log.md`.

`aiwiki status` keeps the existing run-count summary and also reports:

- `fallback_entries`: Wiki entries generated as deterministic fallback/scaffold.
- `grounding_review_entries`: Wiki entries marked for grounding review.
- `lint_status`: whether a lint report is missing, clean, or needs attention.
- `system_files`: readiness of purpose, index, and log files.
- `next_action`: the recommended next command.

`aiwiki next` uses the same repair order: fix workspace structure first, then lint errors, lint warnings, empty-workspace onboarding, and finally healthy-state query guidance.

## Query and Context Filters

`aiwiki context` and `aiwiki query` use local Markdown/frontmatter search. They do not use vector search, a database, external search, or RAG-over-wiki.

Useful filters:

```bash
aiwiki context "AI Agent" --type wiki_entries --source-role input --wiki-type source_knowledge --status active --limit 5
aiwiki query "AI Agent" --type source_cards --status to-review --limit 3
```

Supported filters:

- `--type`: one result group, such as `wiki_entries`, `source_cards`, `claims`, `topics`, `outlines`, or `raw_refs`.
- `--source-role`: frontmatter `source_role`, usually `input`, `processing`, or `output`.
- `--wiki-type`: frontmatter `wiki_type`, such as `source_knowledge` or `personal_knowledge`.
- `--status`: frontmatter status, such as `active`, `to-review`, `ready`, or `draft`.
- `--limit`: per-group result limit, clamped from 1 to 50.

The JSON result keeps the stable `schema_version: "aiwiki.context.v1"` and now also includes:

- `query_scope`: filters, limit, and searched groups.
- `result_quality`: total matches, best score, whether a Wiki Entry was found, and warnings.
- `recommended_next_action`: for example `use_matches_for_answer`, `review_grounding_or_enrich_entry`, or `broaden_query_or_ingest_source`.
- Per match: `match_reasons`, `quality_signals`, and `related_refs`.

Use `match_reasons` to explain why a result matched. Use `quality_signals` before answering confidently: scaffold or grounding-review entries should be treated as traceable leads, not final knowledge.
