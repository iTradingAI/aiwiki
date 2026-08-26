# CORE-1001 Slice 3 Handoff

## Scope

- Contract tests and schema documentation for the declaration-only Extension API v0.1 boundary.
- No `src/` runtime code changes.

## Contract decision

- `aiwiki.extension.v1` remains the compatibility marker.
- Author-facing types, interfaces, and documentation are stable, while Core 1.0 does not implement production invocation of `contextProviders` or `artifactGenerators`.
- Reconsider production invocation only after the Pro track is restored.
- Plugin signing is a proposal requirement transferred to the follow-up Core documentation and migration task; this slice implements no signing behavior.

## Verification evidence

`tests/contracts/extension-api.test.ts` creates an enabled local extension fixture with command, lint rule, context provider, and artifact generator callbacks. The fixture persists callback counters in `callback-counts.json`.

The test executes these Core host paths in order:

1. `plugin inspect`
2. `plugin doctor`
3. Explicit command dispatch
4. `lint --json`

After every path, it asserts that `provider === 0` and `generator === 0`. The command and lint counters advance only on their respective supported paths, establishing that no production runtime call reaches the declaration-only callbacks.
