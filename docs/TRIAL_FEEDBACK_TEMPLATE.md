# AIWiki Trial Feedback Template

Use this template after a first public trial. It is intentionally small so feedback can be pasted into a WeChat group, issue, note, or planning document without adding a new CLI command.

## Basic Info

- AIWiki version:
- Operating system:
- Assistant used:
- Knowledge base path type: temporary / real workspace / project folder

## First-use Result

- Setup result: success / blocked / unclear
- First source type: URL / local file / pasted note / failed fetch
- Ingest result: success / failed / recorded failure only
- Query/context result: useful / partially useful / not useful / no match
- Lint/doctor result: clean / actionable warning / confusing warning / error

## What Worked

- The clearest step was:
- The most useful generated file was:
- One thing I can reuse later:

## What Was Confusing

- Installation or Node.js issue:
- Assistant did not call AIWiki commands:
- I could not find generated files:
- Query/context answer was unclear:
- Lint/doctor output was unclear:
- Other:

## One Practical Scenario

I would use AIWiki for:

```text
Example: saving article research before writing a WeChat post.
```

## Next Action

- Keep using as-is
- Needs documentation improvement
- Needs assistant guidance improvement
- Needs CLI behavior improvement
- Not a fit for my workflow

## Signal Classification

Mark the strongest category before turning this into a task:

- installation: Node.js / npm / global command / assistant reload / path setup
- first-use: unclear next step after setup
- ingest-result: generated files or failure record unclear
- directory: could not find or understand run/source/wiki files
- query-reuse: `query` / `context` did not make reuse clear
- feature-request: asks for crawling, multi-KB, vector search, RBAC, RSS, browser plugin, or another new capability

Suggested decision:

- keep
- defer
- Pro
- reject
- no-change

See [Operating Feedback Loop](OPERATING_FEEDBACK_LOOP.md) before promoting feedback into the managed queue.
