import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

import { discoverArtifacts, type AiwikiArtifact, type ArtifactKind, type ArtifactRole } from "./artifact.js";
import { buildCapsulesFromArtifacts } from "./capsule.js";
import { frontmatterArray, frontmatterString } from "./frontmatter.js";
import { safeJoin } from "./paths.js";
import { isRelationshipType, relationshipsFromFrontmatter, type RelationshipType, type TypedRelationship } from "./relationships.js";
import { schemaId } from "./schema.js";
import { withGraphLock } from "./state/lock.js";
import { buildRebuildProjection } from "./state/projection.js";

export type RelationshipGraphState = "fresh" | "stale" | "missing" | "invalid";
export type GraphEdgeOrigin = "frontmatter" | "compatibility_frontmatter" | "wikilink" | "capsule_membership" | "generated_metadata";

export type RelationshipGraphArtifactNode = {
  id: string;
  kind: "artifact";
  path: string;
  artifact_kind: ArtifactKind;
  role: ArtifactRole;
};

export type RelationshipGraphCapsuleNode = {
  id: string;
  kind: "capsule";
  capsule_id: string;
};

export type RelationshipGraphNode = RelationshipGraphArtifactNode | RelationshipGraphCapsuleNode;

export type RelationshipGraphEdge = {
  source_id: string;
  target_id: string;
  type: RelationshipType;
  origin: GraphEdgeOrigin;
  evidence_ref?: string;
};

export type UnresolvedRelationshipGraphEdge = {
  source_path: string;
  raw_target: string;
  origin: Exclude<GraphEdgeOrigin, "capsule_membership">;
  reason: "invalid_target" | "missing_target";
};

export type RelationshipGraphSummary = {
  artifact_nodes: number;
  capsule_nodes: number;
  edges: number;
  unresolved_edges: number;
};

export type RelationshipGraph = {
  schema_version: "aiwiki.graph.v1";
  root: ".";
  generated_at: string;
  source_snapshot_id: string;
  summary: RelationshipGraphSummary;
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
  unresolved_edges: UnresolvedRelationshipGraphEdge[];
};

export type RelationshipGraphStatus = {
  schema_version: "aiwiki.graph_status.v1";
  state: RelationshipGraphState;
  source_snapshot_id: string;
  graph_snapshot_id?: string;
  summary: RelationshipGraphSummary;
  file: ".aiwiki/state/graph.json";
};

export type RelationshipGraphRead = {
  status: RelationshipGraphStatus;
  graph?: RelationshipGraph;
};

const GRAPH_RELATIVE_PATH = [".aiwiki", "state", "graph.json"] as const;
const WIKILINK_PATTERN = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const GENERATED_RELATIONSHIPS: ReadonlyArray<{ key: string; type: RelationshipType }> = [
  { key: "raw_file", type: "derived_from" },
  { key: "raw_note", type: "derived_from" },
  { key: "source_card", type: "supports" },
  { key: "claims_file", type: "supports" },
  { key: "claims_note", type: "supports" },
  { key: "wiki_entry", type: "related_to" },
  { key: "run_summary", type: "related_to" },
  { key: "processing_summary", type: "related_to" }
];

export async function buildRelationshipGraph(rootPath: string, now = new Date().toISOString()): Promise<RelationshipGraph> {
  const root = path.resolve(rootPath);
  return withGraphLock(root, async () => {
    const graph = await buildGraph(root, now);
    await writeGraph(root, graph);
    return graph;
  });
}

export async function inspectRelationshipGraph(rootPath: string): Promise<RelationshipGraphStatus> {
  return (await readRelationshipGraph(rootPath)).status;
}

export async function readRelationshipGraph(rootPath: string): Promise<RelationshipGraphRead> {
  const root = path.resolve(rootPath);
  const sourceSnapshotId = (await buildRebuildProjection(root)).snapshotId;
  let graph: RelationshipGraph | undefined;
  try {
    graph = await readGraph(root);
  } catch (error) {
    if (error instanceof GraphStorageError) {
      return { status: statusFor("invalid", sourceSnapshotId, emptySummary()) };
    }
    throw error;
  }

  if (!graph) {
    return { status: statusFor("missing", sourceSnapshotId, emptySummary()) };
  }
  if (graph.source_snapshot_id !== sourceSnapshotId) {
    return { status: statusFor("stale", sourceSnapshotId, graph.summary, graph.source_snapshot_id) };
  }
  return { status: statusFor("fresh", sourceSnapshotId, graph.summary, graph.source_snapshot_id), graph };
}

async function buildGraph(root: string, now: string): Promise<RelationshipGraph> {
  const [projection, artifacts] = await Promise.all([
    buildRebuildProjection(root, now),
    discoverArtifacts(root)
  ]);
  const knownPaths = new Set(artifacts.map((artifact) => artifact.vaultPath));
  const nodes: RelationshipGraphNode[] = artifacts
    .map((artifact) => artifactNode(artifact))
    .sort(compareNode);
  const edges: RelationshipGraphEdge[] = [];
  const unresolved: UnresolvedRelationshipGraphEdge[] = [];

  for (const artifact of artifacts) {
    const sourceId = artifactId(artifact.vaultPath);
    for (const { relationship, origin } of relationshipSources(artifact)) {
      const target = resolveLocalArtifactReference(relationship.target, knownPaths);
      if (!target) {
        unresolved.push(unresolvedEdge(artifact.vaultPath, relationship.target, origin));
        continue;
      }
      edges.push({
        source_id: sourceId,
        target_id: artifactId(target),
        type: relationship.type,
        origin,
        ...(evidenceReference(relationship.evidence, knownPaths) ? { evidence_ref: evidenceReference(relationship.evidence, knownPaths) } : {})
      });
    }

    for (const relation of GENERATED_RELATIONSHIPS) {
      const rawTarget = frontmatterString(artifact.frontmatter, relation.key);
      if (!rawTarget) continue;
      const target = resolveLocalArtifactReference(rawTarget, knownPaths);
      if (!target) {
        unresolved.push(unresolvedEdge(artifact.vaultPath, rawTarget, "generated_metadata"));
        continue;
      }
      edges.push({ source_id: sourceId, target_id: artifactId(target), type: relation.type, origin: "generated_metadata" });
    }

    for (const rawTarget of wikilinkTargets(artifact.body ?? "")) {
      const target = resolveLocalArtifactReference(rawTarget, knownPaths);
      if (!target) {
        unresolved.push(unresolvedEdge(artifact.vaultPath, rawTarget, "wikilink"));
        continue;
      }
      edges.push({ source_id: sourceId, target_id: artifactId(target), type: "related_to", origin: "wikilink" });
    }
  }

  for (const capsule of buildCapsulesFromArtifacts(artifacts)) {
    if (!isSafeCapsuleId(capsule.id)) continue;
    const capsuleNode: RelationshipGraphCapsuleNode = {
      id: capsuleId(capsule.id),
      kind: "capsule",
      capsule_id: capsule.id
    };
    nodes.push(capsuleNode);
    for (const artifact of capsule.artifacts) {
      edges.push({
        source_id: artifactId(artifact.vaultPath),
        target_id: capsuleNode.id,
        type: "related_to",
        origin: "capsule_membership"
      });
    }
  }

  const sortedNodes = [...nodes].sort(compareNode);
  const sortedEdges = sortUnique(edges, edgeKey);
  const sortedUnresolved = sortUnique(unresolved, unresolvedKey);
  return {
    schema_version: schemaId("stateGraph"),
    root: ".",
    generated_at: now,
    source_snapshot_id: projection.snapshotId,
    summary: summaryFor(sortedNodes, sortedEdges, sortedUnresolved),
    nodes: sortedNodes,
    edges: sortedEdges,
    unresolved_edges: sortedUnresolved
  };
}

async function readGraph(root: string): Promise<RelationshipGraph | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(graphPath(root), "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    if (error instanceof SyntaxError) throw new GraphStorageError("graph file has invalid JSON.");
    throw error;
  }
  return validateGraph(parsed);
}

async function writeGraph(root: string, graph: RelationshipGraph): Promise<void> {
  const target = graphPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(temporary, "wx");
    await handle.writeFile(JSON.stringify(graph, null, 2) + "\n", "utf8");
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, target);
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

function validateGraph(value: unknown): RelationshipGraph {
  if (!isRecord(value)
    || value.schema_version !== schemaId("stateGraph")
    || value.root !== "."
    || typeof value.generated_at !== "string"
    || !value.generated_at
    || !isHash(value.source_snapshot_id)
    || !Array.isArray(value.nodes)
    || !Array.isArray(value.edges)
    || !Array.isArray(value.unresolved_edges)) {
    throw new GraphStorageError("graph file has an invalid envelope.");
  }

  const nodes = value.nodes.map(validateNode);
  if (!isSortedUnique(nodes, (node) => node.id)) {
    throw new GraphStorageError("graph nodes are not deterministically sorted.");
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = value.edges.map((edge) => validateEdge(edge, nodeIds));
  if (!isSortedUnique(edges, edgeKey)) {
    throw new GraphStorageError("graph edges are not deterministically sorted.");
  }
  const unresolvedEdges = value.unresolved_edges.map(validateUnresolvedEdge);
  if (!isSortedUnique(unresolvedEdges, unresolvedKey)) {
    throw new GraphStorageError("graph unresolved edges are not deterministically sorted.");
  }
  const summary = validateSummary(value.summary);
  if (JSON.stringify(summary) !== JSON.stringify(summaryFor(nodes, edges, unresolvedEdges))) {
    throw new GraphStorageError("graph summary does not match graph data.");
  }

  return {
    schema_version: schemaId("stateGraph"),
    root: ".",
    generated_at: value.generated_at,
    source_snapshot_id: value.source_snapshot_id,
    summary,
    nodes,
    edges,
    unresolved_edges: unresolvedEdges
  };
}

function validateNode(value: unknown): RelationshipGraphNode {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new GraphStorageError("graph node has an invalid shape.");
  }
  if (value.kind === "artifact"
    && isRelativePath(value.path)
    && isArtifactKind(value.artifact_kind)
    && isArtifactRole(value.role)
    && value.id === artifactId(value.path)) {
    return { id: value.id, kind: "artifact", path: value.path, artifact_kind: value.artifact_kind, role: value.role };
  }
  if (value.kind === "capsule" && typeof value.capsule_id === "string" && isSafeCapsuleId(value.capsule_id) && value.id === capsuleId(value.capsule_id)) {
    return { id: value.id, kind: "capsule", capsule_id: value.capsule_id };
  }
  throw new GraphStorageError("graph node has an invalid shape.");
}

function validateEdge(value: unknown, nodeIds: ReadonlySet<string>): RelationshipGraphEdge {
  if (!isRecord(value)
    || typeof value.source_id !== "string"
    || typeof value.target_id !== "string"
    || !nodeIds.has(value.source_id)
    || !nodeIds.has(value.target_id)
    || typeof value.type !== "string"
    || !isRelationshipType(value.type)
    || !isGraphEdgeOrigin(value.origin)
    || value.evidence_ref !== undefined && !isRelativePath(value.evidence_ref)) {
    throw new GraphStorageError("graph edge has an invalid shape.");
  }
  return {
    source_id: value.source_id,
    target_id: value.target_id,
    type: value.type,
    origin: value.origin,
    ...(value.evidence_ref ? { evidence_ref: value.evidence_ref } : {})
  };
}

function validateUnresolvedEdge(value: unknown): UnresolvedRelationshipGraphEdge {
  if (!isRecord(value)
    || !isRelativePath(value.source_path)
    || typeof value.raw_target !== "string"
    || !isUnresolvedOrigin(value.origin)
    || (value.reason !== "invalid_target" && value.reason !== "missing_target")) {
    throw new GraphStorageError("graph unresolved edge has an invalid shape.");
  }
  return {
    source_path: value.source_path,
    raw_target: value.raw_target,
    origin: value.origin,
    reason: value.reason
  };
}

function validateSummary(value: unknown): RelationshipGraphSummary {
  if (!isRecord(value)
    || !isNonNegativeInteger(value.artifact_nodes)
    || !isNonNegativeInteger(value.capsule_nodes)
    || !isNonNegativeInteger(value.edges)
    || !isNonNegativeInteger(value.unresolved_edges)
    || Object.values(value).some((entry) => !isNonNegativeInteger(entry))) {
    throw new GraphStorageError("graph summary has an invalid shape.");
  }
  return {
    artifact_nodes: value.artifact_nodes,
    capsule_nodes: value.capsule_nodes,
    edges: value.edges,
    unresolved_edges: value.unresolved_edges
  };
}

function artifactNode(artifact: AiwikiArtifact): RelationshipGraphArtifactNode {
  return {
    id: artifactId(artifact.vaultPath),
    kind: "artifact",
    path: artifact.vaultPath,
    artifact_kind: artifact.kind,
    role: artifact.role
  };
}

function relationshipSources(artifact: AiwikiArtifact): Array<{
  relationship: TypedRelationship;
  origin: "frontmatter" | "compatibility_frontmatter";
}> {
  const explicitOnly = {
    ...artifact.frontmatter,
    supersedes: [],
    superseded_by: [],
    contradicted_by: []
  };
  return [
    ...relationshipsFromFrontmatter(explicitOnly).map((relationship) => ({ relationship, origin: "frontmatter" as const })),
    ...frontmatterArray(artifact.frontmatter, "supersedes").map((target) => ({
      relationship: { type: "supersedes" as const, target },
      origin: "compatibility_frontmatter" as const
    })),
    ...frontmatterArray(artifact.frontmatter, "superseded_by").map((target) => ({
      relationship: { type: "superseded_by" as const, target },
      origin: "compatibility_frontmatter" as const
    })),
    ...frontmatterArray(artifact.frontmatter, "contradicted_by").map((target) => ({
      relationship: { type: "contradicts" as const, target },
      origin: "compatibility_frontmatter" as const
    }))
  ];
}

function artifactId(vaultPath: string): string {
  return `artifact:${vaultPath}`;
}

function capsuleId(id: string): string {
  return `capsule:${id}`;
}

function resolveLocalArtifactReference(value: string | undefined, knownPaths: ReadonlySet<string>): string | undefined {
  const target = normalizeReference(value);
  if (!target || !isRelativePath(target)) return undefined;
  const candidates = target.toLowerCase().endsWith(".md") ? [target] : [target, `${target}.md`];
  return candidates.find((candidate) => knownPaths.has(candidate));
}

function normalizeReference(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const wikilink = trimmed.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/);
  return (wikilink?.[1] ?? trimmed).trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function wikilinkTargets(body: string): string[] {
  const targets: string[] = [];
  for (const match of body.matchAll(WIKILINK_PATTERN)) {
    if (match[1]) targets.push(match[1]);
  }
  return targets;
}

function evidenceReference(value: string | undefined, knownPaths: ReadonlySet<string>): string | undefined {
  return resolveLocalArtifactReference(value, knownPaths);
}

function unresolvedEdge(
  sourcePath: string,
  rawTarget: string,
  origin: Exclude<GraphEdgeOrigin, "capsule_membership">
): UnresolvedRelationshipGraphEdge {
  return {
    source_path: sourcePath,
    raw_target: rawTarget,
    origin,
    reason: normalizeReference(rawTarget) && isRelativePath(normalizeReference(rawTarget)!) ? "missing_target" : "invalid_target"
  };
}

function summaryFor(
  nodes: readonly RelationshipGraphNode[],
  edges: readonly RelationshipGraphEdge[],
  unresolvedEdges: readonly UnresolvedRelationshipGraphEdge[]
): RelationshipGraphSummary {
  return {
    artifact_nodes: nodes.filter((node) => node.kind === "artifact").length,
    capsule_nodes: nodes.filter((node) => node.kind === "capsule").length,
    edges: edges.length,
    unresolved_edges: unresolvedEdges.length
  };
}

function statusFor(
  state: RelationshipGraphState,
  sourceSnapshotId: string,
  summary: RelationshipGraphSummary,
  graphSnapshotId?: string
): RelationshipGraphStatus {
  return {
    schema_version: "aiwiki.graph_status.v1",
    state,
    source_snapshot_id: sourceSnapshotId,
    ...(graphSnapshotId ? { graph_snapshot_id: graphSnapshotId } : {}),
    summary,
    file: ".aiwiki/state/graph.json"
  };
}

function graphPath(root: string): string {
  return safeJoin(root, ...GRAPH_RELATIVE_PATH);
}

function emptySummary(): RelationshipGraphSummary {
  return { artifact_nodes: 0, capsule_nodes: 0, edges: 0, unresolved_edges: 0 };
}

function compareNode(left: RelationshipGraphNode, right: RelationshipGraphNode): number {
  return left.id.localeCompare(right.id);
}

function edgeKey(edge: RelationshipGraphEdge): string {
  return [edge.source_id, edge.target_id, edge.type, edge.origin, edge.evidence_ref ?? ""].join("\u0000");
}

function unresolvedKey(edge: UnresolvedRelationshipGraphEdge): string {
  return [edge.source_path, edge.raw_target, edge.origin, edge.reason].join("\u0000");
}

function sortUnique<T>(items: readonly T[], key: (item: T) => string): T[] {
  const sorted = [...items].sort((left, right) => key(left).localeCompare(key(right)));
  return sorted.filter((item, index) => index === 0 || key(sorted[index - 1]!) !== key(item));
}

function isSortedUnique<T>(items: readonly T[], key: (item: T) => string): boolean {
  return items.every((item, index) => index === 0 || key(items[index - 1]!).localeCompare(key(item)) < 0);
}

function isGraphEdgeOrigin(value: unknown): value is GraphEdgeOrigin {
  return value === "frontmatter"
    || value === "compatibility_frontmatter"
    || value === "wikilink"
    || value === "capsule_membership"
    || value === "generated_metadata";
}

function isUnresolvedOrigin(value: unknown): value is UnresolvedRelationshipGraphEdge["origin"] {
  return value === "frontmatter" || value === "compatibility_frontmatter" || value === "wikilink" || value === "generated_metadata";
}

function isRelativePath(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && !value.startsWith("/")
    && !value.startsWith("\\")
    && !value.includes(":")
    && !value.split("/").includes("..")
    && !path.posix.isAbsolute(value)
    && !path.win32.isAbsolute(value);
}

function isSafeCapsuleId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && !value.includes("\u0000")
    && !value.includes(":")
    && !value.includes("/")
    && !value.includes("\\")
    && value !== "."
    && value !== ".."
    && !path.isAbsolute(value)
    && !path.win32.isAbsolute(value);
}

function isArtifactKind(value: unknown): value is ArtifactKind {
  return value === "wiki_entry"
    || value === "raw_article"
    || value === "source_card"
    || value === "claim_suggestions"
    || value === "asset_suggestions"
    || value === "topic_candidates"
    || value === "draft_outline"
    || value === "processing_summary"
    || value === "unknown";
}

function isArtifactRole(value: unknown): value is ArtifactRole {
  return value === "primary"
    || value === "raw_source"
    || value === "source_card"
    || value === "claim_suggestions"
    || value === "asset_suggestions"
    || value === "topic_suggestions"
    || value === "outline"
    || value === "run_log"
    || value === "unknown";
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

class GraphStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphStorageError";
  }
}
