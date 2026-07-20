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
  help?: readonly CommandHelp[];
}>;

export type CommandHandler = (context: CommandContext) => Promise<number>;

export type CoreCommandHandlers = Readonly<{
  version: CommandHandler;
  agentHelp: CommandHandler;
  retrievalHelp: CommandHandler;
  help: CommandHandler;
  plugin: CommandHandler;
  setup: CommandHandler;
  agentInstall: CommandHandler;
  agentSync: CommandHandler;
  agentCheck: CommandHandler;
  agentList: CommandHandler;
  promptAgent: CommandHandler;
  init: CommandHandler;
  configShow: CommandHandler;
  doctor: CommandHandler;
  status: CommandHandler;
  rebuild: CommandHandler;
  index: CommandHandler;
  context: CommandHandler;
  query: CommandHandler;
  show: CommandHandler;
  next: CommandHandler;
  lint: CommandHandler;
  ingestAgent: CommandHandler;
  ingestFile: CommandHandler;
  ingestUrl: CommandHandler;
}>;

export class CommandRegistry {
  readonly definitions: readonly CommandDefinition[];

  constructor(definitions: readonly CommandDefinition[]) {
    this.definitions = definitions;
  }

  find(context: CommandContext): CommandDefinition | undefined {
    return this.definitions.find((candidate) => candidate.matches(context));
  }

  async dispatch(context: CommandContext): Promise<number> {
    const definition = this.find(context);
    if (!definition) {
      throw new CliError(`未知命令: ${context.command}`);
    }
    return definition.handle(context);
  }

  help(scope: CommandHelp["scope"], visibility: CommandVisibility = "public"): readonly string[] {
    return this.definitions
      .flatMap((definition) => definition.help ?? [])
      .filter((entry) => entry.scope === scope && entry.visibility === visibility)
      .map((entry) => entry.usage);
  }
}

export function createCoreCommandRegistry(handlers: CoreCommandHandlers): CommandRegistry {
  return new CommandRegistry([
    {
      id: "version",
      matches: ({ args, command }) => args.flags.has("version") || command === "version" || command === "-v",
      handle: handlers.version
    },
    {
      id: "agent-help",
      matches: ({ args, command, subcommand }) => command === "agent" && (subcommand === "help" || args.flags.has("help")),
      handle: handlers.agentHelp
    },
    {
      id: "retrieval-help",
      matches: ({ args, command }) => (command === "context" || command === "query" || command === "show") && args.flags.has("help"),
      handle: handlers.retrievalHelp
    },
    {
      id: "rebuild",
      matches: ({ command }) => command === "rebuild",
      handle: handlers.rebuild,
      help: [
        { usage: "aiwiki rebuild --path <workspace> --json", visibility: "public", scope: "base" },
        { usage: "aiwiki rebuild --check --json", visibility: "public", scope: "base" },
        { usage: "aiwiki rebuild --dry-run --json", visibility: "public", scope: "base" }
      ]
    },
    {
      id: "index",
      matches: ({ command }) => command === "index",
      handle: handlers.index,
      help: [
        { usage: "aiwiki index build --path <workspace> --json", visibility: "public", scope: "base" },
        { usage: "aiwiki index status --path <workspace> --json", visibility: "public", scope: "base" },
        { usage: "aiwiki index rebuild --path <workspace> --json", visibility: "public", scope: "base" }
      ]
    },
    {
      id: "plugin-help",
      matches: ({ args, command, subcommand }) => command === "plugin" && (!subcommand || subcommand === "help" || args.flags.has("help")),
      handle: handlers.plugin
    },
    {
      id: "help",
      matches: ({ args, command }) => args.flags.has("help") || !command || command === "help" || command === "-h",
      handle: handlers.help
    },
    {
      id: "plugin",
      matches: ({ command }) => command === "plugin",
      handle: handlers.plugin,
      help: [
        { usage: "aiwiki plugin list --json", visibility: "public", scope: "base" },
        { usage: "aiwiki plugin add <directory>", visibility: "public", scope: "base" },
        { usage: "aiwiki plugin enable <id>", visibility: "public", scope: "base" }
      ]
    },
    {
      id: "setup",
      matches: ({ command }) => command === "setup",
      handle: handlers.setup,
      help: [
        { usage: "aiwiki setup", visibility: "public", scope: "base" },
        { usage: "aiwiki setup --path <path> --yes", visibility: "public", scope: "base" },
        { usage: "aiwiki setup --path <workspace> --yes", visibility: "public", scope: "agent" }
      ]
    },
    {
      id: "agent-sync",
      matches: ({ command, subcommand }) => command === "agent" && subcommand === "sync",
      handle: handlers.agentSync,
      help: [
        { usage: "aiwiki agent sync --yes", visibility: "public", scope: "base" },
        { usage: "aiwiki agent sync --yes", visibility: "public", scope: "agent" },
        { usage: "aiwiki agent sync --agent codex --yes", visibility: "public", scope: "agent" },
        { usage: "aiwiki agent sync --agent codex --dry-run", visibility: "public", scope: "agent" },
        { usage: "aiwiki agent sync --json --yes", visibility: "public", scope: "agent" },
        { usage: "aiwiki agent sync --path <workspace> --yes", visibility: "public", scope: "agent" }
      ]
    },
    {
      id: "agent-check",
      matches: ({ command, subcommand }) => command === "agent" && subcommand === "check",
      handle: handlers.agentCheck,
      help: [
        { usage: "aiwiki agent check --json", visibility: "public", scope: "base" },
        { usage: "aiwiki agent check", visibility: "public", scope: "agent" },
        { usage: "aiwiki agent check --path <workspace> --json", visibility: "public", scope: "agent" },
        { usage: "aiwiki agent check --json", visibility: "public", scope: "agent" }
      ]
    },
    {
      id: "ingest-agent",
      matches: ({ command }) => command === "ingest-agent",
      handle: handlers.ingestAgent,
      help: [{ usage: "aiwiki ingest-agent --stdin", visibility: "public", scope: "base" }]
    },
    {
      id: "ingest-file",
      matches: ({ command }) => command === "ingest-file",
      handle: handlers.ingestFile,
      help: [{ usage: "aiwiki ingest-file --file <file>", visibility: "public", scope: "base" }]
    },
    {
      id: "doctor",
      matches: ({ command }) => command === "doctor",
      handle: handlers.doctor,
      help: [{ usage: "aiwiki doctor", visibility: "public", scope: "base" }]
    },
    {
      id: "status",
      matches: ({ command }) => command === "status",
      handle: handlers.status,
      help: [{ usage: "aiwiki status", visibility: "public", scope: "base" }]
    },
    {
      id: "show",
      matches: ({ command }) => command === "show",
      handle: handlers.show,
      help: [
        { usage: "aiwiki show <query>", visibility: "public", scope: "base" },
        { usage: "aiwiki show <topic>", visibility: "public", scope: "retrieval" },
        { usage: "aiwiki show --id <capsule_id>", visibility: "public", scope: "retrieval" },
        { usage: "aiwiki show --artifact-path <artifact.md> --path <workspace>", visibility: "public", scope: "retrieval" }
      ]
    },
    {
      id: "context",
      matches: ({ command }) => command === "context",
      handle: handlers.context,
      help: [
        { usage: "aiwiki context <query>", visibility: "public", scope: "base" },
        { usage: "aiwiki context <topic> --limit 10", visibility: "public", scope: "retrieval" },
        { usage: "aiwiki context <topic> --view capsule", visibility: "public", scope: "retrieval" }
      ]
    },
    {
      id: "query",
      matches: ({ command }) => command === "query",
      handle: handlers.query,
      help: [
        { usage: "aiwiki query <query>", visibility: "public", scope: "base" },
        { usage: "aiwiki query <topic> --view capsule", visibility: "public", scope: "retrieval" },
        { usage: "aiwiki query <topic> --view files --type wiki_entries --status active", visibility: "public", scope: "retrieval" }
      ]
    },
    {
      id: "lint",
      matches: ({ command }) => command === "lint",
      handle: handlers.lint,
      help: [
        { usage: "aiwiki lint", visibility: "public", scope: "base" },
        { usage: "aiwiki lint --capsules --json", visibility: "public", scope: "base" },
        { usage: "aiwiki lint --strict --json", visibility: "public", scope: "base" },
        { usage: "aiwiki lint --fix-empty-dirs --json", visibility: "public", scope: "base" }
      ]
    },
    {
      id: "agent-install",
      matches: ({ command, subcommand }) => command === "agent" && subcommand === "install",
      handle: handlers.agentInstall,
      help: [
        { usage: "aiwiki agent install --agent codex --yes", visibility: "public", scope: "agent" },
        { usage: "aiwiki agent install --agent codex --yes --force", visibility: "public", scope: "agent" }
      ]
    },
    {
      id: "agent-list",
      matches: ({ command, subcommand }) => command === "agent" && (subcommand === "list" || !subcommand),
      handle: handlers.agentList
    },
    {
      id: "prompt-agent",
      matches: ({ command, subcommand }) => command === "prompt" && (subcommand === "agent" || !subcommand),
      handle: handlers.promptAgent
    },
    {
      id: "init",
      matches: ({ command }) => command === "init",
      handle: handlers.init
    },
    {
      id: "config-show",
      matches: ({ command, subcommand }) => command === "config" && subcommand === "show",
      handle: handlers.configShow
    },
    {
      id: "next",
      matches: ({ command }) => command === "next",
      handle: handlers.next
    },
    {
      id: "ingest-url",
      matches: ({ command }) => command === "ingest-url",
      handle: handlers.ingestUrl
    }
  ]);
}
