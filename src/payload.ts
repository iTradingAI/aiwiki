import { repairMojibake } from "./encoding.js";

export type NormalizedPayload = {
  schema_version: "aiwiki.agent_payload.v1";
  target_kb?: string;
  source: {
    kind: string;
    url?: string;
    title?: string;
    author?: string;
    platform?: string;
    content_format?: string;
    content?: string;
    fetcher?: string;
    fetch_status: "ok" | "failed";
    fetch_notes?: string;
    captured_at: string;
    language?: string;
  };
  request: {
    mode: string;
    outputs: string[];
    language?: string;
  };
  warnings: string[];
};

type RawRecord = Record<string, unknown>;

export function normalizePayload(raw: unknown, runStartedAt: string): NormalizedPayload {
  if (!isRecord(raw)) {
    throw new Error("payload must be a JSON object");
  }
  if (raw.schema_version !== "aiwiki.agent_payload.v1") {
    throw new Error("schema_version must be aiwiki.agent_payload.v1");
  }
  rejectWriteControlFields(raw);

  const sourceRaw = raw.source;
  if (!isRecord(sourceRaw)) {
    throw new Error("source is required");
  }

  const legacyContent = isRecord(raw.content) ? stringValue(raw.content.text) : undefined;
  const legacyMetadata = isRecord(raw.metadata) ? raw.metadata : undefined;
  const warnings: string[] = [];

  const contentRepair = repairMojibake(stringValue(sourceRaw.content) ?? legacyContent);
  const titleRepair = repairMojibake(stringValue(sourceRaw.title));
  const fetchNotesRepair = repairMojibake(stringValue(sourceRaw.fetch_notes));
  const content = contentRepair.value;
  const fetcher = stringValue(sourceRaw.fetcher) ?? (legacyMetadata ? stringValue(legacyMetadata.fetcher) : undefined);
  const legacyCapturedAt = legacyMetadata ? stringValue(legacyMetadata.captured_at) : undefined;
  const capturedAt = stringValue(sourceRaw.captured_at) ?? legacyCapturedAt ?? runStartedAt;
  if (!stringValue(sourceRaw.captured_at) && legacyCapturedAt) {
    warnings.push("metadata.captured_at 已规范化为 source.captured_at。");
  }
  if (!stringValue(sourceRaw.captured_at) && !legacyCapturedAt) {
    warnings.push("缺少 captured_at，已使用 run_started_at 补齐。");
  }

  const fetchStatus = normalizeFetchStatus(stringValue(sourceRaw.fetch_status), content);
  if (fetchStatus !== "failed" && !content?.trim()) {
    throw new Error("source.content is required when source.fetch_status is ok");
  }

  const kind = stringValue(sourceRaw.kind);
  if (!kind) {
    throw new Error("source.kind is required");
  }

  const requestRaw = isRecord(raw.request) ? raw.request : {};
  const requestedOutputs = Array.isArray(requestRaw.outputs)
    ? requestRaw.outputs.filter((item): item is string => typeof item === "string")
    : ["source_card", "creative_assets", "topics", "draft_outline", "processing_summary"];

  const outputs = ["source_card", "creative_assets", "topics", "draft_outline", "processing_summary"];
  if (fetchStatus !== "failed" && requestedOutputs.length && requestedOutputs.length !== outputs.length) {
    warnings.push("基础版会生成完整单条资料产物，request.outputs 已按全量输出处理。");
  }
  if (typeof raw.target_kb === "string" && raw.target_kb.trim()) {
    warnings.push(`target_kb=${raw.target_kb} 已被单知识库流程忽略。`);
  }
  if (contentRepair.repaired) {
    warnings.push("source.content 检测到疑似 UTF-8 mojibake，已自动修复。");
  }
  if (titleRepair.repaired) {
    warnings.push("source.title 检测到疑似 UTF-8 mojibake，已自动修复。");
  }
  if (fetchNotesRepair.repaired) {
    warnings.push("source.fetch_notes 检测到疑似 UTF-8 mojibake，已自动修复。");
  }

  if (fetchStatus === "failed" && content?.trim()) {
    throw new Error("source.content must be empty when source.fetch_status is failed");
  }

  return {
    schema_version: "aiwiki.agent_payload.v1",
    target_kb: stringValue(raw.target_kb),
    source: {
      kind,
      url: stringValue(sourceRaw.url),
      title: titleRepair.value,
      author: stringValue(sourceRaw.author),
      platform: stringValue(sourceRaw.platform),
      content_format: stringValue(sourceRaw.content_format),
      content,
      fetcher,
      fetch_status: fetchStatus,
      fetch_notes: fetchNotesRepair.value,
      captured_at: capturedAt,
      language: stringValue(sourceRaw.language) ?? (legacyMetadata ? stringValue(legacyMetadata.language) : undefined)
    },
    request: {
      mode: stringValue(requestRaw.mode) ?? (fetchStatus === "failed" ? "record_fetch_failure" : "ingest"),
      outputs,
      language: stringValue(requestRaw.language) ?? stringValue(sourceRaw.language)
    },
    warnings
  };
}

function normalizeFetchStatus(value: string | undefined, content: string | undefined): "ok" | "failed" {
  if (value === "failed") {
    return "failed";
  }
  if (value === "ok") {
    return "ok";
  }
  return content ? "ok" : "failed";
}

function rejectWriteControlFields(raw: RawRecord): void {
  if (isRecord(raw.output) && (typeof raw.output.path === "string" || typeof raw.output.dir === "string")) {
    throw new Error("payload must not control output paths");
  }
  if (typeof raw.output_file === "string") {
    throw new Error("payload must not control output paths");
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
