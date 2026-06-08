---
aiwiki_id: "llm-wiki-notes:wiki-entry"
type: "wiki_entry"
wiki_type: "source_knowledge"
source_role: "input"
represents_user_view: false
status: "active"
generation_mode: "agent_enriched"
quality: "enriched"
generated_by: "host_agent"
llm_enriched: true
title: "LLM Wiki Notes"
slug: "llm-wiki-notes"
source_url: "https://example.com/llm-wiki"
source_type: "url"
source_card: "03-sources/article-cards/llm-wiki-notes.md"
raw_file: "02-raw/articles/llm-wiki-notes.md"
claims_file: "04-claims/_suggestions/llm-wiki-notes-claims.md"
topics_file: "07-topics/ready/llm-wiki-notes-topics.md"
outline_file: "08-outputs/outlines/llm-wiki-notes-outline.md"
run_summary: "09-runs/20260608-160603980-89f570/processing-summary.md"
run_id: "20260608-160603980-89f570"
content_fingerprint: "sha256:7e9fcf3257160956b260fe36c2c3dbdddf91b86856e989045eee547ff0019a9a"
created_at: "2026-06-08T16:06:03.980Z"
updated_at: "2026-06-08T16:06:03.980Z"
summary: "LLM Wiki 把资料整理成可持续维护的本地知识层。"
topics: ["LLM Wiki", "Agent-first", "content fingerprint", "evidence boundary"]
claims: ["高质量知识提炼应由宿主 Agent 提供"]
grounding_evidence_available: false
grounding_evidence_channel: "none"
grounding_needs_review: true
grounding_markers: ["unsupported_claims"]
grounding_claim_count: "1"
grounding_claim_quote_count: "0"
grounding_unsupported_claim_count: "1"
coverage_suspected_incomplete: false
tags: ["aiwiki/wiki-entry"]
---
# LLM Wiki Notes

## Grounding 复核

- 证据通道：none
- 需要复核：yes
- 疑似标记：unsupported_claims
- Claim 引用覆盖：0/1

## 一句话总结

LLM Wiki 把资料整理成可持续维护的本地知识层。

## 核心观点

- Wiki Entry 是入库后的默认知识容器
- 宿主 Agent 负责理解原文

## 可复用知识点

### Agent-first 边界

CLI 负责落盘，Agent 负责理解。

## Reusable Judgments

### Review before reuse

- judgment: Unsupported analysis should stay reviewable before it becomes reusable knowledge.
- rationale: The host Agent may infer beyond the source.
- evidence boundary: needs review if reused as a factual claim


## Entities and Concepts

- entities: AIWiki CLI, Host Agent
- concepts: content fingerprint, evidence boundary

## Tensions

- automation speed vs evidence review

## 相关概念

- LLM Wiki
- Agent-first

## 适合用于什么场景

- 研究
- 写作

## 可转化的选题

- 为什么 Agent 需要本地 Wiki

## Suggested Links

- Grounding review workflow -> 05-wiki/source-knowledge/grounding-review (Connects this source to evidence review practice.)

## 来源

- Source Card: [[03-sources/article-cards/llm-wiki-notes|资料卡]]
- Raw: [[02-raw/articles/llm-wiki-notes|原文]]
- Run: [[09-runs/20260608-160603980-89f570/processing-summary|处理记录]]