import { frontmatterArray, frontmatterString, type FrontmatterValue } from "./frontmatter.js";
import type { AiwikiArtifact } from "./artifact.js";

export type OkfProjection = {
  ready: boolean;
  type?: string;
  title?: string;
  description?: string;
  resource?: string;
  tags: string[];
  timestamp?: string;
  citations: string[];
  warnings: string[];
};

export type OkfReadinessIssue = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  path?: string;
};

export function okfProjectionFromArtifact(artifact: AiwikiArtifact): OkfProjection {
  const citations = extractCitationsFromBody(artifact.body ?? "");
  const description = artifact.description ?? artifact.summary ?? frontmatterString(artifact.frontmatter, "description") ?? frontmatterString(artifact.frontmatter, "summary");
  const projection: OkfProjection = {
    ready: false,
    type: frontmatterString(artifact.frontmatter, "type") ?? artifact.type,
    title: artifact.title,
    description,
    resource: frontmatterString(artifact.frontmatter, "resource") ?? artifact.sourceUrl,
    tags: frontmatterArray(artifact.frontmatter, "tags"),
    timestamp: frontmatterString(artifact.frontmatter, "timestamp") ?? frontmatterString(artifact.frontmatter, "created_at"),
    citations,
    warnings: []
  };
  projection.warnings = okfReadinessIssues(artifact).map((issue) => issue.code);
  projection.ready = projection.warnings.length === 0;
  return projection;
}

export function okfFrontmatterForWikiEntry(input: {
  title: string;
  description?: string;
  sourceUrl?: string;
  tags?: string[];
  timestamp: string;
}): Record<string, FrontmatterValue> {
  return {
    type: "wiki_entry",
    title: input.title,
    description: input.description ?? "",
    resource: input.sourceUrl ?? "",
    tags: input.tags ?? ["source-knowledge"],
    timestamp: input.timestamp
  };
}

export function extractCitationsFromBody(body: string): string[] {
  const citations: string[] = [];
  const sectionMatch = /^#{1,6}\s+Citations\s*$/im.exec(body);
  if (sectionMatch) {
    const rest = body.slice(sectionMatch.index + sectionMatch[0].length);
    for (const line of rest.split(/\r?\n/)) {
      if (/^#{1,6}\s+/.test(line)) {
        break;
      }
      const trimmed = line.trim();
      if (trimmed) {
        citations.push(trimmed);
      }
    }
  }
  const sourceLines = body.match(/^- Source Card:.+|- Raw:.+|- Original URL:.+/gm) ?? [];
  citations.push(...sourceLines.map((line) => line.trim()));
  return Array.from(new Set(citations));
}

export function hasCitationsSection(body: string): boolean {
  return /^#{1,6}\s+Citations\s*$/im.test(body) || /^#{1,6}\s+来源与证据\s*$/m.test(body);
}

export function okfReadinessIssues(artifact: AiwikiArtifact): OkfReadinessIssue[] {
  const issues: OkfReadinessIssue[] = [];
  const type = frontmatterString(artifact.frontmatter, "type") ?? artifact.type;
  const description = artifact.description ?? artifact.summary ?? frontmatterString(artifact.frontmatter, "description") ?? frontmatterString(artifact.frontmatter, "summary");
  const resource = frontmatterString(artifact.frontmatter, "resource") ?? artifact.sourceUrl;
  const timestamp = frontmatterString(artifact.frontmatter, "timestamp") ?? frontmatterString(artifact.frontmatter, "created_at");
  if (!type) issues.push(issue("error", "okf_missing_type", "OKF projection requires type.", artifact.vaultPath));
  if (!artifact.title) issues.push(issue("warning", "okf_missing_title", "OKF projection should include title.", artifact.vaultPath));
  if (!description) issues.push(issue("warning", "okf_missing_description", "OKF projection should include description.", artifact.vaultPath));
  if (!resource) issues.push(issue("info", "okf_missing_resource", "OKF projection should include resource when a source URL exists.", artifact.vaultPath));
  if (!timestamp) issues.push(issue("warning", "okf_missing_timestamp", "OKF projection should include timestamp.", artifact.vaultPath));
  if (!hasCitationsSection(artifact.body ?? "")) issues.push(issue("info", "okf_missing_citations", "OKF-ready entries should include Citations or source evidence.", artifact.vaultPath));
  return issues;
}

function issue(severity: OkfReadinessIssue["severity"], code: string, message: string, path?: string): OkfReadinessIssue {
  return { severity, code, message, path };
}
