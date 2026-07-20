import { flagBool, flagString } from "../../args.js";
import { CliError, writeLine } from "../../output.js";
import { buildRepairPlan, type RepairPlan } from "../../repair-plan.js";
import { resolveWorkspace } from "../../workspace.js";

import type { CommandContext } from "../command-context.js";

const PLAN_ONLY_ERROR = "repair --plan is the only Core repair mode; it never modifies the workspace";

export async function handleRepairCommand(context: CommandContext): Promise<number> {
  const { args, streams } = context;
  if (flagBool(args, "help")) {
    printRepairHelp(streams.stdout);
    return 0;
  }
  if (!flagBool(args, "plan") || args.flags.has("apply") || args.flags.has("yes")) {
    throw new CliError(PLAN_ONLY_ERROR);
  }

  const plan = await buildRepairPlan(await resolveWorkspace(flagString(args, "path")));
  if (flagBool(args, "json")) {
    writeLine(streams.stdout, JSON.stringify(plan, null, 2));
    return 0;
  }
  writeRepairPlan(streams.stdout, plan);
  return 0;
}

function writeRepairPlan(stream: NodeJS.WritableStream, plan: RepairPlan): void {
  writeLine(stream, "AIWiki repair plan");
  writeLine(stream, "");
  writeLine(stream, `items: total=${plan.summary.total}, high=${plan.summary.high}, medium=${plan.summary.medium}, low=${plan.summary.low}`);
  writeLine(stream, "dry_run: true");
  writeLine(stream, "would_write: false");
  for (const item of plan.items) {
    writeLine(stream, `- [${item.risk}] ${item.issue.message}`);
    writeLine(stream, `  affected_files: ${item.affected_files.join(", ")}`);
    writeLine(stream, `  suggested_command: ${item.suggested_command}`);
  }
}

function printRepairHelp(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki repair");
  writeLine(stream, "");
  writeLine(stream, "Generate a read-only maintenance plan. Core does not apply repairs automatically.");
  writeLine(stream, "  aiwiki repair --plan --path <workspace> --json");
  writeLine(stream, "");
  writeLine(stream, "--apply and --yes are rejected. Review the suggested commands before making any workspace change.");
}
