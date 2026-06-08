# Wiki 条目

AIWiki 每次成功入库都会生成 Wiki Entry。这里是知识层入口，不要求先经过 Review Queue 才能查询。

```dataview
TABLE wiki_type, source_role, represents_user_view, quality, source_card, raw_file, updated_at
FROM "05-wiki"
WHERE type = "wiki_entry"
SORT updated_at DESC
```
