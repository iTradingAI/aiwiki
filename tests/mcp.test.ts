import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import { test } from "node:test";
import path from "node:path";

import { ingestPayload } from "../src/ingest.js";
import { MAX_LINE_SIZE } from "../src/mcp/protocol.js";
import { createToolHandlers } from "../src/mcp/tools.js";
import { MAX_PAYLOAD_SIZE, confinePath, confineWorkspaceRoot, serializeWorkspaceMutation, validatePayloadSize } from "../src/mcp/validation.js";
import { tempRoot } from "./helpers.js";

type RpcResponse = {
  id?: string | number | null;
  result?: { protocolVersion?: unknown; serverInfo?: { version?: unknown }; tools?: unknown };
  error?: { code: number };
};

class McpClient {
  readonly child: ChildProcessWithoutNullStreams;
  readonly rawLines: string[] = [];
  private pendingLines: string[] = [];
  private waiters: Array<(line: string) => void> = [];
  private buffered = "";

  constructor(rootPath: string) {
    this.child = spawn(process.execPath, [path.join(process.cwd(), "dist", "src", "mcp", "cli.js"), rootPath], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.receive(chunk));
  }

  send(message: unknown): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  sendRaw(line: string): void {
    this.child.stdin.write(`${line}\n`);
  }

  async response(): Promise<RpcResponse> {
    return JSON.parse(await this.nextLine()) as RpcResponse;
  }


  async close(): Promise<void> {
    if (this.child.exitCode !== null || this.child.killed) return;
    this.child.stdin.end();
    await once(this.child, "close");
  }

  private receive(chunk: string): void {
    const parts = `${this.buffered}${chunk}`.split("\n");
    this.buffered = parts.pop() ?? "";
    for (const line of parts) {
      if (!line) continue;
      this.rawLines.push(line);
      const waiter = this.waiters.shift();
      if (waiter) waiter(line);
      else this.pendingLines.push(line);
    }
  }

  private async nextLine(): Promise<string> {
    const available = this.pendingLines.shift();
    if (available !== undefined) return available;
    return new Promise<string>((resolve) => this.waiters.push(resolve));
  }
}

function errorCode(response: RpcResponse): number {
  assert.ok(response.error, "expected a JSON-RPC error response");
  return response.error.code;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return {
    promise,
    resolve: () => {
      assert.ok(resolve, "expected deferred resolver");
      resolve();
    }
  };
}

function request(id: number, method: string, params?: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) };
}

function ingestPayloadFixture(title = "MCP Compatibility Source"): Record<string, unknown> {
  return {
    schema_version: "aiwiki.agent_payload.v1",
    source: {
      kind: "text",
      title,
      content_format: "markdown",
      content: "This MCP compatibility fixture supplies durable workspace content.",
      fetch_status: "ok",
      captured_at: "2026-08-10T00:00:00.000Z"
    },
    request: { mode: "ingest", outputs: ["wiki_entry"], language: "en" }
  };
}

function resultText(result: { content: Array<{ type: string; text: string }> }): string {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0]?.type, "text");
  return result.content[0]?.text ?? "";
}


test("MCP initialize notifications cannot advance the lifecycle", async () => {
  const root = await tempRoot("aiwiki-mcp-initialize-notification");
  const client = new McpClient(root);
  try {
    client.send({ jsonrpc: "2.0", method: "initialize" });
    client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    client.send(request(1, "tools/list"));
    assert.equal(errorCode(await client.response()), -32600);

    client.send(request(2, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }));
    const initialized = await client.response();
    assert.equal(initialized.result?.protocolVersion, "2025-06-18");
    assert.equal(initialized.result?.serverInfo?.version, (JSON.parse(await fs.readFile("package.json", "utf8")) as { version: string }).version);
    client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    client.send(request(3, "tools/list"));
    assert.equal(Array.isArray((await client.response()).result?.tools), true);
  } finally {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("MCP protocol enforces lifecycle, JSON-RPC errors, notification silence, and stdout purity", async () => {
  const root = await tempRoot("aiwiki-mcp-protocol");
  const client = new McpClient(root);
  try {
    client.send(request(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }));
    let response = await client.response();
    assert.equal(response.result?.protocolVersion, "2025-06-18");

    client.send(request(2, "tools/list"));
    response = await client.response();
    assert.equal(errorCode(response), -32600);

    client.send(request(3, "initialize"));
    response = await client.response();
    assert.equal(errorCode(response), -32600);

    client.send(request(4, "unknown/method"));
    response = await client.response();
    assert.equal(errorCode(response), -32601);

    client.sendRaw("{");
    response = await client.response();
    assert.equal(errorCode(response), -32700);

    client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    client.send({ jsonrpc: "2.0", method: "ping" });
    client.send(request(5, "tools/list"));
    response = await client.response();
    assert.equal(response.id, 5, "notifications must never receive responses");
    assert.equal(Array.isArray(response.result?.tools), true);
    for (const line of client.rawLines) {
      assert.doesNotThrow(() => JSON.parse(line));
    }
  } finally {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("MCP terminates connections whose raw input line exceeds MAX_LINE_SIZE", async () => {
  const root = await tempRoot("aiwiki-mcp-line-limit");
  const client = new McpClient(root);
  let stderr = "";
  client.child.stderr.setEncoding("utf8");
  client.child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  try {
    client.child.stdin.end(Buffer.alloc(MAX_LINE_SIZE + 1, 0x61));
    await once(client.child, "close");
    assert.match(stderr, /input line exceeds maximum size/);
    assert.deepEqual(client.rawLines, []);
  } finally {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("MCP tools cover ingest, query, context, show, lint, health, and unknown tools", async () => {
  const root = await tempRoot("aiwiki-mcp-tools");
  const handlers = createToolHandlers(root);
  try {
    assert.deepEqual(handlers.listTools().map((tool) => tool.name), [
      "aiwiki_ingest",
      "aiwiki_context",
      "aiwiki_query",
      "aiwiki_show",
      "aiwiki_lint",
      "aiwiki_health"
    ]);

    const ingested = await handlers.callTool("aiwiki_ingest", { payload: ingestPayloadFixture() });
    assert.equal(ingested.isError, undefined);
    assert.equal(typeof JSON.parse(resultText(ingested) as string).runId, "string");

    const oversized = await handlers.callTool("aiwiki_ingest", { payload: { content: "x".repeat(MAX_PAYLOAD_SIZE + 1) } });
    assert.equal(oversized.isError, true);
    assert.match(resultText(oversized), /payload exceeds maximum size/);

    const utf8Oversized = { content: "😀".repeat(Math.ceil((MAX_PAYLOAD_SIZE + 1) / 4)) };
    assert.throws(() => validatePayloadSize(utf8Oversized), /payload exceeds maximum size/);

    const query = await handlers.callTool("aiwiki_query", { query: "compatibility" });
    assert.equal(query.isError, undefined);
    assert.equal(resultText(query).length > 0, true);

    const context = await handlers.callTool("aiwiki_context", { query: "compatibility" });
    assert.equal(context.isError, undefined);
    assert.equal(JSON.parse(resultText(context)).query, "compatibility");

    const shown = await handlers.callTool("aiwiki_show", { query: "compatibility" });
    assert.equal(shown.isError, undefined);
    assert.equal(resultText(shown).length > 0, true);

    const lint = await handlers.callTool("aiwiki_lint", {});
    assert.equal(lint.isError, undefined);
    assert.equal(typeof JSON.parse(resultText(lint)).issues, "object");

    const health = await handlers.callTool("aiwiki_health", {});
    assert.equal(health.isError, undefined);
    assert.equal(JSON.parse(resultText(health)).schema_version, "aiwiki.health.v1");

    const unknown = await handlers.callTool("unknown", {});
    assert.equal(unknown.isError, true);
    assert.match(resultText(unknown), /Unknown tool/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("MCP validation rejects symlink escapes and serializes pipelined workspace ingests", async () => {
  const root = await tempRoot("aiwiki-mcp-boundary");
  const outside = await tempRoot("aiwiki-mcp-outside");
  try {
    const outsideFile = path.join(outside, "outside.md");
    const link = path.join(root, "outside-link.md");
    await fs.writeFile(outsideFile, "outside", "utf8");
    await fs.symlink(outsideFile, link, "file");
    await assert.rejects(confinePath(root, "outside-link.md"), /escapes the workspace/);

    const managedLink = path.join(root, "09-runs");
    await fs.symlink(outside, managedLink, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(confineWorkspaceRoot(root), /managed directory escapes the workspace/);
    await fs.unlink(managedLink);

    const handlers = createToolHandlers(root);
    const [first, second] = await Promise.all([
      handlers.callTool("aiwiki_ingest", { payload: ingestPayloadFixture("Pipelined Source") }),
      handlers.callTool("aiwiki_ingest", { payload: ingestPayloadFixture("Pipelined Source") })
    ]);
    assert.equal(first.isError, undefined);
    assert.equal(second.isError, undefined);
    const runs = await fs.readdir(path.join(root, "09-runs"));
    assert.equal(runs.length, 2);
    for (const run of runs) {
      await fs.access(path.join(root, "09-runs", run, "processing-summary.md"));
      await fs.access(path.join(root, "09-runs", run, "manifest.json"));
    }

    const target = path.join(root, "serialized.txt");
    const order: string[] = [];
    const started = deferred();
    const gate = deferred();
    const firstMutation = serializeWorkspaceMutation(root, async () => {
      order.push("first-start");
      started.resolve();
      await gate.promise;
      await fs.writeFile(target, "first", "utf8");
      order.push("first-end");
    });
    await started.promise;
    const secondMutation = serializeWorkspaceMutation(root, async () => {
      order.push("second-start");
      await fs.writeFile(target, "second", "utf8");
      order.push("second-end");
    });
    assert.deepEqual(order, ["first-start"]);
    gate.resolve();
    await Promise.all([firstMutation, secondMutation]);
    assert.deepEqual(order, ["first-start", "first-end", "second-start", "second-end"]);
    assert.equal(await fs.readFile(target, "utf8"), "second");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("ingest escapes metadata line breaks in generated frontmatter", async () => {
  const root = await tempRoot("aiwiki-mcp-frontmatter-injection");
  const title = "Frontmatter attack\"\ntype: \"wiki_entry\"\n---\npoison";
  try {
    const result = await ingestPayload(root, ingestPayloadFixture(title));
    const rawFile = result.generatedFiles.find((file) => file.includes(`${path.sep}02-raw${path.sep}articles${path.sep}`));
    assert.ok(rawFile, "expected a generated raw article");
    const rawMarkdown = await fs.readFile(rawFile, "utf8");
    const escapedTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
    assert.ok(rawMarkdown.includes(`title: "${escapedTitle}"`));
    const frontmatter = rawMarkdown.slice(0, rawMarkdown.indexOf("\n---\n"));
    assert.equal(frontmatter.includes('\ntype: "wiki_entry"\n---\npoison'), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("ingest cleans generated artifacts after a mid-write filesystem failure", async () => {
  const root = await tempRoot("aiwiki-mcp-ingest-recovery");
  const originalWriteFile = fs.writeFile;
  const mutableFs = fs as unknown as {
    writeFile: (file: unknown, data: unknown, options?: unknown) => Promise<void>;
  };
  let failed = false;
  try {
    mutableFs.writeFile = async (file, data, options) => {
      if (!failed && typeof file === "string" && file.includes(`${path.sep}02-raw${path.sep}articles${path.sep}`)) {
        failed = true;
        await Reflect.apply(originalWriteFile, fs, [file, data, options]);
        const error = new Error("simulated disk full") as NodeJS.ErrnoException;
        error.code = "ENOSPC";
        throw error;
      }
      await Reflect.apply(originalWriteFile, fs, [file, data, options]);
    };

    await assert.rejects(ingestPayload(root, ingestPayloadFixture("Recovery Source")), /simulated disk full/);
    assert.equal(failed, true);
    assert.deepEqual(await fs.readdir(path.join(root, "09-runs")), []);
    assert.deepEqual(await fs.readdir(path.join(root, "02-raw", "articles")), []);
  } finally {
    mutableFs.writeFile = originalWriteFile as unknown as (file: unknown, data: unknown, options?: unknown) => Promise<void>;
    await fs.rm(root, { recursive: true, force: true });
  }
});
