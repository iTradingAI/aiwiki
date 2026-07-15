import type { ParsedArgs } from "../args.js";
import type { CliStreams } from "../output.js";

export type CommandContext = Readonly<{
  args: ParsedArgs;
  command: string | undefined;
  subcommand: string | undefined;
  streams: CliStreams;
}>;

export function createCommandContext(args: ParsedArgs, streams: CliStreams): CommandContext {
  const [command, subcommand] = args.positional;
  return { args, command, subcommand, streams };
}
