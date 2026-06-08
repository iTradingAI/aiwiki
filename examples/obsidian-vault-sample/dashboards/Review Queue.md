# 待审队列

未安装 Dataview 时，可直接打开 [[03-sources/article-cards]]、[[04-claims/_suggestions]]、[[06-assets/_suggestions]] 和 [[08-outputs/outlines]] 手工审阅。

## 待审内容

```dataview
TABLE type, source_url, source_card, raw_note, claims_note, assets_note, outline_note
FROM "03-sources/article-cards" or "04-claims/_suggestions" or "06-assets/_suggestions" or "08-outputs/outlines"
WHERE status = "to-review"
SORT captured_at DESC
```
