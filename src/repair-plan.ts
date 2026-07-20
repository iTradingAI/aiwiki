import { buildHealthReport } from "./health.js";
import type { LintIssue } from "./lint.js";

export type RepairRisk = "high" | "medium" | "low";

export type RepairPlanItem = {
  id: string;
  issue: LintIssue;
  evidence: string[];
  suggested_changes: string[];
  risk: RepairRisk;
  affected_files: string[];
  suggested_command: string;
};

export type RepairPlan = {
  schema_version: "aiwiki.repair_plan.v1";
  generated_at: string;
  dry_run: true;
  would_write: false;
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
  items: RepairPlanItem[];
  recommended_next_action: "review_plan" | "workspace_ready";
};

export async function buildRepairPlan(rootPath: string, now = new Date().toISOString()): Promise<RepairPlan> {
  const health = await buildHealthReport(rootPath, now);
  const items = health.issues.map((issue) => repairPlanItem(issue)).sort(compareRepairPlanItem);
  return {
    schema_version: "aiwiki.repair_plan.v1",
    generated_at: now,
    dry_run: true,
    would_write: false,
    summary: {
      total: items.length,
      high: items.filter((item) => item.risk === "high").length,
      medium: items.filter((item) => item.risk === "medium").length,
      low: items.filter((item) => item.risk === "low").length
    },
    items,
    recommended_next_action: items.length ? "review_plan" : "workspace_ready"
  };
}

function repairPlanItem(issue: LintIssue): RepairPlanItem {
  const path = issue.path ?? "workspace";
  const category = issue.category ?? "uncategorized";
  const action = issue.action ?? "review";
  return {
    id: [issue.domain ?? "quality", category, action, path].join(":"),
    issue,
    evidence: [
      `domain=${issue.domain ?? "quality"}`,
      `category=${category}`,
      issue.message
    ],
    suggested_changes: [issue.suggestion ?? "Review the recorded evidence before changing workspace content."],
    risk: repairRisk(issue),
    affected_files: [path],
    suggested_command: suggestedCommand(issue)
  };
}

function repairRisk(issue: LintIssue): RepairRisk {
  if (issue.severity === "error" || issue.category === "lifecycle" && /contradicted|superseded/i.test(issue.message)) {
    return "high";
  }
  return issue.severity === "warning" ? "medium" : "low";
}

function suggestedCommand(issue: LintIssue): string {
  if (issue.safe_fix) {
    return issue.safe_fix.command;
  }
  if (issue.category === "workspace_structure") {
    return "aiwiki setup --path <workspace> --yes";
  }
  if (issue.category === "index_state") {
    return /missing/.test(issue.message)
      ? "aiwiki index build --path <workspace> --json"
      : "aiwiki index rebuild --path <workspace> --json";
  }
  if (issue.category === "relationship_graph_state") {
    return /missing/.test(issue.message)
      ? "aiwiki graph build --path <workspace> --json"
      : "aiwiki graph rebuild --path <workspace> --json";
  }
  return "aiwiki lint --json --path <workspace>";
}

function compareRepairPlanItem(left: RepairPlanItem, right: RepairPlanItem): number {
  const riskOrder: Record<RepairRisk, number> = { high: 0, medium: 1, low: 2 };
  return riskOrder[left.risk] - riskOrder[right.risk]
    || (left.issue.domain ?? "quality").localeCompare(right.issue.domain ?? "quality")
    || (left.issue.category ?? "uncategorized").localeCompare(right.issue.category ?? "uncategorized")
    || (left.issue.path ?? "workspace").localeCompare(right.issue.path ?? "workspace")
    || left.id.localeCompare(right.id);
}
