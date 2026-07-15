import { CliError } from "../output.js";
import type { CommandContext } from "./command-context.js";

export type CommandVisibility = "public" | "hidden";

export type CommandHelp = Readonly<{
  usage: string;
  visibility: CommandVisibility;
  scope: "base" | "agent" | "retrieval";
}>;

export type CommandDefinition = Readonly<{
  id: string;
  matches: (context: CommandContext) => boolean;
  handle: (context: CommandContext) => Promise<number>;
  help?: CommandHelp;
}>;

export class CommandRegistry {
  readonly definitions: readonly CommandDefinition[];

  constructor(definitions: readonly CommandDefinition[]) {
    this.definitions = definitions;
  }

  async dispatch(context: CommandContext): Promise<number> {
    const definition = this.definitions.find((candidate) => candidate.matches(context));
    if (!definition) {
      throw new CliError(`未知命令: ${context.command}`);
    }
    return definition.handle(context);
  }

  help(scope: CommandHelp["scope"], visibility: CommandVisibility = "public"): readonly string[] {
    return this.definitions
      .flatMap((definition) => definition.help ? [definition.help] : [])
      .filter((entry) => entry.scope === scope && entry.visibility === visibility)
      .map((entry) => entry.usage);
  }
}
