# Obsidian + Dataview Integration

## Decision

AIWiki should treat Obsidian compatibility as a first-class product surface:

- Base layer: works with Obsidian native Markdown, Properties, Backlinks, Search, and Graph View.
- Enhanced layer: ships optional Dataview dashboards for users who install the Dataview community plugin.
- Boundary: AIWiki must not automatically install or modify Obsidian community plugins. Plugin installation stays a documented user action.

This keeps the knowledge base portable while making the Obsidian review workflow feel like a database when Dataview is available.

## Implementation Status

Implemented in `0.2.0`:

- `setup` seeds dashboard, schema, and template files when missing.
- Generated Markdown includes database-oriented frontmatter relationship fields.
- CLI ingest output reports `dashboard` and `review_queue`.
- The bundled Agent skill tells host Agents to report Obsidian review entry points and not to install Dataview automatically.

## Evidence From Current Code

- Workspace setup already creates `dashboards`, `_system/templates`, and `_system/schemas`, but only creates directories. No seeded dashboard/schema/template files exist yet. See `src/workspace.ts` lines 11-23 and 47-68.
- Ingest now writes Obsidian wikilinks and basic frontmatter fields. See `src/ingest.ts` lines 190-244 and 247-320.
- Generated relationship fields are currently mostly body links, not queryable frontmatter fields. See `src/ingest.ts` lines 203-206, 231-238, 258-259, 276-277, 294-295, and 312-313.
- Existing usage docs mention Dataview only as a possible filter surface, not as an optional database enhancement with setup instructions. See `docs/USAGE.md` lines 189-204.
- The Agent skill reports CLI output fields, but does not tell host Agents how to surface Obsidian dashboards or review queues to users. See `skill/SKILL.md` lines 30-39.

External grounding:

- Obsidian supports wikilinks and display aliases such as `[[note|label]]`: https://help.obsidian.md/Linking%20notes%20and%20files/Internal%20links
- Obsidian properties are YAML stored at the top of notes: https://help.obsidian.md/properties
- Dataview queries metadata fields from frontmatter/inline fields and implicit file metadata: https://blacksmithgu.github.io/obsidian-dataview/annotation/add-metadata/

## Product Positioning

This should become one of AIWiki's selling points:

> AIWiki does not just save article Markdown. It turns every collected source into an Obsidian-ready review database: native Properties and Backlinks work out of the box, while optional Dataview dashboards provide source queues, claim queues, topic queues, and recent-run traceability.

The user flow should become:

1. `aiwiki setup` creates the vault-like folder structure plus database assets.
2. User optionally installs Dataview in Obsidian.
3. User asks a host Agent: `入库 <url>`.
4. AIWiki writes raw/source/claims/assets/topics/outlines/runs with stable metadata and wikilinks.
5. User opens `dashboards/AIWiki Home.md` in Obsidian.
6. Without Dataview: links and Properties still work.
7. With Dataview: dashboards render tables for review queues and recent activity.

## Target Database Schema

All generated Markdown notes should share these frontmatter fields:

```yaml
aiwiki_id: "<stable slug or run-scoped id>"
type: "source_card | raw_article | claim_suggestions | asset_suggestions | topic_candidates | draft_outline | processing_summary"
status: "to-review | ready | draft | reviewed | archived | fetch-failed"
slug: "<article-slug>"
title: "<human title>"
source_url: "<original URL when available>"
source_type: "url | file | text"
source_card: "[[03-sources/article-cards/slug|资料卡]]"
raw_note: "[[02-raw/articles/slug|原文]]"
claims_note: "[[04-claims/_suggestions/slug-claims|Claim 建议]]"
assets_note: "[[06-assets/_suggestions/slug-assets|素材建议]]"
topics_note: "[[07-topics/ready/slug-topics|选题]]"
outline_note: "[[08-outputs/outlines/slug-outline|大纲]]"
run_summary: "[[09-runs/run-id/processing-summary|处理记录]]"
run_id: "<run-id>"
created_at: "<ISO timestamp>"
captured_at: "<ISO timestamp from host Agent>"
tags:
  - aiwiki/source-card
```

Rules:

- Use Obsidian-link strings in frontmatter for relationship fields, because Obsidian Properties can display internal links when they are quoted YAML strings.
- Keep body wikilinks as human navigation, but make frontmatter the database source of truth.
- Use lowercase snake_case field names to avoid Dataview field-name normalization surprises.
- Preserve existing `url` for compatibility, but prefer `source_url` going forward.

## Dashboard Files To Generate

`aiwiki setup` should seed these files if missing:

- `dashboards/AIWiki Home.md`: entry point, review counts, recent sources, links to all queues.
- `dashboards/Review Queue.md`: sources and claims with `status = "to-review"`.
- `dashboards/Recent Runs.md`: processing summaries sorted by creation time.
- `dashboards/Topic Pipeline.md`: topic candidates and draft outlines.
- `_system/schemas/aiwiki-frontmatter.md`: schema reference and allowed values.
- `_system/templates/source-card.md`: source-card template.
- `_system/templates/review-note.md`: generic review template.

Dashboards should include:

- A short native fallback section with normal links.
- A Dataview section fenced as `dataview`, so users with the plugin get rendered tables.
- A clear note that installing Dataview is optional.

Example query:

```dataview
TABLE status, source_url, captured_at, run_summary
FROM "03-sources/article-cards"
WHERE type = "source_card"
SORT captured_at DESC
```

## Implementation Plan

1. Add workspace seed-file support in `src/workspace.ts`.
   - Create a helper like `ensureSeedFile(root, relativePath, content)`.
   - Only write files when missing, so user-edited dashboards/templates are not overwritten.
   - Return seeded files in setup/init results so CLI can report them.

2. Expand generated frontmatter in `src/ingest.ts`.
   - Add stable relationship fields to raw, source card, claims, assets, topics, outline, and processing summary.
   - Make `processing-summary.md` a first-class typed note with frontmatter.
   - Keep existing body wikilinks for human navigation.

3. Add dashboard content and schema docs.
   - Seed `AIWiki Home.md`, `Review Queue.md`, `Recent Runs.md`, `Topic Pipeline.md`.
   - Seed `_system/schemas/aiwiki-frontmatter.md`.
   - Include optional Dataview installation instructions in docs, not automatic plugin writes.

4. Update CLI output.
   - After `setup`, print created/kept dashboard files.
   - After successful ingest, print `dashboard: dashboards/AIWiki Home.md` or `review_queue: dashboards/Review Queue.md`.

5. Update host Agent skill guidance.
   - Tell Agents to report the Obsidian entry point after ingest.
   - Tell Agents not to install Dataview or modify `.obsidian`.
   - Tell Agents to say Dataview is optional and only enhances dashboard rendering.

6. Update tests.
   - Workspace tests assert seed files are created and preserved on rerun.
   - Ingest tests assert all generated Markdown has the required frontmatter fields.
   - CLI tests assert setup reports dashboard seed files and ingest reports the Obsidian entry point.
   - Add collision tests to ensure relationship frontmatter points to the renamed long-term files.

7. Update version.
   - This is a user-visible workflow enhancement. Bump minor if implemented as a new feature, patch if only documentation/schema prep is merged.

## Acceptance Criteria

- `aiwiki setup` creates dashboard/schema/template files when missing and preserves them when already edited.
- A fresh vault works in Obsidian without Dataview: links, backlinks, and Properties are usable.
- Installing Dataview renders dashboard tables without further file edits.
- Every generated Markdown note has `aiwiki_id`, `type`, `status`, `slug`, `created_at`, and relevant relationship fields.
- Dataview queries do not depend on body text parsing.
- Host Agent skill replies include the Obsidian review entry point.
- Tests cover setup seeding, ingest metadata, dashboard query presence, and rerun preservation.

## Risks And Mitigations

- Risk: Auto-installing plugins can corrupt or surprise user vaults.
  - Mitigation: Never edit `.obsidian/community-plugins.json`; document manual Dataview installation only.
- Risk: Dataview field names drift from generated frontmatter.
  - Mitigation: Centralize field names in one generator/schema helper and test dashboard query field names.
- Risk: User customizes dashboards and setup overwrites them.
  - Mitigation: Seed only when missing; future updates can write `.new` suggestions instead of overwriting.
- Risk: Obsidian links in YAML are parsed as strings, not link values, in some contexts.
  - Mitigation: Quote all link strings and keep body wikilinks as fallback navigation.

## Skill Optimization Needed

Yes, the AIWiki skill should be optimized after the database layer is implemented.

Required changes:

- Add an "Obsidian review workflow" section to `skill/SKILL.md`.
- Instruct host Agents to report `processing_summary`, `source_card`, and the dashboard/review queue path.
- Instruct host Agents not to install Dataview or edit Obsidian plugin files.
- Add wording for the final user reply, for example:

```text
已入库，并加入 Obsidian 审阅队列。
资料卡：...
处理记录：...
Obsidian 入口：dashboards/AIWiki Home.md
Dataview 是可选增强；未安装时仍可用 Properties、Backlinks 和普通链接审阅。
```

## Verification Plan

- Run `npm test`.
- Run `npm pack --dry-run` and confirm dashboard/schema/template assets are included.
- Generate a sample workspace, open generated Markdown, and inspect frontmatter/query blocks.
- Manually check one sample vault in Obsidian:
  - Without Dataview: links and Properties work.
  - With Dataview: dashboards render tables.
