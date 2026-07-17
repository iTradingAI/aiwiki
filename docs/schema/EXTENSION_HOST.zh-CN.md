# AIWiki Extension Host v0.1

## 范围

CORE-0405 为公开的 `aiwiki.extension.v1` 作者合同启用最小 Host。它只支持显式 bundled catalog 和本地 extension 目录；不包含包自动发现、registry 下载、后台进程、scheduler、connector 或自动 Skill 匹配。

## 显式命令

```text
aiwiki plugin list --json
aiwiki plugin add <directory> --path <workspace>
aiwiki plugin enable <id> --path <workspace>
```

`plugin list` 只读取 Host 状态，不 import 本地 module，也不创建状态文件。`plugin add` 只读取和校验 `aiwiki-extension.json`。`plugin enable` 会重新校验 manifest、import 指定 ESM module、校验声明，随后创建 extension 自己的 Host 管理 state 根目录。

## 本地 Manifest

每个本地 extension 目录包含 `aiwiki-extension.json`：

```json
{
  "schema_version": "aiwiki.extension.v1",
  "id": "example.local-quality",
  "name": "Local quality extension",
  "version": "0.1.0",
  "api_version": "aiwiki.extension.v1",
  "entry": "index.mjs"
}
```

schema 与 API 标记必须精确等于 `aiwiki.extension.v1`。ID 只能使用小写标识符。entry 必须是解析后仍位于 extension 根目录中的相对 `.js` 或 `.mjs` 文件；绝对路径、路径穿越和 symlink 逃逸都会被拒绝。

## 运行边界

CORE-0405 只运行 command 与 lint rule callback。command 只接收 argv token。lint rule 只接收没有绝对路径和完整正文的只读 vault 相对 artifact snapshot。context provider 与 artifact generator 不会被调用。

Core command root 被保留。extension command 不能覆盖 Core command，也不能覆盖另一个已启用 extension command。

## 状态与失败隔离

Host 数据位于：

```text
.aiwiki/extensions/
  installed.json
  enabled.json
  state/<extension-id>/
```

Host 通过临时文件 rename 写入。加载、声明校验、command 执行或 lint callback 失败时，会在 `enabled.json` 记录 disabled reason；Core command 和健康 extension 仍继续运行。

这不是 sandbox。本地加载的 JavaScript 仍可以自行 import Node.js 能力；Host 只是不注入 filesystem、process、network、scheduler 或 Core-state 能力。权限策略由 CORE-0603 负责。

## Skill 边界

这些命令是显式管理命令。CORE-0405 不新增自然语言 extension 意图、自动匹配、优先级或 fallback；这些 Skill 匹配规则与验收测试由 CORE-0407 负责。
