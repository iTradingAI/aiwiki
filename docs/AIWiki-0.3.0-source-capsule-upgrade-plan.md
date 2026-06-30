# AIWiki 0.3.0 Source Capsule Upgrade Plan

## Summary

This plan implements the 0.3.0 architecture described in
`docs/AIWiki-0.3.0-architecture-code-split-design.md`.

Planning addendum:

- `docs/AIWiki-0.3.0-ralplan-review-addendum.md` is the decision and risk record for this implementation plan.
- Implementation agents must read the addendum before editing code.

Execution handoff artifacts:

- `.omx/plans/prd-aiwiki-030-source-capsule.md` is the PRD and acceptance-criteria gate for implementation.
- `.omx/plans/test-spec-aiwiki-030-source-capsule.md` is the unit, integration, e2e, package, and remote-smoke test gate.
- `docs/AIWiki-0.3.0-execution-readiness-checklist.md` connects the architecture, PRD, test spec, release boundary, and remote verification requirements.
- `docs/AIWiki-0.3.0-release-smoke-runbook.md` defines the exact-tarball local and remote smoke gates before GitHub update.
- `docs/AIWiki-0.3.0-documentation-completeness-review.md` is the plan completeness and documentation coverage review.

Baseline correction:

- The design document names `@itradingai/aiwiki@0.2.25` as its baseline.
- The current project baseline is `@itradingai/aiwiki@0.2.26`.
- The 0.3.0 implementation should treat 0.2.26 as the real local and npm-latest baseline.

Goal:

AIWiki 0.3.0 should upgrade AIWiki from a file-centric Markdown artifact CLI into an object-centric, lifecycle-aware, OKF-ready Agent-first local LLM-wiki CLI.

Core definition:

```text
AIWiki 0.3.0 =
Source Capsule Object Layer
+ Minimal Lifecycle State
+ OKF-ready Projection
+ Compatible CLI Interface
```

## Product And Compatibility Boundaries

Implement:

- One source should be recognized as one Source Capsule.
- Source Capsule should group Wiki Entry, Source Card, Raw, Claims, Assets, Topics, Outlines, and Run Summary.
- Users should get a low-entropy single-source view through `aiwiki show`.
- Human query output should default to capsule view.
- Agent context should keep v1 compatibility by default and add capsule view through an explicit flag.
- New artifacts should carry capsule, lifecycle, and OKF-ready metadata.
- Lint should be able to check file, capsule, lifecycle, and OKF-ready layers.

Do not implement in 0.3.0:

- SQLite, vector indexes, BM25, graph traversal, or background jobs.
- Automatic contradiction detection or automatic supersession.
- Retention scheduler or FSRS-style review.
- OKF export/import.
- A `.aiwiki/capsules` manifest dependency.
- Old Markdown bulk migration or directory renaming.
- Web fetching or built-in LLM behavior.

Compatibility requirements:

- Keep current physical directories.
- Do not rename `_suggestions`.
- Do not delete or replace Review Queue.
- Do not overwrite user-edited dashboards.
- Do not break `aiwiki.context.v1`.
- Do not remove existing ingest report fields such as `keyFiles.reviewQueue`, `keyFiles.dashboard`, `keyFiles.sourceCard`, or `keyFiles.wikiEntry`.

## Public Interfaces

### `aiwiki show`

Add:

```bash
aiwiki show "<query>"
aiwiki show --id src_xxx
aiwiki show --artifact-path 05-wiki/source-knowledge/example.md --path <workspace>
aiwiki show "<query>" --json
aiwiki show "<query>" --debug
aiwiki show "<query>" --all-artifacts
```

Behavior:

- Shows one Source Capsule.
- Default output includes primary Wiki Entry, lifecycle state, OKF readiness, evidence files, supporting artifacts, debug artifacts, warnings, and next actions.
- `--json` returns a stable capsule JSON shape.
- `--debug` includes run logs and inferred grouping data.
- `--all-artifacts` includes every artifact in the capsule.

### `aiwiki query`

Change:

- Default `query` output becomes capsule view.
- Add `--view capsule|files`.
- `--view files` preserves the current file-group output.
- Default capsule view hides debug-only capsules unless no better match exists.

### `aiwiki context`

Change:

- Default output remains `schema_version: "aiwiki.context.v1"`.
- Add `--view capsule` and optional `--capsules` alias.
- Capsule context returns `schema_version: "aiwiki.context.capsule.v1"`.
- Capsule context should include query scope, result quality, capsules, lifecycle warnings, OKF readiness, missing context, and recommended next action.

### `aiwiki lint`

Change:

```bash
aiwiki lint --capsules
aiwiki lint --lifecycle
aiwiki lint --okf
aiwiki lint --strict
```

Behavior:

- Default `aiwiki lint` keeps current behavior and does not create noise for legacy workspaces.
- `--capsules` checks missing primary, duplicate primary, run-only capsule visibility, missing evidence, and broken capsule grouping.
- `--lifecycle` checks invalid lifecycle values and contradictory state combinations.
- `--okf` checks OKF-ready fields and citation/readiness signals.
- `--strict` can raise selected OKF/capsule gaps to stronger severities for release or CI use.

### `aiwiki status`

Add metrics:

- `capsule_count`
- `capsule_with_primary_count`
- `entropy_risk`
- `lifecycle_risk`
- `okf_ready_count`

Keep existing status fields and next action behavior.

## Implementation Plan

### Phase 1: Object Layer

Add modules in the current flat `src/` style:

- `src/artifact.ts`
- `src/capsule.ts`
- `src/lifecycle.ts`
- `src/relationships.ts`
- `src/okf.ts`

Responsibilities:

- `artifact.ts`: discover Markdown artifacts, infer kind/role/visibility from path and frontmatter, normalize frontmatter reads.
- `capsule.ts`: build Source Capsules from artifacts, find capsules by query/id/path, expose JSON conversion.
- `lifecycle.ts`: parse/default lifecycle state, compute penalties and warnings, decide answer safety.
- `relationships.ts`: parse and validate typed relationships without graph traversal.
- `okf.ts`: project Wiki Entries into OKF-ready fields and check readiness.

Acceptance:

- Legacy workspaces without `capsule_id` can still produce Source Capsules through runtime inference.
- New workspaces with full metadata use explicit `capsule_id` first.
- Unit tests cover grouping order, lifecycle defaults, OKF projection, and relationship validation.

### Phase 2: New Artifact Metadata

Update ingest and Wiki Entry rendering.

New generated artifact fields:

- `capsule_id`
- `artifact_role`
- `visibility`
- `description`
- `resource`
- `timestamp`
- `knowledge_status`
- `confidence_level`
- `confidence_score`
- `last_confirmed`
- `valid_from`
- `valid_until`
- `staleness`
- `evidence_count`
- `evidence_refs`
- `access_count`
- `last_accessed`
- `supersedes`
- `superseded_by`
- `contradicted_by`
- `relationships`

Rules:

- Preserve existing fields and paths.
- Generate capsule IDs deterministically from source URL, content fingerprint, run ID, slug, or vault path.
- New Wiki Entry should include OKF-ready frontmatter and a source/evidence section.
- Lint should accept legacy files that do not have these fields.

Acceptance:

- New ingest produces artifacts with capsule metadata.
- New Wiki Entry has lifecycle and OKF-ready fields.
- Existing ingest tests still pass after updating expected frontmatter.

### Phase 3: CLI Integration

Add modules:

- `src/show.ts`
- `src/query-view.ts`
- `src/capsule-context.ts`

Update:

- `src/app.ts`
- `src/args.ts`
- `src/context.ts`

Rules:

- Register `show`.
- Keep current context v1 path unchanged by default.
- Route `context --view capsule` through capsule context.
- Route `query` through capsule renderer by default.
- Preserve old query renderer behind `--view files`.
- Continue using the current hand-written argument parser.

Acceptance:

- `aiwiki show "<query>"` works on legacy and new workspaces.
- `aiwiki query "<topic>"` returns capsule view.
- `aiwiki query "<topic>" --view files` preserves old behavior.
- `aiwiki context "<topic>"` still returns `aiwiki.context.v1`.
- `aiwiki context "<topic>" --view capsule` returns `aiwiki.context.capsule.v1`.

### Phase 4: Lint And Status

Add:

- `src/capsule-lint.ts`

Update:

- `src/lint.ts`
- `src/app.ts`
- status summary helpers in `src/workspace.ts` or a small capsule-aware helper.

Rules:

- Default lint remains file/structure-oriented.
- Capsule/lifecycle/OKF checks are opt-in.
- Strict mode should be explicit and should not surprise normal users.

Acceptance:

- `lint --capsules` detects missing primary and duplicate primary.
- `lint --lifecycle` detects invalid lifecycle state and inconsistent supersession.
- `lint --okf` detects missing recommended OKF fields.
- Default `lint` does not fail legacy workspaces for missing 0.3.0 metadata.
- `status` reports capsule counts without breaking existing status tests.

### Phase 5: Workspace Seeds, Docs, And Skill

Update workspace seeds:

- Add `dashboards/Source Capsules.md`.
- Update new `AIWiki Home.md` seed to include Source Capsules as the primary low-entropy entry.
- Keep Review Queue as a compatibility entry.
- Update `_system/schemas/aiwiki-frontmatter.md` with capsule, lifecycle, relationship, and OKF-ready fields.

Update docs:

- `README.md`
- `README.zh-CN.md`
- `docs/README.md`
- `docs/README.zh-CN.md`
- `docs/USAGE.md`
- `docs/USAGE.zh-CN.md`
- `docs/FAQ.md`
- `docs/FAQ.zh-CN.md`
- `docs/AGENT_HANDOFF.md`
- `docs/AGENT_HANDOFF.zh-CN.md`
- `docs/ROADMAP.md`
- `docs/ROADMAP.zh-CN.md`
- `docs/RELEASE.md`
- `docs/RELEASE.zh-CN.md`

Update skill:

- `skill/SKILL.md`
- `skill/QUERY_PROTOCOL.md`
- `skill/LINT_PROTOCOL.md`
- `skill/UPGRADE_NOTES.md`

Acceptance:

- New users understand Source Capsule as the default object view.
- Agents know to use `show` for one source and `context --view capsule` for low-entropy retrieval.
- Docs explicitly say old workspaces do not need migration.
- Docs explicitly say 0.3.0 is OKF-ready, not full OKF export/import.

## Test Plan

Add or update tests:

- `tests/capsule.test.ts`
- `tests/lifecycle.test.ts`
- `tests/okf.test.ts`
- `tests/context-capsule.test.ts`
- `tests/capsule-lint.test.ts`
- Existing `tests/cli.test.ts`
- Existing `tests/ingest.test.ts`
- Existing `tests/workspace.test.ts`

Required test scenarios:

1. Legacy workspace without `capsule_id` can build capsules.
2. Legacy workspace does not fail default lint due to missing lifecycle fields.
3. New ingest creates `capsule_id`, `artifact_role`, and `visibility`.
4. New Wiki Entry has `description`, `resource`, `timestamp`, lifecycle fields, and evidence refs.
5. `aiwiki show` displays primary/evidence/lifecycle/OKF sections.
6. `aiwiki query` defaults to capsule view.
7. `aiwiki query --view files` preserves current output.
8. `aiwiki context` default schema remains `aiwiki.context.v1`.
9. `aiwiki context --view capsule` returns `aiwiki.context.capsule.v1`.
10. `aiwiki lint --capsules` detects missing primary.
11. `aiwiki lint --lifecycle` detects inconsistent lifecycle state.
12. `aiwiki lint --okf` detects missing OKF-ready fields.
13. Review Queue is not deleted.
14. `_suggestions` directories are not renamed.
15. Old dashboards are not overwritten on setup.

Validation commands:

```bash
npm run build
npm test
npm run release:check
npm pack --dry-run --json
```

Manual smoke commands:

```bash
aiwiki --version
aiwiki init --path ./tmp-v030 --yes
aiwiki ingest-agent --payload tests/fixtures/agent_payload.analysis.grounded.json --path ./tmp-v030
aiwiki show "Grounded Notes" --path ./tmp-v030
aiwiki show --artifact-path 05-wiki/source-knowledge/grounded-notes.md --path ./tmp-v030
aiwiki show "Grounded Notes" --json --path ./tmp-v030
aiwiki query "Grounded Notes" --path ./tmp-v030
aiwiki query "Grounded Notes" --view files --path ./tmp-v030
aiwiki context "Grounded Notes" --path ./tmp-v030
aiwiki context "Grounded Notes" --view capsule --path ./tmp-v030
aiwiki lint --path ./tmp-v030
aiwiki lint --capsules --path ./tmp-v030
aiwiki lint --lifecycle --path ./tmp-v030
aiwiki lint --okf --path ./tmp-v030
aiwiki status --path ./tmp-v030
```

## Release Notes For Implementers

Before release:

- Bump `package.json` version to `0.3.0`.
- Do not include `docs/AIWiki-0.3.0-architecture-code-split-design.md`, this implementation plan, or the ralplan addendum in `package.json.files` by default; these are internal implementation documents, not shipped user docs.
- Do not include `.omx/plans/prd-aiwiki-030-source-capsule.md`, `.omx/plans/test-spec-aiwiki-030-source-capsule.md`, `docs/AIWiki-0.3.0-execution-readiness-checklist.md`, `docs/AIWiki-0.3.0-release-smoke-runbook.md`, or `docs/AIWiki-0.3.0-documentation-completeness-review.md` in `package.json.files` by default.
- Inspect `npm pack --dry-run --json` to prove the shipped docs contract is correct.
- Keep release path aligned with existing Trusted Publishing workflow.
- Do not treat local npm auth issues as a blocker if workflow-based publish remains healthy.
- Run exact-tarball local smoke and remote smoke before GitHub update, following `docs/AIWiki-0.3.0-release-smoke-runbook.md`.

## Definition Of Done

AIWiki 0.3.0 is done when:

- One source can be recognized as one Source Capsule.
- `aiwiki show` shows a single-source low-entropy view.
- `aiwiki query` returns Source Capsule lists by default.
- `aiwiki context --view capsule` returns low-entropy capsule JSON for Agents.
- New artifacts include capsule, lifecycle, and OKF-ready metadata.
- Lint can check file, capsule, lifecycle, and OKF-ready layers.
- Old workspaces keep working without migration.
- No database, vector store, graph traversal, crawler, or background automation is introduced.
