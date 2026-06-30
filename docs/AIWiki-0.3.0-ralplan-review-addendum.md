# AIWiki 0.3.0 RALPLAN Review Addendum

This addendum completes the planning gaps left by:

- `docs/AIWiki-0.3.0-architecture-code-split-design.md`
- `docs/AIWiki-0.3.0-source-capsule-upgrade-plan.md`

It is the decision record and risk plan for implementing AIWiki 0.3.0. Implementation agents should read this file before editing code.

Execution gate artifacts:

- `.omx/plans/prd-aiwiki-030-source-capsule.md`
- `.omx/plans/test-spec-aiwiki-030-source-capsule.md`
- `docs/AIWiki-0.3.0-execution-readiness-checklist.md`
- `docs/AIWiki-0.3.0-release-smoke-runbook.md`

These files turn this RALPLAN decision record into a Ralph/team-ready implementation handoff.

## RALPLAN-DR Summary

### Principles

1. Compatibility first: old workspaces, old paths, `aiwiki.context.v1`, and existing dashboard files must continue to work.
2. Object layer before interface changes: `show`, capsule query, capsule context, and capsule lint must use the same Source Capsule model.
3. Runtime inference before migration: legacy Markdown files should become capsules at read time without bulk rewrites.
4. Metadata is additive: new frontmatter fields may be added to new artifacts, but existing fields and report keys remain stable.
5. OKF-ready, not OKF-locked: 0.3.0 prepares projection/readiness checks but does not add OKF export/import.

### Decision Drivers

1. Reduce retrieval entropy for users and Agents without changing the physical Markdown layout.
2. Make lifecycle and evidence state visible before introducing heavier search, graph, or database layers.
3. Keep 0.3.0 releasable as a low-risk CLI upgrade from the current `0.2.26` baseline.

### Viable Options

#### Option A: Runtime Source Capsule Object Layer

Add artifact discovery, capsule grouping, lifecycle parsing, OKF projection, and capsule-aware CLI views while preserving current directories.

Pros:

- Best match for the 0.3.0 architecture.
- Preserves legacy workspaces without migration.
- Lets all new CLI behavior share one model.

Cons:

- Requires careful inference rules for legacy files.
- Adds more modules and tests than a docs-only release.

Decision: chosen.

#### Option B: Frontmatter-only Upgrade

Only add new metadata fields during ingest and keep query/context/lint mostly file-centric.

Pros:

- Smaller first diff.
- Lower immediate implementation cost.

Cons:

- Capsule remains a documentation concept, not a system object.
- `show`, lifecycle, and OKF readiness would duplicate logic or drift.

Decision: rejected because it fails the object-layer goal.

#### Option C: Manifest or Database-backed Capsule Index

Create `.aiwiki/capsules.json`, SQLite, or another persistent index as the primary capsule source.

Pros:

- Faster future retrieval and explicit object storage.
- Easier to add index operations later.

Cons:

- Introduces migration, cache invalidation, and repair complexity.
- Violates the 0.3.0 no-database/no-manifest-dependency boundary.

Decision: rejected for 0.3.0; reconsider in 0.6.0 index-layer work.

## ADR

### Decision

Implement AIWiki 0.3.0 as a runtime Source Capsule Object Layer over the existing Markdown artifact layout, with additive lifecycle and OKF-ready metadata for new artifacts.

### Drivers

- Existing users already have workspaces in the current folder layout.
- Current `context` and `query` behavior is file-group oriented and has growing entropy for Agents.
- The product direction favors low-entropy source capsules over more generated files or retrieval mechanics.

### Alternatives Considered

- Frontmatter-only upgrade: rejected because it does not create a shared object model.
- Persistent manifest/database: rejected because it creates migration and invalidation risk too early.
- Directory migration: rejected because it breaks current dashboard and user mental models.
- Full OKF export/import: rejected because 0.3.0 only needs OKF readiness and projection.

### Why Chosen

Runtime capsules let AIWiki gain object semantics without moving files. This keeps the current local Markdown promise while giving `show`, `query`, `context`, `lint`, and `status` one coherent domain model.

### Consequences

- Artifact inference rules become a stable internal contract.
- Frontmatter parsing/writing must keep the richer local value model stable and covered by tests.
- Default CLI output changes for `query`, so `query --view files` must be preserved and tested.
- Legacy workspaces may produce capsules with `unknown` lifecycle confidence; this is acceptable and must not be reported as a default lint failure.

### Follow-ups

- 0.4.0 can add OKF export/import once OKF projection has proven stable.
- 0.5.0 can add lifecycle operations such as confirm, stale, supersede, and contradiction review.
- 0.6.0 can add an optional index layer after runtime capsule semantics are stable.

## Implementation Decisions To Lock

### Frontmatter Parser And Serializer

Current `src/frontmatter.ts` has been extended toward the 0.3.0 value model with strings, booleans, numbers, `null`, arrays, and flat object arrays. Phase 1 should preserve this local parser/serializer direction, close compatibility gaps, and add tests instead of replacing it with a YAML dependency.

Locked decision:

- Keep the small local frontmatter value model instead of adding a YAML dependency.
- Support the subset AIWiki writes: string, boolean, number, null, string arrays, and arrays of flat objects for `relationships`.
- Preserve unknown fields when reading where possible, but only serialize fields AIWiki owns.
- Keep all generated YAML deterministic for test snapshots.

Reason:

- No new dependency is required.
- AIWiki controls the fields it writes.
- The current repo already uses lightweight parsing and deterministic rendering.

### Package Files

Locked decision:

- Do not include `docs/AIWiki-0.3.0-architecture-code-split-design.md`, `docs/AIWiki-0.3.0-source-capsule-upgrade-plan.md`, or this addendum in `package.json.files` for 0.3.0 by default.
- Do not include `.omx/plans/prd-aiwiki-030-source-capsule.md`, `.omx/plans/test-spec-aiwiki-030-source-capsule.md`, `docs/AIWiki-0.3.0-execution-readiness-checklist.md`, or `docs/AIWiki-0.3.0-release-smoke-runbook.md` in `package.json.files` for 0.3.0 by default.
- These are internal implementation documents, not shipped user docs.
- Public user docs should be README, USAGE, FAQ, ROADMAP, Agent Handoff, and skill protocol updates.

Packaged-docs contract:

- Public release docs `docs/RELEASE.md` and `docs/RELEASE.zh-CN.md` must also be updated because the release path now includes exact-tarball local smoke and remote smoke before GitHub update.
- `npm pack --dry-run --json` must be inspected to prove public docs and skill files are included while internal planning docs are excluded.

### Query Default Change

Locked decision:

- `aiwiki query` defaults to capsule view in 0.3.0.
- `aiwiki query --view files` preserves current file-group output.
- Documentation must call this out as a visible behavior change.

### Context Compatibility

Locked decision:

- `aiwiki context <topic>` remains `schema_version: "aiwiki.context.v1"`.
- `aiwiki context <topic> --view capsule` returns `schema_version: "aiwiki.context.capsule.v1"`.
- Do not silently add capsule-only required fields to v1 consumers.

### Lint Severity

Locked decision:

- Default `aiwiki lint` must not warn on missing 0.3.0 capsule/lifecycle/OKF fields in legacy workspaces.
- `--capsules`, `--lifecycle`, and `--okf` opt into those layers.
- `--strict` is the only mode that can elevate OKF-readiness gaps for CI/release usage.

## Pre-mortem

### Failure 1: Legacy Workspaces Produce Incorrect Capsule Grouping

Risk:

- Legacy files lack `capsule_id`; grouping by URL, fingerprint, run ID, slug, or path can merge unrelated files or split related files.

Mitigation:

- Unit-test grouping precedence with legacy fixtures.
- Render inferred grouping reasons in `show --debug`.
- Treat ambiguous or multiple-primary groups as capsule lint findings, not silent success.

### Failure 2: Frontmatter Changes Break Existing Parsing Or Tests

Risk:

- Adding richer frontmatter values could break current query, lint, or workspace tests.

Mitigation:

- Keep existing helper API names for `frontmatterString`, `frontmatterBoolean`, and `frontmatterArray`.
- Keep helper support for numbers, nullable strings, and object arrays covered by tests.
- Run current tests before relying on new behavior.
- Use deterministic serializer output.

### Failure 3: Query Default Change Surprises Users Or Agents

Risk:

- Users or existing Agent prompts may expect file-group query output.

Mitigation:

- Preserve `query --view files`.
- Update skill and Agent Handoff with the new default.
- Add tests that compare old file view availability.
- Keep `context` default unchanged for machine consumers.

### Failure 4: Lint Creates Too Much Noise

Risk:

- New capsule/lifecycle/OKF checks could make healthy old workspaces look broken.

Mitigation:

- Default lint stays legacy-compatible.
- New checks are flag-gated.
- Strict mode is explicit.
- Docs explain that missing capsule metadata in old files is not a migration error.

### Failure 5: Release Appears Done Before Remote Verification

Risk:

- Version bump and local tests pass, but package smoke or npm publish verification is skipped.

Mitigation:

- Preserve the release loop: test, release check, dry-run pack, exact package smoke, GitHub Trusted Publishing, `npm view`, post-publish sanity.
- Do not treat local npm auth issues as a blocker if workflow-based Trusted Publishing is healthy.

## Expanded Test Plan

### Unit

- `artifact.ts`: kind, role, visibility, body preview, and inferred metadata.
- `capsule.ts`: grouping precedence, primary selection, quality warnings, capsule JSON.
- `lifecycle.ts`: defaults, parsing, penalties, answer-safety checks.
- `relationships.ts`: valid relationship parsing and invalid relationship warnings.
- `okf.ts`: projection, citation detection, readiness issues.
- `frontmatter.ts`: deterministic parse/serialize for string, boolean, number, null, arrays, and flat object arrays.

### Integration

- New ingest writes capsule/lifecycle/OKF-ready metadata across Wiki Entry, Source Card, Raw, and Run Summary.
- `show` works for legacy and new workspaces.
- `query` capsule view and `query --view files` both work.
- `context` v1 remains unchanged by default.
- `context --view capsule` returns `aiwiki.context.capsule.v1`.
- `lint --capsules`, `lint --lifecycle`, and `lint --okf` merge cleanly with the existing lint report shape.
- `status` adds metrics without breaking existing status output assertions.

### End-to-end

- Create a temporary workspace.
- Ingest a grounded fixture.
- Run `show`, `query`, `query --view files`, `context`, `context --view capsule`, all lint modes, and `status`.
- Confirm Review Queue still exists.
- Confirm `_suggestions` paths remain unchanged.
- Confirm existing dashboards are not overwritten on repeated setup.

### Observability And Release Verification

- `show --debug` must expose grouping reason, lifecycle warnings, and artifact paths.
- `lint --json --capsules` should expose machine-readable issue categories.
- `npm run build`, `npm test`, `npm run release:check`, and `npm pack --dry-run --json` must pass before release.
- Exact packed artifact smoke should be run before Trusted Publishing.
- After publish, verify `npm view @itradingai/aiwiki version` and run a post-publish smoke on a clean environment.

## Rollout Plan

### PR 1: Domain Model

Implement artifact, lifecycle, relationships, OKF projection, capsule grouping, and frontmatter parser/serializer tests and refinements.

Gate:

- Unit tests pass.
- No CLI behavior changes yet.

### PR 2: Ingest Metadata

Write capsule/lifecycle/OKF-ready fields for new artifacts while preserving old fields and paths.

Gate:

- Existing ingest tests pass after expected field updates.
- New generated files still work with existing `query`, `context`, and `lint`.

### PR 3: CLI Views

Add `show`, `query --view`, and `context --view capsule`.

Gate:

- Default `context` remains v1.
- `query --view files` preserves old output.
- Legacy and new workspace smoke tests pass.

### PR 4: Lint, Status, Workspace Seeds

Add capsule/lifecycle/OKF lint flags, status metrics, Source Capsules dashboard seed, and schema docs.

Gate:

- Default lint stays quiet for legacy metadata absence.
- Existing user-edited dashboard preservation tests pass.

### PR 5: Docs, Skill, Release Readiness

Update public docs and skill protocols, bump version to `0.3.0`, run release checks and package smoke.

Gate:

- Docs explain Source Capsule defaults and compatibility.
- Release docs explain exact-tarball local smoke and remote smoke before GitHub update.
- Package dry-run proves internal planning docs are excluded and public docs/skill files are included.
- Release verification commands pass.

## Rollback Plan

- If PR 1 fails, revert only new modules and tests; no public behavior changes should exist.
- If PR 2 metadata breaks ingest, gate new fields behind renderer helpers and revert metadata writes while keeping pure parsing tests.
- If PR 3 query default causes regressions, temporarily keep capsule view behind `--view capsule` and delay default switch until docs/skill are updated.
- If PR 4 lint creates noise, keep new lint layers opt-in and lower severities before release.
- If publish smoke fails, do not publish. Fix locally, rerun pack smoke, then use Trusted Publishing only after full verification.

## Execution Staffing Guidance

### Sequential `ralph` Path

Use one owner for the full loop:

- Phase 1 and frontmatter parser first.
- Phase 2 ingest metadata second.
- Phase 3 CLI views third.
- Phase 4 lint/status and workspace seeds fourth.
- Phase 5 docs/skill/release last.

Reason:

- Shared model files affect most phases; one persistent owner reduces interface drift.

Default execution mode: sequential `ralph`.

Escalate to `team` only after the domain model interface is stable and write scopes can be split without shared-file contention.

### Coordinated `team` Path

Use bounded lanes:

- Architect or executor: Source Capsule model and frontmatter support.
- Executor: ingest metadata and Wiki Entry rendering.
- Executor: CLI `show/query/context` integration.
- Test engineer: fixtures, compatibility tests, smoke scripts.
- Writer: README, docs, skill protocol updates.
- Verifier: release checks, pack smoke, post-publish checklist.

Rules:

- PR 1 must land or stabilize before CLI and lint lanes rely on the object model.
- Do not let docs promise behavior that tests do not cover.
- Shared files `src/app.ts`, `src/frontmatter.ts`, `src/workspace.ts`, and `tests/cli.test.ts` need one owner at a time.
