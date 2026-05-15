import { promises as fs } from "node:fs";
import path from "node:path";

import { frontmatterBoolean, frontmatterString, parseMarkdown } from "./frontmatter.js";
import { relativePath, safeJoin } from "./paths.js";
import { exists } from "./workspace.js";

export type LintIssue = {
  severity: "error" | "warning" | "info";
  path?: string;
  message: string;
  suggestion?: string;
};

export type LintReport = {
  generated_at: string;
  summary: {
    wiki_entries: number;
    source_cards: number;
    raw_files: number;
    runs: number;
  };
  issues: LintIssue[];
};

type Note = {
  path: string;
  title: string;
  sourceUrl: string;
  body: string;
  frontmatter: ReturnType<typeof parseMarkdown>["frontmatter"];
};

export async function lintWorkspace(rootPath: string, now = new Date().toISOString()): Promise<LintReport> {
  const root = path.resolve(rootPath);
  const wikiEntries = await readNotes(root, "05-wiki/source-knowledge");
  const sourceCards = await readNotes(root, "03-sources/article-cards");
  const rawFiles = await readNotes(root, "02-raw/articles");
  const runs = await runDirs(root);
  const allNotes = [
    ...wikiEntries,
    ...sourceCards,
    ...rawFiles,
    ...await readNotes(root, "04-claims/_suggestions"),
    ...await readNotes(root, "06-assets/_suggestions"),
    ...await readNotes(root, "07-topics/ready"),
    ...await readNotes(root, "08-outputs/outlines")
  ];
  const issues: LintIssue[] = [];

  const wikiSourceCards = new Set(wikiEntries.map((note) => frontmatterString(note.frontmatter, "source_card")).filter(Boolean));
  for (const card of sourceCards) {
    if (!wikiSourceCards.has(card.path)) {
      issues.push({
        severity: "warning",
        path: card.path,
        message: "Source Card 没有对应 Wiki Entry。",
        suggestion: `重新入库或生成 05-wiki/source-knowledge/${path.basename(card.path)}`
      });
    }
  }

  for (const entry of wikiEntries) {
    const sourceCard = frontmatterString(entry.frontmatter, "source_card");
    const rawFile = frontmatterString(entry.frontmatter, "raw_file");
    const mode = frontmatterString(entry.frontmatter, "generation_mode");
    if (!sourceCard) {
      issues.push({ severity: "warning", path: entry.path, message: "Wiki Entry 缺少 source_card。", suggestion: "补写 source_card vault 路径。" });
    }
    if (!rawFile) {
      issues.push({ severity: "warning", path: entry.path, message: "Wiki Entry 缺少 raw_file。", suggestion: "补写 raw_file vault 路径。" });
    }
    if (mode === "deterministic_fallback") {
      issues.push({ severity: "info", path: entry.path, message: "Wiki Entry 是 deterministic fallback，仅包含来源和正文预览。", suggestion: "让宿主 Agent 基于原文补充 analysis 或 wiki_entry。" });
      const createdAt = Date.parse(frontmatterString(entry.frontmatter, "created_at") ?? "");
      if (Number.isFinite(createdAt) && Date.parse(now) - createdAt > 7 * 24 * 60 * 60 * 1000) {
        issues.push({ severity: "warning", path: entry.path, message: "fallback Wiki Entry 超过 7 天未补全。", suggestion: "重新运行宿主 Agent 生成 enriched Wiki Entry。" });
      }
    }
    if (mode === "agent_enriched") {
      const hasSummary = /## 一句话总结/.test(entry.body) || Boolean(frontmatterString(entry.frontmatter, "summary"));
      const hasKeyPoints = /## 核心观点[\s\S]*-\s+/.test(entry.body);
      if (!hasSummary) {
        issues.push({ severity: "warning", path: entry.path, message: "agent_enriched Wiki Entry 缺少 summary。", suggestion: "让宿主 Agent 提供 analysis.summary。" });
      }
      if (!hasKeyPoints) {
        issues.push({ severity: "warning", path: entry.path, message: "agent_enriched Wiki Entry 缺少 key_points。", suggestion: "让宿主 Agent 提供 analysis.key_points。" });
      }
    }
    if (frontmatterBoolean(entry.frontmatter, "represents_user_view") === true && frontmatterString(entry.frontmatter, "source_role") === "input") {
      issues.push({ severity: "warning", path: entry.path, message: "外部 input 被标记为代表用户观点。", suggestion: "将 represents_user_view 改为 false，或在 P1 使用 source_role=output。" });
    }
  }

  issues.push(...duplicateIssues(sourceCards, "source_url", "重复 URL"));
  issues.push(...duplicateTitles(allNotes));
  issues.push(...brokenLinkIssues(root, allNotes));

  return {
    generated_at: now,
    summary: {
      wiki_entries: wikiEntries.length,
      source_cards: sourceCards.length,
      raw_files: rawFiles.length,
      runs: runs.length
    },
    issues
  };
}

export async function writeLintReport(rootPath: string, report: LintReport): Promise<string> {
  const root = path.resolve(rootPath);
  const target = safeJoin(root, "dashboards", "Lint Report.md");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, renderLintReport(report), "utf8");
  return relativePath(root, target);
}

export function renderLintReport(report: LintReport): string {
  return [
    "# AIWiki Lint Report",
    "",
    `Generated at: ${report.generated_at}`,
    "",
    "## Summary",
    "",
    `- Wiki Entries: ${report.summary.wiki_entries}`,
    `- Source Cards: ${report.summary.source_cards}`,
    `- Raw Files: ${report.summary.raw_files}`,
    `- Runs: ${report.summary.runs}`,
    "",
    "## Issues",
    "",
    ...(report.issues.length ? report.issues.map((issue) => {
      const suffix = issue.path ? ` (${issue.path})` : "";
      const suggestion = issue.suggestion ? `\n  - Suggested Fix: ${issue.suggestion}` : "";
      return `- [${issue.severity}] ${issue.message}${suffix}${suggestion}`;
    }) : ["- none"]),
    ""
  ].join("\n");
}

async function readNotes(root: string, dir: string): Promise<Note[]> {
  const absolute = path.join(root, dir);
  if (!(await exists(absolute))) {
    return [];
  }
  const files = await listMarkdownFiles(absolute);
  return Promise.all(files.map(async (file) => {
    const text = await fs.readFile(file, "utf8");
    const parsed = parseMarkdown(text);
    return {
      path: relativePath(root, file),
      title: frontmatterString(parsed.frontmatter, "title") ?? path.basename(file, ".md"),
      sourceUrl: frontmatterString(parsed.frontmatter, "source_url") ?? "",
      body: parsed.body,
      frontmatter: parsed.frontmatter
    };
  }));
}

async function runDirs(root: string): Promise<string[]> {
  const dir = path.join(root, "09-runs");
  if (!(await exists(dir))) {
    return [];
  }
  return (await fs.readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
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

function duplicateIssues(notes: Note[], field: "source_url", label: string): LintIssue[] {
  const seen = new Map<string, string[]>();
  for (const note of notes) {
    const value = field === "source_url" ? note.sourceUrl : "";
    if (!value) {
      continue;
    }
    seen.set(value, [...(seen.get(value) ?? []), note.path]);
  }
  return Array.from(seen.entries()).flatMap(([value, paths]) => paths.length > 1
    ? [{ severity: "warning" as const, message: `${label}: ${value}`, suggestion: paths.join(", ") }]
    : []);
}

function duplicateTitles(notes: Note[]): LintIssue[] {
  const seen = new Map<string, string[]>();
  for (const note of notes) {
    if (!note.title) {
      continue;
    }
    seen.set(note.title, [...(seen.get(note.title) ?? []), note.path]);
  }
  return Array.from(seen.entries()).flatMap(([title, paths]) => paths.length > 1
    ? [{ severity: "info" as const, message: `重复标题: ${title}`, suggestion: paths.join(", ") }]
    : []);
}

function brokenLinkIssues(root: string, notes: Note[]): LintIssue[] {
  const existing = new Set(notes.map((note) => note.path.replace(/\.md$/i, "")));
  const issues: LintIssue[] = [];
  for (const note of notes) {
    for (const link of note.body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
      const target = link[1].replace(/\\/g, "/").replace(/\.md$/i, "");
      if (!existing.has(target) && !isRunLocalLink(target)) {
        issues.push({ severity: "error", path: note.path, message: `内部链接断裂: ${target}`, suggestion: "检查目标文件是否存在或更新 wikilink。" });
      }
    }
  }
  return issues;
}

function isRunLocalLink(target: string): boolean {
  // Run-local notes are valid trace links but are not part of the long-term note set.
  return target.startsWith("09-runs/");
}
