# Project Decision Memory

**Workflow Type / 工作流类型:** Decision / 决策

## Decision

Start with a local Markdown knowledge base before adding heavier retrieval
systems.

## Constraints

- Users need to inspect and edit the generated files.
- The first public trial must work without a hosted service.
- The assistant, not AIWiki, reads webpages and understands source content.
- Query and context should stay local and explainable.

## Rejected Alternatives

- Browser integration first: too much installation and permission surface for the
  first trial.
- A hosted retrieval system first: it hides the file contract before users trust
  the workflow.
- Automatic collection first: it solves volume before the basic reuse loop is
  proven.

## Review Trigger

Revisit this decision after users can reliably complete setup, ingest one
source, query it later, and report where the workflow feels unclear.

## Reuse Prompt

Before proposing a new storage or retrieval feature, ask:

```text
Why did the project choose a local Markdown knowledge base first?
```
