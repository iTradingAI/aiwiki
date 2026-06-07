import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { frontmatterBoolean, frontmatterString, parseMarkdown } from "./frontmatter.js";
import { CliError } from "./output.js";
import { relativePath } from "./paths.js";

export const CONFIG_FILE = "aiwiki.yaml";

export const CORE_DIRS = [
  "02-raw/articles",
  "03-sources/article-cards",
  "05-wiki",
  "05-wiki/source-knowledge",
  "09-runs",
  "dashboards",
  "_system/templates",
  "_system/schemas",
  "_system/logs"
] as const;

export const OPTIONAL_DIRS = [
  "04-claims/_suggestions",
  "06-assets/_suggestions",
  "07-topics/ready",
  "08-outputs/outlines"
] as const;

export const OPTIONAL_PARENT_DIRS = [
  "04-claims",
  "06-assets",
  "07-topics",
  "08-outputs"
] as const;

export const REQUIRED_DIRS = CORE_DIRS;

export type SeedFile = {
  path: string;
  created: boolean;
};

export type WorkspaceConfig = {
  product: string;
  schemaVersion: string;
  createdAt: string;
};

export type UserConfig = {
  defaultPath?: string;
  updatedAt?: string;
};

export type DoctorCheck = {
  name: string;
  status: "ok" | "missing" | "permission error";
  detail: string;
};

export type ReadinessStatus = "ok" | "missing" | "needs_attention";

const WORKSPACE_SEEDS: Array<{ path: string; content: string }> = [
  {
    path: "_system/purpose.md",
    content: `# AIWiki Knowledge Base Purpose

This file defines what this knowledge base is for. Host Agents should read it before ingesting, querying, or reorganizing content.

## Goal

Build a local, traceable AI knowledge base that turns useful articles, notes, and source material into Obsidian-ready Markdown.

## Suitable Materials

- Articles, notes, transcripts, and references that can become source cards, wiki entries, claims, topics, outlines, or reusable assets.
- External materials with clear source information.
- User-owned drafts or published work when the user explicitly says the material represents their own output.

## Unsuitable Materials

- Content without a usable source or context.
- Purely private, sensitive, illegal, or unsafe material.
- Generic web noise that cannot become reusable knowledge.
- Claims that cannot be tied back to evidence.

## Multi-Knowledge-Base Boundary

This base AIWiki workspace is a single knowledge base. If the user later creates multiple knowledge bases, each one should have its own purpose file and Agents should route material according to that local purpose.

## Agent Rules

- Respect this purpose before ingesting material.
- Keep evidence and inference separate.
- Do not treat external input as the user's own view unless the user says so.
- Prefer traceable source cards and wiki entries over unsupported summaries.
`
  },
  {
    path: "_system/index.md",
    content: `# AIWiki System Index

Use this file as the human and Agent entry point for the knowledge base.

## Core Areas

- [[02-raw/articles|Raw Articles]]
- [[03-sources/article-cards|Source Cards]]
- [[04-claims/_suggestions|Claim Suggestions]]
- [[05-wiki|Wiki Entries]]
- [[06-assets/_suggestions|Asset Suggestions]]
- [[07-topics/ready|Topic Pipeline]]
- [[08-outputs/outlines|Draft Outlines]]
- [[09-runs|Processing Runs]]

## Dashboards

- [[dashboards/AIWiki Home|AIWiki Home]]
- [[dashboards/Review Queue|Review Queue]]
- [[dashboards/Recent Runs|Recent Runs]]
- [[dashboards/Lint Report|Lint Report]]

## System Files

- [[_system/purpose|Purpose]]
- [[_system/log|Log]]
- [[_system/schemas/aiwiki-frontmatter|Frontmatter Schema]]

## Common Commands

\`\`\`bash
aiwiki status
aiwiki next
aiwiki query "<topic>"
aiwiki context "<topic>"
aiwiki lint
\`\`\`
`
  },
  {
    path: "_system/log.md",
    content: `# AIWiki System Log

This lightweight log is reserved for important workspace events. It keeps the base edition file-first and does not require a database.

## Entries

<!-- Add manual or future automated events below. -->

`
  },
  {
    path: "dashboards/AIWiki Home.md",
    content: `# AIWiki 首页

AIWiki 的 Obsidian 入口。Dataview 是可选增强；未安装时仍可使用下方普通链接、Properties、Backlinks 和 Graph View。

## 原生链接入口

- [[dashboards/Wiki Entries|Wiki 条目]]
- [[dashboards/Source Cards|资料卡]]
- [[dashboards/Review Queue|待审队列]]
- [[dashboards/Recent Runs|最近处理]]
- [[dashboards/Topic Pipeline|选题管线]]
- [[dashboards/Lint Report|结构检查]]
- [[_system/schemas/aiwiki-frontmatter|字段说明]]

## 最近收录

\`\`\`dataview
TABLE status, source_url, captured_at, run_summary
FROM "03-sources/article-cards"
WHERE type = "source_card"
SORT captured_at DESC
\`\`\`

## 待审队列

\`\`\`dataview
TABLE type, status, source_card, raw_note, run_summary
FROM "03-sources/article-cards" or "04-claims/_suggestions" or "06-assets/_suggestions" or "08-outputs/outlines"
WHERE status = "to-review"
SORT created_at DESC
\`\`\`
`
  },
  {
    path: "dashboards/Wiki Entries.md",
    content: `# Wiki 条目

AIWiki 每次成功入库都会生成 Wiki Entry。这里是知识层入口，不要求先经过 Review Queue 才能查询。

\`\`\`dataview
TABLE wiki_type, source_role, represents_user_view, quality, source_card, raw_file, updated_at
FROM "05-wiki"
WHERE type = "wiki_entry"
SORT updated_at DESC
\`\`\`
`
  },
  {
    path: "dashboards/Source Cards.md",
    content: `# 资料卡

资料卡用于追踪来源、原文、Claim 建议、素材建议、选题和大纲。

\`\`\`dataview
TABLE status, source_url, wiki_entry, raw_note, captured_at
FROM "03-sources/article-cards"
WHERE type = "source_card"
SORT captured_at DESC
\`\`\`
`
  },
  {
    path: "dashboards/Review Queue.md",
    content: `# 待审队列

未安装 Dataview 时，可直接打开 [[03-sources/article-cards]]、[[04-claims/_suggestions]]、[[06-assets/_suggestions]] 和 [[08-outputs/outlines]] 手工审阅。

## 待审内容

\`\`\`dataview
TABLE type, source_url, source_card, raw_note, claims_note, assets_note, outline_note
FROM "03-sources/article-cards" or "04-claims/_suggestions" or "06-assets/_suggestions" or "08-outputs/outlines"
WHERE status = "to-review"
SORT captured_at DESC
\`\`\`
`
  },
  {
    path: "dashboards/Recent Runs.md",
    content: `# 最近处理

处理记录用于追溯每次宿主 Agent 入库的 payload、产物和告警。

\`\`\`dataview
TABLE status, source_url, source_card, raw_note, created_at
FROM "09-runs"
WHERE type = "processing_summary"
SORT created_at DESC
\`\`\`
`
  },
  {
    path: "dashboards/Topic Pipeline.md",
    content: `# 选题管线

选题和大纲是从资料卡继续写作的入口。

\`\`\`dataview
TABLE status, source_card, outline_note, source_url, created_at
FROM "07-topics/ready" or "08-outputs/outlines"
WHERE type = "topic_candidates" or type = "draft_outline"
SORT created_at DESC
\`\`\`
`
  },
  {
    path: "_system/schemas/aiwiki-frontmatter.md",
    content: `# AIWiki Frontmatter Schema

AIWiki 使用 Obsidian 原生 Properties 作为基础数据库层，Dataview 只作为可选增强。

## Shared Fields

- \`aiwiki_id\`: AIWiki 内部稳定标识。
- \`type\`: \`source_card\`, \`raw_article\`, \`claim_suggestions\`, \`asset_suggestions\`, \`topic_candidates\`, \`draft_outline\`, \`processing_summary\`。
- \`status\`: \`to-review\`, \`ready\`, \`draft\`, \`reviewed\`, \`archived\`, \`fetch-failed\`。
- \`slug\`: 来源标题或 URL 生成的 slug。
- \`source_url\`: 原始 URL，若没有则为空。
- \`source_type\`: \`url\`, \`file\`, \`text\` 等来源类型。
- \`created_at\`: AIWiki 写入时间。
- \`captured_at\`: 宿主 Agent 读取来源的时间。
- \`run_id\`: 本次处理记录目录名。
- \`source_card\`, \`raw_note\`, \`claims_note\`, \`assets_note\`, \`topics_note\`, \`outline_note\`, \`run_summary\`: Obsidian 内部链接字符串。
- \`tags\`: AIWiki 类型标签。

## Rule

正文中的 wikilink 用于人工阅读；frontmatter 字段是 Dataview 查询和数据库筛选的来源。
`
  },
  {
    path: "_system/templates/source-card.md",
    content: `---
aiwiki_id: ""
type: "source_card"
status: "to-review"
slug: ""
title: ""
source_url: ""
source_type: ""
created_at: ""
captured_at: ""
run_id: ""
source_card: ""
raw_note: ""
claims_note: ""
assets_note: ""
topics_note: ""
outline_note: ""
run_summary: ""
tags: ["aiwiki/source-card"]
---

# 资料卡

## Obsidian 链接

- 原文：
- Claim 建议：
- 素材建议：
- 选题：
- 大纲：
- 处理记录：

## 摘要

`
  },
  {
    path: "_system/templates/review-note.md",
    content: `---
type: "review_note"
status: "draft"
source_card: ""
created_at: ""
tags: ["aiwiki/review"]
---

# 审阅记录

## 判断

## 可复用结论

## 后续动作

`
  }
];

export function resolveRoot(rootPath: string): string {
  return path.resolve(rootPath);
}

export function defaultConfig(createdAt = new Date().toISOString()): string {
  return [
    "product: aiwiki",
    "schema_version: 1",
    `created_at: "${createdAt}"`,
    "",
    "knowledge_base:",
    "  id: default",
    "  name: AIWiki",
    "  language: zh-CN",
    "",
    "agent:",
    "  url_first: true",
    "  fetch_owner: host_agent",
    "  cli_fetch_webpage: false",
    "",
    "review:",
    "  wiki_merge_policy: manual",
    "  claim_policy: suggest_only",
    "  asset_policy: suggest_only",
    ""
  ].join("\n");
}

export function defaultSetupPath(): string {
  return path.join(os.homedir(), "AIWiki");
}

export function userConfigPath(): string {
  const home = process.env.AIWIKI_HOME ? path.resolve(process.env.AIWIKI_HOME) : path.join(os.homedir(), ".aiwiki");
  return path.join(home, "config.json");
}

export async function setDefaultWorkspace(rootPath: string) {
  const root = resolveRoot(rootPath);
  const configPath = userConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const config: UserConfig = {
    defaultPath: root,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return { configPath, defaultPath: root };
}

export async function readUserConfig(): Promise<UserConfig> {
  const configPath = userConfigPath();
  if (!(await exists(configPath))) {
    return {};
  }
  return JSON.parse(await fs.readFile(configPath, "utf8")) as UserConfig;
}

export async function initWorkspace(rootPath: string) {
  const root = resolveRoot(rootPath);
  await fs.mkdir(root, { recursive: true });

  const createdDirs: string[] = [];
  for (const dir of CORE_DIRS) {
    const absolute = path.join(root, dir);
    const existed = await exists(absolute);
    await fs.mkdir(absolute, { recursive: true });
    if (!existed) {
      createdDirs.push(dir);
    }
  }

  const configPath = path.join(root, CONFIG_FILE);
  const createdConfig = !(await exists(configPath));
  if (createdConfig) {
    await fs.writeFile(configPath, defaultConfig(), "utf8");
  }

  const seededFiles = await seedWorkspaceFiles(root);
  return { root, createdConfig, createdDirs, seededFiles };
}

async function seedWorkspaceFiles(root: string): Promise<SeedFile[]> {
  const files: SeedFile[] = [];
  for (const seed of WORKSPACE_SEEDS) {
    const target = path.join(root, seed.path);
    const alreadyExists = await exists(target);
    if (!alreadyExists) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, seed.content, "utf8");
    }
    files.push({ path: seed.path, created: !alreadyExists });
  }
  return files;
}

export async function resolveWorkspace(optionalPath?: string, startDir = process.cwd()) {
  if (optionalPath) {
    const root = resolveRoot(optionalPath);
    if (!(await exists(path.join(root, CONFIG_FILE)))) {
      throw new CliError(`未找到配置文件：${path.join(root, CONFIG_FILE)}。请先运行 aiwiki init --path "${root}" --yes。`);
    }
    return root;
  }

  const found = await findWorkspace(startDir);
  if (found) {
    return found;
  }

  const userConfig = await readUserConfig();
  if (userConfig.defaultPath) {
    const root = resolveRoot(userConfig.defaultPath);
    if (await exists(path.join(root, CONFIG_FILE))) {
      return root;
    }
    throw new CliError(`默认知识库不可用：${root}。请运行 aiwiki setup --path <知识库路径> --yes 重新设置。`);
  }

  throw new CliError("未找到 AIWiki 知识库。请先运行 aiwiki setup，或运行 aiwiki setup --path <知识库路径> --yes。");
}

export async function findWorkspace(startDir: string) {
  let current = path.resolve(startDir);
  while (true) {
    if (await exists(path.join(current, CONFIG_FILE))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export async function promptForInitPath() {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("AIWiki 知识库路径: ");
    if (!answer.trim()) {
      throw new CliError("路径不能为空。");
    }
    return answer.trim();
  } finally {
    rl.close();
  }
}

export async function promptForSetup(options: { rootPath?: string; yes: boolean }) {
  if (options.rootPath && options.yes) {
    return { rootPath: options.rootPath, confirmed: true };
  }

  if (!input.isTTY) {
    return promptForSetupFromPipe(options);
  }

  const rl = createInterface({ input, output });
  try {
    let rootPath = options.rootPath;
    if (!rootPath) {
      const defaultPath = defaultSetupPath();
      const answer = await rl.question(`AIWiki 知识库路径（直接回车使用 ${defaultPath}）: `);
      rootPath = answer.trim() || defaultPath;
    }
    if (!options.yes) {
      const root = resolveRoot(rootPath);
      output.write(`将创建或补齐 AIWiki 目录: ${root}\n`);
      for (const dir of CORE_DIRS) {
        output.write(`  - ${dir}\n`);
      }
      const answer = await rl.question("确认创建？输入 y 继续: ");
      if (answer.trim().toLowerCase() !== "y") {
        return { rootPath, confirmed: false };
      }
    }
    return { rootPath, confirmed: true };
  } finally {
    rl.close();
  }
}

async function promptForSetupFromPipe(options: { rootPath?: string; yes: boolean }) {
  const lines = await readInputLines();
  const hasExplicitInput = lines.some((line) => line.trim().length > 0);
  if (!options.yes && !hasExplicitInput) {
    throw new CliError("Interactive setup requires a terminal. For scripts, run aiwiki setup --path <path> --yes.");
  }

  let lineIndex = 0;
  let rootPath = options.rootPath;
  if (!rootPath) {
    const defaultPath = defaultSetupPath();
    output.write(`AIWiki 知识库路径（直接回车使用 ${defaultPath}）: `);
    rootPath = lines[lineIndex]?.trim() || defaultPath;
    lineIndex += 1;
  }
  if (!options.yes) {
    const root = resolveRoot(rootPath);
    output.write(`将创建或补齐 AIWiki 目录: ${root}\n`);
    for (const dir of CORE_DIRS) {
      output.write(`  - ${dir}\n`);
    }
    output.write("确认创建？输入 y 继续: ");
    return { rootPath, confirmed: lines[lineIndex]?.trim().toLowerCase() === "y" };
  }
  return { rootPath, confirmed: true };
}

async function readInputLines() {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
}

export async function confirmInit(rootPath: string) {
  const root = resolveRoot(rootPath);
  const rl = createInterface({ input, output });
  try {
    output.write(`将创建或补齐 AIWiki 目录: ${root}\n`);
    for (const dir of CORE_DIRS) {
      output.write(`  - ${dir}\n`);
    }
    const answer = await rl.question("确认创建？输入 y 继续: ");
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

export async function readConfig(rootPath: string) {
  const root = resolveRoot(rootPath);
  const configPath = path.join(root, CONFIG_FILE);
  if (!(await exists(configPath))) {
    throw new CliError(`未找到配置文件：${configPath}`);
  }

  const text = await fs.readFile(configPath, "utf8");
  return {
    product: readScalar(text, "product") ?? "unknown",
    schemaVersion: readScalar(text, "schema_version") ?? "unknown",
    createdAt: unquote(readScalar(text, "created_at") ?? "unknown")
  };
}

export async function directorySummary(rootPath: string) {
  const root = resolveRoot(rootPath);
  const missing: string[] = [];
  for (const dir of REQUIRED_DIRS) {
    if (!(await exists(path.join(root, dir)))) {
      missing.push(dir);
    }
  }
  return { present: REQUIRED_DIRS.length - missing.length, missing };
}

export async function doctor(rootPath: string) {
  const root = resolveRoot(rootPath);
  const checks: DoctorCheck[] = [];
  const configPath = path.join(root, CONFIG_FILE);
  checks.push({
    name: CONFIG_FILE,
    status: (await exists(configPath)) ? "ok" : "missing",
    detail: configPath
  });

  for (const dir of REQUIRED_DIRS) {
    const absolute = path.join(root, dir);
    checks.push({
      name: dir,
      status: (await exists(absolute)) ? "ok" : "missing",
      detail: absolute
    });
  }

  for (const file of REQUIRED_FILES) {
    const absolute = path.join(root, file);
    checks.push({
      name: file,
      status: (await exists(absolute)) ? "ok" : "missing",
      detail: absolute
    });
  }

  const writeTarget = path.join(root, "_system", "logs", ".doctor-write-test");
  try {
    await fs.writeFile(writeTarget, "ok", "utf8");
    await fs.unlink(writeTarget);
    checks.push({ name: "write_permission", status: "ok", detail: root });
  } catch {
    checks.push({ name: "write_permission", status: "permission error", detail: root });
  }

  return checks;
}

export type StatusSummary = {
  root: string;
  runCount: number;
  failedCount: number;
  lastRunId?: string;
  lastSuccessRunId?: string;
  lastFailureRunId?: string;
  fallbackCount: number;
  groundingReviewCount: number;
  lintStatus: ReadinessStatus;
  lintReportPath?: string;
  systemFiles: Array<{ path: string; status: "ok" | "missing" }>;
};

export async function statusSummary(rootPath: string) {
  const root = resolveRoot(rootPath);
  const runsRoot = path.join(root, "09-runs");
  if (!(await exists(runsRoot))) {
    return {
      root,
      runCount: 0,
      failedCount: 0,
      fallbackCount: await countWikiEntries(root, "deterministic_fallback"),
      groundingReviewCount: await countGroundingReviewEntries(root),
      lintStatus: await readLintStatus(root),
      lintReportPath: await lintReportPath(root),
      systemFiles: await systemFileSummary(root)
    };
  }

  const entries = await fs.readdir(runsRoot, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  let failedCount = 0;

  for (const dir of dirs) {
    const payloadPath = path.join(runsRoot, dir, "payload.json");
    try {
      const payload = JSON.parse(await fs.readFile(payloadPath, "utf8")) as { source?: { fetch_status?: string } };
      if (payload.source?.fetch_status === "failed") {
        failedCount += 1;
      }
    } catch {
      if (dir.endsWith("-fetch-failed")) {
        failedCount += 1;
      }
    }
  }

  const stats: Array<{ dir: string; mtimeMs: number }> = [];
  for (const dir of dirs) {
    stats.push({ dir, mtimeMs: (await fs.stat(path.join(runsRoot, dir))).mtimeMs });
  }
  stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const successDirs = dirs.filter((dir) => !dir.endsWith("-fetch-failed"));
  const failureDirs = dirs.filter((dir) => dir.endsWith("-fetch-failed"));

  return {
    root,
    runCount: dirs.length,
    failedCount,
    lastRunId: stats[0]?.dir,
    lastSuccessRunId: await newestDir(root, successDirs),
    lastFailureRunId: await newestDir(root, failureDirs),
    fallbackCount: await countWikiEntries(root, "deterministic_fallback"),
    groundingReviewCount: await countGroundingReviewEntries(root),
    lintStatus: await readLintStatus(root),
    lintReportPath: await lintReportPath(root),
    systemFiles: await systemFileSummary(root)
  };
}

export async function exists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function readScalar(text: string, key: string): string | undefined {
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, "m");
  return pattern.exec(text)?.[1]?.trim();
}

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

const REQUIRED_FILES = ["_system/purpose.md", "_system/index.md", "_system/log.md"] as const;

async function systemFileSummary(root: string) {
  const files: Array<{ path: string; status: "ok" | "missing" }> = [];
  for (const file of REQUIRED_FILES) {
    files.push({ path: file, status: await exists(path.join(root, file)) ? "ok" : "missing" });
  }
  return files;
}

async function newestDir(root: string, dirs: string[]): Promise<string | undefined> {
  const stats: Array<{ dir: string; mtimeMs: number }> = [];
  for (const dir of dirs) {
    stats.push({ dir, mtimeMs: (await fs.stat(path.join(root, "09-runs", dir))).mtimeMs });
  }
  stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return stats[0]?.dir;
}

async function countWikiEntries(root: string, generationMode: string): Promise<number> {
  const files = await markdownFiles(path.join(root, "05-wiki", "source-knowledge"));
  let count = 0;
  for (const file of files) {
    const parsed = parseMarkdown(await fs.readFile(file, "utf8"));
    if (frontmatterString(parsed.frontmatter, "generation_mode") === generationMode) {
      count += 1;
    }
  }
  return count;
}

async function countGroundingReviewEntries(root: string): Promise<number> {
  const files = await markdownFiles(path.join(root, "05-wiki", "source-knowledge"));
  let count = 0;
  for (const file of files) {
    const parsed = parseMarkdown(await fs.readFile(file, "utf8"));
    if (frontmatterBoolean(parsed.frontmatter, "grounding_needs_review") === true) {
      count += 1;
    }
  }
  return count;
}

async function readLintStatus(root: string): Promise<ReadinessStatus> {
  const reportPath = await lintReportPath(root);
  if (!reportPath) {
    return "missing";
  }
  const text = await fs.readFile(path.join(root, reportPath), "utf8");
  if (/\[(error|warning)\]/.test(text)) {
    return "needs_attention";
  }
  return "ok";
}

async function lintReportPath(root: string): Promise<string | undefined> {
  const absolute = path.join(root, "dashboards", "Lint Report.md");
  return await exists(absolute) ? relativePath(root, absolute) : undefined;
}

async function markdownFiles(dir: string): Promise<string[]> {
  if (!(await exists(dir))) {
    return [];
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await markdownFiles(target));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(target);
    }
  }
  return files;
}
