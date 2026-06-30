# AIWiki 0.3.0 Documentation Completeness Review

This document reviews whether the AIWiki 0.3.0 Source Capsule planning documents are complete enough for execution, verification, and release handoff.

It is an internal planning document. It is not a packaged user guide unless a later release decision explicitly adds it to `package.json.files`.

## Review Scope

Covered:

- Architecture and code split design.
- RALPLAN decision record and tradeoff review.
- PRD and acceptance criteria.
- Test specification and smoke gates.
- Execution readiness checklist.
- Release smoke runbook.
- Public documentation and packaged skill protocol coverage.

Not covered:

- A fresh code review of implementation diffs.
- A fresh npm publish verification.
- A replacement for the exact-tarball local and remote smoke gates.

## Verdict

The 0.3.0 planning set is complete for execution handoff when all documents below exist and stay internally consistent.

The release is not complete merely because these documents exist. Release completion still requires the local validation, package inspection, exact local tarball smoke, remote smoke, GitHub update, and any publish verification required by the release owner.

## Document Set

Read order:

| Order | Document | Role | Required state |
| --- | --- | --- | --- |
| 1 | `.omx/context/aiwiki-030-source-capsule-20260630T121100Z.md` | Context snapshot | Captures baseline, desired outcome, constraints, unknowns, and touchpoints. |
| 2 | `docs/AIWiki-0.3.0-architecture-code-split-design.md` | Architecture source | Defines object model, module split, CLI design, tests, compatibility, and non-goals. |
| 3 | `docs/AIWiki-0.3.0-source-capsule-upgrade-plan.md` | Implementation plan | Converts the architecture into phases, public interfaces, test plan, and definition of done. |
| 4 | `docs/AIWiki-0.3.0-ralplan-review-addendum.md` | Consensus review | Records RALPLAN-DR principles, drivers, options, ADR, risks, rollout, rollback, and staffing. |
| 5 | `.omx/plans/prd-aiwiki-030-source-capsule.md` | Execution PRD | Defines functional requirements, acceptance criteria, staffing, risks, and launch hints. |
| 6 | `.omx/plans/test-spec-aiwiki-030-source-capsule.md` | Test gate | Defines unit, integration, e2e, package, local tarball, and remote smoke checks. |
| 7 | `docs/AIWiki-0.3.0-execution-readiness-checklist.md` | Gate checklist | Connects architecture, PRD, tests, docs, packaging, and release gates. |
| 8 | `docs/AIWiki-0.3.0-release-smoke-runbook.md` | Release runbook | Defines exact-tarball local and remote smoke policy before GitHub update. |
| 9 | `docs/AIWiki-0.3.0-documentation-completeness-review.md` | Completeness review | Confirms document coverage and command-contract consistency. |

## RALPLAN-DR Coverage

| Requirement | Covered by | Notes |
| --- | --- | --- |
| Principles | `docs/AIWiki-0.3.0-ralplan-review-addendum.md` | Compatibility, local-first Markdown, object-first reuse, explicit lifecycle, OKF-ready boundary. |
| Decision drivers | `docs/AIWiki-0.3.0-ralplan-review-addendum.md` | Agent reuse quality, compatibility risk, implementation risk. |
| Viable options | `docs/AIWiki-0.3.0-ralplan-review-addendum.md` | Runtime object layer, frontmatter-only upgrade, manifest/database-backed index. |
| ADR | `docs/AIWiki-0.3.0-ralplan-review-addendum.md` and `.omx/plans/prd-aiwiki-030-source-capsule.md` | Runtime Source Capsule layer over current Markdown layout. |
| Pre-mortem | `docs/AIWiki-0.3.0-ralplan-review-addendum.md` | Legacy grouping, frontmatter parsing, query default, lint noise, premature release. |
| Expanded test plan | `docs/AIWiki-0.3.0-ralplan-review-addendum.md` and `.omx/plans/test-spec-aiwiki-030-source-capsule.md` | Unit, integration, e2e, packaging, remote smoke. |
| Staffing guidance | `.omx/plans/prd-aiwiki-030-source-capsule.md` | Sequential `ralph` and optional `team` lanes. |
| Verification path | `.omx/plans/test-spec-aiwiki-030-source-capsule.md` and `docs/AIWiki-0.3.0-release-smoke-runbook.md` | Local validation, package inspection, exact tarball smoke, remote smoke. |

## Command Contract Trace

| Surface | Contract | Planning source | Test / smoke source |
| --- | --- | --- | --- |
| `show` by query | `aiwiki show "<query>" --path <workspace>` opens one Source Capsule. | Architecture, upgrade plan, PRD | Test spec, release runbook |
| `show` by ID | `aiwiki show --id <capsule_id> --path <workspace>` resolves one capsule. | Architecture, upgrade plan, PRD | Test spec |
| `show` by artifact | `aiwiki show --artifact-path <artifact.md> --path <workspace>` resolves by local artifact path. `--path` remains the workspace selector. | Upgrade plan, PRD | Test spec, release runbook |
| `show` JSON | `aiwiki show "<query>" --json --path <workspace>` returns parseable capsule JSON. | Architecture, PRD | Test spec, release runbook |
| `query` default | `aiwiki query "<topic>" --path <workspace>` defaults to Source Capsule view. | Architecture, upgrade plan, PRD | Test spec, release runbook |
| `query --view files` | Preserves the older file-level match view. | Architecture, upgrade plan, PRD | Test spec, release runbook |
| `context` default | `aiwiki context "<topic>" --path <workspace>` remains `aiwiki.context.v1`. | Architecture, upgrade plan, PRD | Test spec, release runbook |
| `context --view capsule` | Returns `aiwiki.context.capsule.v1`. | Architecture, upgrade plan, PRD | Test spec, release runbook |
| `lint` default | Default lint stays legacy-compatible and file/structure-oriented. | Architecture, upgrade plan, PRD | Test spec, release runbook |
| `lint` deep checks | `--capsules`, `--lifecycle`, `--okf`, and `--strict` are explicit opt-in checks. | Architecture, upgrade plan, PRD | Test spec, release runbook |
| `status` | Adds capsule metrics without breaking existing stable status lines. | Architecture, upgrade plan, PRD | Test spec, release runbook |
| `setup` / `init` | Seeds Source Capsules dashboard/schema files when missing and preserves user edits. | Architecture, upgrade plan, PRD | Test spec |

## Acceptance Trace

| PRD criterion | Evidence required | Primary document |
| --- | --- | --- |
| AC1 legacy workspace grouping | Capsule grouping tests over files without `capsule_id`. | Test spec UT3 |
| AC2 additive ingest metadata | Ingest and Wiki Entry tests for capsule, lifecycle, relationship, and OKF-ready fields. | Test spec IT1 |
| AC3 query-based `show` view | CLI test and smoke command for `aiwiki show "<query>"`. | Test spec IT2 |
| AC4 artifact-path `show` view | CLI test and smoke command for `aiwiki show --artifact-path <artifact.md> --path <workspace>`. | Test spec IT2 |
| AC5 `show --json` | Parseable capsule JSON assertion. | Test spec IT2 |
| AC6 default capsule query | CLI test and smoke command for default `query`. | Test spec IT3 |
| AC7 file query compatibility | CLI test and smoke command for `query --view files`. | Test spec IT3 |
| AC8 default context v1 | JSON schema assertion for `aiwiki.context.v1`. | Test spec IT4 |
| AC9 capsule context | JSON schema assertion for `aiwiki.context.capsule.v1`. | Test spec IT4 |
| AC10 legacy-compatible lint | Default lint test on legacy metadata. | Test spec IT5 |
| AC11 opt-in lint layers | `--capsules`, `--lifecycle`, `--okf`, and `--strict` test coverage. | Test spec IT5 |
| AC12 status metrics | CLI/status test for capsule metrics. | Test spec IT6 |
| AC13 workspace seeds | Setup tests and sample vault dashboard/schema files. | Test spec IT6 |
| AC14 docs and skill protocols | Public docs and skill protocol review. | Execution checklist Gate 5 |
| AC15 package boundary | `npm pack --dry-run --json` package inspection. | Test spec local release gate |
| AC16 local validation | `npm run build`, `npm test`, `npm run release:check`, `npm pack --dry-run --json`. | Test spec local release gate |
| AC17 exact local tarball smoke | Clean install from the actual `itradingai-aiwiki-0.3.0.tgz`. | Test spec exact tarball smoke |
| AC18 remote exact tarball smoke | Remote clean install and command smoke from the same local tarball before GitHub update. | Release smoke runbook |

## Public Documentation Coverage

Public packaged docs that must describe the 0.3.0 user-facing behavior:

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

Required public messages:

- Source Capsule is the default human query view in 0.3.0.
- `aiwiki.context.v1` remains the default Agent JSON contract.
- `context --view capsule` is the explicit object-level JSON view.
- Old workspaces do not need bulk migration.
- Capsule, lifecycle, and OKF checks are opt-in for normal users.
- 0.3.0 is OKF-ready, not OKF export/import.
- AIWiki still does not fetch webpages or call LLMs itself.
- The base product still supports one knowledge base.

## Packaging Boundary

The following internal planning documents should remain excluded from `package.json.files` by default:

- `docs/AIWiki-0.3.0-architecture-code-split-design.md`
- `docs/AIWiki-0.3.0-source-capsule-upgrade-plan.md`
- `docs/AIWiki-0.3.0-ralplan-review-addendum.md`
- `docs/AIWiki-0.3.0-execution-readiness-checklist.md`
- `docs/AIWiki-0.3.0-release-smoke-runbook.md`
- `docs/AIWiki-0.3.0-documentation-completeness-review.md`
- `.omx/plans/prd-aiwiki-030-source-capsule.md`
- `.omx/plans/test-spec-aiwiki-030-source-capsule.md`

The package dry-run must prove this boundary before publish or GitHub release handoff.

## Release Evidence To Record

Before calling the release complete, record:

- Local validation command outputs.
- Package dry-run file count and inclusion/exclusion review.
- Actual tarball filename, shasum, and integrity.
- Exact local tarball smoke temp path and result.
- Remote host, remote temp path, tarball path, command summary, and result.
- Git commit hash pushed after remote smoke.
- npm publish or Trusted Publishing result, when publishing is in scope.
- Post-publish sanity result, when publishing is in scope.

## Remaining Watchpoints

- Do not let `--path` become both workspace selector and artifact selector again. Use `--artifact-path` for artifact-file resolution.
- Do not promote internal planning docs into the npm package without an explicit release decision.
- Do not treat local tests as a substitute for exact-tarball remote smoke.
- Do not treat OKF readiness as OKF import/export support.
- Do not let Source Capsule grouping require a database, manifest migration, or directory rewrite in 0.3.0.
