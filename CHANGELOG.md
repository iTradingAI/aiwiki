# Changelog

This changelog records public, consumer-visible release history. Repository tags and npm artifacts are cited only where both mappings were verified; registry-only history is labeled separately.

## Unreleased

### Added

- Core 1.0 migration guide, complete security guide, and plugin signing proposal.

## [0.8.1] - 2026-08-12

- Corrected the published 0.8.0 release record and made the bilingual maintainer release runbook version-neutral.
- Added packaged Skill upgrade guidance for every public release line since 0.6.0.
- Aligned MCP `initialize` `serverInfo.version` with the package version; protocol, tools, and other CLI/API/schema/extension/Pro behavior remain unchanged.

## [0.8.0] - 2026-08-12

- Added additive `aiwiki.doctor.v1`, `aiwiki.status.v1`, and `aiwiki.next.v1` JSON contracts with one shared readiness model and stable ordered action identifiers.
- Added five explicit first-use states: `repair_required`, `setup_required`, `first_ingest_required`, `review_required`, and `ready`.
- Made diagnostic collection strictly read-only, including capability checks, live lint observation, content metrics, and run history; no command or suggested action is executed automatically.
- Preserved existing text output and exit-code behavior while adding machine-readable diagnostics for fresh and incomplete workspaces.
- Kept Health, repair planning, host-Agent checks, SDK exports, MCP tools, extensions, and Pro capabilities outside the readiness contract.

Verified publication: annotated tag `v0.8.0` resolves to `081fa1a3f4ebaa2ac26efab42151eff972471005`; [GitHub Release v0.8.0](https://github.com/iTradingAI/aiwiki/releases/tag/v0.8.0) was published on 2026-08-12; npm artifact `@itradingai/aiwiki@0.8.0` has SHA-1 `8c8dcbc83b76ca038761f8dac037dd47b39c4d4e` and integrity `sha512-sYHJ14NROsDag6X/UU8VcrnOb9LfMEu3L20c/ZJP1+AQRpfVWH8bZFORCCfN4IsIDBWLIGskqWT/p2WUUa+SWQ==`.

## [0.7.1] - 2026-08-10

- Fixed MCP client configuration documentation: added `mcpServers` wrapper format, `npx` usage, and absolute-path examples for Claude Desktop, Cline, and other MCP clients.
- Added MCP quickstart sections to README.md, README.zh-CN.md, USAGE.md, and USAGE.zh-CN.md.

## [0.7.0] - 2026-08-10

- Added stable SDK exports for query, show, health, lifecycle, relationship, and graph-context operations to `aiwiki.public.v1`.
- Added a zero-runtime-dependency MCP server with six tools, hand-rolled JSON-RPC 2.0 over stdio, and protocol version `2025-06-18`.
- Added Agent Contract documentation for integrating AIWiki with host agents.

This entry records source changes for the 0.7.0 release line. Publication mappings are cited only where independently verified.

## [0.6.0] - 2026-08-10

- Added four packaged workflow packs for research, writing, decisions, and review / retrospective work, each with an ordered command path, expected outputs, safe fallbacks, and a runnable public-trial scenario.
- Added public-trial scenario examples that demonstrate the workflow packs against an AIWiki workspace.
- Routed explicit research, writing, decision, review, and retrospective requests in the packaged Skill to their matching workflow guidance.
- Included the workflow and public-trial scenario documentation in the published package contents.
- Kept CLI behavior, JSON keys, schema identifiers, enum values, and matching precedence unchanged.

This entry records source changes for the 0.6.0 release line. Publication mappings are cited only where independently verified.

## [0.5.1] - 2026-07-26

- Aligned the current-release declarations, packaged Skill marker, upgrade guidance, and bilingual public documentation on 0.5.1.
- Added bilingual changelogs and private vulnerability-reporting policies.
- Separated public release notes from the maintainer release runbook and removed internal task identifiers from consumer guidance without changing command behavior or JSON contracts.
- Kept `https://maxking.cc/aiwiki` as the canonical homepage while the replacement site remains readiness-gated.

This entry records source changes for the 0.5.1 release line. Publication mappings are cited only where independently verified.

## [0.5.0] - 2026-07-20

### Added

- Removable derived-state snapshots with explicit dry-run, check, and rebuild flows.
- A structured index and deterministic relationship graph, both built only on explicit request.
- The opt-in `aiwiki.context.v2` graph-aware view while keeping default Agent output on `aiwiki.context.v1`.
- Read-only knowledge health and repair-plan contracts, plus explicit health-report generation that updates only managed dashboard content and writes an immutable run record.

### Compatibility

- Markdown remains the source of truth; missing or stale derived state does not disable normal retrieval.
- Existing Context v1 and capsule contracts remain stable.
- No automatic indexing, graph rebuilding, extension discovery, scheduling, or watcher behavior was introduced.

### Verified release evidence

- Annotated tag object: `v0.5.0` at `051581321dec480cb5025b32a555f4cae37eb1c5`.
- Tagged source commit: `b2f38e61f485c99700929c80479c7217eb0c00cc`; its `package.json` declares `0.5.0`.
- npm artifact: `@itradingai/aiwiki@0.5.0`, SHA-1 `e4b0f2a5caf558671df21b952326ad1a839b94bf`, integrity `sha512-hEv7yjRJztWwl/Nc/p1bDY5e/kujWSCgT4QA4kNIzIzzRhHPo20M1aFkcgfQ8oiTecR+OOwIoHuPP+K1rYeU1w==`.

## [0.4.0] - 2026-07-17

### Added

- Stable public ESM entry points for the package root, contracts, and declaration-only Extension API.
- Schema compatibility handling for legacy workspace version 1 and manual review of unknown future major versions.
- Explicit local extension administration with failure isolation; no automatic discovery, enablement, execution, or natural-language matching.
- A command registry and installed-package contract coverage for CLI, public types, schema, extension, and complete Skill-bundle behavior.

### Compatibility

- Existing `aiwiki.context.v1` and `aiwiki.context.capsule.v1` JSON contracts remain stable.
- Legacy workspaces remain readable without automatic migration or frontmatter rewrites.
- Internal deep imports remain unsupported through the package export map.

### Verified release evidence

- Annotated tag object: `v0.4.0` at `320d47c5c6116effb05bf1d88b5e706cef70a46c`.
- Tagged source commit: `be10c5bdbdb3125c32e64f386c066ad876f60f18`; its `package.json` declares `0.4.0`.
- npm artifact: `@itradingai/aiwiki@0.4.0`, SHA-1 `02898907202e31df3268bcc602ca11b33df6014f`, integrity `sha512-ZePAQNSI16UPafJvKmm9sSF3pt7VSFrjFOqSvE1pwMfXfDm+K/2nx+ANR/ehx52F5yHd/jA8mCLJIorZRVNTuQ==`.

## 0.3.0 registry history

Source Capsules, capsule-oriented human query output, explicit capsule context, and opt-in capsule/lifecycle/OKF checks were introduced in the 0.3.0 line. The version exists in the npm registry, but no verified repository tag mapping is asserted here; this section is historical context, not the current release.
