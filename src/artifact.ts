import { promises as fs } from "node:fs";
import path from "node:path";

import { frontmatterString, parseMarkdown, type FrontmatterValue } from "./frontmatter.js";
import { relativePath } from "./paths.js";
import { exists } from "./workspace.js";

export type ArtifactRole =
  | "primary"
  | "raw_source"
  | "source_card"
  | "claim_suggestions"
  | "asset_suggestions"
  | "topic_suggestions"
  | "outline"
  | "run_log"
  | "unknown";

export type ArtifactVisibility = "primary" | "supporting" | "debug";

export type ArtifactKind =
  | "wiki_entry"
  | "raw_article"
  | "source_card"
  | "claim_suggestions"
  | "asset_suggestions"
  | "topic_candidates"
  | "draft_outline"
  | "processing_summary"
  | "unknown";

export type AiwikiArtifact = {
  absolutePath: string;
  vaultPath: string;
  filename: string;
  type?: string;
  kind: ArtifactKind;
  role: ArtifactRole;
  visibility: ArtifactVisibility;
  title?: string;
  description?: string;
  summary?: string;
  capsuleId?: string;
  slug?: string;
  sourceUrl?: string;
  contentFingerprint?: string;
  runId?: string;
  frontmatter: Record<string, FrontmatterValue>;
  bodyPreview?: string;
  body?: string;
};

export const ARTIFACT_PATH_RULES = [
  { prefix: "05-wiki/source-knowledge/", kind: "wiki_entry", role: "primary", visibility: "primary" },
  { prefix: "02-raw/articles/", kind: "raw_article", role: "raw_source", visibility: "supporting" },
  { prefix: "03-sources/article-cards/", kind: "source_card", role: "source_card", visibility: "supporting" },
  { prefix: "04-claims/_suggestions/", kind: "claim_suggestions", role: "claim_suggestions", visibility: "supporting" },
  { prefix: "06-assets/_suggestions/", kind: "asset_suggestions", role: "asset_suggestions", visibility: "supporting" },
  { prefix: "07-topics/ready/", kind: "topic_candidates", role: "topic_suggestions", visibility: "supporting" },
  { prefix: "08-outputs/outlines/", kind: "draft_outline", role: "outline", visibility: "supporting" },
  { prefix: "09-runs/", kind: "processing_summary", role: "run_log", visibility: "debug" }
] as const;

const DISCOVERY_DIRS = [
  "05-wiki/source-knowledge",
  "02-raw/articles",
  "03-sources/article-cards",
  "04-claims/_suggestions",
  "06-assets/_suggestions",
  "07-topics/ready",
  "08-outputs/outlines",
  "09-runs"
] as const;

export async function discoverArtifacts(root: string): Promise<AiwikiArtifact[]> {
  const resolved = path.resolve(root);
  const files: string[] = [];
  for (const dir of DISCOVERY_DIRS) {
    const target = path.join(resolved, dir);
    if (await exists(target)) {
      files.push(...await listMarkdownFiles(target));
    }
  }
  return Promise.all(files.sort().map((file) => readArtifact(resolved, file)));
}

export async function readArtifact(root: string, absolutePath: string): Promise<AiwikiArtifact> {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(absolutePath);
  const text = await fs.readFile(resolvedPath, "utf8");
  const parsed = parseMarkdown(text);
  const vaultPath = relativePath(resolvedRoot, resolvedPath);
  const type = frontmatterString(parsed.frontmatter, "type");
  const kind = inferArtifactKind(vaultPath, parsed.frontmatter);
  const role = inferArtifactRole(kind, vaultPath, parsed.frontmatter);
  const visibility = inferArtifactVisibility(role, vaultPath, parsed.frontmatter);

  return {
    absolutePath: resolvedPath,
    vaultPath,
    filename: path.basename(resolvedPath),
    type,
    kind,
    role,
    visibility,
    title: frontmatterString(parsed.frontmatter, "title") ?? path.basename(resolvedPath, ".md"),
    description: frontmatterString(parsed.frontmatter, "description"),
    summary: frontmatterString(parsed.frontmatter, "summary"),
    capsuleId: frontmatterString(parsed.frontmatter, "capsule_id"),
    slug: frontmatterString(parsed.frontmatter, "slug"),
    sourceUrl: frontmatterString(parsed.frontmatter, "source_url") ?? frontmatterString(parsed.frontmatter, "resource"),
    contentFingerprint: frontmatterString(parsed.frontmatter, "content_fingerprint"),
    runId: frontmatterString(parsed.frontmatter, "run_id"),
    frontmatter: parsed.frontmatter,
    bodyPreview: bodyPreview(parsed.body),
    body: parsed.body
  };
}

export function inferArtifactKind(vaultPath: string, frontmatter: Record<string, FrontmatterValue>): ArtifactKind {
  const type = frontmatterString(frontmatter, "type");
  if (isArtifactKind(type)) {
    return type;
  }
  const normalized = normalizeVaultPath(vaultPath);
  const rule = ARTIFACT_PATH_RULES.find((item) => normalized.startsWith(item.prefix));
  return rule?.kind ?? "unknown";
}

export function inferArtifactRole(
  kind: ArtifactKind,
  vaultPath: string,
  frontmatter: Record<string, FrontmatterValue>
): ArtifactRole {
  const role = frontmatterString(frontmatter, "artifact_role");
  if (isArtifactRole(role)) {
    return role;
  }
  const normalized = normalizeVaultPath(vaultPath);
  const rule = ARTIFACT_PATH_RULES.find((item) => normalized.startsWith(item.prefix));
  if (rule) {
    return rule.role;
  }
  if (kind === "wiki_entry") return "primary";
  if (kind === "raw_article") return "raw_source";
  if (kind === "source_card") return "source_card";
  if (kind === "processing_summary") return "run_log";
  return "unknown";
}

export function inferArtifactVisibility(
  role: ArtifactRole,
  vaultPath: string,
  frontmatter: Record<string, FrontmatterValue>
): ArtifactVisibility {
  const visibility = frontmatterString(frontmatter, "visibility");
  if (visibility === "primary" || visibility === "supporting" || visibility === "debug") {
    return visibility;
  }
  const normalized = normalizeVaultPath(vaultPath);
  const rule = ARTIFACT_PATH_RULES.find((item) => normalized.startsWith(item.prefix));
  if (rule) {
    return rule.visibility;
  }
  if (role === "primary") return "primary";
  if (role === "run_log") return "debug";
  return "supporting";
}

export function normalizeArtifactFrontmatter(artifact: AiwikiArtifact): Record<string, FrontmatterValue> {
  return {
    ...artifact.frontmatter,
    type: artifact.kind,
    artifact_role: artifact.role,
    visibility: artifact.visibility,
    ...(artifact.capsuleId ? { capsule_id: artifact.capsuleId } : {})
  };
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(target));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(target);
    }
  }
  return files;
}

function normalizeVaultPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isArtifactKind(value: string | undefined): value is ArtifactKind {
  return Boolean(value && [
    "wiki_entry",
    "raw_article",
    "source_card",
    "claim_suggestions",
    "asset_suggestions",
    "topic_candidates",
    "draft_outline",
    "processing_summary",
    "unknown"
  ].includes(value));
}

function isArtifactRole(value: string | undefined): value is ArtifactRole {
  return Boolean(value && [
    "primary",
    "raw_source",
    "source_card",
    "claim_suggestions",
    "asset_suggestions",
    "topic_suggestions",
    "outline",
    "run_log",
    "unknown"
  ].includes(value));
}

function bodyPreview(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 220 ? `${compact.slice(0, 220)}...` : compact;
}
