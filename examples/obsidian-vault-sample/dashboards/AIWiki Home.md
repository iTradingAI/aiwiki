# AIWiki 首页

AIWiki 的 Obsidian 入口。Dataview 是可选增强；未安装时仍可使用下方普通链接、Properties、Backlinks 和 Graph View。

## 原生链接入口

- [[dashboards/Wiki Entries|Wiki 条目]]
- [[dashboards/Source Cards|资料卡]]
- [[dashboards/Review Queue|待审队列]]
- [[dashboards/Recent Runs|最近处理]]
- [[dashboards/Topic Pipeline|选题管线]]
- [[dashboards/Lint Report|结构检查]]
- [[_system/schemas/aiwiki-frontmatter|字段说明]]

## 最近收录

```dataview
TABLE status, source_url, captured_at, run_summary
FROM "03-sources/article-cards"
WHERE type = "source_card"
SORT captured_at DESC
```

## 待审队列

```dataview
TABLE type, status, source_card, raw_note, run_summary
FROM "03-sources/article-cards" or "04-claims/_suggestions" or "06-assets/_suggestions" or "08-outputs/outlines"
WHERE status = "to-review"
SORT created_at DESC
```
