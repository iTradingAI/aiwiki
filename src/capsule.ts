import path from "node:path";

import { AiwikiArtifact, discoverArtifacts, readArtifact } from "./artifact.js";
import { frontmatterString } from "./frontmatter.js";
import { lifecycleFromFrontmatter, lifecyclePenalty, type KnowledgeLifecycle } from "./lifecycle.js";
import { okfProjectionFromArtifact, type OkfProjection } from "./okf.js";

export type CapsuleGroupingReason =
  | "explicit_capsule_id"
  | "content_fingerprint"
  | "source_url"
  | "slug"
  | "run_id"
  | "path_fallback";

export type SourceCapsule = {
  id: string;
  title: string;
  slug?: string;
  sourceUrl?: string;
  contentFingerprint?: string;
  runIds: string[];
  groupingReason: CapsuleGroupingReason;
  primary?: AiwikiArtifact;
  artifacts: AiwikiArtifact[];
  supportingArtifacts: AiwikiArtifact[];
  debugArtifacts: AiwikiArtifact[];
  lifecycle: KnowledgeLifecycle;
  okf: OkfProjection;
  quality: {
    score: number;
    lifecyclePenalty: number;
    warnings: string[];
  };
};

export type CapsuleSearchOptions = {
  includeDebugOnly?: boolean;
  filters?: CapsuleFilters;
  limit?: number;
};

export type CapsuleFilters = {
  type?: string;
  source_role?: string;
  wiki_type?: string;
  status?: string;
};

export type CapsuleMetrics = {
  capsule_count: number;
  capsule_with_primary_count: number;
  entropy_risk: "low" | "medium" | "high";
  lifecycle_risk: "low" | "medium" | "high";
  okf_ready_count: number;
};

export async function buildCapsules(rootPath: string, now = new Date().toISOString()): Promise<SourceCapsule[]> {
  return buildCapsulesFromArtifacts(await discoverArtifacts(rootPath), now);
}

export function buildCapsulesFromArtifacts(artifacts: AiwikiArtifact[], now = new Date().toISOString()): SourceCapsule[] {
  const groups = new Map<string, { reason: CapsuleGroupingReason; artifacts: AiwikiArtifact[] }>();
  for (const artifact of artifacts) {
    const group = groupingKey(artifact);
    const existing = groups.get(group.key);
    if (existing) {
      existing.artifacts.push(artifact);
    } else {
      groups.set(group.key, { reason: group.reason, artifacts: [artifact] });
    }
  }

  return Array.from(groups.entries())
    .map(([id, group]) => toCapsule(id, group.reason, group.artifacts, now))
    .sort((left, right) => capsuleSortKey(left).localeCompare(capsuleSortKey(right)));
}

export async function findCapsuleByQuery(rootPath: string, query: string, options: CapsuleSearchOptions = {}): Promise<SourceCapsule | undefined> {
  const matches = searchCapsules(await buildCapsules(rootPath), query, options);
  return matches[0];
}

export async function findCapsuleById(rootPath: string, id: string): Promise<SourceCapsule | undefined> {
  return (await buildCapsules(rootPath)).find((capsule) => capsule.id === id);
}

export async function findCapsuleByArtifactPath(rootPath: string, artifactPath: string): Promise<SourceCapsule | undefined> {
  const root = path.resolve(rootPath);
  const absolute = path.isAbsolute(artifactPath) ? artifactPath : path.join(root, artifactPath);
  const artifact = await readArtifact(root, absolute);
  const capsules = await buildCapsules(root);
  return capsules.find((capsule) => capsule.artifacts.some((item) => item.vaultPath === artifact.vaultPath));
}

export function searchCapsules(capsules: SourceCapsule[], query: string, options: CapsuleSearchOptions = {}): SourceCapsule[] {
  const tokens = tokenize(query);
  const limit = normalizeLimit(options.limit);
  const scored = capsules
    .filter((capsule) => options.includeDebugOnly || capsule.primary || capsule.supportingArtifacts.length)
    .filter((capsule) => capsuleMatchesFilters(capsule, options.filters))
    .map((capsule) => ({ capsule, score: capsuleSearchScore(capsule, tokens) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || capsuleSortKey(left.capsule).localeCompare(capsuleSortKey(right.capsule)));
  return scored.slice(0, limit).map((item) => item.capsule);
}

export function capsuleToJson(capsule: SourceCapsule, options: { debug?: boolean; allArtifacts?: boolean } = {}) {
  const artifacts = options.allArtifacts
    ? capsule.artifacts
    : [
      ...(capsule.primary ? [capsule.primary] : []),
      ...capsule.supportingArtifacts,
      ...(options.debug ? capsule.debugArtifacts : [])
    ];
  return {
    id: capsule.id,
    title: capsule.title,
    slug: capsule.slug,
    source_url: capsule.sourceUrl,
    content_fingerprint: capsule.contentFingerprint,
    run_ids: capsule.runIds,
    grouping_reason: capsule.groupingReason,
    lifecycle: {
      knowledge_status: capsule.lifecycle.knowledgeStatus,
      confidence_level: capsule.lifecycle.confidenceLevel,
      confidence_score: capsule.lifecycle.confidenceScore,
      staleness: capsule.lifecycle.staleness,
      evidence_count: capsule.lifecycle.evidenceCount,
      evidence_refs: capsule.lifecycle.evidenceRefs,
      warnings: capsule.lifecycle.warnings
    },
    okf: {
      ready: capsule.okf.ready,
      type: capsule.okf.type,
      title: capsule.okf.title,
      description: capsule.okf.description,
      resource: capsule.okf.resource,
      timestamp: capsule.okf.timestamp,
      citations: capsule.okf.citations,
      warnings: capsule.okf.warnings
    },
    quality: capsule.quality,
    primary: capsule.primary ? artifactToJson(capsule.primary) : undefined,
    artifacts: artifacts.map(artifactToJson)
  };
}

export function capsuleMetrics(capsules: SourceCapsule[]): CapsuleMetrics {
  const entropyWarnings = capsules.flatMap((capsule) => capsule.quality.warnings.filter((warning) => warning.startsWith("capsule:")));
  const lifecycleWarnings = capsules.flatMap((capsule) => capsule.lifecycle.warnings);
  return {
    capsule_count: capsules.length,
    capsule_with_primary_count: capsules.filter((capsule) => Boolean(capsule.primary)).length,
    entropy_risk: risk(entropyWarnings.length, capsules.length),
    lifecycle_risk: risk(lifecycleWarnings.length, capsules.length),
    okf_ready_count: capsules.filter((capsule) => capsule.okf.ready).length
  };
}

function toCapsule(id: string, reason: CapsuleGroupingReason, artifacts: AiwikiArtifact[], now: string): SourceCapsule {
  const sorted = [...artifacts].sort(artifactSort);
  const primaries = sorted.filter((artifact) => artifact.role === "primary" || artifact.visibility === "primary");
  const primary = primaries[0] ?? sorted.find((artifact) => artifact.kind === "wiki_entry");
  const evidenceBase = primary ?? sorted.find((artifact) => artifact.kind === "source_card") ?? sorted[0];
  const lifecycle = evidenceBase ? lifecycleFromFrontmatter(evidenceBase.frontmatter) : {
    knowledgeStatus: "unknown",
    confidenceLevel: "unknown",
    confidenceScore: undefined,
    lastConfirmed: now,
    validFrom: now,
    validUntil: null,
    staleness: "unknown",
    evidenceCount: 0,
    evidenceRefs: [],
    accessCount: 0,
    lastAccessed: null,
    supersedes: [],
    supersededBy: [],
    contradictedBy: [],
    warnings: ["capsule:empty"]
  } as KnowledgeLifecycle;
  const okf = evidenceBase ? okfProjectionFromArtifact(evidenceBase) : {
    ready: false,
    tags: [],
    citations: [],
    warnings: ["okf_missing_artifact"]
  } as OkfProjection;
  const warnings = capsuleWarnings(sorted, primary, primaries.length);
  const penalty = lifecyclePenalty(lifecycle);
  return {
    id,
    title: bestTitle(primary, sorted),
    slug: first(sorted.map((artifact) => artifact.slug)),
    sourceUrl: first(sorted.map((artifact) => artifact.sourceUrl)),
    contentFingerprint: first(sorted.map((artifact) => artifact.contentFingerprint)),
    runIds: unique(sorted.map((artifact) => artifact.runId).filter((value): value is string => Boolean(value))),
    groupingReason: reason,
    primary,
    artifacts: sorted,
    supportingArtifacts: sorted.filter((artifact) => artifact.visibility === "supporting"),
    debugArtifacts: sorted.filter((artifact) => artifact.visibility === "debug"),
    lifecycle,
    okf,
    quality: {
      score: Number(Math.max(0, 1 - penalty - warnings.length * 0.05).toFixed(2)),
      lifecyclePenalty: penalty,
      warnings: [...warnings, ...lifecycle.warnings, ...okf.warnings]
    }
  };
}

function groupingKey(artifact: AiwikiArtifact): { key: string; reason: CapsuleGroupingReason } {
  if (artifact.capsuleId) return { key: artifact.capsuleId, reason: "explicit_capsule_id" };
  if (artifact.contentFingerprint) return { key: `src_${fingerprintKey(artifact.contentFingerprint)}`, reason: "content_fingerprint" };
  if (artifact.sourceUrl) return { key: `url_${stableKey(artifact.sourceUrl)}`, reason: "source_url" };
  if (artifact.slug) return { key: `slug_${artifact.slug}`, reason: "slug" };
  if (artifact.runId) return { key: `run_${artifact.runId}`, reason: "run_id" };
  return { key: `path_${stableKey(stripRoleSuffix(path.basename(artifact.vaultPath, ".md")))}`, reason: "path_fallback" };
}

function artifactSort(left: AiwikiArtifact, right: AiwikiArtifact): number {
  return visibilityWeight(left.visibility) - visibilityWeight(right.visibility)
    || roleWeight(left.role) - roleWeight(right.role)
    || left.vaultPath.localeCompare(right.vaultPath);
}

function visibilityWeight(value: AiwikiArtifact["visibility"]): number {
  if (value === "primary") return 0;
  if (value === "supporting") return 1;
  return 2;
}

function roleWeight(value: AiwikiArtifact["role"]): number {
  const weights: Record<AiwikiArtifact["role"], number> = {
    primary: 0,
    source_card: 1,
    raw_source: 2,
    claim_suggestions: 3,
    asset_suggestions: 4,
    topic_suggestions: 5,
    outline: 6,
    run_log: 7,
    unknown: 8
  };
  return weights[value];
}

function capsuleWarnings(artifacts: AiwikiArtifact[], primary: AiwikiArtifact | undefined, primaryCount: number): string[] {
  const warnings: string[] = [];
  if (!primary) warnings.push("capsule:missing_primary");
  if (primaryCount > 1) warnings.push("capsule:duplicate_primary");
  if (artifacts.every((artifact) => artifact.visibility === "debug")) warnings.push("capsule:debug_only");
  if (!artifacts.some((artifact) => artifact.kind === "raw_article" || artifact.kind === "source_card")) warnings.push("capsule:missing_evidence_artifact");
  return warnings;
}

function bestTitle(primary: AiwikiArtifact | undefined, artifacts: AiwikiArtifact[]): string {
  return primary?.title
    ?? artifacts.find((artifact) => artifact.kind === "source_card")?.title
    ?? artifacts.find((artifact) => artifact.title)?.title
    ?? "Untitled Source Capsule";
}

function capsuleSearchScore(capsule: SourceCapsule, tokens: string[]): number {
  if (!tokens.length) return 0;
  const haystack = [
    capsule.id,
    capsule.title,
    capsule.slug,
    capsule.sourceUrl,
    capsule.contentFingerprint,
    ...capsule.artifacts.flatMap((artifact) => [
      artifact.vaultPath,
      artifact.title,
      artifact.summary,
      artifact.description,
      artifact.bodyPreview
    ])
  ].filter(Boolean).join("\n").toLowerCase();
  const hits = tokens.filter((token) => haystack.includes(token.toLowerCase())).length;
  return Number((hits / tokens.length).toFixed(2));
}

function tokenize(value: string): string[] {
  const compact = value.trim();
  if (!compact) return [];
  return unique([compact, ...compact.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2)]);
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 10;
  return Math.max(1, Math.min(50, Math.floor(value ?? 10)));
}

function artifactToJson(artifact: AiwikiArtifact) {
  return {
    path: artifact.vaultPath,
    kind: artifact.kind,
    role: artifact.role,
    visibility: artifact.visibility,
    title: artifact.title,
    summary: artifact.summary,
    source_url: artifact.sourceUrl,
    run_id: artifact.runId,
    content_fingerprint: artifact.contentFingerprint,
    body_preview: artifact.bodyPreview
  };
}

function capsuleMatchesFilters(capsule: SourceCapsule, filters: CapsuleFilters | undefined): boolean {
  const normalized = normalizeFilters(filters);
  if (!Object.keys(normalized).length) {
    return true;
  }
  return capsule.artifacts.some((artifact) => artifactMatchesFilters(artifact, normalized));
}

function artifactMatchesFilters(artifact: AiwikiArtifact, filters: CapsuleFilters): boolean {
  if (filters.type && !artifactMatchesType(artifact, filters.type)) {
    return false;
  }
  if (filters.source_role && frontmatterString(artifact.frontmatter, "source_role") !== filters.source_role) {
    return false;
  }
  if (filters.wiki_type && frontmatterString(artifact.frontmatter, "wiki_type") !== filters.wiki_type) {
    return false;
  }
  if (filters.status && frontmatterString(artifact.frontmatter, "status") !== filters.status) {
    return false;
  }
  return true;
}

function artifactMatchesType(artifact: AiwikiArtifact, type: string): boolean {
  const normalized = typeMap(type);
  return artifact.kind === normalized || artifact.type === normalized || artifact.kind === type || artifact.type === type;
}

function typeMap(type: string): string {
  const map: Record<string, string> = {
    wiki_entries: "wiki_entry",
    source_cards: "source_card",
    claims: "claim_suggestions",
    topics: "topic_candidates",
    outlines: "draft_outline",
    raw_refs: "raw_article"
  };
  return map[type] ?? type;
}

function normalizeFilters(filters: CapsuleFilters | undefined): CapsuleFilters {
  return Object.fromEntries(
    Object.entries(filters ?? {})
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([key, value]) => [key, String(value).trim()])
  ) as CapsuleFilters;
}

function capsuleSortKey(capsule: SourceCapsule): string {
  return capsule.primary?.vaultPath ?? capsule.artifacts[0]?.vaultPath ?? capsule.id;
}

function first(values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value.trim());
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function risk(warnings: number, total: number): CapsuleMetrics["entropy_risk"] {
  if (!total || warnings === 0) return "low";
  if (warnings <= Math.max(2, total * 0.25)) return "medium";
  return "high";
}

function fingerprintKey(value: string): string {
  return value.replace(/^sha256:/, "").slice(0, 16).toLowerCase();
}

function stableKey(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function stripRoleSuffix(value: string): string {
  return value.replace(/-(claims|assets|topics|outline|source-card|raw|wiki-entry|processing-summary)$/i, "");
}
