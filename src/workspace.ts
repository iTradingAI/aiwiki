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

  return { root, createdConfig, createdDirs };
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
