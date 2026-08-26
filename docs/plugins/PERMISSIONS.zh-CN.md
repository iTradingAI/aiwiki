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

## 插件签名提案

> 这仅是提案；本版本未实现任何签名验证。

本提案描述未来插件供应链的信任边界；它不改变当前仅声明的 permission model，也不会启用新的 runtime capability。

1. **威胁模型与现有缺口。** 设计必须应对 supply-chain attack、被替换或篡改的 plugin package，以及 malicious extension。当前本地 plugin directory 和其声明的 entry 在没有 publisher authentication 或 cryptographic content verification 的情况下即被信任；这正是本提案要弥补的信任缺口。
2. **方案方向与密钥管理。** 预期方向是 asymmetric signing：publisher 使用保存在 secure storage 中的 private key 对 release identity 签名，verifier 使用对应 public key。后续设计必须规定 key generation、access control、backup、丢失处置和 retirement，不能把 digest 本身当作签名系统。
3. **信任根。** 信任根必须来自受控配置和 trusted registry，并通过已认证的方式分发和更新。设计必须定义 root rotation，以及 old root 和 new root 交接的失败语义；交接未验证、不可用或不一致时，必须 fail closed。
4. **发布者授权。** 已验证的 publisher identity 与其获授权的 signing key 必须绑定到特定 plugin ID 和 version namespace。并未获该 namespace 授权的 key 即使具有有效签名，也不得授权该 release。
5. **签名身份与覆盖范围。** 签名必须覆盖 canonical manifest 和完整可执行 payload closure，其中包括 entry module hash，以及每个能够影响执行的 executable module 或 asset。验证必须识别精确的 immutable bytes，而不只是 package label 或 top-level manifest。
6. **撤销权威与格式。** 设计必须指定权威的 revocation source，并定义经认证的 revocation data format，例如已签名的 revocation list 或 CRL；其中包含 publisher/key/release identifier、reason、issuance metadata，以及有权发布该数据的 authority。
7. **撤销分发与数据不可用。** 撤销数据必须具有经认证的分发路径，并明确 offline、unavailable 和 expired-data 行为。当 policy 要求当前撤销信息而无法确认其 freshness 时，验证必须 fail closed，不得静默使用 stale 或缺失的数据。
8. **密钥轮换交互。** key-rollover protocol 必须说明 verifier 如何识别 old key 和 new key、如何认证其 overlap，以及 old key 何时失效。签名验证必须将该 protocol 与 trust-root 和 revocation state 一并应用。
9. **导入前的 fail-closed 验证。** 每一次 enable 或 import 都必须在 module import 前即时验证 immutable bytes，验证失败必须 fail closed。`add` 接收可变的 directory，而 load 会直接 import 声明的 `entryPath`；因此不能仅在 add 时验证。验证与 import 之间出现内容变异、不完整 payload closure、读取不匹配或 time-of-check/time-of-use race 时，必须阻止 import。
10. **单调版本与新鲜度。** 已签名 metadata 和经认证的 revocation state 必须携带 issue time、expiry、sequence，以及单调 version 或 epoch。设计必须规定最大可接受龄期，在 replay 或 stale data 时 fail closed，并抵抗本地 state rollback，防止旧的 signed release 或 revocation view 重新获得授权。
11. **降级防护。** 当 signed policy 适用时，验证必须防止回退到 unsigned release 或其他防护更弱的 prior release。兼容性处理绝不能创建一条将受保护 plugin 静默降级为 unsigned trust 的路径。
12. **渐进 rollout 与失败行为。** 采用必须分阶段进行，并明确定义 compatibility state、operator migration step，以及 legacy plugin、registry 和 client 的失败行为。要求签名的 state 必须拒绝 invalid、missing 或 unverifiable signature；不得静默放宽为 unsigned execution。

这仅是提案；本版本未实现任何签名验证。
