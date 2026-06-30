# AIWiki Release Notes

This document describes the release gate for maintainers.

AIWiki release work must prove the package locally, on the remote test server, through GitHub, and after npm publication.

## Local Checks

Start from a clean, intentional worktree:

```bash
git status --short --branch
npm test
npm run release:check
```

When package contents, docs, examples, or skill files changed, inspect:

```bash
npm pack --dry-run
```

The package should contain CLI runtime files, user documentation, examples, and packaged skill files only.

For the 0.3.0 Source Capsule release, the dry-run output must also confirm:

- `dist/src` contains the capsule runtime modules.
- public docs and `skill/` protocol files include Source Capsule guidance.
- internal 0.3.0 planning files are not packaged unless a later release decision explicitly changes that.
- `.omx`, `.npm-cache`, temporary smoke folders, and private planning artifacts are absent.

## Version

`package.json` is the version source. `aiwiki --version` reads it at runtime.

Patch bump by default:

```bash
npm version patch --no-git-tag-version
```

## Pre-delivery Remote Test

Before pushing to GitHub or publishing to npm, build the exact local tarball and test it on the remote server.

Standard order:

```text
local verification
  -> version bump
  -> local commit
  -> npm pack
  -> install local tarball on remote test server
  -> run task-specific CLI smoke
  -> GitHub push
  -> GitHub Actions publish workflow
  -> npm registry verification
  -> post-publish remote sanity
```

If the remote smoke fails, do not push and do not publish. Fix locally, rebuild, repack, and rerun the remote smoke.

0.3.0 smoke should exercise the new and compatible command surfaces from the exact packed tarball:

```bash
aiwiki show "<topic>" --path <workspace>
aiwiki show "<topic>" --json --path <workspace>
aiwiki query "<topic>" --path <workspace>
aiwiki query "<topic>" --view files --path <workspace>
aiwiki context "<topic>" --path <workspace>
aiwiki context "<topic>" --view capsule --path <workspace>
aiwiki lint --capsules --path <workspace>
aiwiki lint --lifecycle --path <workspace>
aiwiki lint --okf --path <workspace>
aiwiki status --path <workspace>
```

Expected stable contracts:

- default `context` remains `schema_version: "aiwiki.context.v1"`
- capsule context returns `schema_version: "aiwiki.context.capsule.v1"`
- default `query` is capsule-oriented
- `query --view files` remains available
- lint capsule modes run without turning legacy metadata absence into default lint noise

## Publishing

AIWiki uses npm Trusted Publishing. Publication should be done through GitHub Actions:

```bash
gh workflow run publish.yml --repo iTradingAI/aiwiki
gh run watch --repo iTradingAI/aiwiki
```

Check recent publish runs:

```bash
gh run list --workflow publish.yml --repo iTradingAI/aiwiki --limit 5
```

Verify the registry:

```bash
npm view @itradingai/aiwiki version
npm view @itradingai/aiwiki versions --json
```

If Trusted Publishing fails, verify the npm Trusted Publisher settings, repository name, workflow filename, and `id-token: write` permission.

## Package Images

The README uses GitHub raw URLs for public images so GitHub and npm can render them without bundling `docs/assets/` into the npm package.

If `npm pack --dry-run` includes unexpected assets or private planning files, fix `package.json.files` before publishing.
