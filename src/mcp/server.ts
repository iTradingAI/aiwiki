import { once } from "node:events";
import {
  INTERNAL_ERROR,
  INVALID_PARAMS,
  INVALID_REQUEST,
  JSONRPC_VERSION,
  MAX_LINE_SIZE,
  METHOD_NOT_FOUND,
  PARSE_ERROR,
  PROTOCOL_VERSION,
  createErrorResponse,
  createSuccessResponse,
  type CallToolResult,
  type InitializeResult,
  type JsonRpcId,
  type JsonRpcRequest,
  type Tool,
} from "./protocol.js";

export type ServerState = "new" | "initializing" | "ready" | "closed";

export type ServerHandlers = {
  listTools: () => Tool[];
  callTool: (name: string, args: Record<string, unknown> | undefined) => Promise<CallToolResult>;
};

type JsonObject = Record<string, unknown>;

const INITIALIZE_RESULT: InitializeResult = {
  protocolVersion: PROTOCOL_VERSION,
  capabilities: { tools: { listChanged: false } },
  serverInfo: { name: "aiwiki-mcp", version: "0.7.0" },
};

export async function runMcpServer(handlers: ServerHandlers): Promise<void> {
  let state: ServerState = "new";
  let lineParts: Buffer[] = [];
  let lineLength = 0;

  const writeResponse = async (response: unknown): Promise<void> => {
    const payload = `${JSON.stringify(response)}\n`;
    if (!process.stdout.write(payload)) {
      await once(process.stdout, "drain");
    }
  };

  const respond = async (id: JsonRpcId, code: number, message: string): Promise<void> => {
    await writeResponse(createErrorResponse(id, code, message));
  };

  const handleMessage = async (message: unknown): Promise<void> => {
    if (!isJsonObject(message) || message.jsonrpc !== JSONRPC_VERSION || typeof message.method !== "string") {
      if (hasId(message)) {
        await respond(validId(message.id) ? message.id : null, INVALID_REQUEST, "Invalid Request");
      }
      return;
    }

    const isNotification = !hasId(message);
    if (hasId(message) && !validId(message.id)) {
      await respond(null, INVALID_REQUEST, "Invalid Request");
      return;
    }

    const request = message as JsonRpcRequest;
    if (request.method === "initialize") {
      if (isNotification) {
        return;
      }
      if (state !== "new") {
        await respond(request.id, INVALID_REQUEST, "Server is already initialized");
        return;
      }

      state = "initializing";
      await writeResponse(createSuccessResponse(request.id, INITIALIZE_RESULT));
      return;
    }

    if (request.method === "notifications/initialized") {
      if (state === "initializing") {
        state = "ready";
      }
      return;
    }

    if (request.method === "notifications/cancelled") {
      return;
    }

    if (request.method === "ping" || request.method === "tools/list" || request.method === "tools/call") {
      if (state !== "ready") {
        if (!isNotification) {
          await respond(request.id, INVALID_REQUEST, "Server is not ready");
        }
        return;
      }
    }

    if (isNotification) {
      return;
    }

    switch (request.method) {
      case "ping":
        await writeResponse(createSuccessResponse(request.id, {}));
        return;
      case "tools/list":
        try {
          await writeResponse(createSuccessResponse(request.id, { tools: handlers.listTools() }));
        } catch (error) {
          logError("listing tools", error);
          await respond(request.id, INTERNAL_ERROR, "Internal error");
        }
        return;
      case "tools/call": {
        const params = parseCallToolParams(request.params);
        if (!params) {
          await respond(request.id, INVALID_PARAMS, "Invalid params");
          return;
        }

        try {
          await writeResponse(createSuccessResponse(request.id, await handlers.callTool(params.name, params.args)));
        } catch (error) {
          logError("calling tool", error);
          await respond(request.id, INTERNAL_ERROR, "Internal error");
        }
        return;
      }
      default:
        await respond(request.id, METHOD_NOT_FOUND, "Method not found");
    }
  };

  const handleLine = async (line: Buffer): Promise<void> => {
    let message: unknown;
    try {
      message = JSON.parse(line.toString("utf8"));
    } catch {
      await respond(null, PARSE_ERROR, "Parse error");
      return;
    }

    await handleMessage(message);
  };

  try {
    for await (const chunk of process.stdin) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      let offset = 0;

      while (offset < buffer.length) {
        const newline = buffer.indexOf(0x0a, offset);
        const end = newline === -1 ? buffer.length : newline;
        const segment = buffer.subarray(offset, end);

        if (lineLength + segment.length > MAX_LINE_SIZE) {
          process.stderr.write("aiwiki-mcp: input line exceeds maximum size; closing connection\n");
          process.stdin.destroy();
          return;
        }

        lineParts.push(segment);
        lineLength += segment.length;
        if (newline === -1) {
          break;
        }

        const line = lineParts.length === 1 ? lineParts[0] : Buffer.concat(lineParts, lineLength);
        lineParts = [];
        lineLength = 0;
        await handleLine(line.length > 0 && line[line.length - 1] === 0x0d ? line.subarray(0, -1) : line);
        offset = newline + 1;
      }
    }
  } catch (error) {
    logError("reading standard input", error);
  } finally {
    state = "closed";
  }
}

function hasId(value: unknown): value is JsonObject & { id: unknown } {
  return isJsonObject(value) && Object.hasOwn(value, "id");
}

function validId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === "string" || typeof value === "number";
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCallToolParams(params: unknown): { name: string; args: Record<string, unknown> | undefined } | undefined {
  if (!isJsonObject(params) || typeof params.name !== "string") {
    return undefined;
  }

  if (params.arguments !== undefined && !isJsonObject(params.arguments)) {
    return undefined;
  }

  return { name: params.name, args: params.arguments };
}

function logError(operation: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`aiwiki-mcp: error ${operation}: ${detail}\n`);
}
