# AIWiki Query Protocol

Use this protocol when the user asks:

- 从 AIWiki 里了解某个主题
- 基于 AIWiki 里的资料总结某个问题
- AIWiki 里有没有关于某个主题的内容
- 帮我用 AIWiki 写一篇文章大纲

## Steps

1. Identify the topic and expected output shape.
2. Call stable Agent context first when you need the existing file-group JSON contract:

```bash
aiwiki context "<topic>"
```

3. Call Source Capsule context when the answer should be organized around one source package, provenance, lifecycle state, or OKF readiness:

```bash
aiwiki context "<topic>" --view capsule
```

4. Call graph-aware Context v2 only when the user explicitly asks to trace a relationship, upstream/downstream dependency, or conflict, and the relationship graph is already fresh:

```bash
aiwiki context <topic> --view graph --graph-depth 1 --path <workspace>
```

`--graph-depth` accepts only `1`, `2`, or `3` and defaults to `1`. Do not build or rebuild the graph automatically for this request. When graph state is missing, stale, or invalid, read the bounded `aiwiki.context.v2` result, explain the state, and follow its recommended next action.

5. For direct human output, call:

```bash
aiwiki query "<topic>"
```

`query` defaults to Source Capsule view. Use `--view files` only when you need the older file-level match list:

```bash
aiwiki query "<topic>" --view files
```

6. Use direct capsule inspection when the user asks for one source package:

```bash
aiwiki show "<topic>"
aiwiki show --id <capsule_id>
aiwiki show --artifact-path <artifact.md> --path <workspace>
```

Add filters to default context when the user intent is specific:

```bash
aiwiki context "<topic>" --type wiki_entries --status active --limit 5
aiwiki context "<topic>" --source-role input --wiki-type source_knowledge --limit 5
aiwiki context "<topic>" --source-role output --limit 5
aiwiki context "<topic>" --type source_cards --status to-review --limit 5
```

7. Read the JSON result.
8. For `aiwiki.context.v1`, prefer `matches.wiki_entries` before source cards, claims, topics, outlines, or raw refs.
9. For `aiwiki.context.capsule.v1`, prefer capsules with `primary`, no lifecycle warnings, and `okf.ready: true`.
10. For `aiwiki.context.v2`, read graph state, relationship paths, evidence status, lifecycle/risk warnings, and `recommended_next_action` before making a relationship claim.
11. Read `query_scope` to understand what was searched.
12. Read `result_quality` before deciding how confident the answer can be.
13. Follow `recommended_next_action`:
   - `use_matches_for_answer`: answer from the matches.
   - `use_capsules_for_answer`: answer from the capsule set.
   - `review_grounding_or_enrich_entry`: answer cautiously and suggest enrichment/review.
   - `review_lifecycle_warnings`: explain the lifecycle uncertainty before using the result.
   - `review_okf_readiness`: explain the missing OKF-ready evidence before using the result.
   - `review_source_cards_then_create_wiki_entry`: explain that only source-level material exists.
   - `broaden_query_or_ingest_source`: ask for a broader query or ingest more material.
14. Use `match_reasons` to explain why an item was selected.
15. Use `quality_signals` to decide whether the result is enriched, scaffold, needs grounding review, or only has weak source support.
16. Use `related_refs` or capsule artifact paths to mention useful local follow-up files.
17. If the best Wiki Entry has `quality: "scaffold"` or `quality_signals` includes `grounding:needs_review`, tell the user that the entry is a traceable lead and may need Agent enrichment or evidence review.
18. Do not scan `02-raw` by default unless:
   - Wiki Entries are insufficient.
   - The user asks to verify the original source.
   - There is a source conflict.
   - A precise quote or source check is needed.

## Fallback

Use generic file search only after `aiwiki context`, `aiwiki query`, or `aiwiki show` cannot answer the request. State which command was insufficient and why, keep the fallback scoped to the unresolved question, and do not present a raw-file scan as the default query path.

## Reply Shape

Include:

- Which Source Capsules or Wiki Entries were found.
- Main conclusions.
- Source basis.
- Known gaps or scaffold warnings.
- Lifecycle or OKF readiness warnings when present.
- Suggested next step.
