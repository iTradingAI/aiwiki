# AIWiki Extension API v0.1

## 范围

公开的作者入口是 <code>@itradingai/aiwiki/extension-api</code>，兼容标记为 <code>aiwiki.extension.v1</code>。Extension API v0.1 只定义声明合同；它不会加载扩展、增加 CLI 命令、发现包、注册调度器或写入工作区。

扩展声明 id、name、version、apiVersion，以及可选的 command、lint rule、context provider、artifact generator 数组。<code>defineExtension()</code> 原样返回声明；它不验证、不执行、不注册、不复制也不冻结 callback。

## 作者接口

| 接口 | 输入 | 输出 | 边界 |
| --- | --- | --- | --- |
| Command | 只读 argv token | exit code，以及可选 stdout、stderr、JSON | 不提供 CliStreams、parser、command matcher 或 Core handler。 |
| Lint rule | 只读 artifact snapshot | 只读 lint finding | 不提供 safe fix、报告写入或文件修改。 |
| Context provider | query、可选 limit/filter、只读 artifact snapshot | 带 namespace 的 context fragment | 不修改 <code>aiwiki.context.v1</code> 或 Core 排序字段。 |
| Artifact generator | request 与只读 artifact snapshot | 带 suggested path 的 artifact draft | draft 不是文件系统写入授权。 |

snapshot 使用 vault 相对路径、受限的 artifact kind、role、visibility 值、JSON 兼容 metadata 和可选正文摘要。它不要求绝对路径、完整文件正文、parser 对象或 Core 运行时状态。

## 能力边界

API 不注入 network client、process executor、scheduler、connector runtime、可写 stream、filesystem writer 或 Core state mutator。它不是一个 sandbox：本地加载的 JavaScript 仍可自行导入能力。权限策略、允许的模块加载、输入投影、路径验证、draft 处理和失败隔离属于 CORE-0405。

CORE-0404 不提供 extension manifest 格式、local 或 bundled loader、plugin command、自动发现、后台进程或 extension state directory。

## 兼容性

- 当前启用的合同标记是 <code>aiwiki.extension.v1</code>。
- 在此 major 版本中，只有新增字段才是兼容的 extension contract 变更。
- 公开扩展只能导入 package export-map 路径。<code>src</code> 或 <code>dist/src</code> 下的深层导入不受支持，并以 <code>ERR_PACKAGE_PATH_NOT_EXPORTED</code> 失败。
- CORE-0404 不创建持久化的 Workspace 或 Markdown extension schema，也不新增 migration 路径。

## Skill 匹配边界

Extension API v0.1 不创建用户可见命令，也不创建自动自然语言 Skill 匹配。宿主 Agent 必须继续使用既有 command-first intent matrix。CORE-0407 负责 extension 相关意图示例、优先级、fallback 行为和匹配验收测试。
