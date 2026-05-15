# AIWiki Lint Protocol

Use this protocol when the user asks:

- 整理一下 AIWiki
- 检查知识库有没有问题
- 看看 AIWiki 结构是否健康
- lint AIWiki

## Steps

1. Call:

```bash
aiwiki lint
```

2. Read the terminal report.
3. Mention the report path, usually:

```text
dashboards/Lint Report.md
```

4. Explain warnings and errors as structure-health feedback.
5. Do not frame lint as "the user must manually audit every note".

## Issue Meaning

- `error`: broken structure such as a missing internal link.
- `warning`: likely fix needed, such as missing source fields or stale fallback entries.
- `info`: useful inventory, such as deterministic fallback count or duplicate titles.

## Repair Guidance

Prefer small, traceable fixes:

- Regenerate or enrich missing Wiki Entries.
- Fix broken wikilinks.
- Add missing `source_card` or `raw_file` paths.
- Ask the host Agent to provide `analysis` for scaffold entries.

