# AIWiki Skill Upgrade Notes

Use this note when an Agent finishes `aiwiki agent sync`.

## 1.0.2

- This safety hotfix rejects payloads larger than 10 MiB before any workspace write and stores new runs as `aiwiki.run.v2` manifests plus processing summaries.
- Before compacting legacy storage, run `aiwiki runs inspect --json`, review `aiwiki runs compact --dry-run --json`, and run `aiwiki runs compact --yes --json` only after approval. Existing workspaces remain readable and are never compacted automatically.

## 1.0.1

- This docs-only upgrade refreshes the Core 1.0 ROADMAP delivery state and synchronizes public version declarations to 1.0.1.
- CLI, MCP, API, schema, extension, and Pro behavior remain unchanged.

## 1.0.0

- Core 1.0 freezes the contract matrix and adds compatibility-matrix coverage through `npm run test:compat`.
- Before upgrading an existing workspace, follow the review-first [Migration Guide](../docs/schema/README.md#migration-guide); legacy `schema_version: 1` workspaces remain readable and are not rewritten automatically.
- The release also includes the complete security guide and a plugin signing proposal. The proposal does not enable signature verification.

## 0.8.1

- Corrected the verified 0.8.0 publication record and made the maintainer release instructions reusable across release gates.
- Added the missing upgrade notes for 0.8.0, 0.7.1, and 0.7.0.
- MCP `initialize` now reports the same package version as the CLI; MCP protocol and tools, CLI, API, schema, extension, and Pro behavior remain unchanged.

## 0.8.0

- Added read-only `aiwiki doctor --json`, `aiwiki status --json`, and `aiwiki next --json` readiness diagnostics with stable `aiwiki.doctor.v1`, `aiwiki.status.v1`, and `aiwiki.next.v1` contracts.
- The five reported first-use states are `repair_required`, `setup_required`, `first_ingest_required`, `review_required`, and `ready`.
- Diagnostics observe capabilities, lint state, metrics, and run history only; never execute suggested repair or setup actions automatically.

## 0.7.1

- Corrected MCP client configuration examples to use the `mcpServers` wrapper, `npx`, and absolute executable paths where required by the host.
- Added MCP quickstart coverage to the public README and usage guides.

## 0.7.0

- Added stable `aiwiki.public.v1` SDK exports for query, show, health, lifecycle, relationship, and graph-context operations.
- Added the zero-runtime-dependency MCP server and Agent Contract integration guidance.

## 0.6.0

- Added four packaged, runnable workflow packs for research, writing, decisions, and review / retrospective work, with public-trial scenarios as concrete starting points.
- Skill routing now directs explicit research, writing, decision, review, and retrospective requests through the matching workflow guidance.
- CLI behavior, JSON keys, schema identifiers, enum values, and matching precedence remain unchanged.

## 0.5.1

- The packaged Skill marker and public release guidance now agree on 0.5.1.
- Public documentation separates release history, maintainer release operations, and private vulnerability reporting.
- Command behavior, JSON keys, schema identifiers, enum values, and matching precedence remain unchanged.

## 0.5.0

- Added explicit, removable derived-state maintenance through `aiwiki rebuild --dry-run --json`, `--check`, and user-requested rebuild writes.
- Added explicit structured-index and relationship-graph status/build/rebuild intents. Never build or rebuild either from ordinary retrieval or generic maintenance requests.
- Added the opt-in graph-aware `aiwiki.context.v2` view. Default Agent context remains `aiwiki.context.v1`.
- Added read-only `aiwiki.health.v1` and `aiwiki.repair_plan.v1` outputs. `aiwiki.health --write --json` is a separate explicit report-generation path and must not modify knowledge Markdown or derived state.

## 0.4.0

- Added stable public package entry points for the package root, contracts, and the declaration-only Extension API.
- Added explicit local extension administration and failure isolation. Do not automatically discover, enable, execute, or match extensions from ordinary natural language.
- Legacy workspace `schema_version: 1` remains readable as `aiwiki.workspace.v1`; unknown future major versions require manual review and are never auto-migrated.
- Supported Skill hosts receive the full packaged `skill/` directory. Sync compares every regular bundle file, backs up changed installed files, and leaves unrelated target files untouched.

## 0.3.0 Historical Introduction

- Source Capsules, `aiwiki show`, capsule-oriented human `aiwiki query`, and `aiwiki context --view capsule` were introduced in the 0.3.0 line.
- `aiwiki query "<topic>" --view files` preserves the older file-level query output.
- Capsule-aware lint remains opt-in through `aiwiki lint --capsules`, `--lifecycle`, `--okf`, and `--strict`.
- Source Capsule metadata is additive; old workspaces do not require bulk migration.

## Current Sync Behavior

- Agent integration should use `aiwiki agent sync --yes` for both first install and upgrades.
- Supported Skill hosts receive the full packaged `skill/` directory, not only `SKILL.md`; `agent check` and `agent sync` report file-by-file bundle state.
- Sync backs up each changed installed bundle file before overwriting it, and does not delete unrelated files in the target Skill directory.
- `aiwiki setup --path <workspace> --yes` refreshes workspace `AGENTS.md` guidance during setup or repair.
- Use `aiwiki agent sync --path <workspace> --yes` only for manual workspace-guidance refresh without setup.
- `aiwiki agent check --json` and `aiwiki agent sync --json --yes` provide machine-readable status for Agents.
- Context JSON includes `query_scope`, `result_quality`, `recommended_next_action`, `match_reasons`, `quality_signals`, and `related_refs`.
- Scaffold or grounding-review matches are traceable leads, not final confirmed knowledge.

## Agent Reply After Sync

Tell the user:

- which Agent targets were installed, current, updated, or unsupported
- where the new skill was written
- where the old skill was backed up, if any
- that the Agent may need a restart or reload
- that rollback is possible by copying the backup file back to the target path
- that Claude Code uses the `docs/AGENT_HANDOFF.md` command prompt while Codex, QClaw, and OpenClaw use the full Skill bundle
