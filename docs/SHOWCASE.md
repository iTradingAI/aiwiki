# AIWiki Showcase

This page shows four workflow-specific ways to reuse a local Markdown knowledge
base. Follow the [Core Intent Matrix](AGENT_HANDOFF.md#core-intent-matrix): match
the request to an AIWiki command first, interpret the command output, and use a
bounded fallback only when the command cannot answer the request.

## Shared Trial Path

```bash
aiwiki setup --path ./aiwiki-trial --yes
aiwiki ingest-file --file ./my-input.md --path ./aiwiki-trial
aiwiki context "<topic>" --path ./aiwiki-trial
aiwiki query "<topic>" --path ./aiwiki-trial
aiwiki show "<selected topic>" --path ./aiwiki-trial
aiwiki lint --json --path ./aiwiki-trial
```

A successful local-file ingest creates a Raw record, Source Card, Wiki Entry, and
run artifacts. `context` returns the stable Agent JSON; `query` gives readable
retrieval output; `show` inspects a selected artifact; and `lint --json` checks
the workspace. Read quality signals before relying on a result.

## 1. Writing: Keep Topic Planning Available

**Try:** the [topic-planning input](../examples/public-trial-scenarios/input/topic-planning.md), then ask what topic directions are already captured.

**What it shows:** a writing workflow retrieves prior audience, angles, and
quality warnings before a draft begins. The assistant identifies the Wiki Entry
or Source Card that informed the draft instead of relying only on the current
chat.

**Protocol:** [Writing workflow](workflows/WRITING.md).

## 2. Research: Trace an Article Answer

**Try:** the [article-research input](../examples/public-trial-scenarios/input/article-research.md), then ask what evidence is preserved.

**What it shows:** a research workflow starts with context, compares readable
matches, and uses `show` when source detail matters. The answer distinguishes a
traceable scaffold from an Agent-enriched result.

**Protocol:** [Research workflow](workflows/RESEARCH.md).

## 3. Decision: Recover Constraints Before Changing Direction

**Try:** the [project-decision input](../examples/public-trial-scenarios/input/project-decision.md), then ask why the earlier choice was made.

**What it shows:** a decision workflow recovers constraints and rejected
alternatives before recommending a change. It records uncertainty instead of
pretending that an incomplete match resolves a tradeoff.

**Protocol:** [Decision workflow](workflows/DECISION.md).

## 4. Review / Retrospective: Record the Next Check

**Try:** the [review-retrospective input](../examples/public-trial-scenarios/input/review-retrospective.md), then ask what was verified, what gaps remain, and what should be reviewed next.

**What it shows:** a review workflow preserves the prior outcome, evidence and
quality observations, gaps, and next review action. Retrospective is the review
workflow alias, not a separate retrieval type.

**Protocol:** [Review workflow](workflows/REVIEW.md).

## Public-Trial Scenario Pack

The [public-trial scenario pack](../examples/public-trial-scenarios/) contains
four independently runnable examples: research, writing, decision, and review /
retrospective. Each includes input material, setup and retrieval commands,
expected Raw/Source Card/Wiki Entry/run artifacts, a reuse request, maintenance
value, and success evidence.

If retrieval is insufficient, keep the fallback explicit and ordered: `context`
→ `query` → `show` → broaden the topic or ingest user-provided material →
bounded local inspection. State which command was insufficient; do not present
local inspection as the default path.
