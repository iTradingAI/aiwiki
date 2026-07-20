import type { AiwikiArtifact } from "./artifact.js";
import { buildCapsules, capsuleToJson, searchCapsules, type SourceCapsule } from "./capsule.js";
import type { ContextFilters } from "./context.js";
import { frontmatterBoolean, frontmatterString } from "./frontmatter.js";
import { readRelationshipGraph, type GraphEdgeOrigin, type RelationshipGraphEdge, type RelationshipGraphNode, type RelationshipGraphState, type RelationshipGraphSummary } from "./graph.js";
import { lifecycleFromFrontmatter } from "./lifecycle.js";
import { schemaId } from "./schema.js";

export type GraphContextOptions = {
  filters?: ContextFilters;
  limit?: number;
  graphDepth?: 1 | 2 | 3;
};

type GraphPathStep = RelationshipGraphEdge & { traversal: "outbound" | "inbound" };
type GraphContextNode = {
  id: string;
  kind: "artifact" | "capsule";
  path?: string;
  capsule_id?: string;
};

export type GraphContextResult = {
  schema_version: "aiwiki.context.v2";
  query: string;
  generated_at: string;
  query_scope: {
    view: "graph";
    filters: ContextFilters;
    limit: number;
    graph_depth: 1 | 2 | 3;
  };
  graph: {
    state: RelationshipGraphState;
    source_snapshot_id: string;
    graph_snapshot_id?: string;
    summary: RelationshipGraphSummary;
  };
  seed_capsules: ReturnType<typeof capsuleToJson>[];
  relationships: Array<{
    target: GraphContextNode;
    relationship_path: GraphPathStep[];
    evidence_status: "explicit_frontmatter" | "compatibility_frontmatter" | "local_wikilink" | "generated_metadata" | "capsule_membership" | "mixed";
    lifecycle_status?: { knowledge_status: string; confidence_level: string; staleness: string; warnings: string[] };
    risk: "low" | "medium" | "high";
    must_not_claim: string[];
  }>;
  missing_context: string[];
  recommended_next_action: string;
};

const DEFAULT_LIMIT = 10;
const MAX_TARGETS = 50;

export async function buildGraphContext(
  rootPath: string,
  query: string,
  options: GraphContextOptions = {},
  now = new Date().toISOString()
): Promise<GraphContextResult> {
  const limit = normalizeLimit(options.limit);
  const graphDepth = options.graphDepth ?? 1;
  const filters = normalizeFilters(options.filters);
  const capsules = await buildCapsules(rootPath, now);
  const seeds = searchCapsules(capsules, query, { filters, limit });
  const graphRead = await readRelationshipGraph(rootPath);
  const result = baseResult(query, now, filters, limit, graphDepth, graphRead.status, seeds);

  if (!seeds.length) {
    result.missing_context.push("matching_capsule");
  }
  if (graphRead.status.state !== "fresh" || !graphRead.graph) {
    result.missing_context.push(`relationship_graph_${graphRead.status.state}`);
    result.recommended_next_action = "inspect_or_build_graph_explicitly";
    return result;
  }

  const artifactById = new Map(capsules.flatMap((capsule) => capsule.artifacts).map((artifact) => [`artifact:${artifact.vaultPath}`, artifact]));
  const seedNodeIds = seedIds(seeds);
  const paths = expandGraph(graphRead.graph.nodes, graphRead.graph.edges, seedNodeIds, graphDepth);
  const nodes = new Map(graphRead.graph.nodes.map((node) => [node.id, node]));
  const relationshipCandidates = Array.from(paths.entries())
    .filter(([id]) => !seedNodeIds.has(id))
    .map(([id, relationshipPath]) => relationshipResult(nodes.get(id), relationshipPath, artifactById.get(id)))
    .sort((left, right) => left.relationship_path.length - right.relationship_path.length
      || left.target.id.localeCompare(right.target.id)
      || pathKey(left.relationship_path).localeCompare(pathKey(right.relationship_path)));
  if (relationshipCandidates.length > MAX_TARGETS) {
    result.missing_context.push("relationship_expansion_truncated");
  }
  result.relationships = relationshipCandidates.slice(0, MAX_TARGETS);

  if (!result.relationships.length && seeds.length) {
    result.missing_context.push("relationship_path");
    result.recommended_next_action = "review_seed_capsules";
  } else if (result.missing_context.includes("relationship_expansion_truncated") || result.relationships.some((item) => item.risk === "high")) {
    result.recommended_next_action = "review_graph_context_before_answer";
  } else if (result.relationships.length) {
    result.recommended_next_action = "use_graph_context_for_answer";
  }
  return result;
}

function baseResult(
  query: string,
  now: string,
  filters: ContextFilters,
  limit: number,
  graphDepth: 1 | 2 | 3,
  graph: Awaited<ReturnType<typeof readRelationshipGraph>>["status"],
  seeds: SourceCapsule[]
): GraphContextResult {
  return {
    schema_version: schemaId("contextV2"),
    query,
    generated_at: now,
    query_scope: { view: "graph", filters, limit, graph_depth: graphDepth },
    graph: {
      state: graph.state,
      source_snapshot_id: graph.source_snapshot_id,
      ...(graph.graph_snapshot_id ? { graph_snapshot_id: graph.graph_snapshot_id } : {}),
      summary: graph.summary
    },
    seed_capsules: seeds.map((capsule) => capsuleToJson(capsule)),
    relationships: [],
    missing_context: [],
    recommended_next_action: "broaden_query_or_ingest_source"
  };
}

function seedIds(capsules: SourceCapsule[]): Set<string> {
  return new Set(capsules.flatMap((capsule) => capsule.artifacts.map((artifact) => `artifact:${artifact.vaultPath}`)));
}

function expandGraph(
  nodes: RelationshipGraphNode[],
  edges: RelationshipGraphEdge[],
  seeds: Set<string>,
  depth: 1 | 2 | 3
): Map<string, GraphPathStep[]> {
  const known = new Set(nodes.map((node) => node.id));
  const paths = new Map<string, GraphPathStep[]>();
  const queue = Array.from(seeds).filter((id) => known.has(id)).sort().map((id) => ({ id, path: [] as GraphPathStep[] }));
  for (const item of queue) paths.set(item.id, item.path);

  while (queue.length) {
    const current = queue.shift()!;
    if (current.path.length >= depth) continue;
    const next = edges.flatMap((edge): Array<{ id: string; step: GraphPathStep }> => {
      if (edge.source_id === current.id) return [{ id: edge.target_id, step: { ...edge, traversal: "outbound" } }];
      if (edge.target_id === current.id) return [{ id: edge.source_id, step: { ...edge, traversal: "inbound" } }];
      return [];
    }).sort((left, right) => left.id.localeCompare(right.id) || stepKey(left.step).localeCompare(stepKey(right.step)));
    for (const item of next) {
      if (paths.has(item.id)) continue;
      const path = [...current.path, item.step];
      paths.set(item.id, path);
      queue.push({ id: item.id, path });
    }
  }
  return paths;
}

function relationshipResult(
  node: RelationshipGraphNode | undefined,
  relationshipPath: GraphPathStep[],
  artifact: AiwikiArtifact | undefined
): GraphContextResult["relationships"][number] {
  const target = node?.kind === "artifact"
    ? { id: node.id, kind: "artifact" as const, path: node.path }
    : { id: node?.id ?? "unknown", kind: "capsule" as const, capsule_id: node?.kind === "capsule" ? node.capsule_id : undefined };
  const lifecycle = artifact ? lifecycleFromFrontmatter(artifact.frontmatter) : undefined;
  const mustNotClaim = new Set<string>();
  let risk: "low" | "medium" | "high" = "low";
  if (relationshipPath.some((edge) => edge.type === "contradicts")) {
    risk = "high";
    mustNotClaim.add("relationship_conflict_present");
  }
  if (lifecycle?.knowledgeStatus === "superseded" || lifecycle?.knowledgeStatus === "contradicted" || lifecycle?.knowledgeStatus === "archived") {
    risk = "high";
    mustNotClaim.add("lifecycle_not_current");
  }
  if (risk !== "high" && (lifecycle?.knowledgeStatus === "needs_review" || lifecycle?.knowledgeStatus === "stale" || lifecycle?.staleness === "stale")) {
    risk = "medium";
    mustNotClaim.add("lifecycle_needs_review");
  }
  if (risk !== "high" && (lifecycle?.evidenceCount === 0 || lifecycle?.warnings.some((warning) => warning === "evidence:missing") || frontmatterString(artifact?.frontmatter ?? {}, "quality") === "scaffold" || frontmatterBoolean(artifact?.frontmatter ?? {}, "grounding_needs_review"))) {
    risk = "medium";
    mustNotClaim.add("evidence_or_grounding_needs_review");
  }
  if (risk === "low" && relationshipPath.every((edge) => edge.origin !== "frontmatter" && edge.origin !== "wikilink")) {
    risk = "medium";
    mustNotClaim.add("relationship_requires_source_review");
  }
  return {
    target,
    relationship_path: relationshipPath,
    evidence_status: evidenceStatus(relationshipPath),
    ...(lifecycle ? { lifecycle_status: {
      knowledge_status: lifecycle.knowledgeStatus,
      confidence_level: lifecycle.confidenceLevel,
      staleness: lifecycle.staleness,
      warnings: lifecycle.warnings
    } } : {}),
    risk,
    must_not_claim: Array.from(mustNotClaim).sort()
  };
}

function evidenceStatus(path: GraphPathStep[]): GraphContextResult["relationships"][number]["evidence_status"] {
  const origins = Array.from(new Set(path.map((edge) => edge.origin)));
  if (origins.length !== 1) return "mixed";
  const value: Record<GraphEdgeOrigin, GraphContextResult["relationships"][number]["evidence_status"]> = {
    frontmatter: "explicit_frontmatter",
    compatibility_frontmatter: "compatibility_frontmatter",
    wikilink: "local_wikilink",
    generated_metadata: "generated_metadata",
    capsule_membership: "capsule_membership"
  };
  return value[origins[0]!];
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(50, Math.floor(value ?? DEFAULT_LIMIT)));
}

function normalizeFilters(filters: ContextFilters | undefined): ContextFilters {
  return Object.fromEntries(Object.entries(filters ?? {})
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([key, value]) => [key, String(value).trim()])) as ContextFilters;
}

function stepKey(edge: GraphPathStep): string {
  return `${edge.source_id}\u0000${edge.target_id}\u0000${edge.type}\u0000${edge.origin}\u0000${edge.traversal}\u0000${edge.evidence_ref ?? ""}`;
}

function pathKey(path: GraphPathStep[]): string {
  return path.map(stepKey).join("\u0001");
}
