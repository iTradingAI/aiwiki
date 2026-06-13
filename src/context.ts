import { promises as fs } from "node:fs";
import path from "node:path";

import { frontmatterArray, frontmatterBoolean, frontmatterString, parseMarkdown } from "./frontmatter.js";
import { relativePath } from "./paths.js";
import { exists } from "./workspace.js";

type MatchItem = {
  title: string;
  path: string;
  summary: string;
  score: number;
  type: string;
  topics: string[];
  tags: string[];
  source_url: string;
  status?: string;
  source_role?: string;
  wiki_type?: string;
  match_reasons: string[];
  quality_signals: string[];
  related_refs: string[];
  generation_mode?: string;
  quality?: string;
  grounding_evidence_available?: boolean;
  grounding_needs_review?: boolean;
  grounding_markers: string[];
  warnings: string[];
};

export type ContextFilters = {
  type?: string;
  source_role?: string;
  wiki_type?: string;
  status?: string;
};

export type ContextOptions = {
  filters?: ContextFilters;
  limit?: number;
};

export type ContextResult = {
  schema_version: "aiwiki.context.v1";
  query: string;
  generated_at: string;
  query_scope: {
    filters: ContextFilters;
    limit: number;
    searched_groups: string[];
  };
  result_quality: {
    total_matches: number;
    best_score: number;
    has_wiki_entry: boolean;
    warnings: string[];
  };
  recommended_next_action: string;
  matches: {
    wiki_entries: MatchItem[];
    source_cards: MatchItem[];
    claims: MatchItem[];
    topics: MatchItem[];
    outlines: MatchItem[];
    raw_refs: MatchItem[];
  };
  suggested_answer_structure: string[];
  reuse_guidance: {
    writing: string;
    research: string;
    decision: string;
    review: string;
  };
  warnings: string[];
};

const GROUPS = [
  { key: "wiki_entries", dir: "05-wiki", weight: 6 },
  { key: "topics", dir: "07-topics/ready", weight: 5 },
  { key: "source_cards", dir: "03-sources/article-cards", weight: 4 },
  { key: "claims", dir: "04-claims/_suggestions", weight: 3 },
  { key: "outlines", dir: "08-outputs/outlines", weight: 2 },
  { key: "raw_refs", dir: "02-raw/articles", weight: 1 }
] as const;

const DEFAULT_LIMIT = 10;

export async function buildContext(
  rootPath: string,
  query: string,
  options: ContextOptions = {},
  now = new Date().toISOString()
): Promise<ContextResult> {
  const root = path.resolve(rootPath);
  const tokens = tokenize(query);
  const limit = normalizeLimit(options.limit);
  const filters = normalizeFilters(options.filters);
  const result: ContextResult = {
    schema_version: "aiwiki.context.v1",
    query,
    generated_at: now,
    query_scope: {
      filters,
      limit,
      searched_groups: []
    },
    result_quality: {
      total_matches: 0,
      best_score: 0,
      has_wiki_entry: false,
      warnings: []
    },
    recommended_next_action: "broaden_query",
    matches: {
      wiki_entries: [],
      source_cards: [],
      claims: [],
      topics: [],
      outlines: [],
      raw_refs: []
    },
    suggested_answer_structure: ["topic overview", "core claims", "available evidence", "reuse judgment", "next action"],
    reuse_guidance: reuseGuidance(),
    warnings: []
  };

  if (!tokens.length) {
    result.warnings.push("query is empty after tokenization");
    finalizeQuality(result);
    return result;
  }

  for (const group of GROUPS.filter((item) => item.key !== "raw_refs")) {
    if (!groupAllowed(group.key, filters.type)) {
      continue;
    }
    const dir = path.join(root, group.dir);
    if (!(await exists(dir))) {
      continue;
    }
    result.query_scope.searched_groups.push(group.key);
    const matches = await searchDir(root, dir, tokens, group.weight, group.key, filters);
    result.matches[group.key].push(...matches.slice(0, limit));
  }

  if (!result.matches.wiki_entries.length && groupAllowed("raw_refs", filters.type)) {
    result.warnings.push("No Wiki Entry matched; results may come from source cards, topics, outlines, or raw references.");
    const rawGroup = GROUPS.find((item) => item.key === "raw_refs");
    if (rawGroup) {
      const rawDir = path.join(root, rawGroup.dir);
      if (await exists(rawDir)) {
        result.query_scope.searched_groups.push(rawGroup.key);
        result.matches.raw_refs.push(...(await searchDir(root, rawDir, tokens, rawGroup.weight, rawGroup.key, filters)).slice(0, limit));
      }
    }
  }

  finalizeQuality(result);
  return result;
}

async function searchDir(root: string, dir: string, tokens: string[], weight: number, groupKey: string, filters: ContextFilters): Promise<MatchItem[]> {
  const files = await listMarkdownFiles(dir);
  const matches: MatchItem[] = [];
  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    const parsed = parseMarkdown(text);
    const rel = relativePath(root, file);
    const title = frontmatterString(parsed.frontmatter, "title") ?? path.basename(file, ".md");
    const type = frontmatterString(parsed.frontmatter, "type") ?? groupKey;
    const status = frontmatterString(parsed.frontmatter, "status");
    const sourceRole = frontmatterString(parsed.frontmatter, "source_role");
    const wikiType = frontmatterString(parsed.frontmatter, "wiki_type");
    if (!passesFilters({ type, groupKey, status, source_role: sourceRole, wiki_type: wikiType }, filters)) {
      continue;
    }

    const topics = frontmatterArray(parsed.frontmatter, "topics");
    const tags = frontmatterArray(parsed.frontmatter, "tags");
    const relatedRefs = relatedReferences(parsed.frontmatter, parsed.body);
    const sourceUrl = frontmatterString(parsed.frontmatter, "source_url") ?? "";
    const haystack = [
      rel,
      title,
      sourceUrl,
      topics.join(" "),
      tags.join(" "),
      relatedRefs.join(" "),
      parsed.body
    ].join("\n").toLowerCase();
    const hits = tokens.filter((token) => haystack.includes(token.toLowerCase())).length;
    if (!hits) {
      continue;
    }

    const generationMode = frontmatterString(parsed.frontmatter, "generation_mode");
    const quality = frontmatterString(parsed.frontmatter, "quality");
    const groundingMarkers = frontmatterArray(parsed.frontmatter, "grounding_markers");
    const groundingNeedsReview = frontmatterBoolean(parsed.frontmatter, "grounding_needs_review");
    const groundingEvidenceAvailable = frontmatterBoolean(parsed.frontmatter, "grounding_evidence_available");
    const warnings = generationMode === "deterministic_fallback"
      ? ["This Wiki Entry is a deterministic fallback; it may need host-agent enrichment."]
      : [];
    if (groundingNeedsReview) {
      warnings.push(`Grounding needs review${groundingMarkers.length ? `: ${groundingMarkers.join(", ")}` : ""}.`);
    }

    matches.push({
      title,
      path: rel,
      summary: frontmatterString(parsed.frontmatter, "summary") ?? summarize(parsed.body, quality),
      score: Number(((hits / tokens.length) * weight).toFixed(2)),
      type,
      topics,
      tags,
      source_url: sourceUrl,
      status,
      source_role: sourceRole,
      wiki_type: wikiType,
      match_reasons: matchReasons(tokens, { rel, title, body: parsed.body, topics, tags, relatedRefs, sourceUrl }),
      quality_signals: qualitySignals({ quality, generationMode, groundingEvidenceAvailable, groundingNeedsReview, status, relatedRefs }),
      related_refs: relatedRefs,
      generation_mode: generationMode,
      quality,
      grounding_evidence_available: groundingEvidenceAvailable,
      grounding_needs_review: groundingNeedsReview,
      grounding_markers: groundingMarkers,
      warnings
    });
  }
  return matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
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

function tokenize(value: string): string[] {
  const compact = value.trim();
  if (!compact) {
    return [];
  }
  const asciiTokens = compact.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2);
  return Array.from(new Set([compact, ...asciiTokens]));
}

function summarize(body: string, quality?: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  if (quality === "scaffold") {
    return "Only a scaffold preview is available; enrich before relying on it as a final answer.";
  }
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
}

function normalizeLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(50, Math.floor(value)));
}

function normalizeFilters(filters: ContextFilters | undefined): ContextFilters {
  return Object.fromEntries(
    Object.entries(filters ?? {})
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([key, value]) => [key, String(value).trim()])
  ) as ContextFilters;
}

function groupAllowed(groupKey: string, typeFilter: string | undefined): boolean {
  if (!typeFilter) {
    return true;
  }
  return normalizeType(typeFilter) === normalizeType(groupKey);
}

function passesFilters(item: { type: string; groupKey: string; status?: string; source_role?: string; wiki_type?: string }, filters: ContextFilters): boolean {
  if (filters.type && normalizeType(filters.type) !== normalizeType(item.type) && normalizeType(filters.type) !== normalizeType(item.groupKey)) {
    return false;
  }
  if (filters.status && filters.status !== item.status) {
    return false;
  }
  if (filters.source_role && filters.source_role !== item.source_role) {
    return false;
  }
  if (filters.wiki_type && filters.wiki_type !== item.wiki_type) {
    return false;
  }
  return true;
}

function normalizeType(value: string): string {
  return value.replace(/-/g, "_").toLowerCase();
}

function relatedReferences(frontmatter: Record<string, string | boolean | string[]>, body: string): string[] {
  const refs = [
    frontmatterString(frontmatter, "source_card"),
    frontmatterString(frontmatter, "raw_file"),
    frontmatterString(frontmatter, "claims_note"),
    frontmatterString(frontmatter, "assets_note"),
    frontmatterString(frontmatter, "topics_note"),
    frontmatterString(frontmatter, "outline_note"),
    ...extractWikilinks(body)
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(refs));
}

function extractWikilinks(body: string): string[] {
  const refs: string[] = [];
  const pattern = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  for (const match of body.matchAll(pattern)) {
    refs.push(match[1].trim());
  }
  return refs;
}

function matchReasons(tokens: string[], fields: { rel: string; title: string; body: string; topics: string[]; tags: string[]; relatedRefs: string[]; sourceUrl: string }): string[] {
  const reasons = new Set<string>();
  for (const token of tokens.map((item) => item.toLowerCase())) {
    if (fields.title.toLowerCase().includes(token)) reasons.add("title");
    if (fields.rel.toLowerCase().includes(token)) reasons.add("path");
    if (fields.sourceUrl.toLowerCase().includes(token)) reasons.add("source_url");
    if (fields.topics.join(" ").toLowerCase().includes(token)) reasons.add("topics");
    if (fields.tags.join(" ").toLowerCase().includes(token)) reasons.add("tags");
    if (fields.relatedRefs.join(" ").toLowerCase().includes(token)) reasons.add("relationships");
    if (fields.body.toLowerCase().includes(token)) reasons.add("body");
  }
  return Array.from(reasons);
}

function qualitySignals(item: { quality?: string; generationMode?: string; groundingEvidenceAvailable?: boolean; groundingNeedsReview?: boolean; status?: string; relatedRefs: string[] }): string[] {
  const signals: string[] = [];
  if (item.quality) signals.push(`quality:${item.quality}`);
  if (item.status) signals.push(`status:${item.status}`);
  if (item.generationMode) signals.push(`generation_mode:${item.generationMode}`);
  if (item.groundingEvidenceAvailable === true) signals.push("grounding:evidence_available");
  if (item.groundingEvidenceAvailable === false) signals.push("grounding:no_evidence_flag");
  if (item.groundingNeedsReview) signals.push("grounding:needs_review");
  if (item.relatedRefs.length) signals.push("relationships:present");
  return signals;
}

function reuseGuidance(): ContextResult["reuse_guidance"] {
  return {
    writing: "Use matched Wiki Entries for angles, outlines, and source-backed points; check quality_signals before drafting.",
    research: "Start from Wiki Entries, then inspect related_refs and Source Cards when evidence or source context matters.",
    decision: "Use matches to recover constraints, prior judgments, and rejected alternatives before making or revising a choice.",
    review: "Use result_quality, match_reasons, quality_signals, and warnings to decide whether the knowledge is ready or needs enrichment."
  };
}

function finalizeQuality(result: ContextResult): void {
  const all = Object.values(result.matches).flat();
  result.result_quality = {
    total_matches: all.length,
    best_score: all.reduce((best, item) => Math.max(best, item.score), 0),
    has_wiki_entry: result.matches.wiki_entries.length > 0,
    warnings: result.warnings
  };
  if (!all.length) {
    result.recommended_next_action = "broaden_query_or_ingest_source";
  } else if (!result.matches.wiki_entries.length) {
    result.recommended_next_action = "review_source_cards_then_create_wiki_entry";
  } else if (all.some((item) => item.grounding_needs_review || item.quality === "scaffold")) {
    result.recommended_next_action = "review_grounding_or_enrich_entry";
  } else {
    result.recommended_next_action = "use_matches_for_answer";
  }
}
