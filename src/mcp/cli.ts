#!/usr/bin/env node
import { resolveRoot } from "../workspace.js";
import { confineWorkspaceRoot } from "./validation.js";
import { runMcpServer, type ServerHandlers } from "./server.js";

type ToolModule = {
  createToolHandlers(rootPath: string): ServerHandlers;
};

async function main(): Promise<void> {
  const rootPath = await confineWorkspaceRoot(resolveRoot(process.argv[2] ?? process.cwd()));
  // Tools are delivered independently; defer loading until the optional module is available.
  const toolsModulePath = new URL("./tools.js", import.meta.url).href;
  const { createToolHandlers } = (await import(toolsModulePath)) as ToolModule;
  await runMcpServer(createToolHandlers(rootPath));
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`aiwiki-mcp: failed to start: ${detail}\n`);
  process.exitCode = 1;
});
