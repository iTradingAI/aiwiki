# AIWiki Agent 对接说明

这份文档写给任何可以读取网页、生成结构化内容并调用本机命令的宿主 Agent。

## 目标

当用户说：

```text
入库 https://example.com/article
```

Agent 应自动读取网页，生成 payload，通过 AIWiki CLI 写入本地知识库，并把结果摘要回复给用户。

## 职责边界

```text
Agent 负责：读取网页、整理正文、生成 payload、调用 CLI、回复用户
AIWiki CLI 负责：校验 payload、写本地文件、输出入库结果
用户负责：提供链接或正文，最后审阅结果
```

AIWiki CLI 不做通用网页抓取。网页读取失败时，Agent 仍然要调用 CLI 记录失败原因。

## 标准流程

1. 读取用户给的 URL、正文、附件或消息。
2. 如果读取成功，生成 `fetch_status: "ok"` 的 payload。
3. 如果读取失败，生成 `fetch_status: "failed"` 的 payload，并写清 `fetch_notes`。
4. 不要让用户保存 payload。
5. 不要让用户手动运行命令。
6. 优先通过 stdin 调用：

```bash
aiwiki ingest-agent --stdin
```

7. 读取 CLI 输出，向用户回复入库状态、契合度、摘要、资料卡、处理记录和 Obsidian 审阅入口。

## 成功 payload

```json
{
  "schema_version": "aiwiki.agent_payload.v1",
  "source": {
    "kind": "url",
    "url": "https://example.com/article",
    "title": "文章标题",
    "content_format": "markdown",
    "content": "这里是宿主 Agent 读取到的正文内容。",
    "fetcher": "host-agent",
    "fetch_status": "ok",
    "captured_at": "2026-05-07T10:00:00+08:00"
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

## 失败 payload

```json
{
  "schema_version": "aiwiki.agent_payload.v1",
  "source": {
    "kind": "url",
    "url": "https://example.com/article",
    "title": "无法读取的文章",
    "fetcher": "host-agent",
    "fetch_status": "failed",
    "fetch_notes": "网页需要登录或宿主 Agent 无法访问正文。",
    "captured_at": "2026-05-07T10:00:00+08:00"
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

## 禁止事项

- 不要在 payload 中包含输出路径。
- 不要让用户手动保存 payload。
- 不要让用户每次输入 `--path`。
- 不要声称网页抓取是 AIWiki CLI 的能力。
- 不要在 `fetch_status: "failed"` 时塞入正文内容。
- 不要替用户安装 Dataview。
- 不要修改 `.obsidian`、`community-plugins.json` 或 Obsidian 插件配置。

## Obsidian + Dataview 边界

AIWiki 生成的知识库不依赖 Dataview。用户不安装 Dataview 时，也可以用 Obsidian 原生 Properties、Backlinks、Search、Graph View 和普通 wikilink 审阅。

Dataview 只是可选增强。用户自行在 Obsidian Community plugins 中安装并启用 Dataview 后，`dashboards/AIWiki Home.md`、`dashboards/Review Queue.md`、`dashboards/Recent Runs.md` 和 `dashboards/Topic Pipeline.md` 会渲染成表格。

## Agent 回复模板

成功时：

```text
已加入 Obsidian 审阅队列。
契合度：<fit_score> / <fit_level>
摘要：<summary>
资料卡：<source_card>
处理记录：<processing_summary>
Obsidian 入口：<dashboard>
待审队列：<review_queue>
```

失败但已记录时：

```text
未成功入库正文，但已记录失败原因。
原因：<summary>
记录目录：<run_dir>
处理摘要：<processing_summary>
Obsidian 入口：<dashboard>
待审队列：<review_queue>
```
