# AIWiki Agent 接入说明

这份文档写给可以读取资料、生成结构化内容并调用本机命令的宿主 AI 助手。

## 目标

当用户说：

```text
把这个资料入库到 AIWiki：
https://example.com/article
```

助手应该读取资料，生成 AIWiki payload，调用 AIWiki CLI，然后把结果回复给用户。

## 职责边界

```text
助手：
  读取资料、理解内容、生成 analysis/wiki_entry、调用 CLI、回复用户

AIWiki CLI：
  校验 payload、写入本地 Markdown、创建 Wiki Entry、输出 run 状态

用户：
  提供链接、文件或笔记，最后审阅或复用结果
```

AIWiki CLI 不抓网页，也不调用 LLM。读取失败时，助手也应该调用 AIWiki 记录失败原因。

## 命令优先契约

在 AIWiki 知识库里工作时，先调用 AIWiki 命令，再考虑通用文件搜索或临时脚本。

先确认知识库和根指导是最新的。`setup` 会自动刷新带标记的 `AGENTS.md` 指导：

```bash
aiwiki setup --path <workspace> --yes
aiwiki agent check --path <workspace> --json
```

日常闭环按这个顺序使用：

```bash
aiwiki setup --path <workspace> --yes
aiwiki agent check --path <workspace> --json
aiwiki doctor --path <workspace>
aiwiki lint --json --path <workspace>
aiwiki lint --fix-empty-dirs --json --path <workspace>
aiwiki ingest-file --file <file> --path <workspace>
aiwiki ingest-agent --stdin --path <workspace>
aiwiki status --path <workspace>
aiwiki query <topic> --path <workspace>
aiwiki context <topic> --path <workspace>
aiwiki show <topic> --path <workspace>
```

只有当对应 AIWiki 命令无法回答问题时，才退回 `rg`、`find`、直接读文件或临时脚本；退回时说明哪个 AIWiki 命令不够用以及原因。

## Core Intent Matrix

以下矩阵是自然语言请求匹配 AIWiki 命令的统一合同。公开文档可以使用更短的场景说明，但不得改变首选命令、结果解释和 fallback 边界。

| 用户意图 | 首选命令 | 输出解释 | fallback 条件 |
| --- | --- | --- | --- |
| 安装、初始化或修复工作区 | `aiwiki setup --path <workspace> --yes`，然后 `aiwiki agent check --path <workspace> --json`、`aiwiki doctor --path <workspace>` 和 `aiwiki status --path <workspace>` | 说明工作区是否就绪、根指导是否 current、诊断结果和下一步动作 | 命令不可用时说明环境问题；不要先手工修改工作区结构 |
| 同步、升级或修复宿主 Agent 接入 | `aiwiki agent check --json`、`aiwiki agent sync --dry-run`，再执行 `aiwiki agent sync --yes` | 说明 `installed`、`current`、`different`、备份路径和是否需要重启/重载 | 不支持的宿主不得自动写入；使用 `aiwiki prompt agent` 作为手工接入入口 |
| 入库本地文件或宿主 Agent 已读取的资料 | `aiwiki ingest-file --file <file>` 或 `aiwiki ingest-agent --stdin` | 汇报入库状态、Wiki Entry 质量、Source Card、Processing Summary 和 warning | 无法读取的来源使用 failed-fetch payload 留痕；不能要求用户写入或保存 payload |
| 查询、引用或复用本地知识 | 人类可读结果用 `aiwiki query <topic>`，Agent JSON 用 `aiwiki context <topic>`；单个来源包用 `aiwiki show <topic>` 或 capsule view | 回答前读取 `result_quality`、`recommended_next_action`、来源和已知缺口 | 先尝试对应 AIWiki 命令；仅在命令不足时使用文件搜索，并说明原因 |
| 检查、整理或安全修复工作区 | `aiwiki lint --json`；仅在允许且只有安全修复时执行 `aiwiki lint --fix-empty-dirs --json`，再运行 `aiwiki lint --json` | 解释 error、warning、安全修复范围和 lint 报告路径 | 非安全问题保留为可追踪复核项；不要默认手工修改 Markdown |
| 显式 extension 管理 | 列表使用 `aiwiki plugin list --json --path <workspace>`；仅添加用户提供的目录 `aiwiki plugin add <directory> --path <workspace>`；仅启用用户提供的精确 ID `aiwiki plugin enable <id> --path <workspace>` | 汇报命令结果和精确 extension 状态 | 对“找个插件”“自动选择 skill”“启用合适扩展”这类模糊请求，要求明确动作、目录或 ID；不要自动发现、启用或执行 |

## Schema Compatibility Boundary

保持现有命令优先的意图映射不变。`aiwiki.context.v1` 与 `aiwiki.context.capsule.v1` 仍是受支持的 Agent JSON 输出；历史工作区 `schema_version: 1` 仍按 `aiwiki.workspace.v1` 读取且不回写。未知未来 schema 主版本只能人工复核，不存在 CLI 迁移路径。详见 [Schema Compatibility](schema/README.zh-CN.md)。

CORE-0404 提供仅声明的 Extension API v0.1。CORE-0405 只提供显式 extension 管理：`aiwiki plugin list`、`aiwiki plugin add <directory>`、`aiwiki plugin enable <id>`。CORE-0407 锁定该匹配边界：不要从普通自然语言推断这些命令、自动发现 extension、自动启用 extension、自动执行 extension，也不要把 Host 描述成 sandbox。精确映射见随包交付的 `skill/EXTENSION_PROTOCOL.md`。

## 显式 Extension 意图

只有在用户明确提出 extension 管理请求时才使用这些命令。列出使用 `aiwiki plugin list --json --path <workspace>`；只添加用户提供的目录 `aiwiki plugin add <directory> --path <workspace>`；只启用用户提供的精确 ID `aiwiki plugin enable <id> --path <workspace>`。对于模糊请求，要求用户给出明确动作以及所需目录或 ID；不要自动扫描、选择、启用或执行 extension。

## 合同测试矩阵

CORE-0406 建立该维护者验证入口：变更 Core 兼容边界时运行 `npm run test:contracts`。该套件覆盖 `public-api.test.ts`、`cli-compatibility.test.ts`、`skill-matching.test.ts`、`extension-api.test.ts`、`schema-compatibility.test.ts`、`extension-failure-isolation.test.ts` 和 `release-gate.test.ts`。`skill-matching.test.ts` 会在外部消费者环境安装打包后的包，验证完整 Skill bundle 同步、工作区指导与显式 extension 意图。`release-gate.test.ts` 锁定 Core 0.4 的包清单、双语发布路径和对外交付边界。该套件只验证已文档化的公开导入与显式 Core CLI 命令面；不会引入 Pro 行为、extension 自动发现、自动启用或自动执行。可重建性覆盖延期到 `CORE-0501`，届时才具备可重建状态模型。

## 入库流程

1. 读取 URL、文件、笔记、附件或用户粘贴的正文。
2. 如果存在 `_system/purpose.md`，先阅读并判断资料是否适合该知识库。
3. 生成 `aiwiki.agent_payload.v1`，包含 `source` 和 `request`。
4. 能理解来源时，尽量提供 `analysis` 或 `wiki_entry`。
5. 不要在 payload 中包含输出路径。
6. 如果读取失败，设置 `source.fetch_status` 为 `failed`，并写明 `source.fetch_notes`。
7. 优先通过 stdin 调用：

```bash
aiwiki ingest-agent --stdin
```

如果当前 shell 或助手桥接不能保证 UTF-8 stdin，写入 UTF-8 JSON 文件后调用：

```bash
aiwiki ingest-agent --payload <utf8-json-file>
```

## 用户回复

CLI 运行后，读取输出并汇报：

- 入库状态
- 来源标题或 URL
- 摘要
- Wiki Entry 路径
- Wiki Entry 质量模式
- Source Card 路径
- Processing Summary 路径
- warning

推荐成功回复：

```text
AIWiki 已完成入库，并创建 Wiki 条目。
质量：<wiki_entry_quality> / <wiki_entry_generation_mode>
摘要：<summary>
Wiki 条目：<wiki_entry>
资料卡：<source_card>
处理记录：<processing_summary>
```

如果 `wiki_entry_quality` 是 `scaffold`，要说明它只是可追踪脚手架，仍需要助手继续补全高质量知识提炼。

## 查询协议

用户问 AIWiki 里某个主题时，调用：

```bash
aiwiki context "<topic>"
```

默认 context 保持 `aiwiki.context.v1`，用于兼容已有助手集成。需要按来源对象组织答案时，显式调用 capsule 视图：

```bash
aiwiki context "<topic>" --view capsule
```

用户要求查看来源包、来源链路、生命周期状态或 OKF readiness 时，使用：

```bash
aiwiki show "<topic>"
aiwiki show --id <capsule_id>
aiwiki show --artifact-path <artifact.md> --path <workspace>
```

读取 capsule context 时，先看：

- `capsules`
- `result_quality.has_primary`
- `result_quality.okf_ready_count`
- `missing_context`
- 每个 capsule 内的 lifecycle warnings 和 OKF readiness warnings

不要默认扫描 `02-raw`，除非 Wiki 结果不足、用户要求核对原文，或来源之间有冲突。

## Lint 协议

用户要求检查、整理或 lint 知识库时，先调用：

```bash
aiwiki lint --json
```

只有在用户要求深层健康检查、发布前验证或 Source Capsule 校验时，才运行 capsule 相关检查：

```bash
aiwiki lint --capsules --json
aiwiki lint --lifecycle --json
aiwiki lint --okf --json
aiwiki lint --strict --json
```

如果 `safe_fixes.only_safe_fixes` 为 true 且用户允许整理：

```bash
aiwiki lint --fix-empty-dirs --json
aiwiki lint --json
```

当前唯一自动安全修复是 `remove_empty_optional_dir`，只能删除已知且为空的可选增强目录。

## 升级和修复接入

用户要求安装、更新、升级或修复 AIWiki 接入时，运行：

```bash
aiwiki agent sync --yes
aiwiki setup --path <workspace> --yes
aiwiki agent check --json
aiwiki agent check --path <workspace> --json
```

Skill 同步会保留目标 Skill 目录中原有的无关文件。Claude Code 仍使用手工 `AGENT_HANDOFF.md` 提示；受支持的 Skill 宿主接收完整打包 `skill/` 目录。同步后汇报目标路径、每个备份路径和是否需要重启或重新加载助手。

## 禁止事项

- 不要让用户手动保存 payload。
- 不要让用户每次输入 `--path`。
- 不要声称 AIWiki 会抓网页。
- 不要声称 AIWiki 在没有助手分析字段时会自动生成高质量总结。
- 不要替用户安装 Dataview。
- 不要修改 `.obsidian`、`community-plugins.json` 或 Obsidian 插件配置。
