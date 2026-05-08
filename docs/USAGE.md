# AIWiki 使用说明

目标体验：

```text
用户只做一次 setup -> 之后只把链接发给 Agent -> Agent 自动调用 AIWiki 入库
```

AIWiki CLI 不负责网页抓取。Qclaw、Codex、Claude Code、Cursor、Gemini CLI 等都只是宿主 Agent 的例子；基础版面向的是通用宿主 Agent 协作。

## 1. 一次性设置

发布后直接运行交互式 setup：

```bash
npx aiwiki setup
```

CLI 会询问知识库路径。直接回车会使用默认目录；输入 `y` 后会创建或补齐目录，并设置为默认知识库。

如果你想一行命令完成，也可以运行：

```bash
npx aiwiki setup --path "F:\knowledge_data\aiwiki" --yes
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

`opencode` 和 `hermes` 会被扫描出来，但基础版暂不自动写入它们的配置。确认官方用户提示/skill 目录后再开放自动安装。现在可先输出通用对接协议：

```bash
aiwiki prompt agent
```

把输出内容安装成宿主 Agent 的 skill，或粘贴到宿主 Agent 的项目/会话说明里。不同 Agent 的安装入口不同，所以基础版提供自动安装向导和通用协议两条路径。

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
files: 13
processing_summary: 09-runs/20260507-153012-abc123/processing-summary.md
source_card: 03-sources/article-cards/article-slug.md
draft_outline: 09-runs/20260507-153012-abc123/draft-outline.md
dashboard: dashboards/AIWiki Home.md
review_queue: dashboards/Review Queue.md
warnings: 0
```

宿主 Agent 回复用户时建议展示：

```text
已加入 Obsidian 审阅队列。
契合度：90 / high
摘要：……
资料卡：……
处理记录：……
Obsidian 入口：dashboards/AIWiki Home.md
待审队列：dashboards/Review Queue.md
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
06-assets/_suggestions/
07-topics/ready/
08-outputs/outlines/
```

Obsidian 主要审阅长期目录；`09-runs` 用于追溯每次处理。

### Obsidian 链接规则

AIWiki 生成的 Markdown 按 Obsidian vault 内路径组织，文件正文会使用 wikilink：

```text
[[03-sources/article-cards/article-slug|资料卡]]
[[02-raw/articles/article-slug|原文]]
[[09-runs/20260507-153012-abc123/processing-summary|处理记录]]
```

链接规则：
- wikilink 使用 vault 相对路径，统一为 `/`，并去掉 `.md` 后缀。
- `03-sources/article-cards` 是主要审阅入口，会链接到原文、Claim 建议、素材建议、选题、大纲和本次处理记录。
- `02-raw/articles`、`04-claims/_suggestions`、`06-assets/_suggestions`、`07-topics/ready`、`08-outputs/outlines` 会回链到资料卡，Obsidian 的 Backlinks/Graph View 可以串起同一篇资料。
- `09-runs/<run-id>/processing-summary.md` 会把本次生成的 Markdown 文件列成可点击 wikilink；`payload.json` 不是 Markdown，保留普通路径。
- frontmatter 会写入 `aiwiki_id`、`type`、`status`、`slug`、`source_url`、`created_at`、`captured_at`、`run_id`、`source_card`、`raw_note`、`claims_note`、`assets_note`、`topics_note`、`outline_note`、`run_summary`、`tags` 等字段，便于后续用 Obsidian Search / Properties / Dataview 做筛选。

### Obsidian 数据库入口

`setup` 会创建或补齐 Obsidian 数据库资产：

```text
dashboards/AIWiki Home.md
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
- Agent 不要让用户保存 payload。
- Agent 不要让用户手动运行 `ingest-agent`。
- Agent 生成 payload 后优先通过 stdin 调用 `aiwiki ingest-agent --stdin`。
- Agent 最后只向用户汇报入库状态、契合度、摘要、资料卡、处理记录和 Obsidian 审阅入口。

## 7. 高级调试

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

链接加正文文件：

```bash
aiwiki ingest-url "https://example.com/article" --content-file "F:\knowledge_data\article.md"
```

注意：`ingest-url` 不会抓网页，只会读取 `--content-file`。

## 8. 常见问题

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

## 9. 最小验收清单

完成一次 Agent 入库测试后，检查：

```bash
aiwiki status
```

验收标准：

- `run_count` 增加。
- `09-runs` 下出现新目录。
- `processing-summary.md` 存在。
- 成功读取时，`03-sources/article-cards` 下出现资料卡。
- 抓取失败时，`09-runs/<run-id>-fetch-failed` 下出现失败记录。
