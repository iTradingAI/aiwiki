import type { ParsedArgs } from "../args.js";
import type { CliStreams } from "../output.js";
import { DEFAULT_HELP_LOCALE, type HelpLocale } from "./localization.js";

export type CommandContext = Readonly<{
  args: ParsedArgs;
  command: string | undefined;
  subcommand: string | undefined;
  streams: CliStreams;
  locale: HelpLocale;
}>;

export function createCommandContext(args: ParsedArgs, streams: CliStreams, locale: HelpLocale = DEFAULT_HELP_LOCALE): CommandContext {
  const [command, subcommand] = args.positional;
  return { args, command, subcommand, streams, locale };
}
