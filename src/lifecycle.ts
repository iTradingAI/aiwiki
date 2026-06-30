import { frontmatterArray, frontmatterNullableString, frontmatterNumber, frontmatterString, type FrontmatterValue } from "./frontmatter.js";

export type KnowledgeStatus =
  | "active"
  | "needs_review"
  | "stale"
  | "superseded"
  | "contradicted"
  | "archived"
  | "unknown";

export type ConfidenceLevel = "low" | "medium" | "high" | "unknown";
export type Staleness = "fresh" | "aging" | "stale" | "unknown";

export type KnowledgeLifecycle = {
  knowledgeStatus: KnowledgeStatus;
  confidenceLevel: ConfidenceLevel;
  confidenceScore?: number | null;
  lastConfirmed?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  staleness: Staleness;
  evidenceCount: number;
  evidenceRefs: string[];
  accessCount?: number;
  lastAccessed?: string | null;
  supersedes: string[];
  supersededBy: string[];
  contradictedBy: string[];
  warnings: string[];
};

export function defaultLifecycle(now: string): KnowledgeLifecycle {
  return {
    knowledgeStatus: "active",
    confidenceLevel: "medium",
    confidenceScore: null,
    lastConfirmed: now,
    validFrom: now,
    validUntil: null,
    staleness: "fresh",
    evidenceCount: 1,
    evidenceRefs: [],
    accessCount: 0,
    lastAccessed: null,
    supersedes: [],
    supersededBy: [],
    contradictedBy: [],
    warnings: []
  };
}

export function lifecycleFromFrontmatter(frontmatter: Record<string, FrontmatterValue>): KnowledgeLifecycle {
  const status = normalizeKnowledgeStatus(frontmatterString(frontmatter, "knowledge_status"));
  const confidence = normalizeConfidence(frontmatterString(frontmatter, "confidence_level"));
  const staleness = normalizeStaleness(frontmatterString(frontmatter, "staleness"));
  const evidenceRefs = frontmatterArray(frontmatter, "evidence_refs");
  const lifecycle: KnowledgeLifecycle = {
    knowledgeStatus: status,
    confidenceLevel: confidence,
    confidenceScore: frontmatterNumber(frontmatter, "confidence_score") ?? (frontmatterNullableString(frontmatter, "confidence_score") === null ? null : undefined),
    lastConfirmed: frontmatterNullableString(frontmatter, "last_confirmed"),
    validFrom: frontmatterNullableString(frontmatter, "valid_from"),
    validUntil: frontmatterNullableString(frontmatter, "valid_until"),
    staleness,
    evidenceCount: frontmatterNumber(frontmatter, "evidence_count") ?? evidenceRefs.length,
    evidenceRefs,
    accessCount: frontmatterNumber(frontmatter, "access_count"),
    lastAccessed: frontmatterNullableString(frontmatter, "last_accessed"),
    supersedes: frontmatterArray(frontmatter, "supersedes"),
    supersededBy: frontmatterArray(frontmatter, "superseded_by"),
    contradictedBy: frontmatterArray(frontmatter, "contradicted_by"),
    warnings: []
  };
  lifecycle.warnings = lifecycleWarnings(lifecycle);
  return lifecycle;
}

export function lifecycleToFrontmatter(lifecycle: KnowledgeLifecycle): Record<string, FrontmatterValue> {
  return {
    knowledge_status: lifecycle.knowledgeStatus,
    confidence_level: lifecycle.confidenceLevel,
    confidence_score: lifecycle.confidenceScore ?? null,
    last_confirmed: lifecycle.lastConfirmed ?? null,
    valid_from: lifecycle.validFrom ?? null,
    valid_until: lifecycle.validUntil ?? null,
    staleness: lifecycle.staleness,
    evidence_count: lifecycle.evidenceCount,
    evidence_refs: lifecycle.evidenceRefs,
    access_count: lifecycle.accessCount ?? 0,
    last_accessed: lifecycle.lastAccessed ?? null,
    supersedes: lifecycle.supersedes,
    superseded_by: lifecycle.supersededBy,
    contradicted_by: lifecycle.contradictedBy
  };
}

export function lifecyclePenalty(lifecycle: KnowledgeLifecycle): number {
  let penalty = 0;
  if (lifecycle.knowledgeStatus === "needs_review") penalty += 0.05;
  if (lifecycle.knowledgeStatus === "stale") penalty += 0.15;
  if (lifecycle.knowledgeStatus === "superseded") penalty += 0.5;
  if (lifecycle.knowledgeStatus === "contradicted") penalty += 0.25;
  if (lifecycle.knowledgeStatus === "archived") penalty += 0.75;
  if (lifecycle.confidenceLevel === "low") penalty += 0.1;
  if (lifecycle.staleness === "aging") penalty += 0.05;
  if (lifecycle.staleness === "stale") penalty += 0.15;
  return Number(penalty.toFixed(2));
}

export function lifecycleWarnings(lifecycle: KnowledgeLifecycle): string[] {
  const warnings: string[] = [];
  if (lifecycle.knowledgeStatus === "unknown") warnings.push("lifecycle:unknown");
  if (lifecycle.confidenceLevel === "unknown") warnings.push("confidence:unknown");
  if (lifecycle.knowledgeStatus === "superseded" && !lifecycle.supersededBy.length) warnings.push("superseded_without_target");
  if (lifecycle.knowledgeStatus === "contradicted" && !lifecycle.contradictedBy.length) warnings.push("contradicted_without_target");
  if (lifecycle.knowledgeStatus === "active" && lifecycle.supersededBy.length) warnings.push("active_but_superseded_by_present");
  if (lifecycle.evidenceCount === 0 && !lifecycle.evidenceRefs.length) warnings.push("evidence:missing");
  if (lifecycle.validUntil && Date.parse(lifecycle.validUntil) < Date.now() && lifecycle.knowledgeStatus === "active") warnings.push("active_but_valid_until_expired");
  return warnings;
}

export function isAnswerSafeByDefault(lifecycle: KnowledgeLifecycle): boolean {
  return lifecycle.knowledgeStatus === "active" || lifecycle.knowledgeStatus === "unknown";
}

function normalizeKnowledgeStatus(value: string | undefined): KnowledgeStatus {
  if (value === "active" || value === "needs_review" || value === "stale" || value === "superseded" || value === "contradicted" || value === "archived") {
    return value;
  }
  return "unknown";
}

function normalizeConfidence(value: string | undefined): ConfidenceLevel {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "unknown";
}

function normalizeStaleness(value: string | undefined): Staleness {
  if (value === "fresh" || value === "aging" || value === "stale") {
    return value;
  }
  return "unknown";
}
