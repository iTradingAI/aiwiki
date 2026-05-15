import { NormalizedPayload } from "./payload.js";

export type WikiEntryMode = "agent_enriched" | "deterministic_fallback";
export type WikiEntryQuality = "enriched" | "scaffold";

export type WikiEntryRenderResult = {
  markdown: string;
  mode: WikiEntryMode;
  quality: WikiEntryQuality;
};

export type WikiEntryLinks = {
  slug: string;
  runId: string;
  createdAt: string;
  wikiEntry: string;
  raw: string;
  sourceCard: string;
  claims: string;
  topics: string;
  outline: string;
  runSummary: string;
};

export function renderWikiEntry(payload: NormalizedPayload, links: WikiEntryLinks): WikiEntryRenderResult {
  const enriched = Boolean(payload.wiki_entry || payload.analysis);
  const mode: WikiEntryMode = enriched ? "agent_enriched" : "deterministic_fallback";
  const quality: WikiEntryQuality = enriched ? "enriched" : "scaffold";
  const title = payload.wiki_entry?.title ?? payload.source.title ?? "Untitled";
  const frontmatter = wikiFrontmatter(payload, links, title, mode, quality);
  const body = enriched ? enrichedBody(payload, links, title) : fallbackBody(payload, links, title);
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
  quality: WikiEntryQuality
): string {
  return [
    "---",
    `aiwiki_id: "${escapeYaml(`${links.slug}:wiki-entry`)}"`,
    `type: "wiki_entry"`,
    `wiki_type: "source_knowledge"`,
    `source_role: "input"`,
    `represents_user_view: false`,
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
    `claims_file: "${escapeYaml(links.claims)}"`,
    `topics_file: "${escapeYaml(links.topics)}"`,
    `outline_file: "${escapeYaml(links.outline)}"`,
    `run_summary: "${escapeYaml(links.runSummary)}"`,
    `run_id: "${escapeYaml(links.runId)}"`,
    `created_at: "${escapeYaml(links.createdAt)}"`,
    `updated_at: "${escapeYaml(links.createdAt)}"`,
    ...(mode === "agent_enriched" ? [`summary: "${escapeYaml(payload.wiki_entry?.summary ?? payload.analysis?.summary ?? "")}"`] : []),
    `topics: ${yamlStringArray(payload.analysis?.related_concepts ?? [])}`,
    `claims: ${yamlStringArray(payload.analysis?.claims.map((claim) => claim.claim) ?? [])}`,
    `tags: ["aiwiki/wiki-entry"]`,
    "---"
  ].join("\n");
}

function enrichedBody(payload: NormalizedPayload, links: WikiEntryLinks, title: string): string {
  const sections: string[] = [`# ${title}`, ""];
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
    sections.push("## 相关概念", "", ...listOrFallback(payload.analysis?.related_concepts ?? [], "待宿主 Agent 补充。"), "");
    sections.push("## 适合用于什么场景", "", ...listOrFallback(payload.analysis?.use_cases ?? [], "待宿主 Agent 补充。"), "");
    sections.push("## 可转化的选题", "", ...listOrFallback(payload.analysis?.topic_candidates ?? [], "待宿主 Agent 补充。"), "");
  }

  sections.push(sourceSection(links));
  return sections.join("\n");
}

function bodyHasHeading(markdown: string, heading: string): boolean {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, "m").test(markdown);
}

function fallbackBody(payload: NormalizedPayload, links: WikiEntryLinks, title: string): string {
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

function listOrFallback(values: string[], fallback: string): string[] {
  return values.length ? values.map((value) => `- ${value}`) : [fallback];
}

function sourceSection(links: WikiEntryLinks): string {
  return [
    "## 来源",
    "",
    `- Source Card: ${obsidianLink(links.sourceCard, "资料卡")}`,
    `- Raw: ${obsidianLink(links.raw, "原文")}`,
    `- Run: ${obsidianLink(links.runSummary, "处理记录")}`
  ].join("\n");
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
