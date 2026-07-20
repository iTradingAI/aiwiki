import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

import { discoverArtifacts, type ArtifactKind, type ArtifactRole, type ArtifactVisibility } from "./artifact.js";
import { safeJoin } from "./paths.js";
import { schemaId } from "./schema.js";
import { withIndexLock } from "./state/lock.js";
import { buildRebuildProjection } from "./state/projection.js";

export type StructuredIndexState = "fresh" | "stale" | "missing" | "invalid";

export type StructuredIndexSummary = {
  total: number;
  primary: number;
  supporting: number;
  debug: number;
  source_urls: number;
  duplicate_source_urls: number;
  outbound_links: number;
  inbound_links: number;
};

export type StructuredIndexRecord = {
  path: string;
  kind: ArtifactKind;
  role: ArtifactRole;
  visibility: ArtifactVisibility;
  title: string;
  summary?: string;
  source_url?: string;
  content_hash: string;
  outbound_paths: string[];
  inbound_paths: string[];
};

export type StructuredIndex = {
  schema_version: "aiwiki.index.v1";
  root: ".";
  generated_at: string;
  source_snapshot_id: string;
  summary: StructuredIndexSummary;
  records: StructuredIndexRecord[];
};

export type StructuredIndexStatus = {
  schema_version: "aiwiki.index_status.v1";
  state: StructuredIndexState;
  source_snapshot_id: string;
  indexed_snapshot_id?: string;
  summary: StructuredIndexSummary;
  file: ".aiwiki/state/index.json";
};

const INDEX_RELATIVE_PATH = [".aiwiki", "state", "index.json"] as const;
const WIKILINK_PATTERN = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const ARTIFACT_KINDS: readonly ArtifactKind[] = [
  "wiki_entry",
  "raw_article",
  "source_card",
  "claim_suggestions",
  "asset_suggestions",
  "topic_candidates",
  "draft_outline",
  "processing_summary",
  "unknown"
];
const ARTIFACT_ROLES: readonly ArtifactRole[] = [
  "primary",
  "raw_source",
  "source_card",
  "claim_suggestions",
  "asset_suggestions",
  "topic_suggestions",
  "outline",
  "run_log",
  "unknown"
];

export async function buildStructuredIndex(rootPath: string, now = new Date().toISOString()): Promise<StructuredIndex> {
  const root = path.resolve(rootPath);
  return withIndexLock(root, async () => {
    const index = await buildIndex(root, now);
    await writeIndex(root, index);
    return index;
  });
}

export async function inspectStructuredIndex(rootPath: string): Promise<StructuredIndexStatus> {
  const root = path.resolve(rootPath);
  const sourceSnapshotId = (await buildRebuildProjection(root)).snapshotId;
  let index: StructuredIndex | undefined;
  try {
    index = await readIndex(root);
  } catch (error) {
    if (error instanceof IndexStorageError) {
      return statusFor("invalid", sourceSnapshotId, emptySummary());
    }
    throw error;
  }

  if (!index) {
    return statusFor("missing", sourceSnapshotId, emptySummary());
  }
  if (index.source_snapshot_id !== sourceSnapshotId) {
    return statusFor("stale", sourceSnapshotId, index.summary, index.source_snapshot_id);
  }
  return statusFor("fresh", sourceSnapshotId, index.summary, index.source_snapshot_id);
}

async function buildIndex(root: string, now: string): Promise<StructuredIndex> {
  const [projection, artifacts] = await Promise.all([
    buildRebuildProjection(root, now),
    discoverArtifacts(root)
  ]);
  const knownPaths = new Set(artifacts.map((artifact) => artifact.vaultPath));
  const records: StructuredIndexRecord[] = await Promise.all(artifacts.map(async (artifact) => {
    const raw = await fs.readFile(artifact.absolutePath, "utf8");
    return {
      path: artifact.vaultPath,
      kind: artifact.kind,
      role: artifact.role,
      visibility: artifact.visibility,
      title: artifact.title ?? path.basename(artifact.absolutePath, ".md"),
      ...(artifact.summary ? { summary: artifact.summary } : {}),
      ...(artifact.sourceUrl ? { source_url: artifact.sourceUrl } : {}),
      content_hash: hash(raw),
      outbound_paths: linkedPaths(artifact.body ?? raw, knownPaths),
      inbound_paths: []
    } satisfies StructuredIndexRecord;
  }));
  records.sort((left, right) => left.path.localeCompare(right.path));

  const inbound = new Map<string, string[]>();
  for (const record of records) {
    for (const target of record.outbound_paths) {
      const sources = inbound.get(target) ?? [];
      sources.push(record.path);
      inbound.set(target, sources);
    }
  }
  for (const record of records) {
    record.inbound_paths = sortedUnique(inbound.get(record.path) ?? []);
  }

  return {
    schema_version: schemaId("stateIndex"),
    root: ".",
    generated_at: now,
    source_snapshot_id: projection.snapshotId,
    summary: summaryFor(records),
    records
  };
}

async function readIndex(root: string): Promise<StructuredIndex | undefined> {
  const target = indexPath(root);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(target, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    if (error instanceof SyntaxError) {
      throw new IndexStorageError("index file has invalid JSON.");
    }
    throw error;
  }
  return validateIndex(parsed);
}

async function writeIndex(root: string, index: StructuredIndex): Promise<void> {
  const target = indexPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), "." + path.basename(target) + "." + randomUUID() + ".tmp");
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(temporary, "wx");
    await handle.writeFile(JSON.stringify(index, null, 2) + "\n", "utf8");
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, target);
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

function validateIndex(value: unknown): StructuredIndex {
  if (!isRecord(value)
    || value.schema_version !== schemaId("stateIndex")
    || value.root !== "."
    || typeof value.generated_at !== "string"
    || !value.generated_at
    || !isHash(value.source_snapshot_id)
    || !Array.isArray(value.records)) {
    throw new IndexStorageError("index file has an invalid envelope.");
  }

  const records = value.records.map(validateRecord);
  const paths = records.map((record) => record.path);
  if (!isSortedUnique(paths)) {
    throw new IndexStorageError("index records are not deterministically sorted.");
  }

  const knownPaths = new Set(paths);
  const expectedInbound = new Map<string, string[]>();
  for (const record of records) {
    for (const target of record.outbound_paths) {
      if (!knownPaths.has(target)) {
        throw new IndexStorageError("index record links to an unknown path.");
      }
      const sources = expectedInbound.get(target) ?? [];
      sources.push(record.path);
      expectedInbound.set(target, sources);
    }
  }
  for (const record of records) {
    if (!sameStringArray(record.inbound_paths, sortedUnique(expectedInbound.get(record.path) ?? []))) {
      throw new IndexStorageError("index inbound paths do not match outbound paths.");
    }
  }

  const summary = validateSummary(value.summary);
  if (JSON.stringify(summary) !== JSON.stringify(summaryFor(records))) {
    throw new IndexStorageError("index summary does not match records.");
  }

  return {
    schema_version: schemaId("stateIndex"),
    root: ".",
    generated_at: value.generated_at,
    source_snapshot_id: value.source_snapshot_id,
    summary,
    records
  };
}

function validateRecord(value: unknown): StructuredIndexRecord {
  if (!isRecord(value)
    || !isRelativePath(value.path)
    || !isArtifactKind(value.kind)
    || !isArtifactRole(value.role)
    || !isVisibility(value.visibility)
    || typeof value.title !== "string"
    || !value.title
    || value.summary !== undefined && typeof value.summary !== "string"
    || value.source_url !== undefined && typeof value.source_url !== "string"
    || !isHash(value.content_hash)
    || !isSortedUniquePathArray(value.outbound_paths)
    || !isSortedUniquePathArray(value.inbound_paths)) {
    throw new IndexStorageError("index record has an invalid shape.");
  }

  return {
    path: value.path,
    kind: value.kind,
    role: value.role,
    visibility: value.visibility,
    title: value.title,
    ...(value.summary !== undefined ? { summary: value.summary } : {}),
    ...(value.source_url !== undefined ? { source_url: value.source_url } : {}),
    content_hash: value.content_hash,
    outbound_paths: [...value.outbound_paths],
    inbound_paths: [...value.inbound_paths]
  };
}

function validateSummary(value: unknown): StructuredIndexSummary {
  if (!isRecord(value)) {
    throw new IndexStorageError("index summary has an invalid shape.");
  }
  const { total, primary, supporting, debug, source_urls: sourceUrls, duplicate_source_urls: duplicateSourceUrls, outbound_links: outboundLinks, inbound_links: inboundLinks } = value;
  if (!isNonNegativeInteger(total)
    || !isNonNegativeInteger(primary)
    || !isNonNegativeInteger(supporting)
    || !isNonNegativeInteger(debug)
    || !isNonNegativeInteger(sourceUrls)
    || !isNonNegativeInteger(duplicateSourceUrls)
    || !isNonNegativeInteger(outboundLinks)
    || !isNonNegativeInteger(inboundLinks)
    || Object.values(value).some((entry) => typeof entry !== "number" || entry < 0)) {
    throw new IndexStorageError("index summary has an invalid shape.");
  }

  return {
    total,
    primary,
    supporting,
    debug,
    source_urls: sourceUrls,
    duplicate_source_urls: duplicateSourceUrls,
    outbound_links: outboundLinks,
    inbound_links: inboundLinks
  };
}

function linkedPaths(body: string, knownPaths: ReadonlySet<string>): string[] {
  const targets = [];
  for (const match of body.matchAll(WIKILINK_PATTERN)) {
    const target = resolveLocalWikilink(match[1], knownPaths);
    if (target) {
      targets.push(target);
    }
  }
  return sortedUnique(targets);
}

function resolveLocalWikilink(value: string | undefined, knownPaths: ReadonlySet<string>): string | undefined {
  const target = value?.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!target || !isRelativePath(target)) {
    return undefined;
  }
  const candidates = target.toLowerCase().endsWith(".md") ? [target] : [target, `${target}.md`];
  return candidates.find((candidate) => knownPaths.has(candidate));
}

function summaryFor(records: readonly StructuredIndexRecord[]): StructuredIndexSummary {
  const urlCounts = new Map<string, number>();
  for (const record of records) {
    if (record.source_url) {
      urlCounts.set(record.source_url, (urlCounts.get(record.source_url) ?? 0) + 1);
    }
  }
  return {
    total: records.length,
    primary: records.filter((record) => record.visibility === "primary").length,
    supporting: records.filter((record) => record.visibility === "supporting").length,
    debug: records.filter((record) => record.visibility === "debug").length,
    source_urls: urlCounts.size,
    duplicate_source_urls: [...urlCounts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
    outbound_links: records.reduce((total, record) => total + record.outbound_paths.length, 0),
    inbound_links: records.reduce((total, record) => total + record.inbound_paths.length, 0)
  };
}

function statusFor(
  state: StructuredIndexState,
  sourceSnapshotId: string,
  summary: StructuredIndexSummary,
  indexedSnapshotId?: string
): StructuredIndexStatus {
  return {
    schema_version: "aiwiki.index_status.v1",
    state,
    source_snapshot_id: sourceSnapshotId,
    ...(indexedSnapshotId ? { indexed_snapshot_id: indexedSnapshotId } : {}),
    summary,
    file: ".aiwiki/state/index.json"
  };
}

function indexPath(root: string): string {
  return safeJoin(root, ...INDEX_RELATIVE_PATH);
}

function emptySummary(): StructuredIndexSummary {
  return {
    total: 0,
    primary: 0,
    supporting: 0,
    debug: 0,
    source_urls: 0,
    duplicate_source_urls: 0,
    outbound_links: 0,
    inbound_links: 0
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isSortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]!.localeCompare(value) < 0);
}

function isSortedUniquePathArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isRelativePath) && isSortedUnique(value);
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

function isVisibility(value: unknown): value is ArtifactVisibility {
  return value === "primary" || value === "supporting" || value === "debug";
}

function isArtifactKind(value: unknown): value is ArtifactKind {
  return typeof value === "string" && ARTIFACT_KINDS.includes(value as ArtifactKind);
}

function isArtifactRole(value: unknown): value is ArtifactRole {
  return typeof value === "string" && ARTIFACT_ROLES.includes(value as ArtifactRole);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

class IndexStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexStorageError";
  }
}
