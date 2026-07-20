import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { discoverArtifacts, type AiwikiArtifact } from "./artifact.js";
import { buildCapsulesFromArtifacts, type SourceCapsule } from "./capsule.js";
import { frontmatterString } from "./frontmatter.js";
import { inspectRelationshipGraph, type RelationshipGraphState } from "./graph.js";
import { inspectStructuredIndex, type StructuredIndexState } from "./indexing.js";
import { lintWorkspace, type LintIssue, type MaintenanceDomain } from "./lint.js";
import { safeJoin } from "./paths.js";
import { relationshipsFromFrontmatter } from "./relationships.js";
import { buildRebuildProjection } from "./state/projection.js";
import { compareStoredProjection, type StoredStateStatus } from "./state/storage.js";

export type HealthRatio = {
  numerator: number;
  denominator: number;
};

export type HealthMetrics = {
  capsules: {
    total: number;
    with_primary: number;
    primary_completeness: HealthRatio;
  };
  evidence: {
    capsules_with_evidence: number;
    coverage: HealthRatio;
  };
  relationships: {
    edge_count: number;
    per_capsule: HealthRatio;
  };
  orphaned_capsules: {
    count: number;
    rate: HealthRatio;
  };
  lifecycle: {
    stale_count: number;
    contradiction_count: number;
    scaffold_count: number;
  };
  index_freshness: StructuredIndexState;
  recent_growth_topics: Array<{
    title: string;
    path: string;
    created_at?: string;
  }>;
};

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
  metrics: HealthMetrics;
  issues: LintIssue[];
  recommended_next_action: "repair_structure" | "review_repair_plan" | "workspace_ready";
};

export type WrittenHealthReport = {
  schema_version: "aiwiki.health_report.v1";
  written_at: string;
  dashboard_path: "dashboards/Knowledge Health.md";
  run_path: string;
  health: HealthReport;
};

const DASHBOARD_PATH = "dashboards/Knowledge Health.md" as const;
const DASHBOARD_START = "<!-- AIWIKI:HEALTH:START -->";
const DASHBOARD_END = "<!-- AIWIKI:HEALTH:END -->";

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
  const [lint, artifacts] = await Promise.all([
    lintWorkspace(rootPath, now, { maintenance: true }),
    discoverArtifacts(rootPath)
  ]);
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
  const metrics = buildHealthMetrics(artifacts, buildCapsulesFromArtifacts(artifacts, now), index.state);

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
    metrics,
    issues: lint.issues,
    recommended_next_action: errors > 0 ? "repair_structure" : lint.issues.length ? "review_repair_plan" : "workspace_ready"
  };
}

export async function writeHealthReport(
  rootPath: string,
  report: HealthReport,
  now = report.generated_at
): Promise<WrittenHealthReport> {
  const root = path.resolve(rootPath);
  const dashboardPath = safeJoin(root, DASHBOARD_PATH);
  const runId = healthRunId(now);
  const runDir = safeJoin(root, "09-runs", runId);
  const runPath = safeJoin(runDir, "health-report.json");
  const written: WrittenHealthReport = {
    schema_version: "aiwiki.health_report.v1",
    written_at: now,
    dashboard_path: DASHBOARD_PATH,
    run_path: `09-runs/${runId}/health-report.json`,
    health: report
  };
  const dashboard = mergeHealthDashboard(await readOptional(dashboardPath), renderHealthDashboard(written));

  await fs.mkdir(path.dirname(dashboardPath), { recursive: true });
  await fs.mkdir(runDir, { recursive: false });
  try {
    await fs.writeFile(runPath, `${JSON.stringify(written, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await writeAtomically(dashboardPath, dashboard);
    return written;
  } catch (error) {
    await fs.rm(runDir, { recursive: true, force: true });
    throw error;
  }
}

function buildHealthMetrics(
  artifacts: readonly AiwikiArtifact[],
  capsules: readonly SourceCapsule[],
  indexFreshness: StructuredIndexState
): HealthMetrics {
  const total = capsules.length;
  const withPrimary = capsules.filter((capsule) => Boolean(capsule.primary)).length;
  const capsulesWithEvidence = capsules.filter((capsule) => capsule.artifacts.some((artifact) => (
    artifact.kind === "raw_article" || artifact.kind === "source_card"
  ))).length;
  const orphaned = capsules.filter((capsule) => !capsule.primary).length;
  const relationshipEdges = artifacts.reduce((count, artifact) => count + relationshipsFromFrontmatter(artifact.frontmatter).length, 0);

  return {
    capsules: {
      total,
      with_primary: withPrimary,
      primary_completeness: ratio(withPrimary, total)
    },
    evidence: {
      capsules_with_evidence: capsulesWithEvidence,
      coverage: ratio(capsulesWithEvidence, total)
    },
    relationships: {
      edge_count: relationshipEdges,
      per_capsule: ratio(relationshipEdges, total)
    },
    orphaned_capsules: {
      count: orphaned,
      rate: ratio(orphaned, total)
    },
    lifecycle: {
      stale_count: capsules.filter((capsule) => (
        capsule.lifecycle.staleness === "stale" || capsule.lifecycle.knowledgeStatus === "stale"
      )).length,
      contradiction_count: capsules.filter((capsule) => (
        capsule.lifecycle.knowledgeStatus === "contradicted" || capsule.lifecycle.contradictedBy.length > 0
      )).length,
      scaffold_count: capsules.filter((capsule) => isScaffold(capsule)).length
    },
    index_freshness: indexFreshness,
    recent_growth_topics: recentGrowthTopics(artifacts)
  };
}

function ratio(numerator: number, denominator: number): HealthRatio {
  return { numerator, denominator };
}

function isScaffold(capsule: SourceCapsule): boolean {
  const primary = capsule.primary;
  if (!primary) return false;
  return frontmatterString(primary.frontmatter, "quality") === "scaffold"
    || frontmatterString(primary.frontmatter, "wiki_entry_generation_mode") === "deterministic_fallback";
}

function recentGrowthTopics(artifacts: readonly AiwikiArtifact[]): HealthMetrics["recent_growth_topics"] {
  return artifacts
    .filter((artifact) => artifact.kind === "topic_candidates")
    .map((artifact) => ({
      title: artifact.title ?? artifact.filename,
      path: artifact.vaultPath,
      created_at: validCreatedAt(frontmatterString(artifact.frontmatter, "created_at"))
    }))
    .sort(compareGrowthTopic)
    .slice(0, 5)
    .map(({ title, path, created_at }) => ({ title, path, ...(created_at ? { created_at } : {}) }));
}

function validCreatedAt(value: string | undefined): string | undefined {
  return value && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function compareGrowthTopic(
  left: HealthMetrics["recent_growth_topics"][number],
  right: HealthMetrics["recent_growth_topics"][number]
): number {
  const leftTime = left.created_at ? Date.parse(left.created_at) : undefined;
  const rightTime = right.created_at ? Date.parse(right.created_at) : undefined;
  if (leftTime !== undefined && rightTime !== undefined && leftTime !== rightTime) return rightTime - leftTime;
  if (leftTime !== undefined && rightTime === undefined) return -1;
  if (leftTime === undefined && rightTime !== undefined) return 1;
  return left.path.localeCompare(right.path);
}

function emptyDomainCounts(): Record<MaintenanceDomain, number> {
  return Object.fromEntries(MAINTENANCE_DOMAINS.map((domain) => [domain, 0])) as Record<MaintenanceDomain, number>;
}

function healthRunId(now: string): string {
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`health report requires a valid generated_at timestamp: ${now}`);
  }
  return `health-${parsed.toISOString().replace(/[-:.]/g, "")}`;
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function mergeHealthDashboard(existing: string | undefined, report: string): string {
  const managed = `${DASHBOARD_START}\n${report}\n${DASHBOARD_END}`;
  if (existing === undefined) {
    return [
      "# 知识健康报告",
      "",
      "这是一份可删除、可重新生成的健康报告，不是知识或派生 state 的事实来源。",
      "",
      managed,
      ""
    ].join("\n");
  }

  const start = existing.indexOf(DASHBOARD_START);
  const end = existing.indexOf(DASHBOARD_END);
  if (start < 0 || end < 0 || end < start || existing.indexOf(DASHBOARD_START, start + 1) >= 0 || existing.indexOf(DASHBOARD_END, end + 1) >= 0) {
    throw new Error(`refusing to overwrite ${DASHBOARD_PATH}: managed health markers are missing or invalid`);
  }
  return `${existing.slice(0, start)}${managed}${existing.slice(end + DASHBOARD_END.length)}`;
}

function renderHealthDashboard(written: WrittenHealthReport): string {
  const { health } = written;
  const metrics = health.metrics;
  const topics = metrics.recent_growth_topics.length
    ? metrics.recent_growth_topics.map((topic) => `- [[${topic.path.replace(/\.md$/i, "")}|${topic.title}]]${topic.created_at ? ` (${topic.created_at})` : ""}`).join("\n")
    : "- 暂无近期选题";
  return [
    `生成时间：${written.written_at}`,
    `运行记录：\`${written.run_path}\``,
    "",
    "## 维护问题",
    "",
    `- 总数：${health.summary.total}；错误：${health.summary.errors}；警告：${health.summary.warnings}；提示：${health.summary.info}`,
    `- 下一步：${health.recommended_next_action}`,
    `- 派生状态：rebuild=${health.derived_state.rebuild}，index=${health.derived_state.index}，graph=${health.derived_state.graph}`,
    "",
    "## 知识指标",
    "",
    "| 指标 | 值 |",
    "| --- | --- |",
    `| Capsule 数量 | ${metrics.capsules.total} |`,
    `| 主条目完整度 | ${formatRatio(metrics.capsules.primary_completeness)} |`,
    `| 证据覆盖 | ${formatRatio(metrics.evidence.coverage)} |`,
    `| 关系密度 | ${formatRatio(metrics.relationships.per_capsule)} |`,
    `| 孤立 Capsule | ${metrics.orphaned_capsules.count} (${formatRatio(metrics.orphaned_capsules.rate)}) |`,
    `| 过期条目 | ${metrics.lifecycle.stale_count} |`,
    `| 矛盾条目 | ${metrics.lifecycle.contradiction_count} |`,
    `| Scaffold 条目 | ${metrics.lifecycle.scaffold_count} |`,
    `| 索引状态 | ${metrics.index_freshness} |`,
    "",
    "## 最近增长选题",
    "",
    topics,
    "",
    "报告只提供可审阅的健康事实和建议顺序；不会执行 repair、重建派生 state 或修改知识 Markdown。"
  ].join("\n");
}

function formatRatio(value: HealthRatio): string {
  return `${value.numerator}/${value.denominator}`;
}

async function writeAtomically(target: string, content: string): Promise<void> {
  const temporary = `${target}.tmp-${randomUUID()}`;
  try {
    await fs.writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
