# AIWiki Skill Upgrade Notes

Use this note when an Agent finishes `aiwiki agent sync`.

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
