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
