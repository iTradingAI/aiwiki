import { flagBool, flagString } from "../../args.js";
import { CliError, writeLine } from "../../output.js";
import { rebuildWorkspaceState, type RebuildMode, type RebuildResult } from "../../state/rebuild.js";
import { resolveWorkspace } from "../../workspace.js";

import type { CommandContext } from "../command-context.js";

export async function handleRebuildCommand(context: CommandContext): Promise<number> {
  const { args, streams } = context;
  if (flagBool(args, "help")) {
    printRebuildHelp(streams.stdout);
    return 0;
  }

  const mode = rebuildMode(args);
  const root = await resolveWorkspace(flagString(args, "path"));
  const result = await rebuildWorkspaceState(root, mode);
  if (flagBool(args, "json")) {
    writeLine(streams.stdout, JSON.stringify(result, null, 2));
  } else {
    writeLine(streams.stdout, renderRebuildResult(result));
  }
  return mode === "check" && result.state !== "current" ? 1 : 0;
}

function rebuildMode(args: CommandContext["args"]): RebuildMode {
  const check = flagBool(args, "check");
  const dryRun = flagBool(args, "dry-run");
  if (check && dryRun) {
    throw new CliError("rebuild --check and --dry-run cannot be used together");
  }
  if (check) return "check";
  return dryRun ? "dry_run" : "write";
}

function renderRebuildResult(result: RebuildResult): string {
  const counts = Object.entries(result.counts).map(([key, value]) => `${key}=${value}`).join(", ");
  return [
    `rebuild: ${result.state}`,
    `snapshot_id: ${result.snapshot_id}`,
    `counts: ${counts}`,
    `written_files: ${result.written_files.length ? result.written_files.join(", ") : "none"}`
  ].join("\n");
}

function printRebuildHelp(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki rebuild");
  writeLine(stream, "");
  writeLine(stream, "Rebuild removable derived state from local Markdown without changing Markdown files.");
  writeLine(stream, "  aiwiki rebuild --path <workspace> --json");
  writeLine(stream, "  aiwiki rebuild --check --json");
  writeLine(stream, "  aiwiki rebuild --dry-run --json");
  writeLine(stream, "");
  writeLine(stream, "--check returns exit 1 for missing, stale, or invalid state. --check and --dry-run cannot be combined.");
}
