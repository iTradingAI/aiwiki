# AIWiki Skill Upgrade Notes

Use this note when an Agent finishes `aiwiki agent sync`.

## Current Major Changes

- Agent integration should use `aiwiki agent sync --yes` for both first install and upgrades.
- Sync backs up changed installed skill files before overwriting them.
- `aiwiki agent check --json` and `aiwiki agent sync --json --yes` provide machine-readable status for Agents.
- `aiwiki context` supports `--type`, `--source-role`, `--wiki-type`, `--status`, and `--limit`.
- Context JSON includes `query_scope`, `result_quality`, `recommended_next_action`, `match_reasons`, `quality_signals`, and `related_refs`.
- Scaffold or grounding-review matches are traceable leads, not final confirmed knowledge.

## Agent Reply After Sync

Tell the user:

- which Agent targets were installed, current, updated, or unsupported
- where the new skill was written
- where the old skill was backed up, if any
- that the Agent may need a restart or reload
- that rollback is possible by copying the backup file back to the target path
