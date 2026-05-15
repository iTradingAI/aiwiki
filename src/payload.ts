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
  analysis?: PayloadAnalysis;
  wiki_entry?: PayloadWikiEntry;
  warnings: string[];
};

type RawRecord = Record<string, unknown>;

export type PayloadAnalysis = {
  summary?: string;
  key_points: string[];
  reusable_knowledge: Array<{ title?: string; content: string }>;
  related_concepts: string[];
  use_cases: string[];
  topic_candidates: string[];
  claims: Array<{ claim: string; confidence?: string; source_quote?: string }>;
  outline?: {
    title?: string;
    sections: string[];
  };
};

export type PayloadWikiEntry = {
  title?: string;
  summary?: string;
  sections: Array<{ heading: string; items: string[] }>;
  markdown?: string;
};

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

  const outputs = ["source_card", "wiki_entry", "creative_assets", "topics", "draft_outline", "processing_summary"];
  if (fetchStatus !== "failed" && requestedOutputs.length && hasCustomOutputRequest(requestedOutputs)) {
    warnings.push("AIWiki 会为每条输入生成完整资料产物，request.outputs 已按全量输出处理。");
  }
  if (typeof raw.target_kb === "string" && raw.target_kb.trim()) {
    warnings.push(`target_kb=${raw.target_kb} 已被当前知识库流程忽略。`);
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

  const analysis = normalizeAnalysis(raw.analysis, warnings);
  const wikiEntry = normalizeWikiEntry(raw.wiki_entry, warnings);

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
    analysis,
    wiki_entry: wikiEntry,
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
  if (isRecord(raw.wiki_entry) && typeof raw.wiki_entry.path === "string") {
    throw new Error("payload must not control output paths");
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAnalysis(value: unknown, warnings: string[]): PayloadAnalysis | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    warnings.push("analysis 已忽略：必须是对象。");
    return undefined;
  }

  const analysis: PayloadAnalysis = {
    summary: stringValue(value.summary),
    key_points: stringArray(value.key_points, "analysis.key_points", warnings),
    reusable_knowledge: reusableKnowledgeArray(value.reusable_knowledge, warnings),
    related_concepts: stringArray(value.related_concepts, "analysis.related_concepts", warnings),
    use_cases: stringArray(value.use_cases, "analysis.use_cases", warnings),
    topic_candidates: stringArray(value.topic_candidates, "analysis.topic_candidates", warnings),
    claims: claimsArray(value.claims, warnings),
    outline: outlineValue(value.outline, warnings)
  };

  return hasAnalysisContent(analysis) ? analysis : undefined;
}

function normalizeWikiEntry(value: unknown, warnings: string[]): PayloadWikiEntry | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    warnings.push("wiki_entry 已忽略：必须是对象。");
    return undefined;
  }

  const entry: PayloadWikiEntry = {
    title: stringValue(value.title),
    summary: stringValue(value.summary),
    sections: wikiSections(value.sections, warnings),
    markdown: stringValue(value.markdown)
  };

  return entry.title || entry.summary || entry.sections.length || entry.markdown ? entry : undefined;
}

function stringArray(value: unknown, field: string, warnings: string[]): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push(`${field} 已忽略：必须是字符串数组。`);
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function reusableKnowledgeArray(value: unknown, warnings: string[]): PayloadAnalysis["reusable_knowledge"] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push("analysis.reusable_knowledge 已忽略：必须是数组。");
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) {
      return [{ content: item.trim() }];
    }
    if (isRecord(item) && typeof item.content === "string" && item.content.trim()) {
      return [{ title: stringValue(item.title), content: item.content.trim() }];
    }
    return [];
  });
}

function claimsArray(value: unknown, warnings: string[]): PayloadAnalysis["claims"] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push("analysis.claims 已忽略：必须是数组。");
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) {
      return [{ claim: item.trim() }];
    }
    if (isRecord(item) && typeof item.claim === "string" && item.claim.trim()) {
      return [{
        claim: item.claim.trim(),
        confidence: stringValue(item.confidence),
        source_quote: stringValue(item.source_quote)
      }];
    }
    return [];
  });
}

function outlineValue(value: unknown, warnings: string[]): PayloadAnalysis["outline"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    warnings.push("analysis.outline 已忽略：必须是对象。");
    return undefined;
  }
  const sections = stringArray(value.sections, "analysis.outline.sections", warnings);
  if (!sections.length && !stringValue(value.title)) {
    return undefined;
  }
  return { title: stringValue(value.title), sections };
}

function wikiSections(value: unknown, warnings: string[]): PayloadWikiEntry["sections"] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push("wiki_entry.sections 已忽略：必须是数组。");
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.heading !== "string" || !item.heading.trim()) {
      return [];
    }
    return [{
      heading: item.heading.trim(),
      items: stringArray(item.items, "wiki_entry.sections.items", warnings)
    }];
  });
}

function hasAnalysisContent(analysis: PayloadAnalysis): boolean {
  return Boolean(
    analysis.summary ||
    analysis.key_points.length ||
    analysis.reusable_knowledge.length ||
    analysis.related_concepts.length ||
    analysis.use_cases.length ||
    analysis.topic_candidates.length ||
    analysis.claims.length ||
    analysis.outline
  );
}

function hasCustomOutputRequest(outputs: string[]): boolean {
  const legacyDefault = ["source_card", "creative_assets", "topics", "draft_outline", "processing_summary"];
  const currentDefault = ["source_card", "wiki_entry", "creative_assets", "topics", "draft_outline", "processing_summary"];
  const sameSet = (left: string[], right: string[]) => left.length === right.length && left.every((item) => right.includes(item));
  return !sameSet(outputs, legacyDefault) && !sameSet(outputs, currentDefault);
}
