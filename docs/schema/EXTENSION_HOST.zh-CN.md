# AIWiki Extension Host v0.1

## 范围

显式 Host 管理兼容标记为 `aiwiki.extension.v1` 的 extension。它支持固定的 bundled catalog 和由用户显式添加的本地 extension 目录；不包含包自动发现、registry 下载、后台进程、scheduler、connector 或自动 Skill 匹配。

manifest 与 permission metadata 说明见 [Extension API schema](EXTENSION_SCHEMA.zh-CN.md) 和 [permission 声明](../plugins/PERMISSIONS.zh-CN.md)。

## Plugin 管理

所有管理操作都必须显式执行；适用时均可使用 `--path <workspace>`。完整的 subcommand 列表及 CLI 顺序如下：

```text
aiwiki plugin list [--path <workspace>] [--json]
aiwiki plugin inspect <id> [--path <workspace>] [--json]
aiwiki plugin add <directory> [--path <workspace>] [--json]
aiwiki plugin enable <id> [--path <workspace>] [--json]
aiwiki plugin disable <id> [--path <workspace>] [--json]
aiwiki plugin remove <id> [--path <workspace>] [--json]
aiwiki plugin doctor [--path <workspace>] [--json]
```

| 命令 | 读取或 import 行为 | 结果 |
| --- | --- | --- |
| `list` | 读取 registry-backed metadata；绝不 import extension entry。 | 人类可读状态列表，或 `aiwiki.plugin_status.v1` JSON。 |
| `inspect` | 读取静态 descriptor 与 state；绝不 import entry。 | 返回 descriptor、状态、声明 warning 与 note；JSON 使用 `aiwiki.plugin_inspection.v1`。 |
| `add` | 校验 `aiwiki-extension.json`；绝不 import entry。 | 只注册本地 metadata，并返回既有 action result 结构。 |
| `enable` | 重新读取并校验 metadata，随后 import 并校验指定 ESM module。 | 启用有效 extension、创建其 Host state root，并返回既有 action result 结构。 |
| `disable` | 只修改 metadata；绝不 import entry。 | 保留注册，但将 extension 标记为 disabled。 |
| `remove` | 只修改 metadata；绝不 import entry。 | 删除本地注册；bundled extension 不可删除。 |
| `doctor` | 读取静态 descriptor、manifest 与 state；绝不 import entry，也不写 state。 | 每个 extension 的报告；JSON 使用 `aiwiki.plugin_doctor.v1`，不健康报告会以非零状态退出。 |

`inspect` 与 `doctor` 特意仅检查 metadata。对 disabled 的本地 extension，它们可以提示 runtime validation 将延后到 `enable`；检查和诊断本身不会执行 entry。

## 本地 manifest 与声明 metadata

每个本地 extension 目录包含 `aiwiki-extension.json`。`schema_version` 和必填的旧版 `api_version` 都必须精确为 `aiwiki.extension.v1`。可选的 `aiwiki_api` 是针对已实现 API `1.0.0` 的附加兼容范围；即使它存在，旧版 `api_version` 仍为必填，且必须保持精确的 `aiwiki.extension.v1`。

```json
{
  "schema_version": "aiwiki.extension.v1",
  "id": "example.local-quality",
  "name": "Local quality extension",
  "version": "0.1.0",
  "api_version": "aiwiki.extension.v1",
  "aiwiki_api": "^1.0.0",
  "entry": "index.mjs",
  "capabilities": ["command", "lint_rule"],
  "permissions": ["workspace:read"]
}
```

ID 只能使用小写标识符。`entry` 必须是解析后仍位于 extension 根目录中的相对 `.js` 或 `.mjs` 文件；绝对路径、路径穿越和 symlink 逃逸都会被拒绝。`capabilities` 与 `permissions` 是在 manifest 处理和 enable 时审计的声明 metadata；它们不授予被注入的运行时权限。可接受的 capability 和 permission vocabulary 见 [Extension API schema](EXTENSION_SCHEMA.zh-CN.md) 与 [permission 声明](../plugins/PERMISSIONS.zh-CN.md)。

## 运行边界

Host 只运行 command 与 lint-rule callback。command 只接收 argv token。lint rule 只接收没有绝对路径和完整正文的只读 vault 相对 artifact snapshot。command 与 lint callback 都不接收 writer，本工作也不创建 draft 写入路径。
这不是一个 sandbox：本地加载的 module 仍可直接 import Node API 或调用 `fetch`；声明 permission 不授予被注入的 capability。

`context_provider` 与 `artifact_generator` 在当前 Host 中仍仅为声明 capability。`inspect`、`doctor`、command 执行、lint evaluation 以及任何新增路径都不会调用它们。

Core command root 被保留。extension command 不能覆盖 Core command，也不能覆盖另一个已启用 extension command。

## Disable 与 remove 生命周期

`disable` 只修改 metadata，并且具备幂等性：它在不加载 entry 的情况下记录 disabled state。当不存在既有 failure reason 时，用户 disable 会记录 `disabled by user`；已有的 failure reason 会保留。`enable` 是可恢复转换：根因修复后，成功 enable 会恢复 enabled metadata。

Registry 是单一、不可变的合并 revision stream：`.aiwiki/extensions/revisions/<N>.json` 同时保存 installed registration 和生命周期 state。读取端选取已发布的最高数字 revision。写入端先创建完整的临时 revision，再用不可替换的 `fs.link` 发布；遇到 `EEXIST` 时重新读取并在有限次数内重试。已发布 revision 永不修改或删除。旧的 `installed.json` 与 `enabled.json` split registry 仅用于 bootstrap：两个文件都存在时发布为 revision `0`；两者都不存在时空 registry 合法。

`remove` 仅适用于已注册的本地 extension，并在一个合并 revision 中原子地移除 registration 和生命周期 state。`disable` 与 failure isolation 同样发布完整的合并 state transition。remove 不会删除本地 extension source directory，也不会删除 `.aiwiki/extensions/state/<extension-id>/`；source 与 Host state 会保留，以便恢复或检查。bundled id 和未知 id 都会在修改前被拒绝。加载、声明校验、command 执行或 lint callback 失败时，会在新 revision 中记录 disabled reason；Core command 和健康 extension 仍继续运行。

## Skill 边界

这些是显式管理命令，不新增自然语言 extension intent 或自动匹配。文档定义的 Skill 匹配优先级、fallback 与验收边界保持不变。
