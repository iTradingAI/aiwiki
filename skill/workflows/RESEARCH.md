# Research Workflow

[中文](RESEARCH.zh-CN.md) · [Writing](WRITING.md) · [Decision](DECISION.md) · [Review / retrospective](REVIEW.md)

## When to Use and Inputs

Use this workflow when answering a research question from knowledge already kept
in an AIWiki workspace, comparing source-backed material, or deciding what
additional user-provided material is needed. Provide a focused question and a
local Markdown source when the needed material has not yet been ingested. For
material already read by the host Agent, use an `aiwiki.agent_payload.v1` on
standard input instead.

The relevant `aiwiki.context.v1` field is `reuse_guidance.research`. It guides
research reuse; it does not establish a claim beyond the stored evidence.

## Ordered Workflow

1. Set up the workspace if it does not already exist.
2. Ingest the local source, or ingest already-read material supplied by the host
   Agent.
3. Retrieve research context first and evaluate the returned evidence signals.
4. Query for a readable comparison and show the selected artifact before making a
   source-sensitive conclusion.
5. State what the retrieved material supports, what remains unknown, and check
   the workspace.

```bash
aiwiki setup --path ./aiwiki-research --yes
aiwiki ingest-file --file ./research-input.md --path ./aiwiki-research
# For material already read by the host Agent instead of a local file:
aiwiki ingest-agent --stdin --path ./aiwiki-research
aiwiki context "<research question>" --path ./aiwiki-research
aiwiki query "<research question>" --path ./aiwiki-research
aiwiki show "<selected topic>" --path ./aiwiki-research
aiwiki lint --json --path ./aiwiki-research
```

## Expected Outputs

`setup` creates the workspace layout. A successful local-file ingest writes a Raw
record, Source Card, Wiki Entry, and run artifacts such as:

```text
02-raw/articles/<slug>.md
03-sources/article-cards/<slug>.md
05-wiki/source-knowledge/<slug>.md
09-runs/<run-id>/processing-summary.md
```

`context` returns `aiwiki.context.v1`; read `query_scope`, `result_quality`,
`match_reasons`, `quality_signals`, `related_refs`, `recommended_next_action`,
and `reuse_guidance.research`. `query` is the readable retrieval result; `show`
opens one selected artifact or source package; `lint --json` reports structural
findings. A scaffold result is traceable source material that may need Agent
enrichment or evidence review.

## Failure Modes and Safe Fallback

- No suitable match or `broaden_query_or_ingest_source`: broaden the question or
  ingest user-provided material.
- A grounding or scaffold warning: distinguish the stored lead from a confirmed
  conclusion and inspect it with `show`.
- Conflicting or incomplete support: report the gap rather than resolving it by
  assumption.
- An ingest or lint failure: report it, then repair the input or workspace before
  treating the artifacts as available.

Use this fallback in order: `context` → `query` → `show` → broaden the topic or
ingest user-provided material → bounded local inspection. Inspect local files
only for the unresolved point and state which AIWiki command could not answer it.

Never replace this path with paid-only features, automated crawling, semantic
indexing, or retrieval augmentation.

## AIWiki Was Actually Used

Before delivering a research answer, verify all of the following:

- [ ] At least one shown command ran against the intended workspace.
- [ ] The run produced an observable AIWiki result or artifact path.
- [ ] The answer names the retrieved Wiki Entry, Source Card, or shown artifact
      that informed it.
- [ ] The answer interprets `result_quality`, `match_reasons`,
      `quality_signals`, `related_refs`, and `recommended_next_action` where
      applicable.
- [ ] `reuse_guidance.research` was used as the workflow-specific guidance.

## Boundaries

AIWiki keeps local Markdown records and retrieval signals; the host Agent reads
sources and evaluates evidence. Do not turn a scaffold into a verified finding,
do not silently perform optional administration, and do not substitute broad file
inspection for the command path.

## Runnable Public-Trial Scenario

Run the [research scenario: article research](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/input/article-research.md). Its commands and success evidence are in the [public-trial scenario pack](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/README.md).
