# 更新日志

本日志记录面向使用者的公开版本历史。只有同时验证仓库 tag 与 npm 产物映射后才会列出两类证据；仅存在于 registry 的历史会单独标注。

## [0.7.1] - 2026-08-10

- 修复 MCP 客户端配置文档：添加 `mcpServers` 包装格式、`npx` 用法和绝对路径示例，覆盖 Claude Desktop、Cline 和其他 MCP 客户端。
- 在 README.md、README.zh-CN.md、USAGE.md 和 USAGE.zh-CN.md 中新增 MCP 快速上手说明。

## [0.7.0] - 2026-08-10

- 在 `aiwiki.public.v1` 中新增稳定 SDK 导出：query、show、health、lifecycle、relationship 和 graph-context 操作。
- 新增零运行时依赖的 MCP server：提供 6 个工具，通过 stdio 实现手写 JSON-RPC 2.0，并使用 `2025-06-18` 协议版本。
- 新增 Agent Contract 文档，说明 AIWiki 与宿主 Agent 的集成合同。

本条目描述当前源码版本。在发布门槛完成前，不声称已经存在对应 tag、GitHub Release 或 npm 产物。

## [0.6.0] - 2026-08-10

- 新增四套随包发布的工作流：研究、写作、决策、审查 / 复盘；每套均提供有序命令路径、预期输出、安全 fallback 与可运行的公开试用场景。
- 新增公开试用场景示例，演示如何在 AIWiki 工作区中执行这些工作流。
- 随包 Skill 现将明确的研究、写作、决策、审查和复盘请求路由到对应工作流指引。
- 已将工作流与公开试用场景文档纳入发布包内容。
- CLI 行为、JSON 键、schema 标识符、枚举值和匹配优先级保持不变。

本条目描述当前源码版本。在发布门槛完成前，不声称已经存在对应 tag、GitHub Release 或 npm 产物。

## [0.5.1] - 2026-07-26

- 将当前版本声明、随包 Skill 标记、升级说明和中英文公开文档统一为 0.5.1。
- 新增双语更新日志和私密漏洞报告政策。
- 将公开发布说明与维护者发布手册分开，并从使用者文档移除内部任务编号；命令行为和 JSON 合同不变。
- 在替代站点通过就绪门槛之前，继续以 `https://maxking.cc/aiwiki` 作为规范主页。

本条目描述当前源码版本。在发布门槛完成前，不声称已经存在对应 tag、GitHub Release 或 npm 产物。

## [0.5.0] - 2026-07-20

### 新增

- 可删除的派生状态快照，以及显式的 dry-run、check 和 rebuild 流程。
- 结构化索引和确定性关系图；两者都只在用户明确要求时构建。
- 显式开启的 `aiwiki.context.v2` 关系图视图；默认 Agent 输出继续使用 `aiwiki.context.v1`。
- 只读知识健康检查和修复计划合同，以及显式的健康报告生成：只更新 dashboard 受控区块并写入不可变运行记录。

### 兼容性

- Markdown 仍是事实来源；派生状态缺失或过期不会禁用日常检索。
- 既有 Context v1 和 capsule 合同保持稳定。
- 不会自动构建索引或关系图，也不新增 extension 自动发现、schedule 或 watcher。

### 已验证发布证据

- 注释 tag 对象：`v0.5.0`，OID 为 `051581321dec480cb5025b32a555f4cae37eb1c5`。
- tag 对应源码 commit：`b2f38e61f485c99700929c80479c7217eb0c00cc`；其中 `package.json` 声明 `0.5.0`。
- npm 产物：`@itradingai/aiwiki@0.5.0`，SHA-1 为 `e4b0f2a5caf558671df21b952326ad1a839b94bf`，integrity 为 `sha512-hEv7yjRJztWwl/Nc/p1bDY5e/kujWSCgT4QA4kNIzIzzRhHPo20M1aFkcgfQ8oiTecR+OOwIoHuPP+K1rYeU1w==`。

## [0.4.0] - 2026-07-17

### 新增

- 稳定的 ESM 公开入口：包根入口、contracts 和仅声明的 Extension API。
- 旧工作区版本 1 的 schema 兼容读取，以及未知未来主版本的人工复核边界。
- 显式的本地 extension 管理和失败隔离；不会自动发现、启用、执行或按自然语言匹配 extension。
- 命令注册表，以及针对 CLI、公开类型、schema、extension 和完整 Skill bundle 的已安装包合同覆盖。

### 兼容性

- 既有 `aiwiki.context.v1` 与 `aiwiki.context.capsule.v1` JSON 合同保持稳定。
- 旧工作区继续可读，不会自动迁移或回写 frontmatter。
- package export map 继续拒绝内部深层导入。

### 已验证发布证据

- 注释 tag 对象：`v0.4.0`，OID 为 `320d47c5c6116effb05bf1d88b5e706cef70a46c`。
- tag 对应源码 commit：`be10c5bdbdb3125c32e64f386c066ad876f60f18`；其中 `package.json` 声明 `0.4.0`。
- npm 产物：`@itradingai/aiwiki@0.4.0`，SHA-1 为 `02898907202e31df3268bcc602ca11b33df6014f`，integrity 为 `sha512-ZePAQNSI16UPafJvKmm9sSF3pt7VSFrjFOqSvE1pwMfXfDm+K/2nx+ANR/ehx52F5yHd/jA8mCLJIorZRVNTuQ==`。

## 0.3.0 registry 历史

Source Capsule、面向用户的 capsule 默认查询视图、显式 capsule context，以及需要主动开启的 capsule/lifecycle/OKF 检查，都在 0.3.0 版本线引入。npm registry 中存在该版本，但这里不声称它具有已验证的仓库 tag 映射；本节只是历史背景，不代表当前版本。
