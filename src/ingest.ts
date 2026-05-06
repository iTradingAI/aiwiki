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
  agentReport: AgentReport;
};

export type AgentReport = {
  ingested: boolean;
  recorded: boolean;
  fetchStatus: "ok" | "failed";
  sourceTitle: string;
  sourceUrl?: string;
  fitScore: number;
  fitLevel: string;
  summary: string;
  keyFiles: {
    processingSummary: string;
    sourceCard?: string;
    draftOutline?: string;
  };
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
    return { runId: runDirName, runDir, generatedFiles, warnings: payload.warnings, agentReport: buildAgentReport(root, runDir, payload, generatedFiles) };
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
  return { runId, runDir, generatedFiles, warnings, agentReport: buildAgentReport(root, runDir, payload, generatedFiles) };
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

function buildAgentReport(root: string, runDir: string, payload: NormalizedPayload, generatedFiles: string[]): AgentReport {
  const content = payload.source.content ?? "";
  const fetchFailed = payload.source.fetch_status === "failed";
  const fitScore = fetchFailed ? 0 : estimateFitScore(payload, content);
  return {
    ingested: !fetchFailed,
    recorded: true,
    fetchStatus: payload.source.fetch_status,
    sourceTitle: payload.source.title ?? "Untitled",
    sourceUrl: payload.source.url,
    fitScore,
    fitLevel: fitLevel(fitScore, fetchFailed),
    summary: fetchFailed ? (payload.source.fetch_notes ?? "Host Agent did not provide readable content.") : summarizeContent(content),
    keyFiles: {
      processingSummary: relativePath(root, path.join(runDir, "processing-summary.md")),
      sourceCard: findGeneratedFile(root, generatedFiles, "source-card.md"),
      draftOutline: findGeneratedFile(root, generatedFiles, "draft-outline.md")
    }
  };
}

function estimateFitScore(payload: NormalizedPayload, content: string) {
  let score = 45;
  if (payload.source.kind === "url" || payload.source.kind === "file") {
    score += 10;
  }
  if ((payload.source.title ?? "").trim()) {
    score += 10;
  }
  if (content.trim().length >= 500) {
    score += 20;
  } else if (content.trim().length >= 150) {
    score += 10;
  }
  if (payload.source.url) {
    score += 5;
  }
  return Math.min(95, score);
}

function fitLevel(score: number, fetchFailed: boolean) {
  if (fetchFailed) {
    return "fetch_failed";
  }
  if (score >= 80) {
    return "high";
  }
  if (score >= 60) {
    return "medium";
  }
  return "low";
}

function summarizeContent(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "No readable content was provided.";
  }
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
}

function findGeneratedFile(root: string, files: string[], basename: string) {
  const match = files.find((file) => path.basename(file) === basename);
  return match ? relativePath(root, match) : undefined;
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function createRunId(now: string): string {
  const stamp = now.replace(/[-:.]/g, "").replace("T", "-").replace("Z", "");
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}
