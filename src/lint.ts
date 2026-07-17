import { promises as fs } from "node:fs";
import path from "node:path";

import { capsuleLintIssues, type CapsuleLintOptions } from "./capsule-lint.js";
import { frontmatterArray, frontmatterBoolean, frontmatterString, parseMarkdown } from "./frontmatter.js";
import { relativePath, safeJoin } from "./paths.js";
import { exists, OPTIONAL_DIRS, OPTIONAL_PARENT_DIRS } from "./workspace.js";

export type LintSeverity = "error" | "warning" | "info";
export type LintAction = "enrich" | "fix_link" | "archive" | "reingest" | "mark_reviewed" | "repair_structure" | "remove_empty_optional_dir";

export type LintSafeFix = {
  action: "remove_empty_optional_dir";
  path: string;
  command: "aiwiki lint --fix-empty-dirs --json";
};

export type LintIssue = {
  severity: LintSeverity;
  path?: string;
  message: string;
  suggestion?: string;
  category?: string;
  action?: LintAction;
  safe_fix?: LintSafeFix;
};

export type LintReport = {
  generated_at: string;
  summary: {
    wiki_entries: number;
    source_cards: number;
    raw_files: number;
    runs: number;
  };
  safe_fixes: {
    available: number;
    applied: LintSafeFix[];
    only_safe_fixes: boolean;
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

export async function lintWorkspace(rootPath: string, now = new Date().toISOString(), options: CapsuleLintOptions = {}): Promise<LintReport> {
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

  issues.push(...await systemFileIssues(root));
  issues.push(...await emptyOptionalDirectoryIssues(root));

  const wikiSourceCards = new Set(wikiEntries.map((note) => frontmatterString(note.frontmatter, "source_card")).filter(Boolean));
  for (const card of sourceCards) {
    if (!wikiSourceCards.has(card.path)) {
      issues.push({
        severity: "warning",
        path: card.path,
        category: "isolated_source_card",
        action: "reingest",
        message: "Source Card has no matching Wiki Entry.",
        suggestion: `Reingest or create a matching 05-wiki/source-knowledge/${path.basename(card.path)} entry.`
      });
    }
  }

  for (const entry of wikiEntries) {
    const sourceCard = frontmatterString(entry.frontmatter, "source_card");
    const rawFile = frontmatterString(entry.frontmatter, "raw_file");
    const mode = frontmatterString(entry.frontmatter, "generation_mode");
    if (!sourceCard) {
      issues.push({
        severity: "warning",
        path: entry.path,
        category: "missing_source",
        action: "reingest",
        message: "Wiki Entry is missing source_card.",
        suggestion: "Add the vault path of the source card."
      });
    }
    if (!rawFile) {
      issues.push({
        severity: "warning",
        path: entry.path,
        category: "missing_source",
        action: "reingest",
        message: "Wiki Entry is missing raw_file.",
        suggestion: "Add the vault path of the raw source file."
      });
    }
    if (mode === "deterministic_fallback") {
      issues.push({
        severity: "info",
        path: entry.path,
        category: "stale_scaffold",
        action: "enrich",
        message: "Wiki Entry is a deterministic fallback and only contains source trace plus a content preview.",
        suggestion: "Ask the host Agent to enrich it with analysis or a full wiki_entry."
      });
      const createdAt = Date.parse(frontmatterString(entry.frontmatter, "created_at") ?? "");
      if (Number.isFinite(createdAt) && Date.parse(now) - createdAt > 7 * 24 * 60 * 60 * 1000) {
        issues.push({
          severity: "warning",
          path: entry.path,
          category: "stale_scaffold",
          action: "enrich",
          message: "Fallback Wiki Entry is older than 7 days.",
          suggestion: "Reingest with a host Agent to generate an enriched Wiki Entry."
        });
      }
    }
    if (mode === "agent_enriched") {
      const hasSummary = /##\s+.+/.test(entry.body) || Boolean(frontmatterString(entry.frontmatter, "summary"));
      const hasKeyPoints = /-\s+/.test(entry.body);
      if (!hasSummary) {
        issues.push({
          severity: "warning",
          path: entry.path,
          category: "weak_entry",
          action: "enrich",
          message: "agent_enriched Wiki Entry is missing a summary.",
          suggestion: "Ask the host Agent to provide analysis.summary."
        });
      }
      if (!hasKeyPoints) {
        issues.push({
          severity: "warning",
          path: entry.path,
          category: "weak_entry",
          action: "enrich",
          message: "agent_enriched Wiki Entry is missing key points.",
          suggestion: "Ask the host Agent to provide analysis.key_points."
        });
      }
    }
    if (frontmatterBoolean(entry.frontmatter, "grounding_needs_review") === true) {
      const markers = frontmatterArray(entry.frontmatter, "grounding_markers");
      issues.push({
        severity: "warning",
        path: entry.path,
        category: "grounding_review",
        action: "mark_reviewed",
        message: `Wiki Entry needs grounding review${markers.length ? `: ${markers.join(", ")}` : "."}`,
        suggestion: "Check whether source quotes are present in Raw. Heuristic coverage risks are not confirmed facts."
      });
    }
    if (frontmatterBoolean(entry.frontmatter, "represents_user_view") === true && frontmatterString(entry.frontmatter, "source_role") !== "output") {
      issues.push({
        severity: "warning",
        path: entry.path,
        category: "metadata_boundary",
        action: "mark_reviewed",
        message: "Only output source_role entries should represent the user's view.",
        suggestion: "Set represents_user_view to false, or change source_role to output when it is user-authored output."
      });
    }
  }

  issues.push(...duplicateIssues(sourceCards, "source_url", "Duplicate URL"));
  issues.push(...duplicateTitles(allNotes));
  issues.push(...brokenLinkIssues(root, allNotes));
  issues.push(...await capsuleLintIssues(root, options));

  return {
    generated_at: now,
    summary: {
      wiki_entries: wikiEntries.length,
      source_cards: sourceCards.length,
      raw_files: rawFiles.length,
      runs: runs.length
    },
    safe_fixes: safeFixSummary(issues),
    issues
  };
}

export function filterLintReport(report: LintReport, severity?: LintSeverity): LintReport {
  if (!severity) {
    return report;
  }
  return {
    ...report,
    safe_fixes: safeFixSummary(report.issues.filter((issue) => issue.severity === severity), report.safe_fixes.applied),
    issues: report.issues.filter((issue) => issue.severity === severity)
  };
}

export function mergeLintIssues(report: LintReport, issues: readonly LintIssue[]): LintReport {
  const mergedIssues = [...report.issues, ...issues];
  return {
    ...report,
    safe_fixes: safeFixSummary(mergedIssues, report.safe_fixes.applied),
    issues: mergedIssues
  };
}

export async function removeEmptyOptionalDirs(rootPath: string): Promise<LintSafeFix[]> {
  const root = path.resolve(rootPath);
  const applied: LintSafeFix[] = [];
  for (const dir of [...OPTIONAL_DIRS].sort((left, right) => right.length - left.length)) {
    if (await removeKnownEmptyDir(root, dir)) {
      applied.push(safeFixFor(dir));
    }
  }
  for (const dir of [...OPTIONAL_PARENT_DIRS].sort((left, right) => right.length - left.length)) {
    if (await removeKnownEmptyDir(root, dir)) {
      applied.push(safeFixFor(dir));
    }
  }
  return applied;
}

export function attachAppliedSafeFixes(report: LintReport, applied: LintSafeFix[]): LintReport {
  return {
    ...report,
    safe_fixes: safeFixSummary(report.issues, applied)
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
  const counts = severityCounts(report.issues);
  const topIssue = report.issues[0];
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
    `- Errors: ${counts.error}`,
    `- Warnings: ${counts.warning}`,
    `- Info: ${counts.info}`,
    `- Safe Fixes Available: ${report.safe_fixes.available}`,
    `- Only Safe Fixes: ${report.safe_fixes.only_safe_fixes ? "yes" : "no"}`,
    `- Top Issue: ${topIssue ? formatIssueLine(topIssue) : "none"}`,
    "",
    "## Suggested Handling Order",
    "",
    "- Fix error issues first.",
    "- Review warning issues next.",
    "- Use info issues for enrichment and cleanup backlog.",
    "",
    ...renderIssueGroup("Errors", report.issues.filter((issue) => issue.severity === "error")),
    ...renderIssueGroup("Warnings", report.issues.filter((issue) => issue.severity === "warning")),
    ...renderIssueGroup("Info", report.issues.filter((issue) => issue.severity === "info")),
    ""
  ].join("\n");
}

export function renderLintSummary(report: LintReport, reportPath?: string): string {
  const counts = severityCounts(report.issues);
  const topIssue = report.issues[0];
  return [
    `lint_summary: errors=${counts.error} warnings=${counts.warning} info=${counts.info}`,
    `safe_fixes: available=${report.safe_fixes.available} applied=${report.safe_fixes.applied.length} only_safe_fixes=${report.safe_fixes.only_safe_fixes ? "yes" : "no"}`,
    `top_issue: ${topIssue ? formatIssueLine(topIssue) : "none"}`,
    ...(reportPath ? [`report: ${reportPath}`] : [])
  ].join("\n");
}

async function systemFileIssues(root: string): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];
  for (const systemFile of ["_system/purpose.md", "_system/index.md", "_system/log.md"]) {
    if (await exists(path.join(root, systemFile))) {
      continue;
    }
    issues.push({
      severity: "error",
      path: systemFile,
      category: "workspace_structure",
      action: "repair_structure",
      message: `Required system file is missing: ${systemFile}`,
      suggestion: `Run aiwiki setup --path "${root}" --yes`
    });
  }
  return issues;
}

async function emptyOptionalDirectoryIssues(root: string): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];
  for (const dir of [...OPTIONAL_DIRS, ...OPTIONAL_PARENT_DIRS]) {
    if (!(await isExistingEmptyDirectory(path.join(root, dir)))) {
      continue;
    }
    issues.push({
      severity: "info",
      path: dir,
      category: "empty_optional_directory",
      action: "remove_empty_optional_dir",
      message: `Optional directory is empty and can be safely removed: ${dir}`,
      suggestion: "Run aiwiki lint --fix-empty-dirs --json to remove known empty optional directories.",
      safe_fix: safeFixFor(dir)
    });
  }
  return issues;
}

async function removeKnownEmptyDir(root: string, dir: string): Promise<boolean> {
  const target = path.join(root, dir);
  if (!(await isExistingEmptyDirectory(target))) {
    return false;
  }
  await fs.rmdir(target);
  return true;
}

async function isExistingEmptyDirectory(target: string): Promise<boolean> {
  try {
    const stats = await fs.stat(target);
    if (!stats.isDirectory()) {
      return false;
    }
    return (await fs.readdir(target)).length === 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function safeFixFor(dir: string): LintSafeFix {
  return {
    action: "remove_empty_optional_dir",
    path: dir,
    command: "aiwiki lint --fix-empty-dirs --json"
  };
}

function safeFixSummary(issues: LintIssue[], applied: LintSafeFix[] = []): LintReport["safe_fixes"] {
  const available = issues.filter((issue) => issue.safe_fix).length;
  return {
    available,
    applied,
    only_safe_fixes: issues.length > 0 && issues.every((issue) => Boolean(issue.safe_fix))
  };
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
    ? [{
      severity: "warning" as const,
      category: "duplicate",
      action: "mark_reviewed" as const,
      message: `${label}: ${value}`,
      suggestion: paths.join(", ")
    }]
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
    ? [{
      severity: "info" as const,
      category: "duplicate_title",
      action: "archive" as const,
      message: `Duplicate title: ${title}`,
      suggestion: paths.join(", ")
    }]
    : []);
}

function brokenLinkIssues(root: string, notes: Note[]): LintIssue[] {
  const existing = new Set(notes.map((note) => note.path.replace(/\.md$/i, "")));
  const issues: LintIssue[] = [];
  for (const note of notes) {
    for (const link of note.body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
      const target = link[1].replace(/\\/g, "/").replace(/\.md$/i, "");
      if (!existing.has(target) && !isRunLocalLink(target)) {
        issues.push({
          severity: "error",
          path: note.path,
          category: "broken_link",
          action: "fix_link",
          message: `Broken wikilink: ${target}`,
          suggestion: "Check whether the target file exists or update the wikilink."
        });
      }
    }
  }
  return issues;
}

function renderIssueGroup(title: string, issues: LintIssue[]): string[] {
  return [
    `## ${title}`,
    "",
    ...(issues.length ? issues.map((issue) => {
      const suggestion = issue.suggestion ? `\n  - Suggested Fix: ${issue.suggestion}` : "";
      const action = issue.action ? `\n  - Action: ${issue.action}` : "";
      return `- ${formatIssueLine(issue)}${action}${suggestion}`;
    }) : ["- none"]),
    ""
  ];
}

function formatIssueLine(issue: LintIssue): string {
  const suffix = issue.path ? ` (${issue.path})` : "";
  const category = issue.category ? ` {${issue.category}}` : "";
  return `[${issue.severity}]${category} ${issue.message}${suffix}`;
}

function severityCounts(issues: LintIssue[]) {
  return {
    error: issues.filter((issue) => issue.severity === "error").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length
  };
}

function isRunLocalLink(target: string): boolean {
  // Run-local notes are valid trace links but are not part of the long-term note set.
  return target.startsWith("09-runs/");
}
