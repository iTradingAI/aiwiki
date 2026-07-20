import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { discoverArtifacts, type AiwikiArtifact, type ArtifactKind, type ArtifactRole, type ArtifactVisibility } from "../artifact.js";
import { buildCapsulesFromArtifacts } from "../capsule.js";
import { lifecycleFromFrontmatter, type ConfidenceLevel, type KnowledgeLifecycle, type KnowledgeStatus, type Staleness } from "../lifecycle.js";
import { okfProjectionFromArtifact } from "../okf.js";
import { relationshipsFromFrontmatter, type RelationshipType } from "../relationships.js";
import { schemaId } from "../schema.js";

export type StateEnvelope<T> = {
  schema_version: string;
  snapshot_id: string;
  generated_at: string;
  root: ".";
  summary: Record<string, number>;
  data: T;
};

export type ArtifactStateItem = {
  path: string;
  kind: ArtifactKind;
  role: ArtifactRole;
  visibility: ArtifactVisibility;
  title?: string;
  summary?: string;
  capsule_id?: string;
  slug?: string;
  source_url?: string;
  content_fingerprint?: string;
  run_id?: string;
  content_hash: string;
  modified_at: string;
};

export type CapsuleStateItem = {
  id: string;
  title: string;
  grouping_reason: string;
  artifact_paths: string[];
  primary_path?: string;
  lifecycle: {
    knowledge_status: KnowledgeStatus;
    confidence_level: ConfidenceLevel;
    staleness: Staleness;
    warning_count: number;
  };
  okf: {
    ready: boolean;
    type?: string;
    resource?: string;
    timestamp?: string;
    citations_count: number;
    warning_count: number;
  };
};

export type RelationshipStateItem = {
  source_path: string;
  type: RelationshipType;
  target: string;
  evidence?: string;
  confidence_level?: ConfidenceLevel;
  note?: string;
};

export type LifecycleStateItem = {
  path: string;
  knowledge_status: KnowledgeStatus;
  confidence_level: ConfidenceLevel;
  confidence_score?: number | null;
  last_confirmed?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  staleness: Staleness;
  evidence_count: number;
  evidence_refs: string[];
  access_count?: number;
  last_accessed?: string | null;
  supersedes: string[];
  superseded_by: string[];
  contradicted_by: string[];
  warnings: string[];
};

export type RebuildProjection = {
  snapshotId: string;
  artifacts: StateEnvelope<ArtifactStateItem[]>;
  capsules: StateEnvelope<CapsuleStateItem[]>;
  relationships: StateEnvelope<RelationshipStateItem[]>;
  lifecycle: StateEnvelope<LifecycleStateItem[]>;
};

export async function buildRebuildProjection(rootPath: string, now = new Date().toISOString()): Promise<RebuildProjection> {
  const resolvedRoot = path.resolve(rootPath);
  const artifacts = await discoverArtifacts(resolvedRoot);
  const artifactState = await Promise.all(artifacts.map((artifact) => toArtifactState(resolvedRoot, artifact)));
  artifactState.sort((left, right) => left.path.localeCompare(right.path));

  // Filesystem timestamps help diagnose a local snapshot, but they do not describe knowledge content.
  const snapshotId = fingerprint(artifactState.map(({ modified_at: _modifiedAt, ...artifact }) => artifact));
  const capsules = toCapsuleState(artifacts);
  const relationships = toRelationshipState(artifacts);
  const lifecycle = toLifecycleState(artifacts);

  return {
    snapshotId,
    artifacts: envelope(schemaId("stateArtifacts"), snapshotId, now, artifactSummary(artifactState), artifactState),
    capsules: envelope(schemaId("stateCapsules"), snapshotId, now, { total: capsules.length }, capsules),
    relationships: envelope(schemaId("stateRelationships"), snapshotId, now, { total: relationships.length }, relationships),
    lifecycle: envelope(schemaId("stateLifecycle"), snapshotId, now, { total: lifecycle.length }, lifecycle)
  };
}

async function toArtifactState(rootPath: string, artifact: AiwikiArtifact): Promise<ArtifactStateItem> {
  const [raw, metadata] = await Promise.all([
    readFile(path.join(rootPath, artifact.vaultPath), "utf8"),
    stat(path.join(rootPath, artifact.vaultPath))
  ]);

  return {
    path: artifact.vaultPath,
    kind: artifact.kind,
    role: artifact.role,
    visibility: artifact.visibility,
    ...(artifact.title ? { title: artifact.title } : {}),
    ...(artifact.summary ? { summary: artifact.summary } : {}),
    ...(artifact.capsuleId ? { capsule_id: artifact.capsuleId } : {}),
    ...(artifact.slug ? { slug: artifact.slug } : {}),
    ...(artifact.sourceUrl ? { source_url: artifact.sourceUrl } : {}),
    ...(artifact.contentFingerprint ? { content_fingerprint: artifact.contentFingerprint } : {}),
    ...(artifact.runId ? { run_id: artifact.runId } : {}),
    content_hash: createHash("sha256").update(raw).digest("hex"),
    modified_at: metadata.mtime.toISOString()
  };
}

function toCapsuleState(artifacts: AiwikiArtifact[]): CapsuleStateItem[] {
  return buildCapsulesFromArtifacts(artifacts).map((capsule) => {
    const okfSource = capsule.primary ?? capsule.artifacts[0];
    const okf = okfSource ? okfProjectionFromArtifact(okfSource) : undefined;
    return {
      id: capsule.id,
      title: capsule.title,
      grouping_reason: capsule.groupingReason,
      artifact_paths: capsule.artifacts.map((artifact) => artifact.vaultPath).sort(),
      ...(capsule.primary ? { primary_path: capsule.primary.vaultPath } : {}),
      lifecycle: {
        knowledge_status: capsule.lifecycle.knowledgeStatus,
        confidence_level: capsule.lifecycle.confidenceLevel,
        staleness: capsule.lifecycle.staleness,
        warning_count: capsule.lifecycle.warnings.length
      },
      okf: {
        ready: okf?.ready ?? false,
        ...(okf?.type ? { type: okf.type } : {}),
        ...(okf?.resource ? { resource: okf.resource } : {}),
        ...(okf?.timestamp ? { timestamp: okf.timestamp } : {}),
        citations_count: okf?.citations.length ?? 0,
        warning_count: okf?.warnings.length ?? 0
      }
    };
  });
}

function toRelationshipState(artifacts: AiwikiArtifact[]): RelationshipStateItem[] {
  const items: RelationshipStateItem[] = [];
  for (const artifact of artifacts) {
    for (const relationship of relationshipsFromFrontmatter(artifact.frontmatter)) {
      items.push({
        source_path: artifact.vaultPath,
        type: relationship.type,
        target: relationship.target,
        ...(relationship.evidence ? { evidence: relationship.evidence } : {}),
        ...(relationship.confidenceLevel ? { confidence_level: relationship.confidenceLevel } : {}),
        ...(relationship.note ? { note: relationship.note } : {})
      });
    }
  }
  return items;
}

function toLifecycleState(artifacts: AiwikiArtifact[]): LifecycleStateItem[] {
  return artifacts
    .map((artifact) => ({ path: artifact.vaultPath, lifecycle: lifecycleFromFrontmatter(artifact.frontmatter) }))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ path: artifactPath, lifecycle }) => mapLifecycle(artifactPath, lifecycle));
}

function mapLifecycle(artifactPath: string, lifecycle: KnowledgeLifecycle): LifecycleStateItem {
  return {
    path: artifactPath,
    knowledge_status: lifecycle.knowledgeStatus,
    confidence_level: lifecycle.confidenceLevel,
    ...(lifecycle.confidenceScore !== undefined ? { confidence_score: lifecycle.confidenceScore } : {}),
    ...(lifecycle.lastConfirmed !== undefined ? { last_confirmed: lifecycle.lastConfirmed } : {}),
    ...(lifecycle.validFrom !== undefined ? { valid_from: lifecycle.validFrom } : {}),
    ...(lifecycle.validUntil !== undefined ? { valid_until: lifecycle.validUntil } : {}),
    staleness: lifecycle.staleness,
    evidence_count: lifecycle.evidenceCount,
    evidence_refs: lifecycle.evidenceRefs,
    ...(lifecycle.accessCount !== undefined ? { access_count: lifecycle.accessCount } : {}),
    ...(lifecycle.lastAccessed !== undefined ? { last_accessed: lifecycle.lastAccessed } : {}),
    supersedes: lifecycle.supersedes,
    superseded_by: lifecycle.supersededBy,
    contradicted_by: lifecycle.contradictedBy,
    warnings: lifecycle.warnings
  };
}

function artifactSummary(artifacts: ArtifactStateItem[]): Record<string, number> {
  return {
    total: artifacts.length,
    primary: artifacts.filter((artifact) => artifact.visibility === "primary").length,
    supporting: artifacts.filter((artifact) => artifact.visibility === "supporting").length,
    debug: artifacts.filter((artifact) => artifact.visibility === "debug").length
  };
}

function envelope<T>(schemaVersion: string, snapshotId: string, now: string, summary: Record<string, number>, data: T): StateEnvelope<T> {
  return {
    schema_version: schemaVersion,
    snapshot_id: snapshotId,
    generated_at: now,
    root: ".",
    summary,
    data
  };
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
