import { NormalizedPayload } from "./payload.js";
import { buildGroundingReport, groundingFrontmatterLines, GroundingReport } from "./grounding.js";

export type WikiEntryMode = "agent_enriched" | "deterministic_fallback";
export type WikiEntryQuality = "enriched" | "scaffold";

export type WikiEntryRenderResult = {
  markdown: string;
  mode: WikiEntryMode;
  quality: WikiEntryQuality;
};

export type WikiEntryLinks = {
  capsuleId: string;
  slug: string;
  runId: string;
  createdAt: string;
  contentFingerprint: string;
  wikiEntry: string;
  raw: string;
  sourceCard: string;
  claims?: string;
  topics?: string;
  outline?: string;
  runSummary: string;
};

export function renderWikiEntry(payload: NormalizedPayload, links: WikiEntryLinks): WikiEntryRenderResult {
  const enriched = Boolean(payload.wiki_entry || payload.analysis);
  const mode: WikiEntryMode = enriched ? "agent_enriched" : "deterministic_fallback";
  const quality: WikiEntryQuality = enriched ? "enriched" : "scaffold";
  const title = payload.wiki_entry?.title ?? payload.source.title ?? "Untitled";
  const grounding = buildGroundingReport(payload);
  const frontmatter = wikiFrontmatter(payload, links, title, mode, quality, grounding);
  const body = enriched ? enrichedBody(payload, links, title, grounding) : fallbackBody(payload, links, title, grounding);
  return {
    mode,
    quality,
    markdown: `${frontmatter}\n${body}`
  };
}

function wikiFrontmatter(
  payload: NormalizedPayload,
  links: WikiEntryLinks,
  title: string,
  mode: WikiEntryMode,
  quality: WikiEntryQuality,
  grounding: GroundingReport
): string {
  return [
    "---",
    `aiwiki_id: "${escapeYaml(`${links.slug}:wiki-entry`)}"`,
    `type: "wiki_entry"`,
    ...wikiCapsuleFrontmatter(payload, links, title, grounding),
    `wiki_type: "${wikiType(payload)}"`,
    `source_role: "${payload.source.source_role}"`,
    `represents_user_view: ${payload.source.represents_user_view ? "true" : "false"}`,
    `status: "active"`,
    `generation_mode: "${mode}"`,
    `quality: "${quality}"`,
    `generated_by: "${mode === "agent_enriched" ? "host_agent" : "aiwiki_cli"}"`,
    `llm_enriched: ${mode === "agent_enriched" ? "true" : "false"}`,
    `title: "${escapeYaml(title)}"`,
    `slug: "${escapeYaml(links.slug)}"`,
    `source_url: "${escapeYaml(payload.source.url ?? "")}"`,
    `source_type: "${escapeYaml(payload.source.kind)}"`,
    `source_card: "${escapeYaml(links.sourceCard)}"`,
    `raw_file: "${escapeYaml(links.raw)}"`,
    ...(links.claims ? [`claims_file: "${escapeYaml(links.claims)}"`] : []),
    ...(links.topics ? [`topics_file: "${escapeYaml(links.topics)}"`] : []),
    ...(links.outline ? [`outline_file: "${escapeYaml(links.outline)}"`] : []),
    `run_summary: "${escapeYaml(links.runSummary)}"`,
    `run_id: "${escapeYaml(links.runId)}"`,
    `content_fingerprint: "${escapeYaml(links.contentFingerprint)}"`,
    `created_at: "${escapeYaml(links.createdAt)}"`,
    `updated_at: "${escapeYaml(links.createdAt)}"`,
    ...(mode === "agent_enriched" ? [`summary: "${escapeYaml(payload.wiki_entry?.summary ?? payload.analysis?.summary ?? "")}"`] : []),
    `topics: ${yamlStringArray([...(payload.analysis?.related_concepts ?? []), ...(payload.analysis?.concepts ?? [])])}`,
    `claims: ${yamlStringArray(payload.analysis?.claims.map((claim) => claim.claim) ?? [])}`,
    ...groundingFrontmatterLines(grounding),
    `tags: ["aiwiki/wiki-entry"]`,
    "---"
  ].join("\n");
}

function wikiType(payload: NormalizedPayload): "source_knowledge" | "thought_note" | "personal_knowledge" {
  if (payload.source.source_role === "output") {
    return "personal_knowledge";
  }
  if (payload.source.source_role === "processing") {
    return "thought_note";
  }
  return "source_knowledge";
}

function enrichedBody(payload: NormalizedPayload, links: WikiEntryLinks, title: string, grounding: GroundingReport): string {
  const sections: string[] = [`# ${title}`, ""];
  appendGroundingReview(sections, grounding);
  if (payload.wiki_entry?.summary || payload.analysis?.summary) {
    sections.push("## 一句话总结", "", payload.wiki_entry?.summary ?? payload.analysis?.summary ?? "", "");
  }

  if (payload.wiki_entry?.markdown?.trim()) {
    sections.push(payload.wiki_entry.markdown.trim(), "");
    if (payload.wiki_entry.sections.length) {
      for (const section of payload.wiki_entry.sections) {
        if (bodyHasHeading(payload.wiki_entry.markdown, section.heading)) {
          continue;
        }
        sections.push(`## ${section.heading}`, "", ...listOrFallback(section.items, "待宿主 Agent 补充。"), "");
      }
    }
    sections.push(sourceSection(links));
    return sections.join("\n");
  }

  if (payload.wiki_entry?.sections.length) {
    for (const section of payload.wiki_entry.sections) {
      sections.push(`## ${section.heading}`, "", ...listOrFallback(section.items, "待宿主 Agent 补充。"), "");
    }
  } else {
    sections.push("## 核心观点", "", ...listOrFallback(payload.analysis?.key_points ?? [], "待宿主 Agent 补充。"), "");
    sections.push("## 可复用知识点", "", ...knowledgeList(payload), "");
    sections.push("## Reusable Judgments", "", ...judgmentList(payload), "");
    sections.push("## Entities and Concepts", "", ...entityConceptList(payload), "");
    sections.push("## Tensions", "", ...listOrFallback(payload.analysis?.tensions ?? [], "No explicit tension supplied by the host Agent."), "");
    sections.push("## 相关概念", "", ...listOrFallback(payload.analysis?.related_concepts ?? [], "待宿主 Agent 补充。"), "");
    sections.push("## 适合用于什么场景", "", ...listOrFallback(payload.analysis?.use_cases ?? [], "待宿主 Agent 补充。"), "");
    sections.push("## 可转化的选题", "", ...listOrFallback(payload.analysis?.topic_candidates ?? [], "待宿主 Agent 补充。"), "");
    sections.push("## Suggested Links", "", ...suggestedLinkList(payload), "");
  }

  sections.push(sourceSection(links));
  return sections.join("\n");
}

function bodyHasHeading(markdown: string, heading: string): boolean {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, "m").test(markdown);
}

function fallbackBody(payload: NormalizedPayload, links: WikiEntryLinks, title: string, grounding: GroundingReport): string {
  const preview = trimPreview(payload.source.content ?? payload.source.fetch_notes ?? "", 1000);
  return [
    `# ${title}`,
    "",
    "## 说明",
    "",
    "这是 AIWiki 根据原文和元数据生成的基础 Wiki 条目。当前条目未经过宿主 Agent 的深度分析，仅用于建立知识库索引、来源追踪和后续 Query。",
    "",
    "## 来源信息",
    "",
    `- 原文链接：${payload.source.url ?? "无"}`,
    `- Source Card：${obsidianLink(links.sourceCard, "资料卡")}`,
    `- Raw：${obsidianLink(links.raw, "原文")}`,
    `- Run：${obsidianLink(links.runSummary, "处理记录")}`,
    "",
    "## 内容预览",
    "",
    preview ? blockquote(preview) : "暂无可用正文预览。",
    "",
    "## 待 Agent 补全",
    "",
    "以下内容需要宿主 Agent 基于原文进一步生成：",
    "",
    "- 一句话总结",
    "- 核心观点",
    "- 可复用知识点",
    "- 相关概念",
    "- 适用场景",
    "- 可转化选题",
    "",
    ...groundingReviewLines(grounding),
    "",
    sourceSection(links)
  ].join("\n");
}

function knowledgeList(payload: NormalizedPayload): string[] {
  const items = payload.analysis?.reusable_knowledge ?? [];
  if (!items.length) {
    return ["待宿主 Agent 补充。"];
  }
  return items.flatMap((item) => item.title ? [`### ${item.title}`, "", item.content] : [`- ${item.content}`]);
}

function judgmentList(payload: NormalizedPayload): string[] {
  const items = payload.analysis?.reusable_judgments ?? [];
  if (!items.length) {
    return ["No reusable judgment supplied by the host Agent."];
  }
  return items.flatMap((item) => [
    item.title ? `### ${item.title}` : "### Judgment",
    "",
    `- judgment: ${item.judgment}`,
    ...(item.rationale ? [`- rationale: ${item.rationale}`] : []),
    ...(item.source_quote ? ["- evidence boundary: host supplied quote"] : ["- evidence boundary: needs review if reused as a factual claim"]),
    ""
  ]);
}

function entityConceptList(payload: NormalizedPayload): string[] {
  const entities = payload.analysis?.entities ?? [];
  const concepts = payload.analysis?.concepts ?? [];
  if (!entities.length && !concepts.length) {
    return ["No explicit entities or concepts supplied by the host Agent."];
  }
  return [
    ...(entities.length ? [`- entities: ${entities.join(", ")}`] : []),
    ...(concepts.length ? [`- concepts: ${concepts.join(", ")}`] : [])
  ];
}

function suggestedLinkList(payload: NormalizedPayload): string[] {
  const links = payload.analysis?.suggested_links ?? [];
  if (!links.length) {
    return ["No suggested links supplied by the host Agent."];
  }
  return links.map((link) => {
    const target = link.target ? ` -> ${link.target}` : "";
    const reason = link.reason ? ` (${link.reason})` : "";
    return `- ${link.title}${target}${reason}`;
  });
}

function listOrFallback(values: string[], fallback: string): string[] {
  return values.length ? values.map((value) => `- ${value}`) : [fallback];
}

function sourceSection(links: WikiEntryLinks): string {
  return [
    "## 来源与证据",
    "",
    `- Source Card: ${obsidianLink(links.sourceCard, "资料卡")}`,
    `- Raw: ${obsidianLink(links.raw, "原文")}`,
    `- Run: ${obsidianLink(links.runSummary, "处理记录")}`
  ].join("\n");
}

function wikiCapsuleFrontmatter(
  payload: NormalizedPayload,
  links: WikiEntryLinks,
  title: string,
  grounding: GroundingReport
): string[] {
  const description = payload.wiki_entry?.summary ?? payload.analysis?.summary ?? `Wiki entry for ${title}.`;
  const evidenceRefs = [links.sourceCard, links.raw, links.runSummary];
  return [
    `capsule_id: "${escapeYaml(links.capsuleId)}"`,
    `artifact_role: "primary"`,
    `visibility: "primary"`,
    `description: "${escapeYaml(description)}"`,
    `resource: "${escapeYaml(payload.source.url ?? links.raw)}"`,
    `timestamp: "${escapeYaml(links.createdAt)}"`,
    `knowledge_status: "active"`,
    `confidence_level: "${grounding.evidence_available ? "high" : "medium"}"`,
    "confidence_score: null",
    `last_confirmed: "${escapeYaml(links.createdAt)}"`,
    `valid_from: "${escapeYaml(links.createdAt)}"`,
    "valid_until: null",
    `staleness: "fresh"`,
    `evidence_count: ${evidenceRefs.length}`,
    `evidence_refs: ${yamlStringArray(evidenceRefs)}`,
    "access_count: 0",
    "last_accessed: null",
    "supersedes: []",
    "superseded_by: []",
    "contradicted_by: []",
    "relationships:",
    '  - type: "derived_from"',
    `    target: "${escapeYaml(links.raw)}"`,
    '    confidence_level: "high"',
    '  - type: "supports"',
    `    target: "${escapeYaml(links.sourceCard)}"`,
    `    evidence: "${escapeYaml(grounding.evidence_channel)}"`,
    `    confidence_level: "${grounding.evidence_available ? "high" : "medium"}"`,
    '  - type: "mentions"',
    `    target: "${escapeYaml(links.runSummary)}"`,
    '    confidence_level: "medium"'
  ];
}

function appendGroundingReview(sections: string[], grounding: GroundingReport): void {
  if (!grounding.needs_review) {
    return;
  }
  sections.push(
    "## Grounding 复核",
    "",
    ...groundingReviewLines(grounding),
    ""
  );
}

function groundingReviewLines(grounding: GroundingReport): string[] {
  return [
    `- 证据通道：${grounding.evidence_channel}`,
    `- 需要复核：${grounding.needs_review ? "yes" : "no"}`,
    `- 疑似标记：${grounding.suspicion_markers.length ? grounding.suspicion_markers.join(", ") : "none"}`,
    `- Claim 引用覆盖：${grounding.claim_quote_count}/${grounding.claim_count}`
  ];
}

function obsidianLink(vaultPath: string, label: string) {
  return `[[${vaultPath.replace(/\\/g, "/").replace(/\.md$/i, "")}|${label}]]`;
}

function blockquote(value: string): string {
  return value.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
}

function trimPreview(value: string, length: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

function yamlStringArray(values: string[]): string {
  return `[${values.map((value) => `"${escapeYaml(value)}"`).join(", ")}]`;
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
