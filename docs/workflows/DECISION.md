# Decision Workflow

[中文](DECISION.zh-CN.md) · [Writing](WRITING.md) · [Research](RESEARCH.md) · [Review / retrospective](REVIEW.md)

## When to Use and Inputs

Use this workflow before changing direction, comparing options, or revisiting a
choice that should account for prior constraints and rejected alternatives. Give
a focused decision question and a local Markdown decision note if it is not
already in the workspace. When the host Agent has already read and understood the
material, it may submit an `aiwiki.agent_payload.v1` through standard input.

The relevant `aiwiki.context.v1` field is `reuse_guidance.decision`. It helps
apply retrieved context to a decision; it does not make the choice automatically.

## Ordered Workflow

1. Create the workspace when needed.
2. Ingest the decision note or the host Agent's already-read material.
3. Retrieve decision context first, including constraints and earlier judgments.
4. Query for a readable comparison, then show the selected artifact before relying
   on its provenance or stated alternative.
5. State the decision, evidence boundary, unresolved risk, and next review point;
   then check the workspace.

```bash
aiwiki setup --path ./aiwiki-decision --yes
aiwiki ingest-file --file ./decision-input.md --path ./aiwiki-decision
# For material already read by the host Agent instead of a local file:
aiwiki ingest-agent --stdin --path ./aiwiki-decision
aiwiki context "<decision question>" --path ./aiwiki-decision
aiwiki query "<decision question>" --path ./aiwiki-decision
aiwiki show "<selected topic>" --path ./aiwiki-decision
aiwiki lint --json --path ./aiwiki-decision
```

## Expected Outputs

`setup` creates the workspace layout. A successful local-file ingest writes a Raw
record, Source Card, Wiki Entry, and run artifacts, including:

```text
02-raw/articles/<slug>.md
03-sources/article-cards/<slug>.md
05-wiki/source-knowledge/<slug>.md
09-runs/<run-id>/processing-summary.md
```

`context` returns `aiwiki.context.v1`; read `query_scope`, `result_quality`,
`match_reasons`, `quality_signals`, `related_refs`, `recommended_next_action`,
and `reuse_guidance.decision`. `query` presents a readable retrieval result;
`show` exposes one selected artifact or source package; `lint --json` reports
structural findings. A scaffold result preserves a traceable decision lead but
may need Agent enrichment or evidence review.

## Failure Modes and Safe Fallback

- No relevant match or `broaden_query_or_ingest_source`: broaden the decision
  wording or ingest user-provided material.
- A scaffold, grounding warning, or missing constraint: name the uncertainty and
  inspect the selected artifact before changing direction.
- Conflicting prior judgments: preserve the disagreement and ask for the missing
  decision evidence rather than claiming a resolution.
- An ingest or lint failure: report it and fix the input or workspace issue first.

Use this fallback in order: `context` → `query` → `show` → broaden the topic or
ingest user-provided material → bounded local inspection. Inspect local files
only for the unresolved point and state why the AIWiki path was insufficient.

Never replace this path with paid-only features, automated crawling, semantic
indexing, or retrieval augmentation.

## AIWiki Was Actually Used

Before delivering a decision recommendation, verify all of the following:

- [ ] At least one shown command ran against the intended workspace.
- [ ] The run produced an observable AIWiki result or artifact path.
- [ ] The recommendation names the retrieved Wiki Entry, Source Card, or shown
      artifact that informed it.
- [ ] The recommendation reflects `result_quality`, `match_reasons`,
      `quality_signals`, `related_refs`, and `recommended_next_action` where
      applicable.
- [ ] `reuse_guidance.decision` was used as the workflow-specific guidance.

## Boundaries

AIWiki preserves and retrieves local Markdown context; the host Agent evaluates
tradeoffs and owns the decision. Do not present a scaffold as settled evidence,
do not silently perform optional administration, and do not bypass the command
path with broad file inspection.

## Runnable Public-Trial Scenario

Run the [decision scenario: project decision](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/input/project-decision.md). Its commands and success evidence are in the [public-trial scenario pack](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/README.md).
