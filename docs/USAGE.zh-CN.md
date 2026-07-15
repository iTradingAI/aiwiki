# AIWiki 使用指南

## 场景优先的开始方式

先对 Agent 说：

```text
请安装 AIWiki，使用 <我的本地-aiwiki-路径> 作为工作区，同步支持的 Agent 接入，并汇报工作区和 Agent 状态。
```

Agent 应使用 `setup`、`agent sync/check`、`doctor` 和 `status`，再解释观察到的状态。首选命令、输出解释和 fallback 条件以 [Core Intent Matrix](AGENT_HANDOFF.zh-CN.md#core-intent-matrix) 为准；下方长检查清单仅用于明确的安装排障。

AIWiki 的主路径是让 AI 助手来使用。

目标体验很简单：

```text
只设置一次
  -> 以后把链接、文件、笔记发给 AI 助手
  -> 助手调用 AIWiki
  -> AIWiki 写入可复用的本地 Markdown 知识库
```

AIWiki 不抓网页，也不调用 LLM。宿主 AI 助手负责读取和理解资料；AIWiki 负责校验、写入、链接、查询和检查本地知识库。

## 1. 让 AI 助手安装 AIWiki

复制这段给你的 AI 助手：

发送前，请把所有 `<替换成我的 AIWiki 知识库路径>` 替换成你自己的本地文件夹路径，例如 `D:\AIWiki` 或 `~/AIWiki`。不要把这个占位符原样留在命令里。

```text
请帮我安装并配置 AIWiki。

请先检查 Node.js 是否已安装，并确认 node --version >=20。
如果没有安装 Node.js，或版本低于 20，请先停止，并告诉我如何升级，不要继续运行 npm install。

我的知识库路径是：

<替换成我的 AIWiki 知识库路径>

运行命令前，请把下面所有 `<替换成我的 AIWiki 知识库路径>` 替换成我的真实本地文件夹路径。如果我没有替换，占位符仍然原样存在，请停止并向我询问真实路径。

请运行这些命令：

npm install -g @itradingai/aiwiki@latest
aiwiki setup --path "<替换成我的 AIWiki 知识库路径>" --yes
aiwiki agent sync --yes
aiwiki agent check --json
aiwiki agent check --path "<替换成我的 AIWiki 知识库路径>" --json
aiwiki doctor --path "<替换成我的 AIWiki 知识库路径>"
aiwiki status --path "<替换成我的 AIWiki 知识库路径>"

最后总结安装是否成功、同步了哪些助手目标、知识库根指导是否存在，以及我是否需要重启或重新加载助手。
```

知识库路径示例：

```text
Windows: D:\AIWiki
macOS/Linux: ~/AIWiki
项目内测试: ./aiwiki-test
```

`aiwiki setup` 会创建或修复知识库，并刷新知识库根目录的 `AGENTS.md` 指导。`aiwiki agent sync --yes` 会把 AIWiki skill 同步到支持的本机助手环境。

安装成功后应该看到：

- `aiwiki --version` 可以正常输出
- `aiwiki doctor --path <workspace>` 通过，或给出明确可处理的问题
- `aiwiki agent check --json` 报告支持的助手目标为 `installed`、`updated` 或 `current`
- `aiwiki agent check --path <workspace> --json` 报告知识库根指导是 current
- `aiwiki status --path <workspace>` 返回知识库状态和下一步动作

## 2. Agent 对接的两层含义

```bash
aiwiki agent sync --yes
```

同步到本机支持的 AI 助手环境，例如 Codex、Claude Code、QClaw、OpenClaw。

知识库根指导由 setup 自动刷新：

```bash
aiwiki setup --path <workspace> --yes
```

只有想手动刷新 `AGENTS.md`、但不需要重新 setup 时，才需要运行：

```bash
aiwiki agent sync --path <workspace> --yes
```

这会在知识库根目录写入带标记的指导，让以后进入这个目录的 Agent 先使用 AIWiki 命令，而不是直接翻文件。

验证两层同步：

```bash
aiwiki agent check --json
aiwiki agent check --path <workspace> --json
```

不支持自动写入的宿主，可以输出通用协议：

```bash
aiwiki prompt agent
```

## 3. 入库资料

对 AI 助手说：

```text
把这个资料入库到 AIWiki：
https://example.com/article
```

助手应该：

1. 读取资料
2. 生成 `aiwiki.agent_payload.v1`
3. 能理解时尽量提供 `analysis` 或 `wiki_entry`
4. 调用 `aiwiki ingest-agent --stdin`
5. 汇报 Wiki Entry、Source Card 和 Processing Summary

本地文件可以调用：

```bash
aiwiki ingest-file --file <file>
```

如果网页读取失败，助手也应该记录 `fetch_status: "failed"`，让这次尝试可追踪。

## 4. 从知识库提问

对 AI 助手说：

```text
AIWiki 里关于 <主题> 有什么？
```

助手应该调用：

```bash
aiwiki context "<主题>"
```

默认 `context` 返回稳定的 `aiwiki.context.v1` JSON，包含查询范围、结果质量、匹配原因、质量信号和相关引用。

如果需要 0.3.0 的 Source Capsule 对象视图，调用：

```bash
aiwiki context "<主题>" --view capsule
```

Capsule context 返回 `aiwiki.context.capsule.v1`，里面包含按来源聚合后的 capsule、生命周期警告、OKF readiness、缺失上下文和下一步建议。

人在终端里看结果可以用：

```bash
aiwiki query "<主题>"
```

`query` 默认显示 Source Capsule 视图，把同一来源的 Wiki Entry、Source Card、Raw、可选建议文件和运行记录组织在一起。需要旧的文件分组输出时再使用：

```bash
aiwiki query "<主题>" --view files
```

查看单个 capsule：

```bash
aiwiki show "<主题>"
aiwiki show --id <capsule_id>
aiwiki show --artifact-path <artifact.md> --path <workspace>
aiwiki show "<主题>" --json
```

## 5. 检查和维护知识库

对 AI 助手说：

```text
帮我检查并整理 AIWiki 知识库。
```

助手应该先运行：

```bash
aiwiki lint --json
```

默认 lint 仍然只做文件和结构检查，不会因为旧知识库没有 capsule 元数据就制造噪音。

0.3.0 的深层检查需要显式开启：

```bash
aiwiki lint --capsules --json
aiwiki lint --lifecycle --json
aiwiki lint --okf --json
aiwiki lint --strict --json
```

`--strict` 适合发布或 CI 风格检查，不应作为普通用户整理知识库的默认入口。

如果只有安全修复，并且你允许整理：

```bash
aiwiki lint --fix-empty-dirs --json
aiwiki lint --json
```

当前自动安全修复只包括：删除已知且为空的可选增强目录。AIWiki 不应把核心目录、未知目录、非空目录或文件当成 safe fix 删除。

## 6. 生成的文件

核心产物：

```text
09-runs/<run-id>/payload.json
09-runs/<run-id>/raw.md
09-runs/<run-id>/source-card.md
09-runs/<run-id>/wiki-entry.md
09-runs/<run-id>/processing-summary.md
02-raw/articles/
03-sources/article-cards/
05-wiki/source-knowledge/
```

可选产物只在助手提供对应内容或明确请求时出现：

```text
09-runs/<run-id>/creative-assets.md
09-runs/<run-id>/topics.md
09-runs/<run-id>/draft-outline.md
04-claims/_suggestions/
06-assets/_suggestions/
07-topics/ready/
08-outputs/outlines/
```

Wiki Entry 有两种质量模式：

- `agent_enriched` / `enriched`：助手提供了分析或 Wiki 内容。
- `deterministic_fallback` / `scaffold`：AIWiki 只根据来源内容生成可追踪脚手架。

Source Capsule 元数据是增量字段。新生成文件可能包含：

- `capsule_id`、`artifact_role`、`visibility`
- `knowledge_status`、`confidence_level`、`confidence_score`、`staleness`
- `evidence_refs`、`evidence_count`、`last_confirmed`
- `relationships`、`supersedes`、`superseded_by`、`contradicted_by`
- OKF-ready 字段，例如 `resource`、`description`、`timestamp`

旧知识库不需要批量迁移。缺少显式 `capsule_id` 时，capsule 命令会从路径、来源 URL、内容指纹和 run ID 推断聚合关系。

## 7. Obsidian 和 Dataview

AIWiki 写的是普通 Markdown 和 frontmatter。

Obsidian 可选，Dataview 也可选。AIWiki 不修改 `.obsidian`，不安装插件，也不依赖 Dataview 查询知识库。

`aiwiki setup` 会在缺失时创建 dashboard 和 schema 文件，并保留用户已经编辑过的文件。

## 8. 常见排障

### 找不到 `aiwiki`

让助手重新安装：

```bash
npm install -g @itradingai/aiwiki@latest
aiwiki --version
```

### 助手还是直接翻文件

运行：

```bash
aiwiki agent sync --yes
aiwiki setup --path <workspace> --yes
aiwiki agent check --path <workspace> --json
```

必要时重启或重新加载助手。

助手应该先使用 `aiwiki lint`、`aiwiki status`、`aiwiki query`、`aiwiki context`、`aiwiki ingest-file` 或 `aiwiki ingest-agent`，再考虑通用文件搜索。

### 助手读不到网页

这是宿主助手访问网页的问题，不是 AIWiki 爬虫失败。让助手记录 failed fetch payload，保留可追踪记录。

## 9. 本地开发

```bash
npm install
npm run build
npm test
npm link
```

用临时知识库测试：

```bash
aiwiki setup --path "./aiwiki-test" --yes
aiwiki doctor --path "./aiwiki-test"
aiwiki status --path "./aiwiki-test"
```
