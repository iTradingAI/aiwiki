import { buildContext, type ContextFilters } from "../context.js";
import { buildGraphContext } from "../graph-context.js";
import { buildHealthReport } from "../health.js";
import { ingestPayload } from "../ingest.js";
import { lintWorkspace } from "../lint.js";
import { renderCapsuleQuery } from "../query-view.js";
import { showCapsule } from "../show.js";
import type { CallToolResult, ContentBlock, Tool } from "./protocol.js";
import type { ServerHandlers } from "./server.js";
import { confinePath, confineWorkspaceRoot, serializeWorkspaceMutation, validatePayloadSize } from "./validation.js";

const TOOLS = [
  {
    name: "aiwiki_ingest",
    description: "Ingest an inline AIWiki agent payload.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["payload"],
      properties: { payload: { type: "object" } }
    }
  },
  {
    name: "aiwiki_context",
    description: "Build simple or graph-aware workspace context.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string" },
        view: { enum: ["simple", "graph"] },
        filters: { type: "object" },
        limit: { type: "integer", minimum: 1 },
        graphDepth: { enum: [1, 2, 3] }
      }
    }
  },
  {
    name: "aiwiki_query",
    description: "Render a Source Capsule query.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1 },
        includeDebugOnly: { type: "boolean" }
      }
    }
  },
  {
    name: "aiwiki_show",
    description: "Show a Source Capsule by query, ID, or workspace artifact path.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        id: { type: "string" },
        artifactPath: { type: "string" },
        json: { type: "boolean" }
      }
    }
  },
  {
    name: "aiwiki_lint",
    description: "Lint the AIWiki workspace.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    name: "aiwiki_health",
    description: "Build an AIWiki workspace health report.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  }
] satisfies Tool[];

export function createToolHandlers(rootPath: string): ServerHandlers {
  const confinedRootPath = confineWorkspaceRoot(rootPath);
  return {
    listTools: () => TOOLS,
    callTool: async (name, args) => {
      try {
        const workspaceRoot = await confinedRootPath;
        switch (name) {
          case "aiwiki_ingest": {
            assertKnownArguments(args, ["payload"]);
            const payload = requiredObject(args, "payload");
            validatePayloadSize(payload);
            return jsonResult(await serializeWorkspaceMutation(workspaceRoot, () => ingestPayload(workspaceRoot, payload)));
          }
          case "aiwiki_context": {
            assertKnownArguments(args, ["query", "view", "filters", "limit", "graphDepth"]);
            const query = requiredString(args, "query");
            const view = optionalEnum(args, "view", ["simple", "graph"] as const);
            const filters = optionalObject(args, "filters") as ContextFilters | undefined;
            const limit = optionalPositiveInteger(args, "limit");
            const graphDepth = optionalGraphDepth(args);
            const options = { filters, limit, graphDepth };
            return jsonResult(view === "graph"
              ? await buildGraphContext(workspaceRoot, query, options)
              : await buildContext(workspaceRoot, query, { filters, limit }));
          }
          case "aiwiki_query": {
            assertKnownArguments(args, ["query", "limit", "includeDebugOnly"]);
            return textResult(await renderCapsuleQuery(workspaceRoot, requiredString(args, "query"), {
              limit: optionalPositiveInteger(args, "limit"),
              includeDebugOnly: optionalBoolean(args, "includeDebugOnly")
            }));
          }
          case "aiwiki_show": {
            assertKnownArguments(args, ["query", "id", "artifactPath", "json"]);
            const artifactPath = optionalString(args, "artifactPath");
            return textResult(await showCapsule(workspaceRoot, {
              query: optionalString(args, "query"),
              id: optionalString(args, "id"),
              artifactPath: artifactPath ? await confinePath(workspaceRoot, artifactPath) : undefined,
              json: optionalBoolean(args, "json")
            }));
          }
          case "aiwiki_lint":
            assertKnownArguments(args, []);
            return jsonResult(await lintWorkspace(workspaceRoot));
          case "aiwiki_health":
            assertKnownArguments(args, []);
            return jsonResult(await buildHealthReport(workspaceRoot));
          default:
            return errorResult(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return errorResult(errorMessage(error));
      }
    }
  };
}

function jsonResult(value: unknown): CallToolResult {
  return { content: [textContent(JSON.stringify(value, null, 2))] };
}

function textResult(text: string): CallToolResult {
  return { content: [textContent(text)] };
}

function errorResult(message: string): CallToolResult {
  return { content: [textContent(message)], isError: true };
}

function textContent(text: string): ContentBlock {
  return { type: "text", text };
}

function assertKnownArguments(args: Record<string, unknown> | undefined, names: string[]): void {
  for (const name of Object.keys(args ?? {})) {
    if (!names.includes(name)) {
      throw new Error(`Unknown argument: ${name}`);
    }
  }
}

function requiredString(args: Record<string, unknown> | undefined, name: string): string {
  const value = args?.[name];
  if (typeof value !== "string") {
    throw new Error(`Argument '${name}' must be a string`);
  }
  return value;
}

function optionalString(args: Record<string, unknown> | undefined, name: string): string | undefined {
  const value = args?.[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Argument '${name}' must be a string`);
  }
  return value;
}

function requiredObject(args: Record<string, unknown> | undefined, name: string): Record<string, unknown> {
  const value = args?.[name];
  if (!isObject(value)) {
    throw new Error(`Argument '${name}' must be an object`);
  }
  return value;
}

function optionalObject(args: Record<string, unknown> | undefined, name: string): Record<string, unknown> | undefined {
  const value = args?.[name];
  if (value === undefined) return undefined;
  if (!isObject(value)) {
    throw new Error(`Argument '${name}' must be an object`);
  }
  return value;
}

function optionalPositiveInteger(args: Record<string, unknown> | undefined, name: string): number | undefined {
  const value = args?.[name];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`Argument '${name}' must be a positive integer`);
  }
  return value as number;
}

function optionalBoolean(args: Record<string, unknown> | undefined, name: string): boolean | undefined {
  const value = args?.[name];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`Argument '${name}' must be a boolean`);
  }
  return value;
}

function optionalEnum<T extends string>(args: Record<string, unknown> | undefined, name: string, values: readonly T[]): T | undefined {
  const value = args?.[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`Argument '${name}' must be one of: ${values.join(", ")}`);
  }
  return value as T;
}

function optionalGraphDepth(args: Record<string, unknown> | undefined): 1 | 2 | 3 | undefined {
  const value = args?.graphDepth;
  if (value === undefined) return undefined;
  if (value !== 1 && value !== 2 && value !== 3) {
    throw new Error("Argument 'graphDepth' must be 1, 2, or 3");
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
