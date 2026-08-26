# AIWiki Roadmap

AIWiki has one public base product: a local Markdown knowledge base for AI assistants.

The roadmap keeps the base CLI focused. Advanced automation, crawling, multi-knowledge-base workflows, vector search, and team controls belong outside the base scope unless explicitly planned later.

## Core 1.0 Stabilization

- The Core 1.0 contract freeze is complete: the freeze matrix and contract tests are locked.
- Documentation and migration guides are in progress.
- Compatibility testing is planned.
- Release gates are planned.

## Not in the Base Queue

The base AIWiki CLI is not currently planning:

- web crawling
- WeChat Official Account reading
- browser plugins
- vector search
- RAG-over-wiki
- OKF export/import
- multiple knowledge bases
- RBAC
- RSS or scheduled collection
- default manual review workflow
- automatic Dataview or Obsidian plugin installation

These may become separate service-layer, integration, or Pro-adjacent projects, but they should not blur the base README promise.

## Operating Principle

AIWiki follows a stability-first operating principle:

```text
assistant reads
AIWiki writes
Source Capsules group each source
Markdown stays local
context can be reused later
```

The product gets better when the first ingest, first query, and first maintenance pass become more reliable.

## Feedback Governance

Public feedback is classified before it becomes work. The base queue uses keep, defer, Pro, reject, and no-change decisions to avoid turning every group comment into feature creep.

Low feedback means AIWiki should publish clearer trial tasks and cases, not add telemetry or expand the base boundary.
