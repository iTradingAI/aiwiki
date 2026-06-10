# AIWiki Roadmap

AIWiki has one public base product: a local Markdown knowledge base for AI assistants.

The roadmap keeps the base CLI focused. Advanced automation, crawling, multi-knowledge-base workflows, vector search, and team controls belong outside the base scope unless explicitly planned later.

## Current Focus

### 1. First-use success

- clearer assistant-first installation prompt
- safer `agent sync` and workspace guidance
- better `agent check` diagnostics
- a clean path from setup to first ingest to first query

### 2. Reusable local knowledge

- clearer Wiki Entry quality signals
- better query/context explanations
- more examples showing writing, research, decision, and review workflows
- stronger distinction between external sources and user-authored output

### 3. Workspace health

- practical lint output for humans and assistants
- safe automatic fixes only when the fix is narrow and reversible
- better status and doctor guidance
- fewer empty optional artifacts in new workspaces

### 4. Public trial assets

- short use cases users can complete in 5-10 minutes
- example vaults that match the current CLI behavior
- WeChat group feedback templates
- a queue policy that separates user pain from feature creep

## Not in the Base Queue

The base AIWiki CLI is not currently planning:

- web crawling
- WeChat Official Account reading
- browser plugins
- vector search
- RAG-over-wiki
- multiple knowledge bases
- RBAC
- RSS or scheduled collection
- default manual review workflow
- automatic Dataview or Obsidian plugin installation

These may become separate service-layer, integration, or Pro-adjacent projects, but they should not blur the base README promise.

## Operating Principle

AIWiki should stay boring in the right places:

```text
assistant reads
AIWiki writes
Markdown stays local
context can be reused later
```

The product gets better when the first ingest, first query, and first maintenance pass become more reliable.
