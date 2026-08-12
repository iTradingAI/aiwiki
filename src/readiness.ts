import { promises as fs } from "node:fs";
import path from "node:path";

import { buildCapsules, capsuleMetrics } from "./capsule.js";
import { lintWorkspace } from "./lint.js";
import { CONFIG_FILE, doctor, exists, readConfig, statusSummary, type DoctorCheck } from "./workspace.js";

export type ReadinessState = "repair_required" | "setup_required" | "first_ingest_required" | "review_required" | "ready";
export type AccessState = "ok" | "blocked" | "unknown";
export type DiagnosticCheckState = "ok" | "missing" | "blocked" | "unknown";
export type ReadinessActionId =
  | "run_setup"
  | "restore_workspace_access"
  | "verify_workspace_access"
  | "review_schema"
  | "review_repair_plan"
  | "ingest_first_source"
  | "inspect_failed_run"
  | "review_low_quality_content"
  | "query_knowledge";

export type ReadinessCommand = {
  executable: "aiwiki";
  args: string[];
};

export type ReadinessAction = {
  rank: number;
  id: ReadinessActionId;
  kind: "aiwiki_command" | "manual";
  blocking: boolean;
  reason_code: string;
  command?: ReadinessCommand;
  manual_guidance_code?: string;
  verification_command?: ReadinessCommand;
};

export type WorkspaceDiagnosticSnapshot = {
  generatedAt: string;
  workspace: string;
  workspaceAccess: AccessState;
  writeCapability: { state: AccessState; method: "access_check"; detail: string };
  schema: "compatible" | "unsupported" | "missing" | "unknown";
  checks: Array<{ id: string; name: string; state: DiagnosticCheckState; method: "exists" | "access_check"; detail: string }>;
  activity: {
    runCount: number;
    failedCount: number;
    lastRunId?: string;
    lastSuccessRunId?: string;
    lastFailureRunId?: string;
  };
  content: {
    wikiEntries: number;
    sourceCards: number;
    rawFiles: number;
    topics: number;
    outlines: number;
    fallbackEntries: number;
    groundingReviewEntries: number;
    capsuleCount: number;
    capsuleWithPrimaryCount: number;
    entropyRisk: "low" | "medium" | "high";
    lifecycleRisk: "low" | "medium" | "high";
    okfReadyCount: number;
  };
  lint: {
    live: { source: "live" | "not_run"; reasonCode?: string; errors: number; warnings: number; info: number };
    stored: { state: "ok" | "missing" | "needs_attention"; observedAt: string | null; reportPath: string | null };
  };
};

export type WorkspaceReadiness = {
  state: ReadinessState;
  actions: ReadinessAction[];
};

export async function buildWorkspaceDiagnosticSnapshot(rootPath: string, now = new Date().toISOString()): Promise<WorkspaceDiagnosticSnapshot> {
  const workspace = path.resolve(rootPath);
  const checks = (await doctor(workspace)).map(normalizeDoctorCheck);
  const workspaceAccess = capabilityState(checks, "workspace_access");
  const writeCapabilityState = capabilityState(checks, "write_capability");
  const structureMissing = checks.some((check) => check.state === "missing");
  const summary = await statusSummary(workspace);
  const capsules = await buildCapsules(workspace, now);
  const metrics = capsuleMetrics(capsules);
  const schema = await inspectSchema(workspace);
  const liveLint = structureMissing || workspaceAccess !== "ok"
    ? { source: "not_run" as const, reasonCode: "workspace_not_initialized", errors: 0, warnings: 0, info: 0 }
    : summarizeLiveLint(await lintWorkspace(workspace, now));

  return {
    generatedAt: now,
    workspace,
    workspaceAccess,
    writeCapability: {
      state: writeCapabilityState,
      method: "access_check",
      detail: checks.find((check) => check.id === "write_capability")?.detail ?? workspace
    },
    schema,
    checks,
    activity: {
      runCount: summary.runCount,
      failedCount: summary.failedCount,
      ...(summary.lastRunId ? { lastRunId: summary.lastRunId } : {}),
      ...(summary.lastSuccessRunId ? { lastSuccessRunId: summary.lastSuccessRunId } : {}),
      ...(summary.lastFailureRunId ? { lastFailureRunId: summary.lastFailureRunId } : {})
    },
    content: {
      ...await contentCounts(workspace),
      fallbackEntries: summary.fallbackCount,
      groundingReviewEntries: summary.groundingReviewCount,
      capsuleCount: metrics.capsule_count,
      capsuleWithPrimaryCount: metrics.capsule_with_primary_count,
      entropyRisk: metrics.entropy_risk,
      lifecycleRisk: metrics.lifecycle_risk,
      okfReadyCount: metrics.okf_ready_count
    },
    lint: {
      live: liveLint,
      stored: await storedLintObservation(workspace, summary.lintStatus, summary.lintReportPath)
    }
  };
}

export function deriveWorkspaceReadiness(snapshot: WorkspaceDiagnosticSnapshot): WorkspaceReadiness {
  if (snapshot.workspaceAccess === "blocked" || snapshot.writeCapability.state === "blocked") {
    return readiness("repair_required", [manualAction(1, "restore_workspace_access", true, "workspace_access_blocked", "restore_workspace_access", snapshot)]);
  }
  if (snapshot.schema === "unsupported") {
    return readiness("repair_required", [manualAction(1, "review_schema", true, "workspace_schema_unsupported", "review_schema_compatibility", snapshot)]);
  }
  if (snapshot.lint.live.errors > 0) {
    return readiness("repair_required", [commandAction(1, "review_repair_plan", true, "live_lint_errors", ["repair", "--plan", "--json"], snapshot)]);
  }
  if (snapshot.checks.some((check) => check.state === "missing")) {
    return readiness("setup_required", [commandAction(1, "run_setup", true, "required_structure_missing", ["setup", "--yes"], snapshot)]);
  }
  if (!snapshot.activity.lastSuccessRunId) {
    return readiness("first_ingest_required", [commandAction(1, "ingest_first_source", true, "no_successful_ingest", ["ingest-file", "--file", "<file>"], snapshot)]);
  }
  const actions: ReadinessAction[] = [];
  if (snapshot.writeCapability.state === "unknown" || snapshot.workspaceAccess === "unknown") {
    actions.push(manualAction(actions.length + 1, "verify_workspace_access", false, "workspace_access_unknown", "verify_workspace_access", snapshot));
  }
  if (latestRunFailed(snapshot)) {
    actions.push(commandAction(actions.length + 1, "inspect_failed_run", false, "latest_ingest_failed", ["status", "--json"], snapshot));
  }
  if (snapshot.lint.live.warnings > 0) {
    actions.push(commandAction(actions.length + 1, "review_repair_plan", false, "live_lint_warnings", ["repair", "--plan", "--json"], snapshot));
  }
  if (snapshot.content.fallbackEntries > 0 || snapshot.content.groundingReviewEntries > 0) {
    actions.push(commandAction(actions.length + 1, "review_low_quality_content", false, "low_quality_content_present", ["lint", "--json", "--no-write"], snapshot));
  }
  if (actions.length > 0) {
    return readiness("review_required", actions);
  }
  return readiness("ready", [commandAction(1, "query_knowledge", false, "workspace_ready", ["query", "<topic>"], snapshot)]);
}

export function doctorEnvelope(snapshot: WorkspaceDiagnosticSnapshot) {
  const readiness = deriveWorkspaceReadiness(snapshot);
  return {
    schema_version: "aiwiki.doctor.v1",
    generated_at: snapshot.generatedAt,
    workspace: snapshot.workspace,
    would_write: false,
    checks: snapshot.checks,
    summary: {
      blocking: snapshot.checks.filter((check) => check.state === "missing" || check.state === "blocked").length,
      warnings: snapshot.lint.live.warnings,
      unknown: snapshot.checks.filter((check) => check.state === "unknown").length
    },
    readiness
  };
}

export function statusEnvelope(snapshot: WorkspaceDiagnosticSnapshot) {
  return {
    schema_version: "aiwiki.status.v1",
    generated_at: snapshot.generatedAt,
    workspace: snapshot.workspace,
    would_write: false,
    activity: snakeCaseActivity(snapshot.activity),
    content: {
      wiki_entries: snapshot.content.wikiEntries,
      source_cards: snapshot.content.sourceCards,
      raw_files: snapshot.content.rawFiles,
      topics: snapshot.content.topics,
      outlines: snapshot.content.outlines,
      fallback_entries: snapshot.content.fallbackEntries,
      grounding_review_entries: snapshot.content.groundingReviewEntries,
      capsule_count: snapshot.content.capsuleCount,
      capsule_with_primary_count: snapshot.content.capsuleWithPrimaryCount,
      entropy_risk: snapshot.content.entropyRisk,
      lifecycle_risk: snapshot.content.lifecycleRisk,
      okf_ready_count: snapshot.content.okfReadyCount
    },
    lint: {
      live: {
        source: snapshot.lint.live.source,
        reason_code: snapshot.lint.live.reasonCode ?? null,
        errors: snapshot.lint.live.errors,
        warnings: snapshot.lint.live.warnings,
        info: snapshot.lint.live.info
      },
      stored: {
        state: snapshot.lint.stored.state,
        observed_at: snapshot.lint.stored.observedAt,
        report_path: snapshot.lint.stored.reportPath
      }
    },
    readiness: deriveWorkspaceReadiness(snapshot)
  };
}

export function nextEnvelope(snapshot: WorkspaceDiagnosticSnapshot) {
  return {
    schema_version: "aiwiki.next.v1",
    generated_at: snapshot.generatedAt,
    workspace: snapshot.workspace,
    would_write: false,
    actions_executed: false,
    readiness: deriveWorkspaceReadiness(snapshot)
  };
}

function readiness(state: ReadinessState, actions: ReadinessAction[]): WorkspaceReadiness {
  return { state, actions };
}

function commandAction(rank: number, id: ReadinessActionId, blocking: boolean, reasonCode: string, args: string[], snapshot: WorkspaceDiagnosticSnapshot): ReadinessAction {
  return {
    rank,
    id,
    kind: "aiwiki_command",
    blocking,
    reason_code: reasonCode,
    command: { executable: "aiwiki", args: withPath(args, snapshot.workspace) },
    verification_command: { executable: "aiwiki", args: ["status", "--json", "--path", snapshot.workspace] }
  };
}

function manualAction(rank: number, id: ReadinessActionId, blocking: boolean, reasonCode: string, guidance: string, snapshot: WorkspaceDiagnosticSnapshot): ReadinessAction {
  return {
    rank,
    id,
    kind: "manual",
    blocking,
    reason_code: reasonCode,
    manual_guidance_code: guidance,
    verification_command: { executable: "aiwiki", args: ["doctor", "--json", "--path", snapshot.workspace] }
  };
}

function withPath(args: string[], workspace: string): string[] {
  return [...args, "--path", workspace];
}

function normalizeDoctorCheck(check: DoctorCheck): WorkspaceDiagnosticSnapshot["checks"][number] {
  const state: DiagnosticCheckState = check.status === "permission error" ? "blocked" : check.status;
  return {
    id: check.id ?? check.name,
    name: check.name,
    state,
    method: check.method ?? "exists",
    detail: check.detail
  };
}

function capabilityState(checks: WorkspaceDiagnosticSnapshot["checks"], id: string): AccessState {
  const state = checks.find((check) => check.id === id)?.state;
  return state === "ok" ? "ok" : state === "blocked" ? "blocked" : "unknown";
}

async function inspectSchema(workspace: string): Promise<WorkspaceDiagnosticSnapshot["schema"]> {
  if (!(await exists(path.join(workspace, CONFIG_FILE)))) return "missing";
  try {
    return (await readConfig(workspace)).schema.status === "compatible" ? "compatible" : "unsupported";
  } catch {
    return "unknown";
  }
}

function summarizeLiveLint(report: Awaited<ReturnType<typeof lintWorkspace>>): WorkspaceDiagnosticSnapshot["lint"]["live"] {
  return {
    source: "live",
    errors: report.issues.filter((issue) => issue.severity === "error").length,
    warnings: report.issues.filter((issue) => issue.severity === "warning").length,
    info: report.issues.filter((issue) => issue.severity === "info").length
  };
}

async function storedLintObservation(workspace: string, state: "ok" | "missing" | "needs_attention", reportPath?: string): Promise<WorkspaceDiagnosticSnapshot["lint"]["stored"]> {
  if (!reportPath) return { state, observedAt: null, reportPath: null };
  try {
    const observedAt = (await fs.stat(path.join(workspace, reportPath))).mtime.toISOString();
    return { state, observedAt, reportPath };
  } catch {
    return { state, observedAt: null, reportPath };
  }
}

function latestRunFailed(snapshot: WorkspaceDiagnosticSnapshot): boolean {
  return Boolean(snapshot.activity.lastFailureRunId && snapshot.activity.lastRunId === snapshot.activity.lastFailureRunId && snapshot.activity.lastRunId !== snapshot.activity.lastSuccessRunId);
}

function snakeCaseActivity(activity: WorkspaceDiagnosticSnapshot["activity"]) {
  return {
    run_count: activity.runCount,
    failed_count: activity.failedCount,
    last_run_id: activity.lastRunId ?? null,
    last_success_run_id: activity.lastSuccessRunId ?? null,
    last_failure_run_id: activity.lastFailureRunId ?? null
  };
}

async function contentCounts(workspace: string) {
  return {
    wikiEntries: await countMarkdownFiles(path.join(workspace, "05-wiki")),
    sourceCards: await countMarkdownFiles(path.join(workspace, "03-sources", "article-cards")),
    rawFiles: await countMarkdownFiles(path.join(workspace, "02-raw", "articles")),
    topics: await countMarkdownFiles(path.join(workspace, "07-topics", "ready")),
    outlines: await countMarkdownFiles(path.join(workspace, "08-outputs", "outlines"))
  };
}

async function countMarkdownFiles(directory: string): Promise<number> {
  if (!(await exists(directory))) return 0;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) count += await countMarkdownFiles(target);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) count += 1;
  }
  return count;
}
