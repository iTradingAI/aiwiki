import { resolveRoot } from "../workspace.js";
import { AIWIKI_PUBLIC_API_VERSION, type AiwikiCli, type AiwikiCliStreams } from "./contracts.js";

export { discoverArtifacts, readArtifact } from "../artifact.js";
export { buildCapsules } from "../capsule.js";
export { buildCapsuleContext } from "../capsule-context.js";
export { buildContext } from "../context.js";
export { buildRelationshipGraph, inspectRelationshipGraph, readRelationshipGraph } from "../graph.js";
export { buildGraphContext } from "../graph-context.js";
export { buildHealthReport } from "../health.js";
export { ingestFile, ingestPayload } from "../ingest.js";
export {
  defaultLifecycle,
  lifecycleFromFrontmatter,
  lifecycleToFrontmatter,
  lifecyclePenalty,
  lifecycleWarnings,
  isAnswerSafeByDefault
} from "../lifecycle.js";
export { lintWorkspace } from "../lint.js";
export { renderCapsuleQuery } from "../query-view.js";
export type { CapsuleQueryOptions } from "../query-view.js";
export { relationshipsFromFrontmatter, relationshipsToFrontmatter, validateRelationships, isRelationshipType } from "../relationships.js";
export { showCapsule, resolveCapsule, renderCapsule } from "../show.js";
export type { ShowCapsuleOptions } from "../show.js";
export { AIWIKI_PUBLIC_API_VERSION } from "./contracts.js";
export type {
  AiwikiArtifact,
  AiwikiCli,
  AiwikiCliStreams,
  CapsuleContextResult,
  ConfidenceLevel,
  ContextFilters,
  ContextResult,
  FrontmatterValue,
  GraphContextOptions,
  GraphContextResult,
  GraphEdgeOrigin,
  HealthMetrics,
  HealthRatio,
  HealthReport,
  WrittenHealthReport,
  IngestResult,
  KnowledgeLifecycle,
  KnowledgeStatus,
  LintReport,
  RelationshipGraph,
  RelationshipGraphArtifactNode,
  RelationshipGraphCapsuleNode,
  RelationshipGraphEdge,
  RelationshipGraphNode,
  RelationshipGraphRead,
  RelationshipGraphState,
  RelationshipGraphStatus,
  RelationshipGraphSummary,
  RelationshipType,
  SourceCapsule,
  Staleness,
  TypedRelationship,
  UnresolvedRelationshipGraphEdge
} from "./contracts.js";

export function createAiwikiCli(): AiwikiCli {
  return Object.freeze({
    apiVersion: AIWIKI_PUBLIC_API_VERSION,
    async run(argv: readonly string[], streams?: AiwikiCliStreams): Promise<number> {
      const { runCli } = await import("../app.js");
      return runCli([...argv], streams);
    }
  });
}

export function resolveWorkspace(rootPath: string): string {
  return resolveRoot(rootPath);
}
