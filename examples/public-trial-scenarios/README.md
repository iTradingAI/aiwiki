# Public Trial Scenario Pack

This pack gives first-time AIWiki users three small, repeatable scenarios.
Each one uses only the base CLI: `setup`, `ingest-file`, `query`, `context`,
and `lint`.

Run any scenario in a temporary knowledge base:

```bash
aiwiki setup --path ./aiwiki-trial --yes
aiwiki ingest-file --file examples/public-trial-scenarios/input/article-research.md --path ./aiwiki-trial
aiwiki query "source card" --path ./aiwiki-trial
aiwiki context "source card" --path ./aiwiki-trial
aiwiki lint --json --path ./aiwiki-trial
```

For a clean comparison, create a new temporary workspace per scenario or remove
only your own temporary `./aiwiki-trial` folder after inspecting it.

## Scenario 1: Article Research Memory

Input material:

- [`input/article-research.md`](input/article-research.md)

Use this when you read an article and want the assistant to preserve the core
argument, evidence boundary, and later writing angles.

Commands:

```bash
aiwiki ingest-file --file examples/public-trial-scenarios/input/article-research.md --path ./aiwiki-trial
aiwiki query "source card" --path ./aiwiki-trial
aiwiki context "article research" --path ./aiwiki-trial
```

Expected generated artifacts:

- `02-raw/articles/article-research.md`
- `03-sources/article-cards/article-research.md`
- `05-wiki/source-knowledge/article-research.md`
- `09-runs/<run-id>/processing-summary.md`

Reuse example:

```text
Ask: What does AIWiki remember about preserving source evidence?
Expected: query/context should surface the article-research Wiki Entry and explain why it matched.
```

Why maintain it over time:

Article notes become useful only when they are searchable and traceable months
later. This scenario shows how a one-off reading note becomes reusable research
memory.

WeChat group copy:

```text
AIWiki can turn an article note into a traceable Source Card and Wiki Entry. Try it with one article, then ask the knowledge base what evidence and writing angles it preserved.
```

## Scenario 2: Topic Planning Memory

Input material:

- [`input/topic-planning.md`](input/topic-planning.md)

Use this when you collect rough topic ideas and want the assistant to turn them
into reusable planning context instead of another forgotten note.

Commands:

```bash
aiwiki ingest-file --file examples/public-trial-scenarios/input/topic-planning.md --path ./aiwiki-trial
aiwiki query "topic planning" --path ./aiwiki-trial
aiwiki context "content calendar" --path ./aiwiki-trial
```

Expected generated artifacts:

- `02-raw/articles/topic-planning.md`
- `03-sources/article-cards/topic-planning.md`
- `05-wiki/source-knowledge/topic-planning.md`
- `09-runs/<run-id>/source-card.md`

Reuse example:

```text
Ask: What topic directions are already captured for public trial content?
Expected: query/context should return the topic-planning entry before the assistant drafts.
```

Why maintain it over time:

A content queue is easier to improve when old reasons, audiences, and angles are
still visible. This scenario shows how AIWiki keeps planning memory available
for future writing.

WeChat group copy:

```text
AIWiki can keep topic ideas from becoming scattered chat history. Save a planning note, then ask it which angles are already available before writing.
```

## Scenario 3: Project Decision Memory

Input material:

- [`input/project-decision.md`](input/project-decision.md)

Use this when a project decision needs to be remembered with constraints,
rejected alternatives, and a future check point.

Commands:

```bash
aiwiki ingest-file --file examples/public-trial-scenarios/input/project-decision.md --path ./aiwiki-trial
aiwiki query "decision memory" --path ./aiwiki-trial
aiwiki context "constraints and rejected alternatives" --path ./aiwiki-trial
```

Expected generated artifacts:

- `02-raw/articles/project-decision.md`
- `03-sources/article-cards/project-decision.md`
- `05-wiki/source-knowledge/project-decision.md`
- `09-runs/<run-id>/wiki-entry.md`

Reuse example:

```text
Ask: Why did the project choose a local Markdown knowledge base first?
Expected: query/context should surface the decision note and preserve the stated constraints.
```

Why maintain it over time:

Decision memory prevents the team from re-litigating the same tradeoffs. This
scenario shows how AIWiki keeps the reason, boundary, and next review together.

WeChat group copy:

```text
AIWiki is useful for more than articles: it can preserve project decisions with constraints and rejected alternatives so the next assistant starts from context.
```

## What Success Looks Like

After each scenario, inspect:

```text
02-raw/articles/
03-sources/article-cards/
05-wiki/source-knowledge/
09-runs/
```

Then run:

```bash
aiwiki lint --json --path ./aiwiki-trial
```

The scenario is successful when AIWiki creates a raw record, Source Card, Wiki
Entry, run summary, and query/context can find the scenario topic again.

## Boundaries

These examples do not use crawling, WeChat reading, browser plugins, vector
search, RAG-over-wiki, RBAC, RSS, scheduled collection, Pro commands, or new
dependencies. If the source is a webpage, the host assistant reads it first and
then passes understood content into AIWiki.
