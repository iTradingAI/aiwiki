# AIWiki Extension API v0.1

## 范围

公开的作者入口是 <code>@itradingai/aiwiki/extension-api</code>，兼容标记为 <code>aiwiki.extension.v1</code>。Extension API v0.1 定义声明；它本身不加载 extension、不增加 CLI command、不发现 package、不注册 scheduler，也不写入 workspace。

当前的显式 Host 见 [Extension Host v0.1](EXTENSION_HOST.zh-CN.md)。permission 声明及其信任边界见 [permission 声明](../plugins/PERMISSIONS.zh-CN.md)。

## Core 1.0 合同冻结

### declaration-only v0.1 的正式偏差

Core 1.0 正式记录相对于源计划 Extension API 1.0 的偏差：Extension API v0.1 只冻结声明。兼容标记保持 <code>aiwiki.extension.v1</code> 不变，面向作者的类型、接口和文档保持稳定。Core 范围内不实现 <code>contextProviders</code> 或 <code>artifactGenerators</code> 的生产调用；只有 Pro 赛道恢复后才能重新开放该决策。

Plugin signing 是移交给后续 Core 文档与迁移任务的提案需求。本 Core 1.0 工作不实现任何签名行为、签名格式、验证、密钥处理或 signing CLI 接口。

## Manifest 兼容性

本地 `aiwiki-extension.json` 需要以下旧版字段：

```json
{
  "schema_version": "aiwiki.extension.v1",
  "id": "example.research-workflow",
  "name": "Research Workflow Pack",
  "version": "0.1.0",
  "api_version": "aiwiki.extension.v1",
  "entry": "index.mjs"
}
```

`schema_version` 与 `api_version` 都是必填项，且必须精确等于 `aiwiki.extension.v1`。即使使用下列可选的附加字段，旧版双标记规则仍然必须保留：

| JSON 字段 | 含义 |
| --- | --- |
| `aiwiki_api` | 可选 API 兼容范围，按已实现版本 `1.0.0` 计算。它不能替代必填的 `api_version`。 |
| `capabilities` | 可选的声明 capability 名称数组。 |
| `permissions` | 可选的声明 permission token 数组。 |

支持的 `aiwiki_api` grammar 为精确的 `x.y.z` 版本、如 `^1.0.0` 的 caret range、如 `~1.0.0` 的 tilde range，或如 `>=1.0.0 <2.0.0` 的空格分隔 comparator bound。未支持或格式错误的表达式会被拒绝。不含所有可选字段的 manifest 仍与旧版合同兼容。

capability vocabulary 为 `command`、`lint_rule`、`context_provider` 和 `artifact_generator`。permission vocabulary 为 `workspace:read`、`workspace:write:<path>`、`state:read` 和 `state:write`；安全 write path 规则和 advisory 模型见 [permission 声明](../plugins/PERMISSIONS.zh-CN.md)。

## 作者接口

| 接口 | 输入 | 输出 | 当前 Host 行为 |
| --- | --- | --- | --- |
| Command | 只读 argv token | exit code，以及可选 stdout、stderr、JSON | 只在显式 enable 和 command dispatch 后调用。不提供 writer。 |
| Lint rule | 只读 artifact snapshot | 只读 lint finding | 只在 enabled extension 的 lint evaluation 期间调用。不提供 writer。 |
| Context provider | query、可选 limit/filter、只读 artifact snapshot | 带 namespace 的 context fragment | 仅为声明；当前 Host 不调用。 |
| Artifact generator | request 与只读 artifact snapshot | 带 suggested path 的 artifact draft | 仅为声明；当前 Host 不调用；不存在 draft 写入路径。 |

<code>defineExtension()</code> 原样返回声明；它不验证、不执行、不注册、不复制也不冻结 callback。snapshot 使用 vault 相对路径、受限的 artifact kind、role、visibility 值、JSON 兼容 metadata 和可选正文摘要。它不要求绝对路径、完整文件正文、parser 对象或 Core runtime state。
这不是一个 sandbox：本地加载的 module 仍可直接 import Node API 或调用 `fetch`；声明不授予被注入的 capability。

`context_provider` 与 `artifact_generator` 不会由 `inspect`、`doctor`、command 执行、lint evaluation 或任何新增路径调用。

## Plugin 管理

显式 Host 的完整 subcommand 列表如下：

```text
aiwiki plugin list [--path <workspace>] [--json]
aiwiki plugin inspect <id> [--path <workspace>] [--json]
aiwiki plugin add <directory> [--path <workspace>] [--json]
aiwiki plugin enable <id> [--path <workspace>] [--json]
aiwiki plugin disable <id> [--path <workspace>] [--json]
aiwiki plugin remove <id> [--path <workspace>] [--json]
aiwiki plugin doctor [--path <workspace>] [--json]
```

`list`、`inspect`、`add`、`disable`、`remove` 与 `doctor` 只处理 metadata，不 import extension entry。`enable` 是唯一会 import 指定 ESM module 的管理操作。`inspect` 返回 `aiwiki.plugin_inspection.v1` JSON，`doctor` 返回 `aiwiki.plugin_doctor.v1` JSON；doctor 会报告每个 extension，报告不健康时以非零状态退出。

disable 记录 metadata，并可由成功的 enable 反转。remove 会在一个不可变的组合 revision 中原子移除本地 extension 的 registration 与 lifecycle entry，因此不会观察到中间状态；它保留本地 source directory 和 Host state directory。bundled extension 不可 remove。Host 读取最高 numeric revision。revision 先在临时文件中完成，再通过无替换的 `fs.link` 发布；遇到 `EEXIST` 竞争时有限重试，已发布 revision 绝不修改或删除。`installed.json` 与 `enabled.json` 仅作为 bootstrap 的 legacy input。

## 兼容性与 Skill 边界

- 在此 major 版本中，只有新增字段才是兼容的 extension contract 变更。
- 公开 extension 只能导入 package export-map 路径。<code>src</code> 或 <code>dist/src</code> 下的深层导入不受支持，并以 <code>ERR_PACKAGE_PATH_NOT_EXPORTED</code> 失败。
- Extension API v0.1 不创建持久化的 Workspace 或 Markdown extension schema，也不新增 migration 路径。
- Extension API v0.1 不创建用户可见 command，也不创建自动自然语言 Skill match。Host assistant 必须继续使用既有 command-first intent matrix，并保留文档定义的 extension intent 优先级、fallback 行为和 matching acceptance boundary。
