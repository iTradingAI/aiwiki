import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";

import { frontmatterString, parseMarkdown } from "./frontmatter.js";
import { relativePath } from "./paths.js";

export type RunClassification = "health" | "legacy_ingest" | "v2_ingest" | "v2_partial_compact" | "unknown";
export type ManifestV2 = {
  schema_version: "aiwiki.run.v2";
  run_id: string;
  status: "success" | "fetch_failed";
  created_at: string;
  source: {
    kind: string;
    title: string;
    url?: string;
    content_format: string;
    content_bytes: number;
    content_fingerprint: string;
    fetcher: string;
    fetch_status: "ok" | "failed";
  };
  artifacts: {
    processing_summary: string;
    raw?: string;
    source_card?: string;
    wiki_entry?: string;
    claims?: string;
    assets?: string;
    topics?: string;
    outline?: string;
  };
  generation?: {
    wiki_entry_mode: "agent_enriched" | "deterministic_fallback";
    wiki_entry_quality: "enriched" | "scaffold";
  };
  warnings: string[];
};
export type LegacyDuplicate = { artifactType: string; runPath: string; canonicalPath: string | null };
export type RunRecord = {
  runId: string;
  dirName: string;
  dirPath: string;
  classification: RunClassification;
  status?: string;
  manifest?: ManifestV2;
  hasPayloadJson: boolean;
  hasManifestJson: boolean;
  payloadSourceError?: "invalid_payload_source";
  legacyDuplicates: LegacyDuplicate[];
  compactAction: "safe_delete" | "manual_review_required" | "already_v2" | "health_never_compact";
};
export type CompactPlan = {
  totalRuns: number;
  compactableRuns: string[];
  manualReviewRuns: string[];
  alreadyCompactRuns: string[];
  healthRuns: string[];
  unknownRuns: string[];
  destructiveActions: number;
  derived_state_changed: boolean;
  recommended_next_action: string;
};

const TERMINAL_FILES: Record<string, true> = { "manifest.json": true, "processing-summary.md": true };
const LEGACY_ARTIFACTS: ReadonlyArray<{ file: string; artifactType: string; fields: readonly string[] }> = [
  { file: "raw.md", artifactType: "raw", fields: ["raw_file", "raw_note"] },
  { file: "source-card.md", artifactType: "source_card", fields: ["source_card"] },
  { file: "wiki-entry.md", artifactType: "wiki_entry", fields: ["raw_file"] },
  { file: "claims.md", artifactType: "claims", fields: ["claims_note"] },
  { file: "creative-assets.md", artifactType: "assets", fields: ["assets_note"] },
  { file: "topics.md", artifactType: "topics", fields: ["topics_note"] },
  { file: "draft-outline.md", artifactType: "outline", fields: ["outline_note"] }
];
const ALLOWED_CANONICAL_DIRECTORIES = [
  "02-raw/articles/",
  "03-sources/article-cards/",
  "05-wiki/source-knowledge/",
  "04-claims/_suggestions/",
  "06-assets/_suggestions/",
  "07-topics/ready/",
  "08-outputs/outlines/"
] as const;

export async function scanRuns(rootPath: string): Promise<RunRecord[]> {
  const runsPath = path.join(rootPath, "09-runs");
  let entries: Dirent[];
  try {
    entries = await fs.readdir(runsPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).map(async (entry) => {
    const dirPath = path.join(runsPath, entry.name);
    const { classification, hasPayloadJson, payloadSourceError } = await classifyRunDirectoryDetails(dirPath, entry.name);
    const hasManifestJson = await exists(path.join(dirPath, "manifest.json"));
    const manifest = hasManifestJson ? await readManifestOrUndefined(path.join(dirPath, "manifest.json")) : undefined;
    const legacyDuplicates = await discoverLegacyDuplicates(rootPath, dirPath);
    const compactAction = compactActionFor(classification, legacyDuplicates);
    return {
      runId: manifest?.run_id ?? entry.name,
      dirName: entry.name,
      dirPath,
      classification,
      ...(manifest ? { status: manifest.status, manifest } : {}),
      hasPayloadJson,
      hasManifestJson,
      ...(payloadSourceError ? { payloadSourceError } : {}),
      legacyDuplicates,
      compactAction
    };
  }));
}

export async function classifyRunDirectory(dirPath: string, dirName: string): Promise<RunClassification> {
  return (await classifyRunDirectoryDetails(dirPath, dirName)).classification;
}

async function classifyRunDirectoryDetails(dirPath: string, dirName: string): Promise<{
  classification: RunClassification;
  hasPayloadJson: boolean;
  payloadSourceError?: "invalid_payload_source";
}> {
  if (dirName.startsWith("health-") && await isValidJson(path.join(dirPath, "health-report.json"))) {
    return { classification: "health", hasPayloadJson: false };
  }
  const manifestPath = path.join(dirPath, "manifest.json");
  const manifest = await readManifestOrUndefined(manifestPath);
  const payloadPath = path.join(dirPath, "payload.json");
  const hasPayloadJson = await exists(payloadPath);
  let payloadSourceError: "invalid_payload_source" | undefined;
  if (hasPayloadJson) {
    try {
      await readJsonStreaming(payloadPath);
    } catch {
      payloadSourceError = "invalid_payload_source";
    }
  }
  // A present but invalid manifest or payload is authoritative evidence of an interrupted or corrupted migration.
  // Neither may fall through to a destructive compact path.
  if (manifest === null || payloadSourceError) return { classification: "unknown", hasPayloadJson, ...(payloadSourceError ? { payloadSourceError } : {}) };
  if (manifest) {
    const names = await fs.readdir(dirPath);
    if (names.length === Object.keys(TERMINAL_FILES).length && names.every((name) => TERMINAL_FILES[name])) {
      return { classification: "v2_ingest", hasPayloadJson };
    }
    if (hasPayloadJson || names.some((name) => LEGACY_ARTIFACTS.some((artifact) => artifact.file === name))) {
      return { classification: "v2_partial_compact", hasPayloadJson };
    }
    return { classification: "unknown", hasPayloadJson };
  }
  return { classification: hasPayloadJson ? "legacy_ingest" : "unknown", hasPayloadJson };
}

export async function readRunManifest(manifestPath: string): Promise<ManifestV2> {
  const parsed: unknown = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (!isManifestV2(parsed)) throw new Error(`invalid aiwiki.run.v2 manifest: ${manifestPath}`);
  return parsed;
}

export function planCompact(records: readonly RunRecord[]): CompactPlan {
  const compactable = records.filter((record) => record.compactAction === "safe_delete");
  return {
    totalRuns: records.length,
    compactableRuns: compactable.map((record) => record.runId),
    manualReviewRuns: records.filter((record) => record.compactAction === "manual_review_required").map((record) => record.runId),
    alreadyCompactRuns: records.filter((record) => record.compactAction === "already_v2").map((record) => record.runId),
    healthRuns: records.filter((record) => record.compactAction === "health_never_compact").map((record) => record.runId),
    unknownRuns: records.filter((record) => record.classification === "unknown").map((record) => record.runId),
    destructiveActions: compactable.reduce((count, record) => count + record.legacyDuplicates.length + Number(record.hasPayloadJson), 0),
    derived_state_changed: compactable.length > 0,
    recommended_next_action: compactable.length
      ? "Run aiwiki runs compact --yes after reviewing this plan."
      : "No compactable runs found."
  };
}

/** Resolves only a path explicitly carried in artifact frontmatter; it never guesses a filename. */
export async function resolveCanonicalPath(rootPath: string, explicitFrontmatterPathField: string | undefined): Promise<string | null> {
  const reference = parseExplicitReference(explicitFrontmatterPathField);
  if (!reference) return null;
  const root = path.resolve(rootPath);
  const candidates = path.extname(reference)
    ? [path.resolve(root, reference)]
    : [path.resolve(root, reference), path.resolve(root, `${reference}.md`)];
  const contained = candidates.filter((candidate) => {
    const relative = path.relative(root, candidate).split(path.sep).join("/");
    return Boolean(relative) && !relative.startsWith("../") && !path.isAbsolute(relative) &&
      ALLOWED_CANONICAL_DIRECTORIES.some((directory) => relative.startsWith(directory));
  });
  const existing: string[] = [];
  for (const candidate of contained) {
    try {
      await fs.access(candidate);
      existing.push(candidate);
    } catch {
      // An explicit Obsidian link omits .md; absence is resolved only by its exact Markdown extension.
    }
  }
  return existing.length === 1 ? existing[0] : null;
}

export async function verifyByteEquality(leftPath: string, rightPath: string): Promise<boolean> {
  const [left, right] = await Promise.all([streamingHash(leftPath), streamingHash(rightPath)]);
  return left === right;
}

export function streamingHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: string | Buffer) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });
}

/** Reads only the frontmatter prefix needed to validate legacy payload retention before deletion. */
export async function readCanonicalContentFingerprint(filePath: string): Promise<string | null> {
  return frontmatterString(await readFrontmatterPrefix(filePath), "content_fingerprint") ?? null;
}
/** Returns the legacy payload's source object without synthesizing missing fields. */
export async function readLegacyPayloadSource(record: Pick<RunRecord, "dirPath">): Promise<Record<string, unknown> | null> {
  const payload = await readJsonStreaming(path.join(record.dirPath, "payload.json"));
  return isRecord(payload) && isRecord(payload.source) ? payload.source : null;
}

/** Matches ingest's normalized SHA-256 content-fingerprint rule. */
export function deriveContentFingerprint(content: unknown): string | null {
  if (typeof content !== "string" || content.length === 0) return null;
  const encoded = Buffer.from(content, "utf8");
  if (encoded.toString("utf8") !== content) return null;
  return `sha256:${createHash("sha256").update(content.replace(/\r\n/g, "\n"), "utf8").digest("hex")}`;
}


export async function createManifestFromLegacy(record: RunRecord): Promise<ManifestV2> {
  if (record.manifest) return record.manifest;
  const payload = await readJsonStreaming(path.join(record.dirPath, "payload.json")) as LegacyPayload;
  const source = payload.source ?? {};
  const fetchFailed = source.fetch_status === "failed";
  const artifacts: ManifestV2["artifacts"] = {
    processing_summary: relativePath(workspaceRootForRun(record.dirPath), path.join(record.dirPath, "processing-summary.md"))
  };
  for (const duplicate of record.legacyDuplicates) {
    if (duplicate.canonicalPath) artifacts[duplicate.artifactType as keyof ManifestV2["artifacts"]] = relativePath(workspaceRootForRun(record.dirPath), duplicate.canonicalPath);
  }
  if (!fetchFailed && (!artifacts.raw || !artifacts.source_card || !artifacts.wiki_entry)) {
    throw new Error(`run ${record.runId} is missing an explicitly verified canonical artifact`);
  }
  const content = typeof source.content === "string" ? source.content : "";
  const contentFingerprint = deriveContentFingerprint(source.content);
  return {
    schema_version: "aiwiki.run.v2",
    run_id: record.dirName,
    status: fetchFailed ? "fetch_failed" : "success",
    created_at: typeof source.captured_at === "string" ? source.captured_at : new Date().toISOString(),
    source: {
      kind: typeof source.kind === "string" ? source.kind : "unknown",
      title: typeof source.title === "string" ? source.title : "Untitled",
      ...(typeof source.url === "string" && source.url ? { url: source.url } : {}),
      content_format: typeof source.content_format === "string" ? source.content_format : "markdown",
      content_bytes: Buffer.byteLength(content, "utf8"),
      content_fingerprint: contentFingerprint ?? "",
      fetcher: typeof source.fetcher === "string" ? source.fetcher : "unknown",
      fetch_status: fetchFailed ? "failed" : "ok"
    },
    artifacts,
    ...(fetchFailed ? {} : {
      generation: {
        wiki_entry_mode: payload.wiki_entry || payload.analysis ? "agent_enriched" : "deterministic_fallback",
        wiki_entry_quality: payload.wiki_entry || payload.analysis ? "enriched" : "scaffold"
      }
    }),
    warnings: Array.isArray(payload.warnings) ? payload.warnings.filter((warning): warning is string => typeof warning === "string") : []
  };
}

function compactActionFor(classification: RunClassification, duplicates: readonly LegacyDuplicate[]): RunRecord["compactAction"] {
  if (classification === "health") return "health_never_compact";
  if (classification === "v2_ingest") return "already_v2";
  if (classification === "unknown") return "manual_review_required";
  if (classification === "legacy_ingest" || classification === "v2_partial_compact") {
    return duplicates.every((duplicate) => duplicate.canonicalPath !== null) ? "safe_delete" : "manual_review_required";
  }
  return "manual_review_required";
}

async function discoverLegacyDuplicates(rootPath: string, dirPath: string): Promise<LegacyDuplicate[]> {
  const duplicates: LegacyDuplicate[] = [];
  for (const artifact of LEGACY_ARTIFACTS) {
    const runPath = path.join(dirPath, artifact.file);
    if (!await exists(runPath)) continue;
    const frontmatter = await readFrontmatterPrefix(runPath);
    const explicit = artifact.fields.map((field) => frontmatterString(frontmatter, field)).find((field): field is string => Boolean(field));
    let canonicalPath = await resolveCanonicalPath(rootPath, explicit);
    if (artifact.artifactType === "wiki_entry" && canonicalPath) {
      const rawFrontmatter = await readFrontmatterPrefix(canonicalPath);
      canonicalPath = await resolveCanonicalPath(rootPath, frontmatterString(rawFrontmatter, "wiki_entry"));
    }
    if (canonicalPath && !await canonicalCrossValidates(canonicalPath, artifact.fields, explicit!)) {
      duplicates.push({ artifactType: artifact.artifactType, runPath, canonicalPath: null });
      continue;
    }
    duplicates.push({ artifactType: artifact.artifactType, runPath, canonicalPath });
  }
  return duplicates;
}

async function canonicalCrossValidates(canonicalPath: string, fields: readonly string[], explicit: string): Promise<boolean> {
  const frontmatter = await readFrontmatterPrefix(canonicalPath);
  return fields.some((field) => parseExplicitReference(frontmatterString(frontmatter, field)) === parseExplicitReference(explicit));
}

async function readFrontmatterPrefix(filePath: string) {
  const handle = await fs.open(filePath, "r");
  try {
    const bytes = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    return parseMarkdown(bytes.subarray(0, bytesRead).toString("utf8")).frontmatter;
  } finally {
    await handle.close();
  }
}

async function readJsonStreaming(filePath: string): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of createReadStream(filePath)) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
}

function parseExplicitReference(value: string | undefined): string | null {
  if (!value || !value.trim()) return null;
  const links = [...value.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((match) => match[1].trim());
  if (links.length > 1) return null;
  const raw = links.length === 1 ? links[0] : value.trim();
  if (raw.includes("\n") || raw.includes("\r")) return null;
  return raw.replace(/\\/g, "/").replace(/^\.\//, "");
}

function workspaceRootForRun(dirPath: string): string {
  return path.resolve(dirPath, "..", "..");
}

async function readManifestOrUndefined(manifestPath: string): Promise<ManifestV2 | undefined | null> {
  try {
    return await readRunManifest(manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return null;
  }
}

async function isValidJson(filePath: string): Promise<boolean> {
  try {
    JSON.parse(await fs.readFile(filePath, "utf8"));
    return true;
  } catch {
    return false;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isManifestV2(value: unknown): value is ManifestV2 {
  if (!isRecord(value) || !hasOnlyAllowedKeys(value, ["schema_version", "run_id", "status", "created_at", "source", "artifacts", "warnings", "generation"])) return false;
  if (value.schema_version !== "aiwiki.run.v2" || (value.status !== "success" && value.status !== "fetch_failed")) return false;
  if (typeof value.run_id !== "string" || typeof value.created_at !== "string" || !isRecord(value.source) || !isRecord(value.artifacts) || !isStringArray(value.warnings)) return false;

  const source = value.source;
  if (!hasOnlyAllowedKeys(source, ["kind", "title", "url", "content_format", "content_bytes", "content_fingerprint", "fetcher", "fetch_status"])) return false;
  if (typeof source.kind !== "string" || typeof source.title !== "string" || (source.url !== undefined && typeof source.url !== "string") ||
    typeof source.content_format !== "string" || !isNonNegativeFiniteNumber(source.content_bytes) || typeof source.content_fingerprint !== "string" ||
    typeof source.fetcher !== "string" || (source.fetch_status !== "ok" && source.fetch_status !== "failed")) return false;

  const artifacts = value.artifacts;
  if (!hasOnlyAllowedKeys(artifacts, ["processing_summary", "raw", "source_card", "wiki_entry", "claims", "assets", "topics", "outline"]) ||
    typeof artifacts.processing_summary !== "string") return false;
  for (const key of ["raw", "source_card", "wiki_entry", "claims", "assets", "topics", "outline"] as const) {
    if (artifacts[key] !== undefined && typeof artifacts[key] !== "string") return false;
  }

  if (value.status === "success") {
    return source.fetch_status === "ok" && typeof artifacts.raw === "string" && typeof artifacts.source_card === "string" &&
      typeof artifacts.wiki_entry === "string" && isGeneration(value.generation);
  }
  return source.fetch_status === "failed" && artifacts.raw === undefined && artifacts.source_card === undefined &&
    artifacts.wiki_entry === undefined && value.generation === undefined;
}

function hasOnlyAllowedKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isGeneration(value: unknown): value is NonNullable<ManifestV2["generation"]> {
  return isRecord(value) && hasOnlyAllowedKeys(value, ["wiki_entry_mode", "wiki_entry_quality"]) &&
    (value.wiki_entry_mode === "agent_enriched" || value.wiki_entry_mode === "deterministic_fallback") &&
    (value.wiki_entry_quality === "enriched" || value.wiki_entry_quality === "scaffold");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type LegacyPayload = {
  source?: Record<string, unknown>;
  analysis?: unknown;
  wiki_entry?: unknown;
  warnings?: unknown;
};
