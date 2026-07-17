import path from "node:path";

import { discoverArtifacts, type AiwikiArtifact } from "./artifact.js";
import { assessSchemaCompatibility, type AiwikiSchemaKey, type SchemaCompatibility } from "./schema.js";
import { readConfig, resolveRoot } from "./workspace.js";

export type SchemaMigrationFindingStatus = "compatible" | "unsupported_major" | "needs_explicit_migration";
export type SchemaMigrationAction = "none" | "manual_review";

export type SchemaMigrationFinding = {
  path: string;
  schemaId: string;
  suppliedVersion?: string;
  status: SchemaMigrationFindingStatus;
  action: SchemaMigrationAction;
  reason: string;
};

export type SchemaMigrationReport = {
  schema_version: "aiwiki.schema_migration_report.v1";
  dry_run: true;
  would_write: false;
  root: string;
  findings: SchemaMigrationFinding[];
  summary: {
    compatible: number;
    manual_review: number;
  };
};

export async function planSchemaMigration(rootPath: string): Promise<SchemaMigrationReport> {
  const root = resolveRoot(rootPath);
  const config = await readConfig(root);
  const findings: SchemaMigrationFinding[] = [toFinding("aiwiki.yaml", "workspace", config.schemaVersion)];
  const artifacts = await discoverArtifacts(root);

  for (const artifact of artifacts) {
    findings.push(toFinding(artifact.vaultPath, "artifact", frontmatterVersion(artifact, "aiwiki_schema")));
    if (hasAnyField(artifact, ["capsule_id", "aiwiki_capsule_schema"])) {
      findings.push(toFinding(artifact.vaultPath, "capsule", frontmatterVersion(artifact, "aiwiki_capsule_schema")));
    }
    if (hasAnyField(artifact, ["knowledge_status", "confidence_level", "staleness", "aiwiki_lifecycle_schema"])) {
      findings.push(toFinding(artifact.vaultPath, "lifecycle", frontmatterVersion(artifact, "aiwiki_lifecycle_schema")));
    }
    if (hasAnyField(artifact, ["relationships", "supersedes", "superseded_by", "contradicted_by", "aiwiki_relationships_schema"])) {
      findings.push(toFinding(artifact.vaultPath, "relationships", frontmatterVersion(artifact, "aiwiki_relationships_schema")));
    }
  }

  return {
    schema_version: "aiwiki.schema_migration_report.v1",
    dry_run: true,
    would_write: false,
    root: path.resolve(root),
    findings,
    summary: {
      compatible: findings.filter((finding) => finding.action === "none").length,
      manual_review: findings.filter((finding) => finding.action === "manual_review").length
    }
  };
}

function toFinding(filePath: string, key: AiwikiSchemaKey, version: unknown): SchemaMigrationFinding {
  const compatibility = assessSchemaCompatibility(key, version);
  return {
    path: filePath,
    schemaId: compatibility.schemaId,
    ...(compatibility.suppliedVersion ? { suppliedVersion: compatibility.suppliedVersion } : {}),
    status: migrationStatus(compatibility),
    action: compatibility.writable ? "none" : "manual_review",
    reason: compatibility.reason
  };
}

function migrationStatus(compatibility: SchemaCompatibility): SchemaMigrationFindingStatus {
  if (compatibility.status === "compatible") {
    return "compatible";
  }
  return compatibility.status === "unsupported_major" ? "unsupported_major" : "needs_explicit_migration";
}

function frontmatterVersion(artifact: AiwikiArtifact, field: string): unknown {
  return artifact.frontmatter[field];
}

function hasAnyField(artifact: AiwikiArtifact, fields: string[]): boolean {
  return fields.some((field) => Object.hasOwn(artifact.frontmatter, field));
}
