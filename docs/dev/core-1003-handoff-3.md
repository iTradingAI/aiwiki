# CORE-1003 task-3 handoff

## slice
`task-3-pro-fixture-advisory`; depends on the completed task-1 legacy-v1 compatibility fixture/matrix. This slice adds only the optional Pro trial fixture and its advisory-only compatibility subtest; it does not alter Core runtime code, schema, CLI behavior, release gates, or the blocking fresh/v1 matrix.

## changes
Added `tests/fixtures/workspaces/pro-trial/`: the minimal schema-v1 workspace skeleton (`aiwiki.yaml`, `02-raw/`, `03-sources/`, `05-wiki/`, `09-runs/`, `_system/`, and `dashboards/`) plus the local declaration at `extensions/pro-trial-quality/`. That declaration uses `aiwiki-extension.json` with `schema_version`/`api_version` `aiwiki.extension.v1` and an `index.mjs` `defineExtension` stub imported from `@itradingai/aiwiki/extension-api`; it does not invent a PluginAPI or imperative activation API. Appended only `Pro fixture validation` to `tests/contracts/cli-compatibility.test.ts`: it is skipped unless `AIWIKI_RUN_PRO_TESTS=1`, runs only `status --json`, `plugin list --json`, and `plugin doctor --json`, asserts exit-0/JSON/whole-workspace immutability on success, and catches failures to emit `[ADVISORY]` without failing the test.

## verification
Exit 0: `npm run build`; `node --test dist/tests/contracts/cli-compatibility.test.js` reported 4 pass, 1 skipped (`Pro fixture validation`); `env AIWIKI_RUN_PRO_TESTS=1 node --test dist/tests/contracts/cli-compatibility.test.js` reported 5 pass, 0 skipped; `npm run test:compat` reported 9 pass, 1 skipped. A deliberate temporary removal of the Pro raw-article frontmatter produced `[ADVISORY] Pro fixture validation failed: AssertionError ... expected frontmatter ...` while the enabled test still exited 0; the source fixture was restored and the enabled targeted test then passed.

## reviews
No Critical change review or security review has been run for this slice yet. No review conclusion is claimed; the integration owner must record the assigned agent/job, conclusion, and adopted remediation here before merge.

## evidence
No new artifact was written under `.omx/evidence/core-1003/` by this owned-file slice. The verification commands and their outputs are recorded above; no SHA-256 or Linux exact-tarball evidence was collected because those are final integration-gate work. The local forced-failure run supplied the Pro advisory evidence, and the restored-fixture enabled run supplied the success evidence.

## rollback
Before this slice, `tests/fixtures/workspaces/pro-trial/` and `docs/dev/core-1003-handoff-3.md` did not exist and `cli-compatibility.test.ts` ended with the legacy v1 path loop. Remove that fixture directory and handoff file, then remove only the appended `Pro fixture validation` block. Remaining risk: the local declaration is intentionally not auto-registered because the host requires explicit `plugin add`; this test validates its declaration shape and the workspace read-only/advisory boundary, not local-extension registration or execution.
