# AIWiki Skill Upgrade Notes

Use this note when an Agent finishes `aiwiki agent sync`.

## Current Major Changes

- Agent integration should use `aiwiki agent sync --yes` for both first install and upgrades.
- Supported Skill hosts receive the full packaged `skill/` directory, not only `SKILL.md`; `agent check` and `agent sync` report file-by-file bundle state.
- Sync backs up each changed installed bundle file before overwriting it, and does not delete unrelated files in the target Skill directory.
- `aiwiki setup --path <workspace> --yes` now refreshes workspace `AGENTS.md` guidance automatically during setup or repair.
- Use `aiwiki agent sync --path <workspace> --yes` only for manual workspace-guidance refresh without setup.
- `aiwiki agent check --json` and `aiwiki agent sync --json --yes` provide machine-readable status for Agents.
- `aiwiki context` supports `--type`, `--source-role`, `--wiki-type`, `--status`, and `--limit`.
- Context JSON includes `query_scope`, `result_quality`, `recommended_next_action`, `match_reasons`, `quality_signals`, and `related_refs`.
- Scaffold or grounding-review matches are traceable leads, not final confirmed knowledge.
- 0.3.0 adds Source Capsule commands: `aiwiki show`, default capsule `aiwiki query`, and `aiwiki context --view capsule`.
- `aiwiki query "<topic>" --view files` preserves the older file-level query output.
- Capsule-aware lint is opt-in through `aiwiki lint --capsules`, `--lifecycle`, `--okf`, and `--strict`.
- Source Capsule metadata is additive; old workspaces do not require bulk migration.

## Agent Reply After Sync

Tell the user:

- which Agent targets were installed, current, updated, or unsupported
- where the new skill was written
- where the old skill was backed up, if any
- that the Agent may need a restart or reload
- that rollback is possible by copying the backup file back to the target path
- that Claude Code uses the `docs/AGENT_HANDOFF.md` command prompt while Codex, QClaw, and OpenClaw use the full Skill bundle
