export const AIWIKI_PUBLIC_API_VERSION = "aiwiki.public.v1" as const;

export type AiwikiCliStreams = Readonly<{
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}>;

export type AiwikiCli = Readonly<{
  apiVersion: typeof AIWIKI_PUBLIC_API_VERSION;
  run(argv: readonly string[], streams?: AiwikiCliStreams): Promise<number>;
}>;

export type { AiwikiArtifact } from "../artifact.js";
export type { SourceCapsule } from "../capsule.js";
export type { CapsuleContextResult } from "../capsule-context.js";
export type { ContextFilters, ContextResult } from "../context.js";
export type { FrontmatterValue } from "../frontmatter.js";
export type {
  RelationshipGraph,
  RelationshipGraphState,
  RelationshipGraphStatus,
  RelationshipGraphRead,
  RelationshipGraphNode,
  RelationshipGraphArtifactNode,
  RelationshipGraphCapsuleNode,
  RelationshipGraphEdge,
  UnresolvedRelationshipGraphEdge,
  RelationshipGraphSummary,
  GraphEdgeOrigin
} from "../graph.js";
export type { GraphContextOptions, GraphContextResult } from "../graph-context.js";
export type { HealthRatio, HealthMetrics, HealthReport, WrittenHealthReport } from "../health.js";
export type { IngestResult } from "../ingest.js";
export type { KnowledgeLifecycle } from "../lifecycle.js";
export type { KnowledgeStatus, ConfidenceLevel, Staleness } from "../lifecycle.js";
export type { LintReport } from "../lint.js";
export type { CapsuleQueryOptions } from "../query-view.js";
export type { RelationshipType, TypedRelationship } from "../relationships.js";
export type { ShowCapsuleOptions } from "../show.js";
