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
    dashboard: string;
    reviewQueue: string;
  };
};

type ArtifactLinks = {
  slug: string;
  runId: string;
  createdAt: string;
  raw: string;
  sourceCard: string;
  claims: string;
  assets: string;
  topics: string;
  outline: string;
  runSummary: string;
};

type LongTermTargets = {
  raw: string;
  sourceCard: string;
  claims: string;
  assets: string;
  topics: string;
  outline: string;
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
  const collisionWarnings: string[] = [];
  const longTermTargets = await chooseLongTermTargets(root, slug, runId, collisionWarnings);
  const links = buildArtifactLinks(root, slug, runDirName, runStartedAt, longTermTargets);

  await writeFile(path.join(runDir, "raw.md"), contentFile(payload, content, links), generatedFiles);
  await writeFile(path.join(runDir, "source-card.md"), sourceCard(payload, runDirName, links), generatedFiles);
  await writeFile(path.join(runDir, "creative-assets.md"), creativeAssets(payload, links), generatedFiles);
  await writeFile(path.join(runDir, "topics.md"), topics(payload, links), generatedFiles);
  await writeFile(path.join(runDir, "draft-outline.md"), outline(payload, links), generatedFiles);

  await writeFile(longTermTargets.raw, contentFile(payload, content, links), generatedFiles);
  await writeFile(longTermTargets.sourceCard, sourceCard(payload, runDirName, links), generatedFiles);
  await writeFile(longTermTargets.claims, claims(payload, links), generatedFiles);
  await writeFile(longTermTargets.assets, creativeAssets(payload, links), generatedFiles);
  await writeFile(longTermTargets.topics, topics(payload, links), generatedFiles);
  await writeFile(longTermTargets.outline, outline(payload, links), generatedFiles);

  const warnings = [...payload.warnings, ...collisionWarnings];
  await writeSummary(root, runDir, payload, generatedFiles, warnings, links);
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
      title: deriveFileTitle(filePath),
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

export function deriveFileTitle(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

async function chooseLongTermTargets(root: string, slug: string, runId: string, warnings: string[]): Promise<LongTermTargets> {
  return {
    raw: await chooseLongTermTarget(root, "02-raw/articles", `${slug}.md`, runId, warnings),
    sourceCard: await chooseLongTermTarget(root, "03-sources/article-cards", `${slug}.md`, runId, warnings),
    claims: await chooseLongTermTarget(root, "04-claims/_suggestions", `${slug}-claims.md`, runId, warnings),
    assets: await chooseLongTermTarget(root, "06-assets/_suggestions", `${slug}-assets.md`, runId, warnings),
    topics: await chooseLongTermTarget(root, "07-topics/ready", `${slug}-topics.md`, runId, warnings),
    outline: await chooseLongTermTarget(root, "08-outputs/outlines", `${slug}-outline.md`, runId, warnings)
  };
}

async function chooseLongTermTarget(root: string, dir: string, fileName: string, runId: string, warnings: string[]) {
  const target = safeJoin(root, dir, fileName);
  try {
    await fs.access(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return target;
    }
    throw error;
  }
  const renamed = appendRunIdBeforeExt(fileName, runId);
  const renamedTarget = safeJoin(root, dir, renamed);
  warnings.push(`collision renamed: ${relativePath(root, target)} -> ${relativePath(root, renamedTarget)}`);
  return renamedTarget;
}

async function writeFile(target: string, content: string, generatedFiles: string[]) {
  try {
    await fs.writeFile(target, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`target file already exists: ${target}`);
    }
    throw error;
  }
  generatedFiles.push(target);
}

async function writeSummary(
  root: string,
  runDir: string,
  payload: NormalizedPayload,
  generatedFiles: string[],
  warnings: string[],
  links?: ArtifactLinks
) {
  const summaryPath = path.join(runDir, "processing-summary.md");
  const files = [...generatedFiles, summaryPath];
  const runId = path.basename(runDir);
  const slug = links?.slug ?? slugify(payload.source.title ?? payload.source.url);
  const createdAt = links?.createdAt ?? new Date().toISOString();
  const lines = [
    "---",
    `aiwiki_id: "${escapeYaml(`${slug}:run:${runId}`)}"`,
    `type: "processing_summary"`,
    `status: "${payload.source.fetch_status === "failed" ? "fetch-failed" : "to-review"}"`,
    `slug: "${escapeYaml(slug)}"`,
    `title: "${escapeYaml(payload.source.title ?? "Untitled")}"`,
    `source_url: "${escapeYaml(payload.source.url ?? "")}"`,
    `source_type: "${escapeYaml(payload.source.kind)}"`,
    `created_at: "${escapeYaml(createdAt)}"`,
    `captured_at: "${escapeYaml(payload.source.captured_at)}"`,
    `run_id: "${escapeYaml(runId)}"`,
    ...(links ? relationshipFrontmatter(links) : []),
    `tags: ["aiwiki/run"]`,
    "---",
    "",
    "# 处理记录",
    "",
    `来源类型：${payload.source.kind}`,
    `读取状态：${payload.source.fetch_status}`,
    `宿主读取器：${payload.source.fetcher ?? "unknown"}`,
    "",
    "生成文件：",
    ...files.map((file) => `- ${obsidianFileReference(root, file)}`),
    "",
    "告警：",
    ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "下一步审阅：",
    "- 请在 Obsidian 中人工审阅资料卡、Claim 建议、素材建议、选题和大纲。",
    "- AIWiki CLI 不负责网页抓取稳定性。"
  ];
  await fs.writeFile(summaryPath, `${lines.join("\n")}\n`, { encoding: "utf8", flag: "wx" });
  generatedFiles.push(summaryPath);
}

function contentFile(payload: NormalizedPayload, content: string, links: ArtifactLinks): string {
  return [
    "---",
    `aiwiki_id: "${escapeYaml(`${links.slug}:raw`)}"`,
    `title: "${escapeYaml(payload.source.title ?? "Untitled")}"`,
    `type: "raw_article"`,
    `status: "to-review"`,
    `slug: "${escapeYaml(links.slug)}"`,
    `source_type: "${escapeYaml(payload.source.kind)}"`,
    `source_url: "${escapeYaml(payload.source.url ?? "")}"`,
    `created_at: "${escapeYaml(links.createdAt)}"`,
    `captured_at: "${escapeYaml(payload.source.captured_at)}"`,
    `run_id: "${escapeYaml(links.runId)}"`,
    ...relationshipFrontmatter(links),
    `tags: ["aiwiki/raw"]`,
    "---",
    "",
    `# ${payload.source.title ?? "Untitled"}`,
    "",
    "## AIWiki 链接",
    "",
    `- 资料卡：${obsidianLink(links.sourceCard, "资料卡")}`,
    `- 处理记录：${obsidianLink(links.runSummary, "处理记录")}`,
    "",
    content,
    ""
  ].join("\n");
}

function sourceCard(payload: NormalizedPayload, runId: string, links: ArtifactLinks): string {
  return [
    "---",
    `aiwiki_id: "${escapeYaml(`${links.slug}:source-card`)}"`,
    `title: "${escapeYaml(payload.source.title ?? "Untitled")}"`,
    `type: "source_card"`,
    `status: "to-review"`,
    `slug: "${escapeYaml(links.slug)}"`,
    `source_type: "${escapeYaml(payload.source.kind)}"`,
    `source_url: "${escapeYaml(payload.source.url ?? "")}"`,
    `url: "${escapeYaml(payload.source.url ?? "")}"`,
    `fetcher: "${escapeYaml(payload.source.fetcher ?? "unknown")}"`,
    `created_at: "${escapeYaml(links.createdAt)}"`,
    `captured_at: "${escapeYaml(payload.source.captured_at)}"`,
    `run_id: "${escapeYaml(runId)}"`,
    ...relationshipFrontmatter(links),
    `aliases: ["${escapeYaml(payload.source.title ?? "Untitled")}"]`,
    `tags: ["aiwiki/source-card"]`,
    "---",
    "",
    `# ${payload.source.title ?? "Untitled"}`,
    "",
    "## Obsidian 链接",
    "",
    `- 原文：${obsidianLink(links.raw, "原文")}`,
    `- Claim 建议：${obsidianLink(links.claims, "Claim 建议")}`,
    `- 素材建议：${obsidianLink(links.assets, "素材建议")}`,
    `- 选题：${obsidianLink(links.topics, "选题")}`,
    `- 大纲：${obsidianLink(links.outline, "大纲")}`,
    `- 处理记录：${obsidianLink(links.runSummary, "处理记录")}`,
    "",
    "## 摘要",
    "",
    trimPreview(payload.source.content ?? payload.source.fetch_notes ?? ""),
    ""
  ].join("\n");
}

function claims(payload: NormalizedPayload, links: ArtifactLinks): string {
  return [
    "---",
    `aiwiki_id: "${escapeYaml(`${links.slug}:claims`)}"`,
    `title: "${escapeYaml(payload.source.title ?? "Untitled")} Claims"`,
    `type: "claim_suggestions"`,
    `status: "to-review"`,
    `slug: "${escapeYaml(links.slug)}"`,
    `source_url: "${escapeYaml(payload.source.url ?? "")}"`,
    `source_type: "${escapeYaml(payload.source.kind)}"`,
    `created_at: "${escapeYaml(links.createdAt)}"`,
    `captured_at: "${escapeYaml(payload.source.captured_at)}"`,
    `run_id: "${escapeYaml(links.runId)}"`,
    ...relationshipFrontmatter(links),
    `tags: ["aiwiki/claims"]`,
    "---",
    "",
    "# Claim 建议",
    "",
    `- 资料卡：${obsidianLink(links.sourceCard, "资料卡")}`,
    `- 原文：${obsidianLink(links.raw, "原文")}`,
    `- 待人工审阅：${payload.source.title ?? "Untitled"}`,
    ""
  ].join("\n");
}

function creativeAssets(payload: NormalizedPayload, links: ArtifactLinks): string {
  return [
    "---",
    `aiwiki_id: "${escapeYaml(`${links.slug}:assets`)}"`,
    `title: "${escapeYaml(payload.source.title ?? "Untitled")} Assets"`,
    `type: "asset_suggestions"`,
    `status: "to-review"`,
    `slug: "${escapeYaml(links.slug)}"`,
    `source_url: "${escapeYaml(payload.source.url ?? "")}"`,
    `source_type: "${escapeYaml(payload.source.kind)}"`,
    `created_at: "${escapeYaml(links.createdAt)}"`,
    `captured_at: "${escapeYaml(payload.source.captured_at)}"`,
    `run_id: "${escapeYaml(links.runId)}"`,
    ...relationshipFrontmatter(links),
    `tags: ["aiwiki/assets"]`,
    "---",
    "",
    "# 素材建议",
    "",
    `- 资料卡：${obsidianLink(links.sourceCard, "资料卡")}`,
    `- 原文：${obsidianLink(links.raw, "原文")}`,
    `- 可复用素材：${payload.source.title ?? "Untitled"}`,
    ""
  ].join("\n");
}

function topics(payload: NormalizedPayload, links: ArtifactLinks): string {
  return [
    "---",
    `aiwiki_id: "${escapeYaml(`${links.slug}:topics`)}"`,
    `title: "${escapeYaml(payload.source.title ?? "Untitled")} Topics"`,
    `type: "topic_candidates"`,
    `status: "ready"`,
    `slug: "${escapeYaml(links.slug)}"`,
    `source_url: "${escapeYaml(payload.source.url ?? "")}"`,
    `source_type: "${escapeYaml(payload.source.kind)}"`,
    `created_at: "${escapeYaml(links.createdAt)}"`,
    `captured_at: "${escapeYaml(payload.source.captured_at)}"`,
    `run_id: "${escapeYaml(links.runId)}"`,
    ...relationshipFrontmatter(links),
    `tags: ["aiwiki/topics"]`,
    "---",
    "",
    "# 选题候选",
    "",
    `- 资料卡：${obsidianLink(links.sourceCard, "资料卡")}`,
    `- 大纲：${obsidianLink(links.outline, "大纲")}`,
    `- ${payload.source.title ?? "Untitled"}`,
    ""
  ].join("\n");
}

function outline(payload: NormalizedPayload, links: ArtifactLinks): string {
  return [
    "---",
    `aiwiki_id: "${escapeYaml(`${links.slug}:outline`)}"`,
    `title: "${escapeYaml(payload.source.title ?? "Untitled")} Outline"`,
    `type: "draft_outline"`,
    `status: "draft"`,
    `slug: "${escapeYaml(links.slug)}"`,
    `source_url: "${escapeYaml(payload.source.url ?? "")}"`,
    `source_type: "${escapeYaml(payload.source.kind)}"`,
    `created_at: "${escapeYaml(links.createdAt)}"`,
    `captured_at: "${escapeYaml(payload.source.captured_at)}"`,
    `run_id: "${escapeYaml(links.runId)}"`,
    ...relationshipFrontmatter(links),
    `tags: ["aiwiki/outline"]`,
    "---",
    "",
    "# 草稿大纲",
    "",
    `资料卡：${obsidianLink(links.sourceCard, "资料卡")}`,
    `原文：${obsidianLink(links.raw, "原文")}`,
    "",
    "1. 背景",
    "2. 关键观点",
    "3. 可复用方法",
    `4. 来源：${payload.source.title ?? "Untitled"}`,
    ""
  ].join("\n");
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
    summary: fetchFailed ? (payload.source.fetch_notes ?? "宿主 Agent 没有提供可读正文。") : summarizeContent(content),
    keyFiles: {
      processingSummary: relativePath(root, path.join(runDir, "processing-summary.md")),
      sourceCard: findGeneratedFileInDir(root, generatedFiles, "03-sources/article-cards"),
      draftOutline: findGeneratedFile(root, generatedFiles, "draft-outline.md"),
      dashboard: "dashboards/AIWiki Home.md",
      reviewQueue: "dashboards/Review Queue.md"
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
    return "没有提供可读正文。";
  }
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
}

function findGeneratedFile(root: string, files: string[], basename: string) {
  const match = files.find((file) => path.basename(file) === basename);
  return match ? relativePath(root, match) : undefined;
}

function findGeneratedFileInDir(root: string, files: string[], dir: string) {
  const match = files.find((file) => relativePath(root, file).startsWith(`${dir}/`));
  return match ? relativePath(root, match) : undefined;
}

function buildArtifactLinks(root: string, slug: string, runDirName: string, createdAt: string, longTermTargets: LongTermTargets): ArtifactLinks {
  return {
    slug,
    runId: runDirName,
    createdAt,
    raw: relativePath(root, longTermTargets.raw),
    sourceCard: relativePath(root, longTermTargets.sourceCard),
    claims: relativePath(root, longTermTargets.claims),
    assets: relativePath(root, longTermTargets.assets),
    topics: relativePath(root, longTermTargets.topics),
    outline: relativePath(root, longTermTargets.outline),
    runSummary: `09-runs/${runDirName}/processing-summary.md`
  };
}

function relationshipFrontmatter(links: ArtifactLinks): string[] {
  return [
    `source_card: "${escapeYaml(obsidianLink(links.sourceCard, "资料卡"))}"`,
    `raw_note: "${escapeYaml(obsidianLink(links.raw, "原文"))}"`,
    `claims_note: "${escapeYaml(obsidianLink(links.claims, "Claim 建议"))}"`,
    `assets_note: "${escapeYaml(obsidianLink(links.assets, "素材建议"))}"`,
    `topics_note: "${escapeYaml(obsidianLink(links.topics, "选题"))}"`,
    `outline_note: "${escapeYaml(obsidianLink(links.outline, "大纲"))}"`,
    `run_summary: "${escapeYaml(obsidianLink(links.runSummary, "处理记录"))}"`
  ];
}

function obsidianFileReference(root: string, file: string) {
  const vaultPath = relativePath(root, file);
  if (!vaultPath.toLowerCase().endsWith(".md")) {
    return vaultPath;
  }
  return `${obsidianLink(vaultPath, path.basename(vaultPath, ".md"))} (${vaultPath})`;
}

function obsidianLink(vaultPath: string, label: string) {
  return `[[${vaultPath.replace(/\\/g, "/").replace(/\.md$/i, "")}|${label}]]`;
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function createRunId(now: string): string {
  const stamp = now.replace(/[-:.]/g, "").replace("T", "-").replace("Z", "");
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}
