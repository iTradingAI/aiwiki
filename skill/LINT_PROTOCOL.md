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

2. When you need machine-readable triage, call:

```bash
aiwiki lint --json
aiwiki next
```

3. Read the terminal report.
4. Mention the report path, usually:

```text
dashboards/Lint Report.md
```

5. Explain warnings and errors as structure-health feedback.
6. Do not frame lint as "the user must manually audit every note".
7. If `aiwiki next` recommends `aiwiki agent sync --yes`, treat Agent skill setup as the next operational step before asking the user to ingest or query more material.

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
