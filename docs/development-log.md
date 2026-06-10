# AIWiki Development Log

This log records queue-driven AIWiki development milestones that should remain visible to future maintainers, not only in automation chat history.

## 2026-06-11 - Public trial path and feedback loop

Status: implemented and locally verified. Pre-delivery remote tarball smoke, GitHub push, Trusted Publishing, registry verification, and post-publish remote sanity are required before queue completion.

Version target: `@itradingai/aiwiki@0.2.22`

### Goal

Make the public trial path concrete enough that a first-time user can complete one useful AIWiki loop without learning the whole product first.

The scoped acceptance criteria were:

- show a 10-minute path from setup to first ingest to query/context reuse;
- explain what a successful first run should generate;
- cover installation, first ingest, doctor/lint, query/context, and feedback questions in public docs;
- give host Agents a small first-use handoff path;
- provide a minimal feedback template without adding a CLI command;
- keep the base product boundary: no crawler, WeChat reader, vector search, RAG-over-wiki, RBAC, RSS, scheduled collection, browser plugin, Pro-only command, or multi-KB workflow.

### Implemented

- Added an explicit 10-minute public trial path to the README, usage guide, and showcase.
- Added first-run success checks for the run folder, Source Card, Wiki Entry, query/context match, and structured lint output.
- Added `docs/TRIAL_FEEDBACK_TEMPLATE.md` for lightweight public-trial feedback.
- Updated FAQ coverage for first trial, doctor/lint, query/context, and feedback.
- Updated Agent handoff and packaged skill guidance so host Agents guide first-time users through one small loop before broad exploration.
- Included the trial feedback template in the npm package file list.

### Verification

- `npm test`: passed, 61 tests.
- `npm run release:check`: passed for `@itradingai/aiwiki@0.2.22`, including tests and `scripts/release-check.mjs`.
- `npm pack --dry-run`: passed for `@itradingai/aiwiki@0.2.22`, 90 files, package size approximately 105 kB. Exact tarball shasum is recorded in the queue evidence instead of this packaged log file to avoid a self-referential hash.
- Pack inspection confirmed `docs/TRIAL_FEEDBACK_TEMPLATE.md` is included and `docs/assets/` images are still excluded from the npm tarball.

## 2026-06-10 - README and documentation positioning rewrite

Status: implemented and locally verified. Not pushed, published, or remote-server verified in this documentation-only pass.

Version target: no version bump in this pass.

### Goal

Rebuild the public AIWiki documentation around a clearer user-facing position:

- English README is the primary GitHub/npm entry.
- Chinese documentation is split into dedicated `zh-CN` files.
- The first-screen message is "AIWiki is a local Markdown knowledge base for AI assistants."
- The main Quick Start asks users to let an AI assistant install and configure AIWiki.
- Agent sync remains explicit through `aiwiki agent sync` and `aiwiki agent check`; npm install alone does not silently modify host assistant configuration.
- The older split story of "manual install" followed by a separate host-Agent connection step is removed from the main README path.
- Community QR codes remain visible in the README through raw GitHub asset links.

### Implemented

- Rewrote `README.md` as the English public README with hero image, language/docs/npm links, Quick Start assistant prompt, first-use workflow, boundaries, community, and documentation links.
- Added `README.zh-CN.md` as the Chinese public README.
- Rewrote English docs: `docs/README.md`, `docs/USAGE.md`, `docs/FAQ.md`, `docs/AGENT_HANDOFF.md`, `docs/SHOWCASE.md`, `docs/ROADMAP.md`, and `docs/RELEASE.md`.
- Added matching Chinese docs: `docs/README.zh-CN.md`, `docs/USAGE.zh-CN.md`, `docs/FAQ.zh-CN.md`, `docs/AGENT_HANDOFF.zh-CN.md`, `docs/SHOWCASE.zh-CN.md`, `docs/ROADMAP.zh-CN.md`, and `docs/RELEASE.zh-CN.md`.
- Updated `package.json` description and package file list so the bilingual documentation is included in the npm tarball.
- Updated `skill/SKILL.md` to use the same product positioning while preserving the command-first AIWiki workflow.
- Updated CLI tests so bundled Claude handoff installation is verified against the new English `docs/AGENT_HANDOFF.md` contract.

### Verification

- `npm test`: passed, 61 tests.
- `npm run release:check`: passed, including tests and `scripts/release-check.mjs`.
- `npm pack --dry-run`: passed for `@itradingai/aiwiki@0.2.21`, 89 files, package size 100.0 kB, shasum `6973ed940edf8f4620b7a3e578ddf3ececa01f45`.
- Public English docs scan: no Chinese characters found in `README.md`, the English docs, or `package.json`.
- Deprecated onboarding scan: no `Manual Install`, old `npx ... setup` path, old "second step host Agent" wording, or old first-screen positioning found in the rewritten public docs.

### Follow-up Optimization

- Added npm, Node.js, and license badges to the public README files.
- Added Node.js >=20 checks to the assistant-install prompts.
- Added concrete knowledge base path examples for Windows, macOS/Linux, and project-local testing.
- Added "expected result" sections so users know what a successful install should report.
- Added practical scenario sections to make the README more readable for first-time users.
- Added FAQ entries for Node.js version-related installation failures.

## 2026-06-08 - Base contract cleanup and safe optional directory pruning

Status: implemented and locally verified, committed locally, blocked before GitHub push and npm publication. Test-server verification is now required before both GitHub push and npm publication.

Version target: `@itradingai/aiwiki@0.2.19`

Commit: `3ae25b9` (`Stabilize AIWiki base contract before public-trial work`)

### Goal

Make the base AIWiki experience quieter and more reliable before public-trial work. A new workspace should show the core knowledge workflow first, not a set of empty enhancement directories or legacy command paths. Agents should also have a safe, machine-readable way to detect and remove only empty optional directories.

The scoped acceptance criteria were:

- keep the main help and quick-start path focused on setup, Agent sync/check, ingest, context/query, lint, status, and doctor;
- preserve legacy command behavior without presenting legacy commands as the primary path;
- create only core directories by default in new workspaces;
- create optional long-term directories only when ingest actually writes related outputs;
- treat missing optional directories as normal in doctor and directory summaries;
- report empty optional directories as safe-fix lint issues with stable JSON metadata;
- make `lint --fix-empty-dirs --json` delete only known empty optional directories and empty known optional parent directories;
- keep the base CLI out of crawling, vector search, RAG-over-wiki, RBAC, RSS, scheduled collection, and browser-plugin scope.

### Implemented

- `src/workspace.ts`
  - Split core directories from optional enhancement directories.
  - Made setup/init/doctor summaries core-first.
  - Kept optional directories valid when they already exist, but stopped requiring them for a healthy workspace.

- `src/payload.ts`, `src/ingest.ts`, and `src/wiki-entry.ts`
  - Preserved `request.outputs` as an additive request instead of normalizing every ingest into all optional artifacts.
  - Kept core ingest artifacts stable: Source Card, Wiki Entry, and Processing Summary.
  - Created claims, assets, topics, and outline files only when payload content or explicit outputs require them.
  - Omitted optional frontmatter links when the corresponding files are not written.

- `src/lint.ts` and `src/app.ts`
  - Added safe-fix metadata for empty known optional directories.
  - Added `safe_fixes.available`, `safe_fixes.applied`, and `safe_fixes.only_safe_fixes` to JSON output.
  - Added `aiwiki lint --fix-empty-dirs --json`.
  - Kept deletion deliberately narrow: known optional empty directories only, never core directories, unknown directories, non-empty directories, or files.
  - Reduced main help to the core user path while preserving existing command behavior.

- Documentation and packaged skill files
  - Updated README, usage docs, FAQ, Agent handoff, lint protocol, and skill instructions for the core-first workflow.
  - Documented the Agent flow: run `aiwiki lint --json`, apply safe fixes only when allowed, rerun lint, and report the changed directories.
  - Tightened package file inclusion so unrelated untracked docs are not accidentally packed.

- Tests
  - Updated workspace tests for the smaller default directory contract.
  - Added ingest coverage for minimal output behavior.
  - Added CLI coverage for `lint --fix-empty-dirs --json` and help/setup guidance.

### Verification

- `npm test`: passed, 59 tests.
- `npm run release:check`: passed, including tests and `scripts/release-check.mjs`.
- `npm pack --dry-run`: passed for `@itradingai/aiwiki@0.2.19`, 35 files, package size 77.1 kB, shasum `3f436503bb0dc3019b188941f06f3c518bbecc0b`.
- Verification used `D:/Program Files/nodejs/npm.cmd` with a repo-local npm cache because the PowerShell `npm` shim points to a missing `C:/Users/Max/AppData/Roaming/npm/npm-cli.js`.

### Release State

The implementation is committed locally, but the GitHub push failed before publication:

```text
Warning: Identity file C:/Users/Max/.ssh/id_ed25519 not accessible: Permission denied.
git@github.com: Permission denied (publickey).
fatal: Could not read from remote repository.
```

Because GitHub push failed, npm publication was not attempted. The task queue and human board are marked `blocked`, and the Enterprise WeChat blocked notification was delivered successfully with HTTP 200 / `errcode:0`.

### Testing Server Gate

Test-server verification must run before updating GitHub or npm.

The release gate for `0.2.19` is now a pre-GitHub and pre-npm tarball smoke test: create the exact local npm tarball that would be published, copy that `.tgz` to a task-specific directory on `170.106.73.197`, install it into a task-local Node project, and run the same smoke commands against that installed package. This proves the package artifact before it reaches GitHub or npm.

The older published-package smoke test remains useful after npm publication as a final registry sanity check, but it is no longer allowed to be the first remote test. Pushing to GitHub or publishing to npm before test-server verification would make a public delivery surface the first real deployment surface, which is the wrong order for this queue.

Required prepublication smoke commands:

```bash
aiwiki setup --path <tmp-vault> --yes
aiwiki doctor --path <tmp-vault>
inspect that only core directories are created by default
aiwiki ingest-agent --payload <minimal-fixture> --path <tmp-vault>
inspect that optional output directories remain absent unless needed
aiwiki lint --json --path <tmp-vault>
aiwiki lint --fix-empty-dirs --json --path <tmp-vault>
aiwiki context <topic> --path <tmp-vault>
aiwiki query <topic> --path <tmp-vault>
```

The smoke test must use only a task-specific temporary directory on the remote server. Do not install globally, do not reuse a real user vault, and do not clean outside the task directory.

### Resume Steps

Remote tarball smoke must pass first. Only after that, restore SSH key access for the current runtime user or configure GitHub authentication so this succeeds:

```powershell
git push origin main
```

Then continue the release chain:

```powershell
npm publish --access public
npm view @itradingai/aiwiki version
```

After `npm view` returns `0.2.19`, a short published-package registry sanity check can be run, but the blocking test-server gate must already have passed before both GitHub push and npm publish.

### Notes For Future Changes

- Keep optional directories optional. Do not reintroduce required empty claims/assets/topics/outlines directories in new workspaces.
- Keep safe fixes narrow and auditable. Do not let `--fix-empty-dirs` delete files, core directories, unknown directories, or non-empty directories.
- Keep main help focused on the core path. Legacy commands can remain compatible without being promoted as first-run guidance.
- Test-server verification from the local npm tarball must happen before GitHub push and before npm publication. Local pack verification alone is not enough to update GitHub or npm.

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
