# Source Capsules

Source Capsules group the Wiki Entry, Source Card, Raw record, optional suggestions, and run summary that came from the same source.

Use this dashboard with Obsidian native links and Properties. Dataview is optional.

## CLI

```bash
aiwiki show "<topic>"
aiwiki query "<topic>"
aiwiki context "<topic>" --view capsule
aiwiki lint --capsules
```

## Capsule Entries

```dataview
TABLE capsule_id, knowledge_status, confidence_level, staleness, evidence_count, source_card, raw_note, run_summary
FROM "05-wiki/source-knowledge"
WHERE capsule_id
SORT file.mtime DESC
```

## Capsule Evidence

```dataview
TABLE capsule_id, type, artifact_role, visibility, source_url, created_at
FROM "02-raw/articles" or "03-sources/article-cards" or "04-claims/_suggestions" or "06-assets/_suggestions" or "07-topics/ready" or "08-outputs/outlines" or "09-runs"
WHERE capsule_id
SORT capsule_id ASC, created_at DESC
```
