# AIWiki 使用说明

这份说明用于本机真实测试。核心边界是：

```text
Agent 读网页或整理正文 -> AIWiki CLI 写本地知识库文件 -> Obsidian 长期审阅
```

AIWiki CLI 不负责网页抓取稳定性。Qclaw、Codex、Claude Code 等宿主 Agent 能读到网页内容后，再把正文交给 AIWiki。

## 1. 本机安装

如果 npm 包已经发布，可以直接运行：

```bash
npx aiwiki init --path "F:\knowledge_data\aiwiki" --yes
```

如果是在当前仓库本地测试，先进入仓库：

```bash
cd "<AIWiki 仓库路径>"
npm install
npm run build
npm link
```

验证命令是否可用：

```bash
aiwiki --version
```

预期看到类似：

```text
aiwiki 0.1.0
```

## 2. 初始化知识库

建议先用一个测试目录：

```bash
aiwiki init --path "F:\knowledge_data\aiwiki-test" --yes
aiwiki doctor --path "F:\knowledge_data\aiwiki-test"
aiwiki status --path "F:\knowledge_data\aiwiki-test"
```

`doctor` 全部为 `ok` 即表示目录可用。

初始化后会生成这些目录：

```text
02-raw/
03-sources/
04-claims/
05-wiki/
06-assets/
07-topics/
08-outputs/
09-runs/
```

## 3. 用 Qclaw 测试链接

把下面这段发给 Qclaw，并替换其中的文章链接：

```text
aiwiki

请读取这个链接的正文：
<这里放文章链接>

要求：
1. 你负责读取网页正文，AIWiki CLI 不负责抓网页。
2. 如果网页读取失败，请生成 fetch_status=failed 的 payload，并写明 fetch_notes。
3. 如果读取成功，请把正文整理成 aiwiki.agent_payload.v1 JSON。
4. payload 中不要包含任何输出路径字段，不要尝试决定文件写到哪里。
5. 如果你可以运行本机命令，请把 payload 保存为临时 JSON 文件，并执行：
   aiwiki ingest-agent --payload <payload.json> --path "F:\knowledge_data\aiwiki-test"
6. 如果你不能运行命令，请直接把完整 payload JSON 发给我。
```

Qclaw 能运行命令时，完成后你再检查：

```bash
aiwiki status --path "F:\knowledge_data\aiwiki-test"
```

并打开：

```text
F:\knowledge_data\aiwiki-test\09-runs
```

每次成功处理都会出现一个新的 run 目录。

## 4. 手动 payload 测试

如果 Qclaw 只能输出 JSON，先把它保存为：

```text
F:\knowledge_data\aiwiki-test\payload.json
```

然后运行：

```bash
aiwiki ingest-agent --payload "F:\knowledge_data\aiwiki-test\payload.json" --path "F:\knowledge_data\aiwiki-test"
```

也可以用 stdin：

```bash
type "F:\knowledge_data\aiwiki-test\payload.json" | aiwiki ingest-agent --stdin --path "F:\knowledge_data\aiwiki-test"
```

## 5. payload 格式

成功读取网页时：

```json
{
  "schema_version": "aiwiki.agent_payload.v1",
  "source": {
    "kind": "url",
    "url": "https://example.com/article",
    "title": "文章标题",
    "content_format": "markdown",
    "content": "这里是宿主 Agent 读取到的正文内容。",
    "fetcher": "qclaw",
    "fetch_status": "ok",
    "captured_at": "2026-05-06T10:00:00+08:00"
  },
  "request": {
    "mode": "ingest",
    "outputs": [
      "source_card",
      "creative_assets",
      "topics",
      "draft_outline",
      "processing_summary"
    ],
    "language": "zh-CN"
  }
}
```

网页读取失败时：

```json
{
  "schema_version": "aiwiki.agent_payload.v1",
  "source": {
    "kind": "url",
    "url": "https://example.com/article",
    "title": "无法读取的文章",
    "fetcher": "qclaw",
    "fetch_status": "failed",
    "fetch_notes": "网页需要登录或宿主 Agent 无法访问正文。",
    "captured_at": "2026-05-06T10:00:00+08:00"
  },
  "request": {
    "mode": "record_fetch_failure",
    "outputs": [
      "processing_summary"
    ],
    "language": "zh-CN"
  }
}
```

失败 payload 也应该写入 AIWiki，因为它能留下“为什么这条资料没处理成功”的记录。

## 6. 本地文件测试

如果你已经有一篇 Markdown：

```bash
aiwiki ingest-file --file "F:\knowledge_data\article.md" --path "F:\knowledge_data\aiwiki-test"
```

如果你有链接和正文文件：

```bash
aiwiki ingest-url "https://example.com/article" --content-file "F:\knowledge_data\article.md" --path "F:\knowledge_data\aiwiki-test"
```

注意：`ingest-url` 不会抓网页，只会读取 `--content-file`。

## 7. 成功后会生成什么

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

同时会写入长期目录：

```text
02-raw/articles/
03-sources/article-cards/
04-claims/_suggestions/
06-assets/_suggestions/
07-topics/ready/
08-outputs/outlines/
```

Obsidian 主要审阅长期目录；`09-runs` 用于追溯每次处理。

## 8. 常见问题

### 找不到 `aiwiki` 命令

本地仓库测试时重新执行：

```bash
cd "<AIWiki 仓库路径>"
npm run build
npm link
```

### `doctor` 报 missing

执行修复：

```bash
aiwiki init --path "F:\knowledge_data\aiwiki-test" --yes
```

### Qclaw 抓不到网页

这是宿主 Agent 的网页读取问题，不是 AIWiki CLI 的问题。让 Qclaw 生成 `fetch_status=failed` 的 payload，AIWiki 会记录失败原因。

### 生成的文件名重复

AIWiki 会自动追加 run id，避免覆盖旧文件。

## 9. 最小验收清单

完成一次 Qclaw 测试后，检查：

```bash
aiwiki status --path "F:\knowledge_data\aiwiki-test"
```

验收标准：

- `run_count` 增加。
- `09-runs` 下出现新目录。
- `processing-summary.md` 存在。
- 成功读取时，`03-sources/article-cards` 下出现资料卡。
- 抓取失败时，`09-runs/<run-id>-fetch-failed` 下出现失败记录。
