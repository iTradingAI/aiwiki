import { flagBool, flagString } from "../../args.js";
import { CliError, writeLine } from "../../output.js";
import { buildRelationshipGraph, inspectRelationshipGraph, type RelationshipGraph, type RelationshipGraphStatus } from "../../graph.js";
import { resolveWorkspace } from "../../workspace.js";

import type { CommandContext } from "../command-context.js";

type GraphAction = "built" | "rebuilt";

export async function handleGraphCommand(context: CommandContext): Promise<number> {
  const { args, streams, subcommand } = context;
  if (flagBool(args, "help")) {
    printGraphHelp(streams.stdout);
    return 0;
  }

  const root = await resolveWorkspace(flagString(args, "path"));
  if (subcommand === "status") {
    const result = await inspectRelationshipGraph(root);
    writeGraphStatus(streams.stdout, result, flagBool(args, "json"));
    return result.state === "fresh" ? 0 : 1;
  }
  if (subcommand === "build" || subcommand === "rebuild") {
    const graph = await buildRelationshipGraph(root);
    writeBuildResult(streams.stdout, subcommand === "build" ? "built" : "rebuilt", graph, flagBool(args, "json"));
    return 0;
  }
  throw new CliError("graph expects build, status, or rebuild");
}

function writeBuildResult(stream: NodeJS.WritableStream, action: GraphAction, graph: RelationshipGraph, json: boolean): void {
  const result = {
    schema_version: "aiwiki.graph_command.v1" as const,
    action,
    graph
  };
  if (json) {
    writeLine(stream, JSON.stringify(result, null, 2));
    return;
  }
  writeLine(stream, `graph: ${action}`);
  writeLine(stream, `source_snapshot_id: ${graph.source_snapshot_id}`);
  writeLine(stream, `edges: ${graph.summary.edges}`);
  writeLine(stream, "written_file: .aiwiki/state/graph.json");
}

function writeGraphStatus(stream: NodeJS.WritableStream, result: RelationshipGraphStatus, json: boolean): void {
  if (json) {
    writeLine(stream, JSON.stringify(result, null, 2));
    return;
  }
  writeLine(stream, `graph: ${result.state}`);
  writeLine(stream, `source_snapshot_id: ${result.source_snapshot_id}`);
  writeLine(stream, `edges: ${result.summary.edges}`);
  writeLine(stream, `file: ${result.file}`);
}

function printGraphHelp(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki graph");
  writeLine(stream, "");
  writeLine(stream, "Inspect or rebuild removable Markdown-derived relationship graph metadata.");
  writeLine(stream, "  aiwiki graph build --path <workspace> --json");
  writeLine(stream, "  aiwiki graph status --path <workspace> --json");
  writeLine(stream, "  aiwiki graph rebuild --path <workspace> --json");
  writeLine(stream, "");
  writeLine(stream, "status exits 1 for stale, missing, or invalid graph. Context and query remain Markdown-backed when graph metadata is unavailable.");
}
