import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { CliError } from "./output.js";

export const CONFIG_FILE = "aiwiki.yaml";

export const REQUIRED_DIRS = [
  "02-raw/articles",
  "03-sources/article-cards",
  "04-claims/_suggestions",
  "05-wiki",
  "06-assets/_suggestions",
  "07-topics/ready",
  "08-outputs/outlines",
  "09-runs",
  "dashboards",
  "_system/templates",
  "_system/schemas",
  "_system/logs"
] as const;

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

const WORKSPACE_SEEDS: Array<{ path: string; content: string }> = [
  {
    path: "dashboards/AIWiki Home.md",
    content: `# AIWiki Home

AIWiki 的 Obsidian 入口。Dataview 是可选增强；未安装时仍可使用下方普通链接、Properties、Backlinks 和 Graph View。

## Native Links

- [[dashboards/Review Queue|Review Queue]]
- [[dashboards/Recent Runs|Recent Runs]]
- [[dashboards/Topic Pipeline|Topic Pipeline]]
- [[_system/schemas/aiwiki-frontmatter|Frontmatter Schema]]

## Recent Sources

\`\`\`dataview
TABLE status, source_url, captured_at, run_summary
FROM "03-sources/article-cards"
WHERE type = "source_card"
SORT captured_at DESC
\`\`\`

## Review Queue

\`\`\`dataview
TABLE type, status, source_card, raw_note, run_summary
FROM "03-sources/article-cards" or "04-claims/_suggestions" or "06-assets/_suggestions" or "08-outputs/outlines"
WHERE status = "to-review"
SORT created_at DESC
\`\`\`
`
  },
  {
    path: "dashboards/Review Queue.md",
    content: `# Review Queue

未安装 Dataview 时，可直接打开 [[03-sources/article-cards]]、[[04-claims/_suggestions]]、[[06-assets/_suggestions]] 和 [[08-outputs/outlines]] 手工审阅。

## To Review

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
    content: `# Recent Runs

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
    content: `# Topic Pipeline

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

# Source Card

## Obsidian Links

- Raw:
- Claims:
- Assets:
- Topics:
- Outline:
- Run Summary:

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

# Review Note

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
  for (const dir of REQUIRED_DIRS) {
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
      for (const dir of REQUIRED_DIRS) {
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
    for (const dir of REQUIRED_DIRS) {
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
    for (const dir of REQUIRED_DIRS) {
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
};

export async function statusSummary(rootPath: string) {
  const root = resolveRoot(rootPath);
  const runsRoot = path.join(root, "09-runs");
  if (!(await exists(runsRoot))) {
    return { root, runCount: 0, failedCount: 0 };
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

  return {
    root,
    runCount: dirs.length,
    failedCount,
    lastRunId: stats[0]?.dir
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
