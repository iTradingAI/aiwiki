# Extension permission 声明

Extension manifest 使用兼容标记 `aiwiki.extension.v1`。其中的 `permissions` 与 `capabilities` 字段是 metadata 声明，而不是被注入的 handle。Host 会在处理 manifest 和 enable extension 时审计这些声明；其默认行为是不向 command 或 lint callback 提供 filesystem、process、network、scheduler、Core-state、draft 或 writer capability。

> declared-permission audit + no-injection default; NOT a runtime OS sandbox

manifest 字段规则见 [Extension API schema](../schema/EXTENSION_SCHEMA.zh-CN.md)；metadata-only 管理规则见 [Extension Host](../schema/EXTENSION_HOST.zh-CN.md)。

## 精确 token vocabulary

只接受以下 permission token：

| Token | 声明范围 |
| --- | --- |
| `workspace:read` | workspace 的读取声明。 |
| `workspace:write:<path>` | 一个安全 workspace-relative root 的写入声明。 |
| `state:read` | extension 的 Host-managed state 的读取声明。 |
| `state:write` | extension 的 Host-managed state 的写入声明。 |

不存在 `network` 或 `process` token。`workspace:write:<path>` 的 root 必须非空、相对且使用 forward slash 分隔；它不能是绝对路径、drive-qualified 路径、包含 backslash 的路径，也不能有空、`.` 或 `..` segment。

capability vocabulary 是 `command`、`lint_rule`、`context_provider` 和 `artifact_generator`。Host 可以报告 advisory 声明不匹配，包括未声明 `artifact_generator` 却声明 workspace-write、声明 `artifact_generator` 却没有 workspace-write，以及 provider 和 generator capability 当前仅为声明的状态。

## Advisory 边界

声明不会阻止本地 module 直接 import `node:fs` 或 `node:child_process`，也不会阻止其直接调用 `fetch`；声明同样不会授予这些访问能力。command 与 lint callback 不接收 writer。本工作不创建 draft mediation 或 draft 写入路径。

当前 Host 只调用已 enable 的 command 与 lint-rule callback。`context_provider` 与 `artifact_generator` 仍仅为声明，不会被 `inspect`、`doctor`、command 执行、lint evaluation 或任何新增路径调用。

## Plugin 管理

完整的显式 subcommand 列表如下：

```text
aiwiki plugin list [--path <workspace>] [--json]
aiwiki plugin inspect <id> [--path <workspace>] [--json]
aiwiki plugin add <directory> [--path <workspace>] [--json]
aiwiki plugin enable <id> [--path <workspace>] [--json]
aiwiki plugin disable <id> [--path <workspace>] [--json]
aiwiki plugin remove <id> [--path <workspace>] [--json]
aiwiki plugin doctor [--path <workspace>] [--json]
```

`list`、`inspect`、`add`、`disable`、`remove` 与 `doctor` 会在不 import entry 的情况下检查或修改 metadata。`enable` 是唯一会 import 指定 ESM module 的管理 command。`inspect` 与 `doctor` 是 static-descriptor 检查；`doctor` 报告 manifest 与声明问题，但不写 state。
