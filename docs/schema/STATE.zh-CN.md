# AIWiki 派生状态 v1

`<workspace>/.aiwiki/state/` 是可重建的派生状态缓存，不是事实来源；Markdown 和 frontmatter 仍然是唯一权威知识记录。

## 文件

一次显式 rebuild 会写入以下四个 JSON snapshot：

```text
.aiwiki/state/
  artifacts.json
  capsules.json
  relationships.json
  lifecycle.json
```

对应 schema 分别为 `aiwiki.state.artifacts.v1`、`aiwiki.state.capsules.v1`、`aiwiki.state.relationships.v1` 和 `aiwiki.state.lifecycle.v1`。

四个文件都使用同一 envelope：

```json
{
  "schema_version": "aiwiki.state.artifacts.v1",
  "snapshot_id": "sha256-derived-from-current-markdown",
  "generated_at": "2026-07-20T00:00:00.000Z",
  "root": ".",
  "summary": { "total": 0 },
  "data": []
}
```

`snapshot_id` 由当前 Markdown 派生内容稳定计算，四个文件共享同一个值。`generated_at` 和用于诊断的文件系统时间变化不会使未改动内容变为 stale。state descriptor 只保存 vault 相对路径和摘要，不保存 Markdown 正文或绝对路径。

## Rebuild 模式

```bash
aiwiki rebuild --path <workspace> --json
aiwiki rebuild --check --json
aiwiki rebuild --dry-run --json
```

| 模式 | 写入 | 结果 | 退出码 |
| --- | --- | --- | --- |
| 默认 | `.aiwiki/state/` 下四个 state 文件 | `rebuilt` | 0 |
| `--check` | 无 | `current`、`missing`、`stale` 或 `invalid` | 只有 `current` 为 0，其余为 1 |
| `--dry-run` | 无 | `would_rebuild` | 0 |

`--check` 与 `--dry-run` 不能同时使用。该命令不会修改 Markdown、frontmatter、dashboard、run 或用户内容。

## 一致性与恢复

- rebuild 在目标文件同目录创建独占 temporary file，再 rename 到最终路径。失败或 mixed snapshot 会被报告为 `invalid`，不会被静默视为 current。
- 默认 rebuild 持有 `<workspace>/.aiwiki/locks/rebuild.lock`。发生锁冲突时命令失败，不会删除或替换其他进程的锁。
- 不支持自动删除 stale lock、`--force`、自动 state repair、Markdown 重写或迁移命令。
- 可以安全删除 `.aiwiki/state/`，之后按需显式 rebuild。state 缺失时，Context、capsule context、show、lint 和 status 仍直接读取 Markdown。

只有用户明确要求检查或重建派生状态时，Agent 才使用 rebuild。日常 query、context、show、lint 和 status 不需要先 rebuild。

## 结构化索引

`.aiwiki/state/index.json` 是独立、可删除的结构化索引文件。`aiwiki rebuild` 不会创建、更新或校验它；应使用显式 `aiwiki index` 命令。

```bash
aiwiki index status --path <workspace> --json
aiwiki index build --path <workspace> --json
aiwiki index rebuild --path <workspace> --json
```

其 `aiwiki.index.v1` envelope 记录基于 Markdown 的 `source_snapshot_id`、vault 相对路径的 Artifact 记录、分类计数、来源 URL 重复计数和已解析的本地 wiki 链接。它不是语义或向量索引，也不保存 Markdown 正文、正文预览、绝对路径、外部 URL 目标或 embedding。

`index status` 为只读操作，报告 `fresh`、`missing`、`stale` 或 `invalid`；只有 `fresh` 的退出码为 0。`index build` 和 `index rebuild` 在持有 `.aiwiki/locks/index.lock` 时原子写入，不会修改 Markdown 或四个 rebuild snapshot。不要自动构建或重建索引，也不要从 query、context、show、lint、status、ingest 或泛化维护流程推断索引操作。索引缺失、过期或损坏时，仍可直接从 Markdown 检索。
