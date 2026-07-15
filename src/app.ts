import { parseArgs } from "./args.js";
import { createCommandContext } from "./cli/command-context.js";
import { createCoreCommandRegistry } from "./cli/command-registry.js";
import { createCoreCommandHandlers } from "./cli/commands/core-handlers.js";
import { CliError, type CliStreams, writeLine } from "./output.js";

export async function runCli(argv: string[], streams: CliStreams = { stdout: process.stdout, stderr: process.stderr }) {
  try {
    const args = parseArgs(argv);
    const context = createCommandContext(args, streams);
    return await createCoreCommandRegistry(createCoreCommandHandlers()).dispatch(context);
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
