# 完整安全指南

AIWiki 是一个本地 CLI，会在调用方选择的路径下写入 Markdown、JSON、派生元数据和配置文件。本指南说明对仓库根目录漏洞报告政策的补充运行边界。

## 信任边界

### 工作区与本地文件

AIWiki 仅处理工作区或调用方显式提供的其他路径中的本地文件。工作区路径、其中的符号链接、生成的 Markdown 和所有输入 payload 在调用方审查前都应视为不可信。命令不构成读取或写入无关个人目录的授权；任何路径穿越、符号链接逃逸或写入显式目标之外路径的情况都应按安全问题调查。

### Agent 同步

Agent 同步是显式的本地操作。受支持的 Agent 集成文件在你运行 Agent-sync 命令或 `aiwiki setup`（会刷新工作区 AGENTS.md 指导块并先备份既有文件）时创建或更新。它不会自动发现、连接或同步 Agent。运行前请审查命令、目标工作区和将要修改的文件。

### Extension

Extension 在被显式 enable 前保持不活动状态。enable 是约束边界：它是唯一会 import 已声明 extension module 的管理操作。inspect、add、disable、remove 和 doctor 仅处理 metadata 或静态声明，不会 import 该 entry。加载或声明失败仅会使该扩展的 Host 生命周期记录被禁用或保持禁用。扩展模块在 AIWiki 主进程内以你的权限执行：在抛出失败之前发生的副作用不会被隔离或回滚。AIWiki 不是沙箱；只启用你信任的扩展。

## 零遥测政策

AIWiki 不包含遥测、分析或自动上报功能。它不会上传工作区内容、命令数据、标识符、诊断信息或派生元数据。所有知识库处理和配置写入均在本地完成。是否读取外部来源以及向 CLI 传递哪些内容，由宿主 AI 助手而非 AIWiki 决定。

## 供应链验证

安装或发布 npm 包时，请遵循以下步骤：

1. 从 npm registry 安装预期的包名和版本，优先使用已提交的 lockfile 与 `npm ci`。不得绕过 npm integrity 失败，也不得替换为未经验证的 tarball。
2. 发布前运行 `npm run release:check` 和 `npm pack --dry-run`。确认安装包同时包含根目录报告政策和两份完整安全指南，并检查文件清单是否出现意外的可执行文件或配置内容。
3. 发布后使用 `npm view @itradingai/aiwiki@<version> dist.tarball dist.integrity` 确认已发布包的名称、版本、tarball URL 和 integrity metadata。应通过 npm 安装或检查该精确的已发布产物，而不是信任复制的包目录。
4. 对本地 extension，请在显式 enable 前审查已声明 entry 及其 dependency closure。未来的加密验证路径见[插件签名提案](plugins/PERMISSIONS.zh-CN.md#插件签名提案)；它仅是提案，目前不提供签名验证。

发现疑似包替换、integrity 失败或意外 extension 执行时，请按 [SECURITY.zh-CN.md](../SECURITY.zh-CN.md) 中的私密漏洞报告流程提交。
