import { inspectRelationshipGraph, type RelationshipGraphState } from "./graph.js";
import { inspectStructuredIndex, type StructuredIndexState } from "./indexing.js";
import { lintWorkspace, type LintIssue, type MaintenanceDomain } from "./lint.js";
import { buildRebuildProjection } from "./state/projection.js";
import { compareStoredProjection, type StoredStateStatus } from "./state/storage.js";

export type HealthReport = {
  schema_version: "aiwiki.health.v1";
  generated_at: string;
  summary: {
    total: number;
    errors: number;
    warnings: number;
    info: number;
    by_domain: Record<MaintenanceDomain, number>;
  };
  derived_state: {
    rebuild: StoredStateStatus;
    index: StructuredIndexState;
    graph: RelationshipGraphState;
  };
  issues: LintIssue[];
  recommended_next_action: "repair_structure" | "review_repair_plan" | "workspace_ready";
};

const MAINTENANCE_DOMAINS: readonly MaintenanceDomain[] = [
  "structure",
  "capsule",
  "evidence",
  "lifecycle",
  "relationship",
  "index",
  "user_view",
  "quality"
];

export async function buildHealthReport(rootPath: string, now = new Date().toISOString()): Promise<HealthReport> {
  const lint = await lintWorkspace(rootPath, now, { maintenance: true });
  const projection = await buildRebuildProjection(rootPath, now);
  const [rebuild, index, graph] = await Promise.all([
    compareStoredProjection(rootPath, projection),
    inspectStructuredIndex(rootPath),
    inspectRelationshipGraph(rootPath)
  ]);
  const byDomain = emptyDomainCounts();
  for (const issue of lint.issues) {
    byDomain[issue.domain ?? "quality"] += 1;
  }
  const errors = lint.issues.filter((issue) => issue.severity === "error").length;
  const warnings = lint.issues.filter((issue) => issue.severity === "warning").length;
  const info = lint.issues.filter((issue) => issue.severity === "info").length;

  return {
    schema_version: "aiwiki.health.v1",
    generated_at: now,
    summary: {
      total: lint.issues.length,
      errors,
      warnings,
      info,
      by_domain: byDomain
    },
    derived_state: {
      rebuild,
      index: index.state,
      graph: graph.state
    },
    issues: lint.issues,
    recommended_next_action: errors > 0 ? "repair_structure" : lint.issues.length ? "review_repair_plan" : "workspace_ready"
  };
}

function emptyDomainCounts(): Record<MaintenanceDomain, number> {
  return Object.fromEntries(MAINTENANCE_DOMAINS.map((domain) => [domain, 0])) as Record<MaintenanceDomain, number>;
}
