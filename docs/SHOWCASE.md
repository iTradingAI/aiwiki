# AIWiki Showcase

This page shows what a real AIWiki run creates.

Each scenario follows the [Core Intent Matrix](AGENT_HANDOFF.md#core-intent-matrix): match the request to an AIWiki command first, explain the command output, and use a fallback only when the command cannot answer the request.

## 10-minute Trial Walkthrough

This is the public-trial happy path:

```text
1. Create a temporary knowledge base.
2. Ingest one readable source.
3. Inspect the generated run summary, Source Card, and Wiki Entry.
4. Ask the knowledge base one question.
5. Run lint/doctor for workspace health.
6. Send feedback with the trial template.
7. Classify the signal before it enters the queue.
```

Commands for a local-file trial:

```bash
aiwiki setup --path ./aiwiki-trial --yes
aiwiki doctor --path ./aiwiki-trial
aiwiki ingest-file --file ./my-first-source.md --path ./aiwiki-trial
aiwiki query "my topic" --path ./aiwiki-trial
aiwiki context "my topic" --path ./aiwiki-trial
aiwiki lint --json --path ./aiwiki-trial
```

For a URL trial, the assistant reads the URL first, then calls `aiwiki ingest-agent` with the content it read.

After the walkthrough, use [TRIAL_FEEDBACK_TEMPLATE.md](TRIAL_FEEDBACK_TEMPLATE.md) and [Operating Feedback Loop](OPERATING_FEEDBACK_LOOP.md). Classify the result as installation, first-use, ingest-result, directory, query-reuse, or feature-request before making roadmap decisions.

## Scenario 1: Ingest an Article

User message:

```text
Ingest this into AIWiki:
https://example.com/article
```

Assistant work:

1. read the source
2. create an `aiwiki.agent_payload.v1` payload
3. provide `analysis` or `wiki_entry` when possible
4. call `aiwiki ingest-agent --stdin`
5. report the generated files

Core output:

```text
09-runs/<run-id>/payload.json
09-runs/<run-id>/raw.md
09-runs/<run-id>/source-card.md
09-runs/<run-id>/wiki-entry.md
09-runs/<run-id>/processing-summary.md
02-raw/articles/<slug>.md
03-sources/article-cards/<slug>.md
05-wiki/source-knowledge/<slug>.md
```

Optional output appears only when the assistant provides matching content:

```text
09-runs/<run-id>/creative-assets.md
09-runs/<run-id>/topics.md
09-runs/<run-id>/draft-outline.md
04-claims/_suggestions/
06-assets/_suggestions/
07-topics/ready/
08-outputs/outlines/
```

## Scenario 2: The Source Cannot Be Read

Some pages require login or cannot be accessed by the assistant.

AIWiki should still record the attempt:

```text
09-runs/<run-id>/payload.json
09-runs/<run-id>/processing-summary.md
```

The failure reason is preserved, and the user can retry later when the assistant can access the source.

The fallback is not a generic crawl or a manual payload task for the user. The host Agent records a failed-fetch payload so the failed attempt remains traceable.

## Scenario 3: Reuse the Knowledge Later

User message:

```text
What does AIWiki know about AI agents?
```

Assistant command:

```bash
aiwiki context "AI agents"
```

The assistant should use the returned JSON, including match reasons and quality signals, before answering.

If the result cannot answer the question, the assistant may inspect the relevant files after explaining why `context` or `query` was insufficient.

## Sample Files

- [`../examples/demo-run/`](../examples/demo-run/) records input files, commands, and CLI outputs.
- [`../examples/obsidian-vault-sample/`](../examples/obsidian-vault-sample/) is a generated sample vault.
- [`../examples/public-trial-scenarios/`](../examples/public-trial-scenarios/) provides three runnable public-trial examples: article research memory, topic planning memory, and project decision memory.

The sample does not rely on crawling, vector search, RAG-over-wiki, or Pro automation. It shows the real base CLI file contract.

## Public Trial Scenario Pack

Use the scenario pack when a user asks, "What should I try first?"

Each scenario includes:

- sample input material
- base CLI commands
- expected Raw, Source Card, Wiki Entry, and run artifacts
- a query/context reuse prompt
- why the knowledge is worth maintaining over time
- WeChat-group-ready usage copy

Suggested order:

```text
article research memory
  -> topic planning memory
  -> project decision memory
```

This order starts from the most common reading workflow, moves into content reuse, and ends with team/project memory. It keeps the trial focused on local Markdown knowledge reuse instead of adding crawling, vectors, or Pro features.
