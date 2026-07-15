# AIWiki 0.3.0 Execution Readiness Checklist

This checklist connects the architecture document, implementation plan, RALPLAN review, PRD, test spec, and release smoke runbook into one execution handoff.

## Planning Artifact Map

Read in this order:

1. `docs/AIWiki-0.3.0-architecture-code-split-design.md`
   - Full architecture and code split design.
2. `docs/AIWiki-0.3.0-source-capsule-upgrade-plan.md`
   - Implementation phases, interfaces, and release definition.
3. `docs/AIWiki-0.3.0-ralplan-review-addendum.md`
   - RALPLAN-DR summary, ADR, locked decisions, pre-mortem, rollout, rollback, and staffing guidance.
4. `.omx/plans/prd-aiwiki-030-source-capsule.md`
   - Execution PRD and acceptance criteria.
5. `.omx/plans/test-spec-aiwiki-030-source-capsule.md`
   - Test and release verification gate.
6. `docs/AIWiki-0.3.0-release-smoke-runbook.md`
   - Exact-tarball local and remote smoke runbook.
7. `docs/AIWiki-0.3.0-documentation-completeness-review.md`
   - Documentation coverage, command-contract, acceptance, and release-evidence traceability review.
8. `.omx/context/aiwiki-030-source-capsule-20260630T121100Z.md`
   - Context snapshot for the current implementation request.

## Start Conditions

Implementation may start when:

- The PRD and test spec above exist.
- The implementer has read the architecture document and RALPLAN addendum.
- The release smoke runbook exists and is treated as a blocking release gate.
- The scope is limited to AIWiki base, not AIWiki Pro.
- The current baseline is treated as the local repo version, not only the original design document version.
- The implementer accepts that GitHub update happens only after remote smoke verification.

## Non-Negotiable Boundaries

- Keep the public command name `aiwiki`.
- Preserve one knowledge base only.
- Preserve current physical folders and `_suggestions` names.
- Preserve Review Queue.
- Preserve default `aiwiki.context.v1`.
- Keep new lint layers opt-in for old workspaces.
- Do not add SQLite, vector search, graph traversal, crawler behavior, background automation, or OKF export/import in 0.3.0.
- Do not include internal 0.3.0 planning docs in `package.json.files` by default.

## Execution Gates

### Gate 1: Domain Model

Required proof:

- Unit tests for frontmatter, artifact discovery, lifecycle, relationships, OKF projection, and capsule grouping pass.
- Legacy workspace fixtures without `capsule_id` can build capsules.
- No CLI default behavior changes are required for this gate.

### Gate 2: Metadata Rendering

Required proof:

- Ingest tests pass with additive metadata.
- Wiki Entry includes lifecycle and OKF-ready fields.
- Existing report keys and artifact paths are preserved.
- Optional artifacts remain optional.

### Gate 3: CLI Views

Required proof:

- `show` works by query, ID, and artifact path.
- `show --artifact-path <artifact.md> --path <workspace>` works without overloading the workspace `--path` flag.
- `show --json` returns stable JSON.
- `query` defaults to capsule view.
- `query --view files` preserves old output.
- default `context` remains `aiwiki.context.v1`.
- `context --view capsule` returns `aiwiki.context.capsule.v1`.

### Gate 4: Lint, Status, Workspace Seeds

Required proof:

- Default lint does not complain only because legacy files lack 0.3.0 fields.
- `--capsules`, `--lifecycle`, `--okf`, and `--strict` have covered tests.
- Status adds capsule metrics without changing existing stable prefix lines.
- Setup seeds Source Capsules dashboard when missing and preserves user edits.

### Gate 5: Docs, Skill, And Release Docs

Required proof:

- README, usage, FAQ, Agent Handoff, roadmap, release docs, and skill protocol docs describe Source Capsule behavior.
- Docs state that old workspaces do not need migration.
- Docs state that 0.3.0 is OKF-ready, not OKF export/import.
- Release docs state exact-tarball local smoke and remote smoke are required before GitHub/publish.
- Release docs state that branch CI, a read-only technical review, and the required independent GitHub approval are separate gates before a `main` merge.
- The technical review records CI, branch protection, publication OIDC permissions, version tags, and documentation consistency; it cannot replace the independent GitHub approval.
- Version is bumped to `0.3.0`.
- Internal planning docs remain excluded from package files.

### Gate 6: Local And Remote Verification

Required proof:

```bash
npm run build
npm test
npm run release:check
npm pack --dry-run --json
```

Then:

- Exact tarball smoke passes locally.
- Exact tarball smoke passes remotely.
- The tested `dev` or task branch passes CI before remote smoke.
- The read-only technical review resolves blocking findings before GitHub approval is requested.
- The `dev -> main` PR passes merge-result CI and receives an independent GitHub approval before merge.

## Packaged Docs Contract

Public shipped docs that must be updated when behavior changes:

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
- `skill/SKILL.md`
- `skill/QUERY_PROTOCOL.md`
- `skill/LINT_PROTOCOL.md`
- `skill/UPGRADE_NOTES.md`

Internal docs that should remain out of `package.json.files` by default:

- `docs/AIWiki-0.3.0-architecture-code-split-design.md`
- `docs/AIWiki-0.3.0-source-capsule-upgrade-plan.md`
- `docs/AIWiki-0.3.0-ralplan-review-addendum.md`
- `docs/AIWiki-0.3.0-execution-readiness-checklist.md`
- `docs/AIWiki-0.3.0-release-smoke-runbook.md`
- `docs/AIWiki-0.3.0-documentation-completeness-review.md`
- `.omx/plans/prd-aiwiki-030-source-capsule.md`
- `.omx/plans/test-spec-aiwiki-030-source-capsule.md`

`npm pack --dry-run --json` review must confirm the internal docs above are absent unless a later explicit release decision changes packaging.

## Execution Matrix

Default execution mode: sequential `ralph`.

| Phase | Default owner | Shared-file lock | Exit evidence |
| --- | --- | --- | --- |
| Domain model | `executor` with `architect` review | `src/frontmatter.ts`, new domain modules | Unit tests pass |
| Metadata rendering | `executor` | `src/ingest.ts`, `src/wiki-entry.ts` | Ingest tests pass |
| CLI views | `executor` | `src/app.ts`, `src/context.ts`, `tests/cli.test.ts` | CLI/query/context tests pass |
| Lint/status/seeds | `executor` | `src/lint.ts`, `src/workspace.ts` | Lint/status/workspace tests pass |
| Docs/skill | `writer` after behavior exists | README, docs, skill files | Docs match tested behavior |
| Verification | `verifier` | release artifacts only | local, pack, and remote smoke evidence |

Escalate from `ralph` to `team` only when the domain interface is stable and lanes can keep disjoint write sets.

## RALPLAN Consensus Result

Favored option:

- Runtime Source Capsule Object Layer over existing Markdown layout.

Rejected options:

- Frontmatter-only upgrade, because it does not create a shared object model.
- Persistent manifest/database, because it introduces migration and invalidation risk too early.
- Directory migration, because it breaks current dashboard and user mental models.
- Full OKF export/import, because 0.3.0 only needs OKF readiness.

Architectural tension:

- `query` default changes for humans, while `context` default must stay stable for machines.

Synthesis:

- Human views move to Source Capsules by default.
- Machine context stays v1 by default and gets capsule mode only through an explicit flag.
- Lint defaults stay legacy-compatible and deeper checks require explicit flags.

## Release Handoff Notes

- Use the exact local tarball for remote smoke.
- Prefer LF-only remote scripts.
- Inspect real CLI output before writing assertions.
- Keep queue/release state honest: published is not done until remote verification is complete.
