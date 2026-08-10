# AIWiki MCP Server

`aiwiki-mcp` exposes a local AIWiki workspace to an MCP client through newline-delimited JSON-RPC 2.0 on standard input/output. It implements MCP protocol version **2025-06-18** and declares a tools-only capability. It has **zero runtime dependencies**: the protocol, JSON-RPC framing, validation, and stdio server are implemented with Node.js APIs.

## Start the server

Build/install the package, then start the binary with an optional workspace root:

```sh
aiwiki-mcp ./knowledge
```

With no argument, the server resolves the current working directory as its workspace. Stdio is protocol traffic only: do not print banners or diagnostic messages to stdout. Client configuration typically uses:

```json
{
  "command": "aiwiki-mcp",
  "args": ["/absolute/path/to/knowledge"]
}
```

For an embedded host, provide tool handlers and run the server programmatically:

```ts
import { runMcpServer } from "@itradingai/aiwiki/mcp";
import { createToolHandlers } from "@itradingai/aiwiki/dist/src/mcp/tools.js";

await runMcpServer(createToolHandlers("/absolute/path/to/knowledge"));
```

The package's public `/mcp` entry point exports `runMcpServer` and the protocol types (`ServerHandlers`, `Tool`, `CallToolResult`, `ContentBlock`). `createToolHandlers` is the server composition module used by the bundled CLI.

A client must complete the normal lifecycle: send `initialize`, then `notifications/initialized`, then call `tools/list` or `tools/call`. Before initialization completes, `ping`, `tools/list`, and `tools/call` are rejected as not ready.

## Tools

Every input schema is an object with `additionalProperties: false`. Unknown arguments fail instead of being silently ignored. A tool result contains text content; structured results are formatted JSON text.

### `aiwiki_ingest`

Ingest an inline AIWiki agent payload.

```json
{
  "payload": {
    "schema_version": "aiwiki.agent_payload.v1",
    "source": {
      "kind": "web",
      "title": "Example",
      "url": "https://example.test/article",
      "content_format": "markdown",
      "content": "Captured source text",
      "fetcher": "host-agent",
      "fetch_status": "ok",
      "captured_at": "2026-08-10T00:00:00.000Z"
    },
    "request": { "mode": "ingest", "outputs": ["source_card", "wiki_entry"], "language": "en" }
  }
}
```

| Field | Required | Schema |
| --- | --- | --- |
| `payload` | yes | object |

This is **inline-payload-only**. It neither accepts a file path nor fetches URLs. The host agent is responsible for obtaining content and placing it in the payload. Payload serialization is capped at 10 MiB. Successful output is JSON for `IngestResult`.

### `aiwiki_context`

Build simple structured context or graph-aware structured context.

```json
{ "query": "retrieval evaluation", "view": "graph", "filters": { "status": "active" }, "limit": 5, "graphDepth": 2 }
```

| Field | Required | Schema |
| --- | --- | --- |
| `query` | yes | string |
| `view` | no | `"simple"` (default) or `"graph"` |
| `filters` | no | object (`type`, `source_role`, `wiki_type`, `status`) |
| `limit` | no | integer, minimum 1 |
| `graphDepth` | no | `1`, `2`, or `3`; used by graph view |

Simple view returns `aiwiki.context.v1`. Graph view returns `aiwiki.context.v2`, including graph freshness, relationship paths, relationship evidence status, risks, `must_not_claim`, missing context, and the recommended next action.

### `aiwiki_query`

Render a Source Capsule query as human-readable text.

```json
{ "query": "retrieval evaluation", "limit": 10, "includeDebugOnly": false }
```

| Field | Required | Schema |
| --- | --- | --- |
| `query` | yes | string |
| `limit` | no | integer, minimum 1 |
| `includeDebugOnly` | no | boolean |

The result is text rather than a JSON object. Use `aiwiki_context` when an agent needs a structured result contract.

### `aiwiki_show`

Show one Source Capsule by query, stable capsule ID, or an artifact path.

```json
{ "id": "capsule-id", "json": true }
```

| Field | Required | Schema |
| --- | --- | --- |
| `query` | no | string |
| `id` | no | string |
| `artifactPath` | no | workspace-relative or workspace-contained path string |
| `json` | no | boolean |

Lookup precedence is ID, then artifact path, then query. The result is rendered text; `json: true` selects serialized capsule output. Supplying an artifact path triggers filesystem confinement before the capsule is read.

### `aiwiki_lint`

Lint the workspace.

```json
{}
```

It takes no arguments and returns JSON for `LintReport`, including severity, findings, actions, and summary counts.

### `aiwiki_health`

Build a workspace health report.

```json
{}
```

It takes no arguments and returns JSON for the stable `aiwiki.health.v1` report. This tool computes health; it does not write a dashboard.

## Trust model (AD5)

MCP is a local capability, not a remote authorization boundary. Tools execute with the permissions of the local user who starts `aiwiki-mcp`; clients must therefore be trusted to act on that user's workspace.

The server applies these confinement and integrity rules:

1. **Workspace root.** The CLI resolves one root at startup. Tools operate only against that root; no tool accepts a root override.
2. **Inline-only ingestion.** `aiwiki_ingest` accepts the payload object only. It cannot cause the server to read a caller-selected local file or retrieve a network URL.
3. **Realpath confinement.** `aiwiki_show.artifactPath` is resolved with `realpath` for both root and target, then checked with `path.relative`. A path that escapes the root is rejected. This prevents `..` traversal and symlink escapes, including a symlink inside the workspace pointing outside it.
4. **Serialized mutations.** Ingest is the sole mutation tool. Mutations are serialized per resolved workspace so simultaneous clients cannot interleave an ingest operation for the same workspace. A failed mutation does not block a later request.
5. **Bounded input and strict schemas.** Ingest payloads are limited to 10 MiB, stdio lines to 11 MiB, and each tool rejects unknown fields and invalid scalar types.

The server does not sandbox Markdown content, authenticate MCP clients, or make external network requests. Deploy it only where local-user trust and workspace access are appropriate.

## Protocol behavior

- Transport: UTF-8, one JSON-RPC 2.0 message per newline-delimited line over stdio.
- Protocol version: `2025-06-18`.
- Supported requests after initialization: `ping`, `tools/list`, and `tools/call`.
- Responses use standard JSON-RPC errors for parse errors, invalid requests/parameters, unavailable methods, and internal errors.
- Tool-level failures return MCP tool results with `isError: true` and an explanatory text block; a successful `tools/call` remains a JSON-RPC success response.
