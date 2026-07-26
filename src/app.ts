import { flagString, parseArgs } from "./args.js";
import { createCommandContext } from "./cli/command-context.js";
import { createCoreCommandRegistry } from "./cli/command-registry.js";
import { createCoreCommandHandlers } from "./cli/commands/core-handlers.js";
import { DEFAULT_HELP_LOCALE, errorLabel, HelpLocaleResolutionError, resolveHelpLocale, unknownCommandMessage, type HelpLocale } from "./cli/localization.js";
import { runEnabledExtensionCommand } from "./extension/host.js";
import type { ExtensionCommandResult } from "./extension/api.js";
import { CliError, type CliStreams, writeLine } from "./output.js";
import { resolveWorkspace } from "./workspace.js";

export async function runCli(argv: string[], streams: CliStreams = { stdout: process.stdout, stderr: process.stderr }) {
  let locale: HelpLocale = DEFAULT_HELP_LOCALE;
  try {
    const args = parseArgs(argv);
    locale = resolveHelpLocale(args);
    const context = createCommandContext(args, streams, locale);
    const registry = createCoreCommandRegistry(createCoreCommandHandlers());
    const coreCommand = registry.find(context);
    if (coreCommand) {
      return await coreCommand.handle(context);
    }

    let root: string;
    try {
      root = await resolveWorkspace(flagString(args, "path"));
    } catch {
      throw new CliError(unknownCommandMessage(locale, context.command));
    }
    const result = await runEnabledExtensionCommand(root, args.positional, extensionArgv(argv));
    if (!result) {
      throw new CliError(unknownCommandMessage(locale, context.command));
    }
    writeExtensionResult(streams, result);
    return result.exitCode;
  } catch (error) {
    if (error instanceof HelpLocaleResolutionError) locale = error.locale;
    if (error instanceof CliError) {
      writeLine(streams.stderr, `${errorLabel(locale)}: ${error.message}`);
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeLine(streams.stderr, `${errorLabel(locale)}: ${message}`);
    return 1;
  }
}

function extensionArgv(argv: readonly string[]): readonly string[] {
  const result: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--path" || token === "--lang") {
      index += 1;
      continue;
    }
    if (token.startsWith("--path=") || token.startsWith("--lang=")) {
      continue;
    }
    result.push(token);
  }
  return result;
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
