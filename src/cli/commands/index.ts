import { flagBool, flagString } from "../../args.js";
import { CliError, writeLine } from "../../output.js";
import { buildStructuredIndex, inspectStructuredIndex, type StructuredIndex, type StructuredIndexStatus } from "../../indexing.js";
import { resolveWorkspace } from "../../workspace.js";

import type { CommandContext } from "../command-context.js";
import { writeHelp } from "../localization.js";

type IndexAction = "built" | "rebuilt";

export async function handleIndexCommand(context: CommandContext): Promise<number> {
  const { args, streams, subcommand } = context;
  if (flagBool(args, "help")) {
    writeHelp(streams.stdout, context.locale, "index");
    return 0;
  }

  const root = await resolveWorkspace(flagString(args, "path"));
  if (subcommand === "status") {
    const result = await inspectStructuredIndex(root);
    writeIndexStatus(streams.stdout, result, flagBool(args, "json"));
    return result.state === "fresh" ? 0 : 1;
  }
  if (subcommand === "build" || subcommand === "rebuild") {
    const index = await buildStructuredIndex(root);
    writeBuildResult(streams.stdout, subcommand === "build" ? "built" : "rebuilt", index, flagBool(args, "json"));
    return 0;
  }

  throw new CliError("index expects build, status, or rebuild");
}

function writeBuildResult(stream: NodeJS.WritableStream, action: IndexAction, index: StructuredIndex, json: boolean): void {
  const result = {
    schema_version: "aiwiki.index_command.v1" as const,
    action,
    index
  };
  if (json) {
    writeLine(stream, JSON.stringify(result, null, 2));
    return;
  }
  writeLine(stream, "index: " + action);
  writeLine(stream, "source_snapshot_id: " + index.source_snapshot_id);
  writeLine(stream, "records: " + index.summary.total);
  writeLine(stream, "duplicate_source_urls: " + index.summary.duplicate_source_urls);
  writeLine(stream, "written_file: .aiwiki/state/index.json");
}

function writeIndexStatus(stream: NodeJS.WritableStream, result: StructuredIndexStatus, json: boolean): void {
  if (json) {
    writeLine(stream, JSON.stringify(result, null, 2));
    return;
  }
  writeLine(stream, "index: " + result.state);
  writeLine(stream, "source_snapshot_id: " + result.source_snapshot_id);
  writeLine(stream, "records: " + result.summary.total);
  writeLine(stream, "duplicate_source_urls: " + result.summary.duplicate_source_urls);
  writeLine(stream, "file: " + result.file);
}

