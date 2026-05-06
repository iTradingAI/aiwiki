import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { NormalizedPayload, normalizePayload } from "./payload.js";
import { appendRunIdBeforeExt, relativePath, safeJoin, slugify } from "./paths.js";
import { initWorkspace } from "./workspace.js";

export type IngestResult = {
  runId: string;
  runDir: string;
  generatedFiles: string[];
  warnings: string[];
};

export async function ingestPayload(rootPath: string, rawPayload: unknown) {
  await initWorkspace(rootPath);
  const root = path.resolve(rootPath);
  const runStartedAt = new Date().toISOString();
  const runId = createRunId(runStartedAt);
  const payload = normalizePayload(rawPayload, runStartedAt);
  const runDirName = payload.source.fetch_status === "failed" ? `${runId}-fetch-failed` : runId;
  const runDir = safeJoin(root, "09-runs", runDirName);
  await fs.mkdir(runDir, { recursive: false });

  const generatedFiles: string[] = [];
  await writeFile(path.join(runDir, "payload.json"), `${JSON.stringify(payload, null, 2)}\n`, generatedFiles);

  if (payload.source.fetch_status === "failed") {
    await writeSummary(root, runDir, payload, generatedFiles, [
      ...payload.warnings,
      "宿主 Agent 未能提供正文，AIWiki CLI 没有自行抓取网页。"
    ]);
    return { runId: runDirName, runDir, generatedFiles, warnings: payload.warnings };
  }

  const slug = slugify(payload.source.title ?? payload.source.url);
  const content = payload.source.content ?? "";

  await writeFile(path.join(runDir, "raw.md"), contentFile(payload, content), generatedFiles);
  await writeFile(path.join(runDir, "source-card.md"), sourceCard(payload, runDirName), generatedFiles);
  await writeFile(path.join(runDir, "creative-assets.md"), creativeAssets(payload), generatedFiles);
  await writeFile(path.join(runDir, "topics.md"), topics(payload), generatedFiles);
  await writeFile(path.join(runDir, "draft-outline.md"), outline(payload), generatedFiles);

  const collisionWarnings: string[] = [];
  await writeLongTerm(root, "02-raw/articles", `${slug}.md`, contentFile(payload, content), runId, generatedFiles, collisionWarnings);
  await writeLongTerm(root, "03-sources/article-cards", `${slug}.md`, sourceCard(payload, runDirName), runId, generatedFiles, collisionWarnings);
  await writeLongTerm(root, "04-claims/_suggestions", `${slug}-claims.md`, claims(payload), runId, generatedFiles, collisionWarnings);
  await writeLongTerm(root, "06-assets/_suggestions", `${slug}-assets.md`, creativeAssets(payload), runId, generatedFiles, collisionWarnings);
  await writeLongTerm(root, "07-topics/ready", `${slug}-topics.md`, topics(payload), runId, generatedFiles, collisionWarnings);
  await writeLongTerm(root, "08-outputs/outlines", `${slug}-outline.md`, outline(payload), runId, generatedFiles, collisionWarnings);

  const warnings = [...payload.warnings, ...collisionWarnings];
  await writeSummary(root, runDir, payload, generatedFiles, warnings);
  return { runId, runDir, generatedFiles, warnings };
}

export async function ingestFile(rootPath: string, filePath: string) {
  const content = await fs.readFile(filePath, "utf8");
  if (!content.trim()) {
    throw new Error("input file is empty");
  }
  return ingestPayload(rootPath, {
    schema_version: "aiwiki.agent_payload.v1",
    source: {
      kind: "file",
      title: path.basename(filePath),
      content_format: "markdown",
      content,
      fetcher: "local-file",
      fetch_status: "ok",
      captured_at: new Date().toISOString()
    },
    request: {
      mode: "ingest",
      outputs: ["source_card", "creative_assets", "topics", "draft_outline", "processing_summary"],
      language: "zh-CN"
    }
  });
}

async function writeLongTerm(
  root: string,
  dir: string,
  fileName: string,
  content: string,
  runId: string,
  generatedFiles: string[],
  warnings: string[]
) {
  let target = safeJoin(root, dir, fileName);
  try {
    await fs.writeFile(target, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
    const renamed = appendRunIdBeforeExt(fileName, runId);
    target = safeJoin(root, dir, renamed);
    await fs.writeFile(target, content, { encoding: "utf8", flag: "wx" });
    warnings.push(`collision renamed: ${relativePath(root, safeJoin(root, dir, fileName))} -> ${relativePath(root, target)}`);
  }
  generatedFiles.push(target);
}

async function writeFile(target: string, content: string, generatedFiles: string[]) {
  await fs.writeFile(target, content, { encoding: "utf8", flag: "wx" });
  generatedFiles.push(target);
}

async function writeSummary(
  root: string,
  runDir: string,
  payload: NormalizedPayload,
  generatedFiles: string[],
  warnings: string[]
) {
  const summaryPath = path.join(runDir, "processing-summary.md");
  const files = [...generatedFiles, summaryPath];
  const lines = [
    "# processing-summary",
    "",
    `Input source: ${payload.source.kind}`,
    `Fetch status: ${payload.source.fetch_status}`,
    `Host fetcher: ${payload.source.fetcher ?? "unknown"}`,
    "",
    "Generated files:",
    ...files.map((file) => `- ${relativePath(root, file)}`),
    "",
    "Warnings:",
    ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "next review:",
    "- 请在 Obsidian 中人工审阅 Source Card、Claim 建议、资产建议、选题和大纲。",
    "- AIWiki CLI 不负责网页抓取稳定性。"
  ];
  await fs.writeFile(summaryPath, `${lines.join("\n")}\n`, { encoding: "utf8", flag: "wx" });
  generatedFiles.push(summaryPath);
}

function contentFile(payload: NormalizedPayload, content: string): string {
  return [`# ${payload.source.title ?? "Untitled"}`, "", content, ""].join("\n");
}

function sourceCard(payload: NormalizedPayload, runId: string): string {
  return [
    "---",
    `title: "${escapeYaml(payload.source.title ?? "Untitled")}"`,
    `source_type: "${escapeYaml(payload.source.kind)}"`,
    `url: "${escapeYaml(payload.source.url ?? "")}"`,
    `fetcher: "${escapeYaml(payload.source.fetcher ?? "unknown")}"`,
    `captured_at: "${escapeYaml(payload.source.captured_at)}"`,
    `run_id: "${escapeYaml(runId)}"`,
    "---",
    "",
    `# ${payload.source.title ?? "Untitled"}`,
    "",
    "## 摘要",
    "",
    trimPreview(payload.source.content ?? payload.source.fetch_notes ?? ""),
    ""
  ].join("\n");
}

function claims(payload: NormalizedPayload): string {
  return [`# Claim Suggestions`, "", `- 待人工审阅：${payload.source.title ?? "Untitled"}`, ""].join("\n");
}

function creativeAssets(payload: NormalizedPayload): string {
  return [`# Creative Assets`, "", `- 可复用素材：${payload.source.title ?? "Untitled"}`, ""].join("\n");
}

function topics(payload: NormalizedPayload): string {
  return [`# Topic Candidates`, "", `- ${payload.source.title ?? "Untitled"}`, ""].join("\n");
}

function outline(payload: NormalizedPayload): string {
  return [`# Draft Outline`, "", "1. 背景", "2. 关键观点", "3. 可复用方法", `4. 来源：${payload.source.title ?? "Untitled"}`, ""].join("\n");
}

function trimPreview(value: string): string {
  return value.trim().slice(0, 500) || "待人工补充。";
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function createRunId(now: string): string {
  const stamp = now.replace(/[-:.]/g, "").replace("T", "-").replace("Z", "");
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}
