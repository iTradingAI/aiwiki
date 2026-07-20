# AIWiki Derived State v1

`<workspace>/.aiwiki/state/` is a rebuildable derived-state cache. It is not a source of truth: Markdown and frontmatter remain the only authoritative knowledge records.

## Files

One explicit rebuild writes these four JSON snapshots:

```text
.aiwiki/state/
  artifacts.json
  capsules.json
  relationships.json
  lifecycle.json
```

Their schemas are `aiwiki.state.artifacts.v1`, `aiwiki.state.capsules.v1`, `aiwiki.state.relationships.v1`, and `aiwiki.state.lifecycle.v1`.

Every file uses the same envelope:

```json
{
  "schema_version": "aiwiki.state.artifacts.v1",
  "snapshot_id": "sha256-derived-from-current-markdown",
  "generated_at": "2026-07-20T00:00:00.000Z",
  "root": ".",
  "summary": { "total": 0 },
  "data": []
}
```

`snapshot_id` is deterministic for the current Markdown-derived content and is shared by all four files. `generated_at` and diagnostic filesystem timestamps do not make an otherwise unchanged snapshot stale. State descriptors contain vault-relative paths and summaries, not Markdown bodies or absolute paths.

## Rebuild Modes

```bash
aiwiki rebuild --path <workspace> --json
aiwiki rebuild --check --json
aiwiki rebuild --dry-run --json
```

| Mode | Writes | Result | Exit code |
| --- | --- | --- | --- |
| default | four state files under `.aiwiki/state/` | `rebuilt` | 0 |
| `--check` | none | `current`, `missing`, `stale`, or `invalid` | 0 only for `current`; otherwise 1 |
| `--dry-run` | none | `would_rebuild` | 0 |

`--check` and `--dry-run` cannot be combined. The command does not modify Markdown, frontmatter, dashboards, runs, or user content.

## Consistency And Recovery

- Rebuild writes a same-directory exclusive temporary file and renames it into each final path. A failed or mixed group is reported as `invalid`; it is never silently treated as current.
- Default rebuild holds `<workspace>/.aiwiki/locks/rebuild.lock`. A lock conflict fails instead of deleting or replacing another process's lock.
- There is no automatic stale-lock deletion, `--force`, state repair, Markdown rewrite, or migration command.
- It is safe to delete `.aiwiki/state/` and run an explicit rebuild later. Context, capsule context, show, lint, and status continue to read Markdown when state is missing.

Ask an Agent to use rebuild only when the user explicitly asks to inspect or rebuild derived state. Normal query, context, show, lint, and status flows do not require a rebuild first.
