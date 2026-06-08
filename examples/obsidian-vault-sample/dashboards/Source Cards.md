# 资料卡

资料卡用于追踪来源、原文、Claim 建议、素材建议、选题和大纲。

```dataview
TABLE status, source_url, wiki_entry, raw_note, captured_at
FROM "03-sources/article-cards"
WHERE type = "source_card"
SORT captured_at DESC
```
