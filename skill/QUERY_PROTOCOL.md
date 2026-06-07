# AIWiki Query Protocol

Use this protocol when the user asks:

- 从 AIWiki 里了解某个主题
- 基于 AIWiki 里的资料总结某个问题
- AIWiki 里有没有关于某个主题的内容
- 帮我用 AIWiki 写一篇文章大纲

## Steps

1. Identify the topic and expected output shape.
2. Call:

```bash
aiwiki context "<topic>"
```

Add filters when the user intent is specific:

```bash
aiwiki context "<topic>" --type wiki_entries --status active --limit 5
aiwiki context "<topic>" --source-role input --wiki-type source_knowledge --limit 5
aiwiki context "<topic>" --source-role output --limit 5
aiwiki context "<topic>" --type source_cards --status to-review --limit 5
```

3. Read the JSON result.
4. Prefer `matches.wiki_entries` before source cards, claims, topics, outlines, or raw refs.
5. Read `query_scope` to understand what was searched.
6. Read `result_quality` before deciding how confident the answer can be.
7. Follow `recommended_next_action`:
   - `use_matches_for_answer`: answer from the matches.
   - `review_grounding_or_enrich_entry`: answer cautiously and suggest enrichment/review.
   - `review_source_cards_then_create_wiki_entry`: explain that only source-level material exists.
   - `broaden_query_or_ingest_source`: ask for a broader query or ingest more material.
8. Use `match_reasons` to explain why an item was selected.
9. Use `quality_signals` to decide whether the result is enriched, scaffold, needs grounding review, or only has weak source support.
10. Use `related_refs` to mention useful local follow-up files.
11. If the best Wiki Entry has `quality: "scaffold"` or `quality_signals` includes `grounding:needs_review`, tell the user that the entry is a traceable lead and may need Agent enrichment or evidence review.
12. Do not scan `02-raw` by default unless:
   - Wiki Entries are insufficient.
   - The user asks to verify the original source.
   - There is a source conflict.
   - A precise quote or source check is needed.

## Reply Shape

Include:

- Which Wiki Entries were found.
- Main conclusions.
- Source basis.
- Known gaps or scaffold warnings.
- Suggested next step.
