---
name: aiwiki
description: Agent-first AIWiki workflow for turning one URL/body into local knowledge production files.
---

# AIWiki Skill

Use this skill when the user asks an Agent to process one URL, article body, or local text file with the `aiwiki` keyword.

The host Agent reads the webpage or user-provided body, then passes structured content to the `aiwiki` CLI.

The base CLI writes files and does not own webpage fetching stability.

## Agent Handoff

1. Read the URL, message, attachment, or user-provided body.
2. Build an `aiwiki.agent_payload.v1` payload with `source` and `request`.
3. Call:

```bash
aiwiki ingest-agent --payload <payload.json> --path <aiwiki-path>
```

For local files, call:

```bash
aiwiki ingest-file --file <file> --path <aiwiki-path>
```
