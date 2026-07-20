import { frontmatterArray, frontmatterObjectArray, type FrontmatterValue } from "./frontmatter.js";
import type { ConfidenceLevel } from "./lifecycle.js";

export type RelationshipType =
  | "derives_from"
  | "summarizes"
  | "supports"
  | "contradicts"
  | "updates"
  | "supersedes"
  | "superseded_by"
  | "related_to"
  | "used_by"
  | "mentions_topic"
  | "uses"
  | "depends_on"
  | "derived_from"
  | "mentions";

export type TypedRelationship = {
  type: RelationshipType;
  target: string;
  evidence?: string;
  confidenceLevel?: ConfidenceLevel;
  note?: string;
};

export function relationshipsFromFrontmatter(frontmatter: Record<string, FrontmatterValue>): TypedRelationship[] {
  const explicit = frontmatterObjectArray(frontmatter, "relationships").flatMap((item) => {
    const type = typeof item.type === "string" ? item.type : undefined;
    const target = typeof item.target === "string" ? item.target : undefined;
    if (!isRelationshipType(type) || !target) {
      return [];
    }
    const confidence = typeof item.confidence_level === "string" && isConfidence(item.confidence_level)
      ? item.confidence_level
      : undefined;
    return [{
      type,
      target,
      evidence: typeof item.evidence === "string" ? item.evidence : undefined,
      confidenceLevel: confidence,
      note: typeof item.note === "string" ? item.note : undefined
    }];
  });

  return [
    ...explicit,
    ...frontmatterArray(frontmatter, "supersedes").map((target) => ({ type: "supersedes" as const, target })),
    ...frontmatterArray(frontmatter, "superseded_by").map((target) => ({ type: "superseded_by" as const, target })),
    ...frontmatterArray(frontmatter, "contradicted_by").map((target) => ({ type: "contradicts" as const, target }))
  ];
}

export function relationshipsToFrontmatter(relationships: TypedRelationship[]): unknown[] {
  return relationships.map((relationship) => ({
    type: relationship.type,
    target: relationship.target,
    ...(relationship.evidence ? { evidence: relationship.evidence } : {}),
    ...(relationship.confidenceLevel ? { confidence_level: relationship.confidenceLevel } : {}),
    ...(relationship.note ? { note: relationship.note } : {})
  }));
}

export function validateRelationships(relationships: TypedRelationship[]): string[] {
  const warnings: string[] = [];
  for (const relationship of relationships) {
    if (!isRelationshipType(relationship.type)) {
      warnings.push(`invalid_relationship_type:${relationship.type}`);
    }
    if (!relationship.target.trim()) {
      warnings.push("relationship_missing_target");
    }
    if (relationship.confidenceLevel && !isConfidence(relationship.confidenceLevel)) {
      warnings.push(`invalid_relationship_confidence:${relationship.confidenceLevel}`);
    }
  }
  return warnings;
}

export function isRelationshipType(value: string | undefined): value is RelationshipType {
  return Boolean(value && [
    "derives_from",
    "summarizes",
    "supports",
    "contradicts",
    "updates",
    "supersedes",
    "superseded_by",
    "related_to",
    "used_by",
    "mentions_topic",
    "uses",
    "depends_on",
    "derived_from",
    "mentions"
  ].includes(value));
}

function isConfidence(value: string): value is ConfidenceLevel {
  return value === "low" || value === "medium" || value === "high" || value === "unknown";
}
