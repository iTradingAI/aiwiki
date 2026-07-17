import { flagString, parseArgs } from "./args.js";
import { createCommandContext } from "./cli/command-context.js";
import { createCoreCommandRegistry } from "./cli/command-registry.js";
import { createCoreCommandHandlers } from "./cli/commands/core-handlers.js";
import { runEnabledExtensionCommand } from "./extension/host.js";
import type { ExtensionCommandResult } from "./extension/api.js";
import { CliError, type CliStreams, writeLine } from "./output.js";
import { resolveWorkspace } from "./workspace.js";

export async function runCli(argv: string[], streams: CliStreams = { stdout: process.stdout, stderr: process.stderr }) {
  try {
    const args = parseArgs(argv);
    const context = createCommandContext(args, streams);
    const registry = createCoreCommandRegistry(createCoreCommandHandlers());
    const coreCommand = registry.find(context);
    if (coreCommand) {
      return await coreCommand.handle(context);
    }

    let root: string;
    try {
      root = await resolveWorkspace(flagString(args, "path"));
    } catch {
      throw new CliError("未知命令: " + context.command);
    }
    const result = await runEnabledExtensionCommand(root, args.positional);
    if (!result) {
      throw new CliError("未知命令: " + context.command);
    }
    writeExtensionResult(streams, result);
    return result.exitCode;
  } catch (error) {
    if (error instanceof CliError) {
      writeLine(streams.stderr, `错误: ${error.message}`);
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeLine(streams.stderr, `错误: ${message}`);
    return 1;
  }
}

function writeExtensionResult(streams: CliStreams, result: ExtensionCommandResult): void {
  if (result.stdout) {
    writeExtensionText(streams.stdout, result.stdout);
  }
  if (result.stderr) {
    writeExtensionText(streams.stderr, result.stderr);
  }
  if (result.json !== undefined) {
    writeLine(streams.stdout, JSON.stringify(result.json, null, 2));
  }
}

function writeExtensionText(stream: NodeJS.WritableStream, text: string): void {
  stream.write(text);
  if (!text.endsWith("\n")) {
    stream.write("\n");
  }
}
