# AIWiki 使用说明

目标体验：

```text
用户只做一次 setup -> 之后只把链接发给 Agent -> Agent 自动调用 AIWiki 入库
```

AIWiki CLI 不负责网页抓取。Qclaw、Codex、Claude Code 等宿主 Agent 负责读取网页或整理正文，AIWiki 负责写入本地知识库文件。

## 1. 一次性设置

发布后直接运行：

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

## 2. 日常使用

把下面的话发给 Qclaw，并替换链接：

```text
aiwiki 处理这篇文章：https://example.com/article
```

Qclaw 应该自动完成：

1. 读取网页正文。
2. 生成 `aiwiki.agent_payload.v1`。
3. 通过 stdin 调用 `aiwiki ingest-agent --stdin`。
4. 把 AIWiki CLI 输出的入库结果摘要回复给用户。

用户不需要保存 JSON，不需要手动运行 `ingest-agent`，也不需要每次输入知识库路径。

## 3. Qclaw 端应回复什么

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
processing_summary: 09-runs\20260507-153012-abc123\processing-summary.md
source_card: 09-runs\20260507-153012-abc123\source-card.md
draft_outline: 09-runs\20260507-153012-abc123\draft-outline.md
warnings: 0
```

Qclaw 回复用户时建议展示：

```text
已入库成功。
契合度：90 / high
摘要：……
结果目录：……
资料卡：……
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
processing_summary: 09-runs\20260507-153012-abc123-fetch-failed\processing-summary.md
warnings: 0
```

Qclaw 回复用户时建议展示：

```text
未成功入库正文，但已记录失败原因。
原因：……
记录目录：……
```

## 4. 成功后会生成什么

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

## 5. Agent 对接协议

给 Qclaw、Codex、Claude Code 等 Agent 的详细协议见：

```text
docs/AGENT_HANDOFF.md
```

核心要求：

- Agent 负责读取网页正文。
- Agent 不要让用户保存 payload。
- Agent 不要让用户手动运行 `ingest-agent`。
- Agent 生成 payload 后优先通过 stdin 调用 `aiwiki ingest-agent --stdin`。
- Agent 最后只向用户汇报入库状态、契合度、摘要和结果入口。

## 6. 高级调试

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

## 7. 常见问题

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

### Qclaw 抓不到网页

这是宿主 Agent 的网页读取问题，不是 AIWiki CLI 的问题。让 Qclaw 生成 `fetch_status=failed` 的 payload，AIWiki 会记录失败原因。

### 想换默认知识库目录

重新运行：

```bash
aiwiki setup --path "新的知识库路径" --yes
```

## 8. 最小验收清单

完成一次 Qclaw 测试后，检查：

```bash
aiwiki status
```

验收标准：

- `run_count` 增加。
- `09-runs` 下出现新目录。
- `processing-summary.md` 存在。
- 成功读取时，`03-sources/article-cards` 下出现资料卡。
- 抓取失败时，`09-runs/<run-id>-fetch-failed` 下出现失败记录。
