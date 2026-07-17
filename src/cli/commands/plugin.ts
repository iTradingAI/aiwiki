import path from "node:path";
import { flagBool, flagString } from "../../args.js";
import { addLocalExtension, enableExtension, listExtensionStatuses, type ExtensionStatus } from "../../extension/host.js";
import { CliError, writeLine } from "../../output.js";
import { resolveWorkspace } from "../../workspace.js";
import type { CommandHandler } from "../command-registry.js";

export function createPluginCommandHandler(): CommandHandler {
  return async function handlePlugin(context): Promise<number> {
    const { args, streams, subcommand } = context;
    if (!subcommand || subcommand === "help" || flagBool(args, "help")) {
      printPluginHelp(streams.stdout);
      return 0;
    }

    const root = await resolveWorkspace(flagString(args, "path"));
    if (subcommand === "list") {
      const extensions = await listExtensionStatuses(root);
      if (flagBool(args, "json")) {
        writeLine(streams.stdout, JSON.stringify({
          schema_version: "aiwiki.plugin_status.v1",
          extensions
        }, null, 2));
      } else {
        printExtensionList(streams.stdout, extensions);
      }
      return 0;
    }

    if (subcommand === "add") {
      const directory = args.positional[2];
      if (!directory) {
        throw new CliError("请提供 extension 目录。");
      }
      const extension = await addLocalExtension(root, path.resolve(directory));
      printExtensionResult(streams.stdout, "added", extension, flagBool(args, "json"));
      return 0;
    }

    if (subcommand === "enable") {
      const id = args.positional[2];
      if (!id) {
        throw new CliError("请提供 extension id。");
      }
      await enableExtension(root, id);
      const extension = (await listExtensionStatuses(root)).find((candidate) => candidate.id === id);
      if (!extension) {
        throw new CliError("extension 已启用但未找到状态: " + id);
      }
      printExtensionResult(streams.stdout, "enabled", extension, flagBool(args, "json"));
      return 0;
    }

    throw new CliError("未知 plugin 子命令: " + subcommand);
  };
}

function printPluginHelp(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki plugin commands");
  writeLine(stream, "");
  writeLine(stream, "  aiwiki plugin list --json");
  writeLine(stream, "  aiwiki plugin add <directory>");
  writeLine(stream, "  aiwiki plugin enable <id>");
  writeLine(stream, "");
  writeLine(stream, "Extensions are loaded only after explicit add/enable. This host is not an OS sandbox.");
}

function printExtensionResult(
  stream: NodeJS.WritableStream,
  action: "added" | "enabled",
  extension: ExtensionStatus,
  json: boolean
): void {
  if (json) {
    writeLine(stream, JSON.stringify({
      schema_version: "aiwiki.plugin_status.v1",
      action,
      extension
    }, null, 2));
    return;
  }
  writeLine(stream, "plugin " + action + ": " + extension.id);
  writeLine(stream, "status: " + extension.status);
  writeLine(stream, "source: " + extension.source);
}

function printExtensionList(stream: NodeJS.WritableStream, extensions: readonly ExtensionStatus[]): void {
  if (!extensions.length) {
    writeLine(stream, "No extensions are registered.");
    return;
  }
  for (const extension of extensions) {
    writeLine(stream, [
      extension.id,
      extension.status,
      extension.source,
      extension.disabledReason ? "reason=" + extension.disabledReason : ""
    ].filter(Boolean).join(" | "));
  }
}
