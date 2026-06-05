# AIWiki Development Log

This log records queue-driven AIWiki development milestones that should remain visible to future maintainers, not only in automation chat history.

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
