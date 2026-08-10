import path from "node:path";
import { flagBool, flagString } from "../../args.js";
import {
  addLocalExtension,
  disableExtension,
  doctorExtensions,
  enableExtension,
  inspectExtension,
  listExtensionStatuses,
  removeExtension,
  type ExtensionDoctorReport,
  type ExtensionInspection,
  type ExtensionRemovalResult,
  type ExtensionStatus
} from "../../extension/host.js";
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

    if (subcommand === "inspect") {
      const id = requireExtensionId(args.positional[2]);
      const inspection = await inspectExtension(root, id);
      printExtensionInspection(streams.stdout, inspection, flagBool(args, "json"));
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
      const id = requireExtensionId(args.positional[2]);
      await enableExtension(root, id);
      const extension = await extensionStatus(root, id, "已启用但未找到状态");
      printExtensionResult(streams.stdout, "enabled", extension, flagBool(args, "json"));
      return 0;
    }

    if (subcommand === "disable") {
      const id = requireExtensionId(args.positional[2]);
      const extension = await disableExtension(root, id);
      printExtensionResult(streams.stdout, "disabled", extension, flagBool(args, "json"));
      return 0;
    }

    if (subcommand === "remove") {
      const id = requireExtensionId(args.positional[2]);
      const removal = await removeExtension(root, id);
      printExtensionResult(streams.stdout, "removed", removal, flagBool(args, "json"));
      return 0;
    }

    if (subcommand === "doctor") {
      const report = await doctorExtensions(root);
      printExtensionDoctorReport(streams.stdout, report, flagBool(args, "json"));
      return report.ok ? 0 : 1;
    }

    throw new CliError("未知 plugin 子命令: " + subcommand);
  };
}

function printPluginHelp(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki plugin commands");
  writeLine(stream, "");
  writeLine(stream, "  aiwiki plugin list --json");
  writeLine(stream, "  aiwiki plugin inspect <id> --json");
  writeLine(stream, "  aiwiki plugin add <directory>");
  writeLine(stream, "  aiwiki plugin enable <id>");
  writeLine(stream, "  aiwiki plugin disable <id>");
  writeLine(stream, "  aiwiki plugin remove <id>");
  writeLine(stream, "  aiwiki plugin doctor --json");
  writeLine(stream, "");
  writeLine(stream, "Extensions use a declared-permission audit + no-injection default; NOT a runtime OS sandbox. Local modules retain direct Node authority; this host provides no write mediation.");
}

function printExtensionResult(
  stream: NodeJS.WritableStream,
  action: "added" | "enabled" | "disabled" | "removed",
  extension: ExtensionStatus | ExtensionRemovalResult,
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
  if ("status" in extension) writeLine(stream, "status: " + extension.status);
  writeLine(stream, "source: " + extension.source);
}

function requireExtensionId(id: string | undefined): string {
  if (!id) {
    throw new CliError("请提供 extension id。");
  }
  return id;
}

async function extensionStatus(root: string, id: string, failure: string): Promise<ExtensionStatus> {
  const extension = (await listExtensionStatuses(root)).find((candidate) => candidate.id === id);
  if (!extension) {
    throw new CliError("extension " + failure + ": " + id);
  }
  return extension;
}

function printExtensionInspection(stream: NodeJS.WritableStream, inspection: ExtensionInspection, json: boolean): void {
  if (json) {
    writeLine(stream, JSON.stringify({
      schema_version: "aiwiki.plugin_inspection.v1",
      inspection
    }, null, 2));
    return;
  }

  writeLine(stream, "plugin inspect: " + inspection.descriptor.id);
  writeLine(stream, "status: " + inspection.status);
  if (inspection.disabledReason) writeLine(stream, "reason: " + inspection.disabledReason);
  writeLine(stream, "descriptor: " + JSON.stringify(inspection.descriptor));
  for (const warning of inspection.warnings) writeLine(stream, "warning: " + warning);
  for (const note of inspection.notes) writeLine(stream, "note: " + note);
}

function printExtensionDoctorReport(stream: NodeJS.WritableStream, report: ExtensionDoctorReport, json: boolean): void {
  if (json) {
    writeLine(stream, JSON.stringify({
      schema_version: "aiwiki.plugin_doctor.v1",
      report
    }, null, 2));
    return;
  }

  writeLine(stream, "plugin doctor: " + (report.ok ? "ok" : "needs attention"));
  for (const extension of report.extensions) {
    writeLine(stream, [extension.id, extension.status, extension.source].join(" | "));
    if (extension.descriptor) writeLine(stream, "descriptor: " + JSON.stringify(extension.descriptor));
    for (const error of extension.errors) writeLine(stream, "error: " + error);
    for (const warning of extension.warnings) writeLine(stream, "warning: " + warning);
  }
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
