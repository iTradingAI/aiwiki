import { flagBool, flagString } from "../../args.js";
import { buildHealthReport, writeHealthReport, type HealthReport, type WrittenHealthReport } from "../../health.js";
import { writeLine } from "../../output.js";
import { resolveWorkspace } from "../../workspace.js";

import type { CommandContext } from "../command-context.js";

export async function handleHealthCommand(context: CommandContext): Promise<number> {
  const { args, streams } = context;
  if (flagBool(args, "help")) {
    printHealthHelp(streams.stdout);
    return 0;
  }

  const root = await resolveWorkspace(flagString(args, "path"));
  const report = await buildHealthReport(root);
  if (flagBool(args, "write")) {
    const written = await writeHealthReport(root, report);
    if (flagBool(args, "json")) {
      writeLine(streams.stdout, JSON.stringify(written, null, 2));
      return 0;
    }
    writeWrittenHealthReport(streams.stdout, written);
    return 0;
  }
  if (flagBool(args, "json")) {
    writeLine(streams.stdout, JSON.stringify(report, null, 2));
    return 0;
  }
  writeHealthSummary(streams.stdout, report);
  return 0;
}

function writeWrittenHealthReport(stream: NodeJS.WritableStream, written: WrittenHealthReport): void {
  writeLine(stream, "AIWiki health report");
  writeLine(stream, "");
  writeLine(stream, `dashboard_path: ${written.dashboard_path}`);
  writeLine(stream, `run_path: ${written.run_path}`);
  writeLine(stream, `recommended_next_action: ${written.health.recommended_next_action}`);
  writeLine(stream, "");
  writeLine(stream, "The report preserves user content outside AIWiki health markers and does not modify knowledge Markdown or derived state.");
}

function writeHealthSummary(stream: NodeJS.WritableStream, report: HealthReport): void {
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
  writeLine(stream, "  aiwiki health --write --json --path <workspace>");
  writeLine(stream, "");
  writeLine(stream, "Without --write, health never creates dashboards, state files, or workspace content.");
  writeLine(stream, "--write updates only the managed Knowledge Health dashboard and creates a JSON run report; it never changes knowledge Markdown or derived state.");
}
