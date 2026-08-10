# Review Workflow

[中文](REVIEW.zh-CN.md) · [Writing](WRITING.md) · [Research](RESEARCH.md) · [Decision](DECISION.md)

## When to Use and Inputs

Use this workflow to review a completed outcome, assess evidence and quality
signals, record gaps, or prepare the next review. **Retrospective** is an alias
for this review workflow; it is not a separate retrieval type. Provide a focused
review question and a local Markdown note containing the prior outcome,
observations, gaps, and a next-review action. When the host Agent has already
read and understood the material, it may submit an `aiwiki.agent_payload.v1`
through standard input.

The relevant `aiwiki.context.v1` field is `reuse_guidance.review`. It guides a
review or retrospective; it does not certify the prior outcome.

## Ordered Workflow

1. Create the workspace when needed.
2. Ingest the review note or the host Agent's already-read material.
3. Retrieve context before judging the outcome, then read quality and next-action
   signals.
4. Query for a readable comparison and show the selected artifact when its
   provenance, evidence, or warning needs inspection.
5. Record what happened, what the evidence supports, the unresolved gaps, and the
   next review action; then check the workspace.

```bash
aiwiki setup --path ./aiwiki-review --yes
aiwiki ingest-file --file ./review-input.md --path ./aiwiki-review
# For material already read by the host Agent instead of a local file:
aiwiki ingest-agent --stdin --path ./aiwiki-review
aiwiki context "<review question>" --path ./aiwiki-review
aiwiki query "<review question>" --path ./aiwiki-review
aiwiki show "<selected topic>" --path ./aiwiki-review
aiwiki lint --json --path ./aiwiki-review
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
and `reuse_guidance.review`. `query` presents readable retrieval output; `show`
opens a selected artifact or source package; `lint --json` reports structural
findings. A scaffold result is a traceable review lead, not proof that an outcome
was successful.

## Failure Modes and Safe Fallback

- No relevant match or `broaden_query_or_ingest_source`: broaden the review topic
  or ingest user-provided material.
- A scaffold, grounding warning, or missing outcome evidence: name the gap and
  inspect the selected artifact with `show`.
- A previous outcome cannot be verified: preserve that uncertainty and record a
  next review action rather than claiming closure.
- An ingest or lint failure: report it and fix the input or workspace issue first.

Use this fallback in order: `context` → `query` → `show` → broaden the topic or
ingest user-provided material → bounded local inspection. Inspect local files
only for the unresolved point and state why the AIWiki command path was
insufficient.

Never replace this path with paid-only features, automated crawling, semantic
indexing, or retrieval augmentation.

## AIWiki Was Actually Used

Before delivering a review or retrospective, verify all of the following:

- [ ] At least one shown command ran against the intended workspace.
- [ ] The run produced an observable AIWiki result or artifact path.
- [ ] The review names the retrieved Wiki Entry, Source Card, or shown artifact
      that informed it.
- [ ] The review reflects `result_quality`, `match_reasons`, `quality_signals`,
      `related_refs`, and `recommended_next_action` where applicable.
- [ ] `reuse_guidance.review` was used as the workflow-specific guidance.

## Boundaries

AIWiki preserves and retrieves local Markdown context; the host Agent evaluates
the outcome and owns the review judgment. Do not treat a scaffold as verified
proof, do not silently perform optional administration, and do not bypass the
command path with broad file inspection.

## Runnable Public-Trial Scenario

Run the [review / retrospective scenario](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/input/review-retrospective.md). Its commands and success evidence are in the [public-trial scenario pack](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/README.md).
