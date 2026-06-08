# 选题管线

选题和大纲是从资料卡继续写作的入口。

```dataview
TABLE status, source_card, outline_note, source_url, created_at
FROM "07-topics/ready" or "08-outputs/outlines"
WHERE type = "topic_candidates" or type = "draft_outline"
SORT created_at DESC
```
