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
Agent 负责：读取网页、理解正文、尽量生成 analysis/wiki_entry、调用 CLI、回复用户
AIWiki CLI 负责：校验 payload、写本地文件、生成 Wiki Entry、输出入库结果
用户负责：提供链接或正文，最后审阅结果
```

AIWiki CLI 不做通用网页抓取，也不调用 LLM。网页读取失败时，Agent 仍然要调用 CLI 记录失败原因；高质量 Wiki 内容由宿主 Agent 提供。

## 标准流程

1. 读取用户给的 URL、正文、附件或消息。
2. 如果读取成功，生成 `fetch_status: "ok"` 的 payload。
3. 尽量基于正文生成 `analysis` 或 `wiki_entry`。
4. 如果读取失败，生成 `fetch_status: "failed"` 的 payload，并写清 `fetch_notes`。
5. 不要让用户保存 payload。
6. 不要让用户手动运行命令。
7. 优先通过 stdin 调用：

```bash
aiwiki ingest-agent --stdin
```

8. 如果当前 shell、终端或宿主环境无法保证 stdin 是 UTF-8，先把 payload 写成 UTF-8 JSON 文件，再调用：

```bash
aiwiki ingest-agent --payload <utf8-json-file>
```

9. 读取 CLI 输出，向用户回复入库状态、摘要、Wiki 条目、质量模式、资料卡和处理记录。

## 编码要求

payload 必须是 UTF-8 JSON。Windows PowerShell、批处理、第三方 Agent shell bridge 可能会把中文 JSON 管道按非 UTF-8 编码传递；遇到中文乱码、`payload must be valid JSON` 或无法确认管道编码时，使用 `--payload <utf8-json-file>`。

AIWiki 会修复常见 UTF-8 mojibake，但这只是兜底；宿主 Agent 仍应尽量传入干净 UTF-8。

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
  "analysis": {
    "summary": "一句话总结。",
    "key_points": [
      "核心观点 1",
      "核心观点 2"
    ],
    "related_concepts": [
      "概念 A"
    ]
  },
  "request": {
    "mode": "ingest",
    "outputs": [
      "source_card",
      "wiki_entry",
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
- 不要声称 AIWiki CLI 会在没有 Agent 分析字段时自动高质量总结。
- 不要在 `fetch_status: "failed"` 时塞入正文内容。
- 不要替用户安装 Dataview。
- 不要修改 `.obsidian`、`community-plugins.json` 或 Obsidian 插件配置。

## Obsidian + Dataview 边界

AIWiki 生成的知识库不依赖 Dataview。用户不安装 Dataview 时，也可以用 Obsidian 原生 Properties、Backlinks、Search、Graph View 和普通 wikilink 审阅。

Dataview 只是可选增强。用户自行在 Obsidian Community plugins 中安装并启用 Dataview 后，`dashboards/AIWiki Home.md`、`dashboards/Review Queue.md`、`dashboards/Recent Runs.md` 和 `dashboards/Topic Pipeline.md` 会渲染成表格。

## Agent 回复模板

成功时：

```text
AIWiki 已完成入库，并生成 Wiki 条目。
契合度：<fit_score> / <fit_level>
摘要：<summary>
Wiki 条目：<wiki_entry>
质量模式：<wiki_entry_quality> / <wiki_entry_generation_mode>
资料卡：<source_card>
处理记录：<processing_summary>
```

失败但已记录时：

```text
未成功入库正文，但已记录失败原因。
原因：<summary>
记录目录：<run_dir>
处理摘要：<processing_summary>
Obsidian 入口：<dashboard>
```

## Query / Lint

当用户说“从 AIWiki 里了解某个主题”时，调用：

```bash
aiwiki context "<主题>"
```

当用户说“整理 / 检查知识库”时，调用：

```bash
aiwiki lint
```

`context` 返回 JSON，注意其中的 `generation_mode`、`quality` 和 `warnings`。如果结果是 `deterministic_fallback` / `scaffold`，回复时要说明它只是可追溯脚手架，不是高质量知识提炼。
