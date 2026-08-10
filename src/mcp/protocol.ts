export const PROTOCOL_VERSION = "2025-06-18";
export const JSONRPC_VERSION = "2.0";
export const MAX_LINE_SIZE = 11 * 1024 * 1024;

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcErrorResponse = {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
  };
};

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse | JsonRpcErrorResponse;

export type ContentBlock = {
  type: "text";
  text: string;
};

export type Tool = {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    [key: string]: unknown;
  };
};

export type CallToolResult = {
  content: ContentBlock[];
  isError?: boolean;
};

export type InitializeResult = {
  protocolVersion: typeof PROTOCOL_VERSION;
  capabilities: {
    tools: {
      listChanged: false;
    };
  };
  serverInfo: {
    name: string;
    version: string;
  };
};

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export function createErrorResponse(id: JsonRpcId, code: number, message: string): JsonRpcErrorResponse {
  return { jsonrpc: JSONRPC_VERSION, id, error: { code, message } };
}

export function createSuccessResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}
