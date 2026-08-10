# Research Workflow Pack

Research Workflow Pack 是用于 source-backed research 检查的 command-and-lint-only extension。它使用 extension 兼容标记 `aiwiki.extension.v1`；其两个声明 capability 恰好是 `command` 与 `lint_rule`，声明 permission 恰好是 `workspace:read`。

它不声明 `context_provider` 或 `artifact_generator`。这些 capability 名称在当前 Host 中仍仅为声明，`inspect`、`doctor`、command 执行、lint evaluation 和任何新增路径都不会调用它们。command 与 lint rule 不接收 writer；此 pack 不创建 draft 写入路径。

声明 permission 的边界见 [permission 声明](PERMISSIONS.zh-CN.md)。manifest 与生命周期规则见 [Extension API schema](../schema/EXTENSION_SCHEMA.zh-CN.md) 和 [Extension Host](../schema/EXTENSION_HOST.zh-CN.md)。

## 随附 variant

| Variant | Id | 位置 | 注册方式 |
| --- | --- | --- | --- |
| Bundled | `aiwiki.research-workflow` | AIWiki 固定 catalog 内置 | 已可用；必须显式 enable。 |
| On-disk example | `example.research-workflow` | `examples/plugins/research-workflow` | 必须显式 add 其目录，再 enable。 |

两个 id 不同，但两个 variant 都公开相同的 research-workflow command path。一次只能选择一个 variant：已 enable 的 extension command path 不能重叠。若其中一个已 enable，先 disable 它，再 enable 另一个。

## 行为

显式 enable 后，pack 提供 `research-workflow inspect` 与 `research-workflow status`。它们返回普通 extension command result，说明 pack 的可用或 enabled 状态，并标识 `command` 与 `lint_rule` capability，以及 `workspace:read` 声明 permission。

其 lint rule 会针对每个缺少 `source_url` 的 research artifact 报告 warning。finding 是扁平且经过校验的 lint finding，使用 `research_workflow` category、缺少 source 的 message、添加 `source_url` 的 suggestion，并在存在时包含 vault path。

## 安装或选择 variant

完整的显式管理 subcommand 列表如下：

```text
aiwiki plugin list [--path <workspace>] [--json]
aiwiki plugin inspect <id> [--path <workspace>] [--json]
aiwiki plugin add <directory> [--path <workspace>] [--json]
aiwiki plugin enable <id> [--path <workspace>] [--json]
aiwiki plugin disable <id> [--path <workspace>] [--json]
aiwiki plugin remove <id> [--path <workspace>] [--json]
aiwiki plugin doctor [--path <workspace>] [--json]
```

### Bundled variant

bundled id 已出现在 `list` 中；不要为它 add 目录。

```text
aiwiki plugin inspect aiwiki.research-workflow --path <workspace>
aiwiki plugin enable aiwiki.research-workflow --path <workspace>
```

`inspect` 与 `doctor` 只读取 static descriptor，绝不 import entry。`enable` 是唯一会 import 并校验指定 ESM module 的管理 command。若不再使用 bundled variant，运行 `disable`；`remove` 会拒绝 bundled id。

### On-disk example

添加随包 example directory，随后 enable 其不同的 id：

```text
aiwiki plugin add examples/plugins/research-workflow --path <workspace>
aiwiki plugin inspect example.research-workflow --path <workspace>
aiwiki plugin enable example.research-workflow --path <workspace>
```

要切回 bundled variant，先 disable `example.research-workflow`，再 enable `aiwiki.research-workflow`。`remove example.research-workflow` 只注销 local metadata：它会保留 example source directory 和 `.aiwiki/extensions/state/example.research-workflow/`，因此以后可以再次 add。
