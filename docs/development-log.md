# AIWiki Development Log

This log records queue-driven AIWiki development milestones that should remain visible to future maintainers, not only in automation chat history.

## 2026-06-07 - Agent-first skill sync

Status: implemented, locally verified, pushed to GitHub, blocked on npm OTP before publication.

Version target: `@itradingai/aiwiki@0.2.18`

Commit: `e41d634` (`Make Agent skill upgrades safe to sync automatically`)

### Goal

Make AIWiki skill upgrades safe for Agent-first operation. The intended user path is that a host AI Agent can upgrade AIWiki, synchronize its local skill instructions, tell the user what changed, and preserve a rollback path without requiring the user to manually inspect Agent home directories.

The scoped acceptance criteria were:

- provide one idempotent command for first install and future upgrades;
- keep npm install side-effect free and avoid automatic writes to Agent home directories;
- detect missing, current, changed, and unsupported Agent targets;
- back up changed installed skill files before overwrite;
- support `--dry-run` and `--json` for Agent-driven preview and automation;
- improve CLI help, README, and Agent handoff docs for skill upgrade behavior;
- update the packaged AIWiki skill so Agents know how to use the new context/query/lint surfaces.

### Implemented

- `src/app.ts`
  - Added `aiwiki agent sync`.
  - Added `aiwiki agent sync --agent <id> --yes`.
  - Added `aiwiki agent sync --dry-run`.
  - Added `aiwiki agent sync --json --yes`.
  - Added `aiwiki agent check --json`.
  - Added command-specific help for `aiwiki agent help`, `aiwiki agent sync --help`, `aiwiki context --help`, and `aiwiki query --help`.
  - Added safe copy behavior that compares source and target files, no-ops when current, and writes timestamped backups before overwrite.
  - Updated next-action guidance from manual install toward `aiwiki agent sync --yes`.

- `skill/SKILL.md`
  - Added skill version marker `aiwiki-skill-version: 0.2.18`.
  - Added Agent-first setup and upgrade instructions.
  - Documented `agent sync`, `agent check`, `--dry-run`, `--json`, and backup/rollback behavior.
  - Expanded Agent guidance for filtered/explainable context JSON.

- `skill/QUERY_PROTOCOL.md` and `skill/LINT_PROTOCOL.md`
  - Documented filters, query scope, result quality, recommended next action, match reasons, quality signals, and lint/next handling for host Agents.

- `skill/UPGRADE_NOTES.md`
  - Added packaged notes that explain the current skill changes, expected Agent behavior after sync, and user-facing summary requirements.

- `README.md`, `docs/USAGE.md`, and `docs/AGENT_HANDOFF.md`
  - Added safe skill sync and upgrade instructions for first installs, long-gap upgrades, per-agent sync, JSON status checks, and rollback from backup.

- `tests/cli.test.ts`
  - Covered agent sync dry-run, install, JSON current state, changed-file backup, and overwrite behavior.
  - Covered new help text and `agent check --json`.

### Verification

- `npm test`: passed, 56 tests.
- `npm run release:check`: passed, including 56 tests and release-check.
- `npm pack --dry-run`: passed for `@itradingai/aiwiki@0.2.18`.
- Clean publish clone verification from `C:\Users\Max\AppData\Local\Temp\aiwiki-publish-dc800e0934564873853c9313d670122c`: `npm ci`, `npm run release:check`, and `npm pack --dry-run` passed.
- Isolated smoke test with temporary `CODEX_HOME` and `CLAUDE_HOME`: passed for first install, `agent check --json`, changed skill backup, overwrite, and current-state dry-run.

### Release State

GitHub push succeeded:

```text
ceec9a1..e41d634 main -> main
```

npm publication from a clean clone is blocked by a one-time password challenge:

```text
npm error code EOTP
npm error This operation requires a one-time password from your authenticator.
```

Current registry version remains `0.2.16`, so remote smoke tests for `0.2.18` have not run yet.

### Resume Steps

After npm OTP is available, publish from a clean committed tree or a fresh clean clone:

```powershell
npm publish --otp=<code>
npm view @itradingai/aiwiki version
```

After `npm view` returns `0.2.18`, run remote smoke tests for:

```bash
aiwiki agent sync --dry-run
aiwiki agent sync --json --yes
aiwiki agent check --json
aiwiki context --help
aiwiki query --help
```

Use a task-specific temporary Agent home and vault on the remote server. Do not write to real user Agent homes during remote verification.

### Notes For Future Changes

- Keep `agent sync` explicit. Do not add npm lifecycle hooks that write into `CODEX_HOME`, `CLAUDE_HOME`, or other Agent home directories.
- Preserve backup-before-overwrite behavior for any future Agent target.
- Keep `agent install` compatible, but prefer `agent sync` in user-facing guidance because it handles both first install and upgrade.
- Do not make the skill upgrade workflow depend on crawling, vector search, RAG-over-wiki, RBAC, RSS, scheduled collection, or browser plugins.
- Package publication should use a clean clone or clean committed tree because unrelated untracked files can otherwise be included by broad package `files` rules.

## 2026-06-05 - AIWIKI-004 lint workbench

Status: implemented, locally verified, pushed to GitHub, blocked on npm OTP before publication.

Version target: `@itradingai/aiwiki@0.2.16`

Commit: `932386c` (`Turn lint into an actionable maintenance workbench`)

### Goal

Turn `aiwiki lint` from a plain report writer into a practical structure-maintenance workbench for humans and host Agents.

The scoped acceptance criteria were:

- summarize lint output in the terminal with errors, warnings, info, top issue, and report path;
- group the markdown report by severity and provide a handling order;
- support `--severity error|warning|info`;
- support `--json` for machine-readable Agent use;
- support `--no-write` for temporary checks that do not update `dashboards/Lint Report.md`;
- add lightweight knowledge-gap signals where feasible;
- attach advisory review actions such as `enrich`, `fix_link`, `archive`, `reingest`, and `mark_reviewed`.

### Implemented

- `src/lint.ts`
  - Added `LintSeverity` and advisory `LintAction`.
  - Added issue `category` and `action` fields.
  - Added system-file checks for `_system/purpose.md`, `_system/index.md`, and `_system/log.md`.
  - Added signals for isolated Source Cards, stale deterministic fallback entries, grounding-review entries, metadata-boundary issues, duplicate URLs/titles, and broken wikilinks.
  - Added severity filtering, terminal summary rendering, and severity-grouped report rendering.

- `src/app.ts`
  - Added `aiwiki lint --severity error|warning|info`.
  - Added `aiwiki lint --json`.
  - Added `aiwiki lint --no-write`.
  - Kept the default behavior of writing `dashboards/Lint Report.md`.

- `tests/cli.test.ts` and `tests/ingest.test.ts`
  - Covered lint summary output, severity filtering, JSON output, no-write behavior, and updated lint issue text assertions.

- `docs/USAGE.md` and `docs/AGENT_HANDOFF.md`
  - Documented human and Agent-facing lint modes.

### Verification

- `npm test`: passed, 53 tests.
- `npm run release:check`: passed, including 53 tests and release-check.
- `npm pack --dry-run`: passed for `@itradingai/aiwiki@0.2.16`.
- Clean export pack from `C:/tmp/aiwiki-004-publish`: passed, 31 files, shasum `945c70d3d4cf20c9550deaaf92036786b75e62cf`.

### Release State

GitHub push succeeded:

```text
2e4b253..932386c main -> main
```

npm publication is blocked by a one-time password challenge:

```text
npm error code EOTP
npm error This operation requires a one-time password from your authenticator.
```

Current registry version remains `0.2.15`, so remote smoke tests for `0.2.16` have not run yet.

### Resume Steps

From the clean publish directory:

```powershell
cd C:\tmp\aiwiki-004-publish
npm publish --access public --otp=<code>
npm view @itradingai/aiwiki version
```

After `npm view` returns `0.2.16`, run remote smoke tests for:

```bash
aiwiki lint --path <tmp-vault>
aiwiki lint --severity warning --path <tmp-vault>
aiwiki lint --json --path <tmp-vault>
aiwiki lint --no-write --path <tmp-vault>
```

Then update the queue through `published`, `remote_verified`, and `done`.

### Notes For Future Changes

- Lint actions are advisory only. Do not make `archive`, `reingest`, `mark_reviewed`, or related actions mutate files without a separate explicit task.
- Keep lint local-file-only. Do not add crawling, vector search, RAG-over-wiki, RBAC, RSS, scheduled collection, or browser plugins under this queue item.
- The original working tree had unrelated `skill/SKILL.md` changes. Publication must use a clean commit export until that WIP is resolved.
