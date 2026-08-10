# Writing Workflow

[中文](WRITING.zh-CN.md) · [Research](RESEARCH.md) · [Decision](DECISION.md) · [Review / retrospective](REVIEW.md)

## When to Use and Inputs

Use this workflow before drafting, revising, or planning a piece that should reuse
knowledge already kept in an AIWiki workspace. Provide a focused writing question
and, when the material is not already present, a local Markdown file. When the
host Agent has already read and understood source material, it may instead supply
an `aiwiki.agent_payload.v1` through standard input.

The relevant `aiwiki.context.v1` field is `reuse_guidance.writing`. It is guidance
for applying retrieved knowledge; it is not a generated draft.

## Ordered Workflow

1. Create a temporary or project workspace if one does not exist.
2. Ingest the local input, or ingest the host Agent's already-read material.
3. Retrieve writing context first and read its quality and next-action fields.
4. Use human-readable query output to compare candidates; inspect a single result
   when provenance or the original artifact matters.
5. Draft only from the retrieved, appropriately qualified material, then check the
   workspace structure.

```bash
aiwiki setup --path ./aiwiki-writing --yes
aiwiki ingest-file --file ./writing-input.md --path ./aiwiki-writing
# For material already read by the host Agent instead of a local file:
aiwiki ingest-agent --stdin --path ./aiwiki-writing
aiwiki context "<writing question>" --path ./aiwiki-writing
aiwiki query "<writing question>" --path ./aiwiki-writing
aiwiki show "<selected topic>" --path ./aiwiki-writing
aiwiki lint --json --path ./aiwiki-writing
```

## Expected Outputs

`setup` creates the workspace layout. A successful local-file ingest writes a Raw
record, Source Card, Wiki Entry, and run artifacts, including paths like:

```text
02-raw/articles/<slug>.md
03-sources/article-cards/<slug>.md
05-wiki/source-knowledge/<slug>.md
09-runs/<run-id>/processing-summary.md
```

`context` returns machine-readable `aiwiki.context.v1`; read `query_scope`,
`result_quality`, `match_reasons`, `quality_signals`, `related_refs`,
`recommended_next_action`, and `reuse_guidance.writing`. `query` supplies a
human-readable result, `show` exposes one selected artifact or source package,
and `lint --json` reports structural findings. A scaffold Wiki Entry is a
traceable lead, not Agent-enriched writing knowledge.

## Failure Modes and Safe Fallback

- No relevant match or a `broaden_query_or_ingest_source` next action: broaden the
  wording or ingest user-provided material.
- A scaffold or grounding warning: state the limitation; verify the selected
  artifact before using it as support.
- A result needs provenance or detail: use `show` before making the claim.
- A failed ingest or lint finding: report the command result and correct the input
  or workspace issue before relying on it.

Keep this order: `context` → `query` → `show` → broaden the topic or ingest
user-provided material → bounded local inspection. Local inspection is only for
the unresolved question and must name the insufficient AIWiki command.

Never replace this path with paid-only features, automated crawling, semantic
indexing, or retrieval augmentation.

## AIWiki Was Actually Used

Before delivering a draft or plan, verify all of the following:

- [ ] At least one shown command ran against the intended workspace.
- [ ] The run produced an observable AIWiki result or artifact path.
- [ ] The response identifies the retrieved Wiki Entry, Source Card, or shown
      artifact that informed the draft.
- [ ] The response reflects `result_quality`, `match_reasons`,
      `quality_signals`, `related_refs`, and `recommended_next_action` where
      applicable.
- [ ] `reuse_guidance.writing` was used as the workflow-specific guidance.

## Boundaries

AIWiki stores and retrieves local Markdown; the host Agent reads sources and
makes the writing judgment. Do not represent a scaffold as verified evidence, do
not silently perform optional administration, and do not replace the command
path with broad file inspection.

## Runnable Public-Trial Scenario

Run the [writing scenario: topic planning](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/input/topic-planning.md). Its commands and success evidence are in the [public-trial scenario pack](https://github.com/iTradingAI/aiwiki/tree/main/examples/public-trial-scenarios/README.md).
