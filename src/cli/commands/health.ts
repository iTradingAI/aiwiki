import { flagBool, flagString } from "../../args.js";
import { buildHealthReport, type HealthReport } from "../../health.js";
import { writeLine } from "../../output.js";
import { resolveWorkspace } from "../../workspace.js";

import type { CommandContext } from "../command-context.js";

export async function handleHealthCommand(context: CommandContext): Promise<number> {
  const { args, streams } = context;
  if (flagBool(args, "help")) {
    printHealthHelp(streams.stdout);
    return 0;
  }

  const report = await buildHealthReport(await resolveWorkspace(flagString(args, "path")));
  if (flagBool(args, "json")) {
    writeLine(streams.stdout, JSON.stringify(report, null, 2));
    return 0;
  }
  writeHealthReport(streams.stdout, report);
  return 0;
}

function writeHealthReport(stream: NodeJS.WritableStream, report: HealthReport): void {
  writeLine(stream, "AIWiki health");
  writeLine(stream, "");
  writeLine(stream, `issues: total=${report.summary.total}, errors=${report.summary.errors}, warnings=${report.summary.warnings}, info=${report.summary.info}`);
  writeLine(stream, `derived_state: rebuild=${report.derived_state.rebuild}, index=${report.derived_state.index}, graph=${report.derived_state.graph}`);
  writeLine(stream, `recommended_next_action: ${report.recommended_next_action}`);
  writeLine(stream, "");
  writeLine(stream, "Use `aiwiki repair --plan --json` to generate a read-only remediation plan.");
}

function printHealthHelp(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki health");
  writeLine(stream, "");
  writeLine(stream, "Read-only maintenance snapshot across structure, evidence, lifecycle, relationships, derived state, user view, and quality.");
  writeLine(stream, "  aiwiki health --path <workspace> --json");
  writeLine(stream, "");
  writeLine(stream, "health never creates dashboards, state files, or workspace content.");
}
