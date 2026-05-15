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

3. Read the JSON result.
4. Prefer `matches.wiki_entries` before source cards, claims, topics, outlines, or raw refs.
5. Pay attention to `generation_mode`, `quality`, and `warnings`.
6. If the best Wiki Entry has `quality: "scaffold"`, tell the user that the entry is a traceable fallback and may need Agent enrichment.
7. Do not scan `02-raw` by default unless:
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

