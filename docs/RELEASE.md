# AIWiki Release Guide

This guide defines the delivery and release gates for AIWiki maintainers.

## Branch and Pull Request Gates

- `main` is the public, protected branch. Direct pushes, force pushes, and branch deletion are prohibited.
- `dev` is the Core integration branch. Start ordinary Core work from `dev`; use a `task/<id>-<slug>` branch when isolation is needed.
- Ordinary Core tasks merge by pull request into `dev` only after branch CI and the task's remote tarball smoke test pass.
- Only named Core release gates open a `dev` -> `main` pull request: `CORE-0408` (`0.4.0`), `CORE-0506` (`0.5.0`), `CORE-0601` (`0.6.0`), `CORE-0700` (`0.7.0`), and `CORE-1000` (`1.0.0`).
- The control-plane task `CORE-0000` is the one-time exception that establishes this baseline with a `dev` -> `main` pull request. It must not create a version, tag, or npm publication.
- A `main` pull request requires the uniquely named `CI / verify` check from `.github/workflows/ci.yml`, resolved conversations, and one approving review. CI runs on the source branch and the proposed pull request merge result.

## Technical Review Agent

Before requesting the GitHub approval for a Core PR, run the dedicated AIWiki PR review agent in a read-only worktree. Its report must cover CI, branch protection, publication OIDC permissions, release tags, and English/Chinese documentation consistency.

The agent's conclusion is technical review evidence only. It must not edit, push, merge, publish, or submit a GitHub review. A Codex agent using the same GitHub identity as the PR author cannot satisfy the independent GitHub approval requirement.

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
- Public docs and `skill/` protocol files include Source Capsule guidance.
- Internal planning files are not packaged unless a later release decision explicitly changes that.
- `.omx`, `.npm-cache`, temporary smoke folders, and private planning artifacts are absent.

## Version and Tags

`package.json` is the version source. `aiwiki --version` reads it at runtime.

Do not bump a version for ordinary Core tasks. At a named release gate, update the planned milestone version while preparing the `dev` -> `main` pull request:

```bash
npm version minor --no-git-tag-version
```

After the release-gate pull request has been merged into `main`, create and push the corresponding tag from that exact `main` commit:

```bash
git switch main
git pull --ff-only origin main
git tag -a v<version> -m "AIWiki <version>"
git push origin v<version>
```

Do not tag, publish, or announce a version before the `main` pull request is merged.

## Pre-delivery Remote Test

Before an ordinary task pull request, and before opening a release-gate pull request, build the exact local tarball and test it on the remote test server.

Standard order:

```text
local verification
  -> push dev or task branch
  -> branch CI / verify
  -> npm pack
  -> install the exact tarball on the remote test server
  -> run task-specific CLI smoke
  -> task pull request -> dev
  -> dev CI / verify
  -> release-gate pull request dev -> main
  -> CI / verify on the proposed merge result and review approval
  -> merge main
  -> tag
  -> publish workflow
  -> npm registry verification
  -> post-publish remote sanity
```

If the remote smoke fails, do not open or merge the relevant pull request. Fix locally, rebuild, repack, and rerun the remote smoke.

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

- Default `context` remains `schema_version: "aiwiki.context.v1"`.
- Capsule context returns `schema_version: "aiwiki.context.capsule.v1"`.
- Default `query` is capsule-oriented.
- `query --view files` remains available.
- Capsule lint modes run without turning legacy metadata absence into default lint noise.

## Publishing

AIWiki uses npm Trusted Publishing. The workflow defaults to verification-only mode:

```bash
gh workflow run publish.yml --repo iTradingAI/aiwiki --ref dev -f mode=dry-run
gh run watch --repo iTradingAI/aiwiki
```

The workflow denies `mode=publish` outside `main`. For a real publication, it also verifies that `v<package-version>` points at the exact `main` commit selected by the workflow. A release-gate pull request must therefore be merged and tagged first:

```bash
gh workflow run publish.yml --repo iTradingAI/aiwiki --ref main -f mode=publish
gh run watch --repo iTradingAI/aiwiki
```

Verify the registry after a successful publish:

```bash
npm view @itradingai/aiwiki version
npm view @itradingai/aiwiki versions --json
```

If Trusted Publishing fails, verify the npm Trusted Publisher settings, repository name, workflow filename, and `id-token: write` permission.

`id-token: write` is granted only to the `Publish @itradingai/aiwiki` job. The `Publish / verify` dry-run job has read-only repository permission and cannot receive npm Trusted Publishing credentials.

## Package Images

The README uses GitHub raw URLs for public images so GitHub and npm can render them without bundling `docs/assets/` into the npm package.

If `npm pack --dry-run` includes unexpected assets or private planning files, fix `package.json.files` before publishing.
