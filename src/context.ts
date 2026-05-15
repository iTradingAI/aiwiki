import { promises as fs } from "node:fs";
import path from "node:path";

import { frontmatterArray, frontmatterString, parseMarkdown } from "./frontmatter.js";
import { relativePath } from "./paths.js";
import { exists } from "./workspace.js";

type MatchItem = {
  title: string;
  path: string;
  summary: string;
  score: number;
  topics: string[];
  source_url: string;
  generation_mode?: string;
  quality?: string;
  warnings: string[];
};

export type ContextResult = {
  schema_version: "aiwiki.context.v1";
  query: string;
  generated_at: string;
  matches: {
    wiki_entries: MatchItem[];
    source_cards: MatchItem[];
    claims: MatchItem[];
    topics: MatchItem[];
    outlines: MatchItem[];
    raw_refs: MatchItem[];
  };
  suggested_answer_structure: string[];
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

export async function buildContext(rootPath: string, query: string, now = new Date().toISOString()): Promise<ContextResult> {
  const root = path.resolve(rootPath);
  const tokens = tokenize(query);
  const result: ContextResult = {
    schema_version: "aiwiki.context.v1",
    query,
    generated_at: now,
    matches: {
      wiki_entries: [],
      source_cards: [],
      claims: [],
      topics: [],
      outlines: [],
      raw_refs: []
    },
    suggested_answer_structure: ["主题概览", "核心观点", "已有资料依据", "可复用判断", "下一步建议"],
    warnings: []
  };

  if (!tokens.length) {
    result.warnings.push("query is empty after tokenization");
    return result;
  }

  for (const group of GROUPS.filter((item) => item.key !== "raw_refs")) {
    const dir = path.join(root, group.dir);
    if (!(await exists(dir))) {
      continue;
    }
    const matches = await searchDir(root, dir, tokens, group.weight);
    result.matches[group.key].push(...matches.slice(0, 10));
  }

  if (!result.matches.wiki_entries.length) {
    result.warnings.push("未命中 Wiki Entry，结果可能来自资料卡、选题或原文引用。");
    const rawGroup = GROUPS.find((item) => item.key === "raw_refs");
    if (rawGroup) {
      const rawDir = path.join(root, rawGroup.dir);
      if (await exists(rawDir)) {
        result.matches.raw_refs.push(...(await searchDir(root, rawDir, tokens, rawGroup.weight)).slice(0, 10));
      }
    }
  }

  return result;
}

async function searchDir(root: string, dir: string, tokens: string[], weight: number): Promise<MatchItem[]> {
  const files = await listMarkdownFiles(dir);
  const matches: MatchItem[] = [];
  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    const parsed = parseMarkdown(text);
    const rel = relativePath(root, file);
    const title = frontmatterString(parsed.frontmatter, "title") ?? path.basename(file, ".md");
    const haystack = [
      rel,
      title,
      frontmatterString(parsed.frontmatter, "source_url") ?? "",
      frontmatterArray(parsed.frontmatter, "topics").join(" "),
      frontmatterArray(parsed.frontmatter, "tags").join(" "),
      parsed.body
    ].join("\n").toLowerCase();
    const hits = tokens.filter((token) => haystack.includes(token.toLowerCase())).length;
    if (!hits) {
      continue;
    }
    const generationMode = frontmatterString(parsed.frontmatter, "generation_mode");
    const quality = frontmatterString(parsed.frontmatter, "quality");
    const warnings = generationMode === "deterministic_fallback"
      ? ["该 Wiki Entry 是 deterministic fallback，仅包含来源、正文预览和待补全区。"]
      : [];
    matches.push({
      title,
      path: rel,
      summary: frontmatterString(parsed.frontmatter, "summary") ?? summarize(parsed.body, quality),
      score: Number(((hits / tokens.length) * weight).toFixed(2)),
      topics: frontmatterArray(parsed.frontmatter, "topics"),
      source_url: frontmatterString(parsed.frontmatter, "source_url") ?? "",
      generation_mode: generationMode,
      quality,
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
    return "仅有正文预览，未生成高质量摘要。";
  }
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
}
