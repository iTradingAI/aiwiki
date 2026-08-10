# AIWiki MCP 服务器

`aiwiki-mcp` 通过标准输入/输出上的、以换行分隔的 JSON-RPC 2.0，把本地 AIWiki 工作区暴露给 MCP 客户端。它实现 **2025-06-18** 版 MCP 协议，并只声明 tools 能力。它有**零运行时依赖**：协议、JSON-RPC 分帧、校验和 stdio 服务器均由 Node.js API 手写实现。

## 启动服务器

### 命令行

构建或安装包后，以可选工作区根目录启动二进制程序：

```sh
aiwiki-mcp ./knowledge
```

未传参数时，服务器把当前工作目录解析为工作区。stdio 仅用于协议流量：日志输出到 stderr，不输出到 stdout。

### Claude Desktop / Cline / 其他 MCP 客户端

在客户端的 MCP 服务器配置中添加一条目。具体格式取决于客户端，但大多数基于 stdio 的 MCP 客户端（Claude Desktop、Cline 等）都需要 `mcpServers` 对象：

**Claude Desktop**（`claude_desktop_config.json`）：
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

使用 `npx`（无需全局安装）：

```json
{
  "mcpServers": {
    "aiwiki": {
      "command": "npx",
      "args": ["-y", "@itradingai/aiwiki@latest", "/absolute/path/to/your/knowledge"]
    }
  }
}
```

> **注意：** `npx` 启动的是包的默认二进制（`aiwiki`）。如果需要直接启动 MCP 服务器，使用下方显式形式。

使用显式 MCP 二进制（推荐，更可靠）：

```json
{
  "mcpServers": {
    "aiwiki": {
      "command": "npx",
      "args": ["-y", "@itradingai/aiwiki@latest", "--mcp", "/absolute/path/to/your/knowledge"]
    }
  }
}
```

使用全局安装：

```sh
npm install -g @itradingai/aiwiki
```

```json
{
  "mcpServers": {
    "aiwiki": {
      "command": "aiwiki-mcp",
      "args": ["/absolute/path/to/your/knowledge"]
    }
  }
}
```

> 始终使用**绝对路径**指向工作区。客户端可能以非预期的工作目录启动进程。

### 编程方式（嵌入宿主）

嵌入宿主可导入 `runMcpServer` 并提供工具处理器：

```ts
import { runMcpServer } from "@itradingai/aiwiki/mcp";

await runMcpServer({
  listTools: () => [],
  callTool: async () => ({ content: [{ type: "text", text: "未实现" }] })
});
```

公共 `/mcp` 入口导出 `runMcpServer` 和协议类型（`ServerHandlers`、`Tool`、`CallToolResult`、`ContentBlock`）。

### 生命周期

客户端必须完成正常 MCP 生命周期：先发送 `initialize`，再发送 `notifications/initialized`，之后才能调用 `tools/list` 或 `tools/call`。初始化完成前，`ping`、`tools/list` 和 `tools/call` 会因服务器未就绪被拒绝。

详见 [MCP 规范](https://modelcontextprotocol.io/specification)。

## 工具

每个输入 schema 都是 `additionalProperties: false` 的对象。未知参数会失败，而不是被静默忽略。工具结果包含文本内容；结构化结果以格式化 JSON 文本返回。

### `aiwiki_ingest`

导入内联 AIWiki Agent payload。

```json
{
  "payload": {
    "schema_version": "aiwiki.agent_payload.v1",
    "source": {
      "kind": "web",
      "title": "示例",
      "url": "https://example.test/article",
      "content_format": "markdown",
      "content": "已捕获的原文",
      "fetcher": "host-agent",
      "fetch_status": "ok",
      "captured_at": "2026-08-10T00:00:00.000Z"
    },
    "request": { "mode": "ingest", "outputs": ["source_card", "wiki_entry"], "language": "zh-CN" }
  }
}
```

| 字段 | 必填 | Schema |
| --- | --- | --- |
| `payload` | 是 | object |

这是**仅内联 payload**的接口。它不接受文件路径，也不会抓取 URL；宿主 Agent 负责获取内容并放入 payload。payload 序列化后上限为 10 MiB。成功时输出 `IngestResult` 的 JSON。

### `aiwiki_context`

构建简单结构化上下文或图感知的结构化上下文。

```json
{ "query": "检索评估", "view": "graph", "filters": { "status": "active" }, "limit": 5, "graphDepth": 2 }
```

| 字段 | 必填 | Schema |
| --- | --- | --- |
| `query` | 是 | string |
| `view` | 否 | `"simple"`（默认）或 `"graph"` |
| `filters` | 否 | object（`type`、`source_role`、`wiki_type`、`status`） |
| `limit` | 否 | integer，最小值 1 |
| `graphDepth` | 否 | `1`、`2` 或 `3`；图视图使用 |

简单视图返回 `aiwiki.context.v1`。图视图返回 `aiwiki.context.v2`，其中包含图新鲜度、关系路径、关系证据状态、风险、`must_not_claim`、缺失上下文和下一步建议。

### `aiwiki_query`

将 Source Capsule 查询渲染为面向人的文本。

```json
{ "query": "检索评估", "limit": 10, "includeDebugOnly": false }
```

| 字段 | 必填 | Schema |
| --- | --- | --- |
| `query` | 是 | string |
| `limit` | 否 | integer，最小值 1 |
| `includeDebugOnly` | 否 | boolean |

结果是文本而不是 JSON 对象。Agent 需要稳定的结构化结果合同时，应使用 `aiwiki_context`。

### `aiwiki_show`

按查询、稳定胶囊 ID 或制品路径显示一个 Source Capsule。

```json
{ "id": "capsule-id", "json": true }
```

| 字段 | 必填 | Schema |
| --- | --- | --- |
| `query` | 否 | string |
| `id` | 否 | string |
| `artifactPath` | 否 | 相对工作区或位于工作区内的路径字符串 |
| `json` | 否 | boolean |

查找优先级依次是 ID、制品路径、查询。结果为渲染文本；`json: true` 选择序列化胶囊输出。提供制品路径时，读取前会进行文件系统约束检查。

### `aiwiki_lint`

检查工作区。

```json
{}
```

它不接受参数，并返回 `LintReport` 的 JSON，包括严重级别、发现项、动作和汇总计数。

### `aiwiki_health`

构建工作区健康度报告。

```json
{}
```

它不接受参数，并返回稳定的 `aiwiki.health.v1` 报告 JSON。该工具只计算健康度，不会写入仪表盘。

## 信任模型（AD5）

MCP 是本地能力，不是远程授权边界。工具以启动 `aiwiki-mcp` 的本地用户权限执行；因此客户端必须被信任，能够代表该用户操作工作区。

服务器应用以下约束与完整性规则：

1. **工作区根。** CLI 在启动时解析一个根目录。工具只能操作该根目录；没有工具接受根目录覆盖。
2. **仅内联导入。** `aiwiki_ingest` 只接受 payload 对象，不能使服务器读取调用方指定的本地文件或检索网络 URL。
3. **realpath 约束。** `aiwiki_show.artifactPath` 对根和目标都用 `realpath` 解析，再用 `path.relative` 检查。逃出根目录的路径会被拒绝。这可阻止 `..` 穿越和符号链接逃逸，包括工作区内指向外部的符号链接。
4. **串行化变更。** 导入是唯一的变更工具。系统按解析后的工作区串行化变更，因此并发客户端不会交错执行同一工作区的导入。一次失败不会阻塞后续请求。
5. **有界输入与严格 schema。** 导入 payload 上限 10 MiB，stdio 行上限 11 MiB，每个工具都会拒绝未知字段和无效标量类型。

服务器不沙箱化 Markdown 内容、不认证 MCP 客户端，也不发起外部网络请求。仅应在本地用户信任和工作区访问都合适的环境中部署。

## 协议行为

- 传输：UTF-8，stdio 上每行一个 JSON-RPC 2.0 消息。
- 协议版本：`2025-06-18`。
- 初始化后支持的请求：`ping`、`tools/list`、`tools/call`。
- 响应对解析错误、无效请求/参数、不可用方法和内部错误使用标准 JSON-RPC 错误。
- 工具级失败返回带有 `isError: true` 和说明性文本块的 MCP 工具结果；成功的 `tools/call` 仍是 JSON-RPC 成功响应。
