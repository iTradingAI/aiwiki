# AIWiki Release Guide

This guide defines the delivery and release gates for AIWiki maintainers.

## Branch and Pull Request Gates

- `main` is the public, protected branch. Direct pushes, force pushes, and branch deletion are prohibited.
- `dev` is the Core integration branch. Start ordinary Core work from `dev`; use a `task/<id>-<slug>` branch when isolation is needed.
- Ordinary Core tasks merge by pull request into `dev` only after branch CI and the task's remote tarball smoke test pass.
- Only named Core release gates open a `dev` -> `main` pull request: `CORE-0408` (`0.4.0`), `CORE-0506` (`0.5.0`), `CORE-0601` (`0.6.0`), `CORE-0700` (`0.7.0`), and `CORE-1000` (`1.0.0`).
- The control-plane task `CORE-0000` is the one-time exception that establishes this baseline with a `dev` -> `main` pull request. It must not create a version, tag, or npm publication.
- A `main` pull request requires the uniquely named `CI / verify` check from `.github/workflows/ci.yml`, resolved conversations, and a completed Codex technical review record. CI runs on the source branch and the proposed pull request merge result. The repository maintainer merges only after those gates are satisfied.
- Core 0.5 Release Gate uses two PRs: `task -> dev` prepares the version and proves the exact task artifact; only the verified `dev -> main` PR can enter the public branch. After that merge, the `main` push CI and an exact main tarball remote smoke must pass before the tag is created.

## Technical Review Agent

Before merging a Core PR, run the dedicated AIWiki PR review agent in a read-only worktree against the exact PR head. After all blocking findings are resolved, record its conclusion with `gh pr review --comment` using the repository maintainer identity. The report must cover CI, branch protection, publication OIDC permissions, release tags, and English/Chinese documentation consistency.

The local agent's conclusion is technical review evidence only. It must not edit, push, merge, or publish. Its `COMMENT` review is recorded under the maintainer identity and is not a GitHub `APPROVED` review. This repository deliberately uses maintainer merge after PR, CI, resolved-conversation, and technical-review gates; it does not require a second GitHub identity for each release PR.

## Local Checks

Start from a clean, intentional worktree:

```bash
git status --short --branch
npm run test:contracts
npm test
npm run release:check
npm pack --dry-run --json --ignore-scripts
```

When package contents, docs, examples, or skill files changed, inspect:

```bash
npm pack --dry-run
```

The package should contain CLI runtime files, user documentation, examples, and packaged skill files only.

## Core 0.5 Release Gate

CORE-0506 accepts Core 0.5 only when the package manifest, installed consumer, Health Report behavior, and bilingual documentation agree. `release-gate.test.ts` and `npm run release:check` require the CLI, Public API, Extension API, Schema, extension failure isolation, complete Skill bundle, and explicit `aiwiki health --write --json` report contract to be present in the package. The report must emit `aiwiki.health_report.v1` with metrics, refresh only the marker-bounded section of `dashboards/Knowledge Health.md`, and write an immutable JSON run record under `09-runs/` without modifying knowledge Markdown or derived state. The manifest must include the public runtime entries, release and Agent handoff guides in both languages, schema guides, examples, and every regular `skill/**` file. It must exclude `docs/assets/`, `.omx/`, `.npm-cache/`, `Plan/`, `node_modules/`, tests, and temporary smoke artifacts.

CORE-0506 does not add Pro behavior, entitlement, automatic extension discovery, automatic enablement, automatic execution, schedules, or watchers.

## Public API Package Contract

Core supports `@itradingai/aiwiki`, `@itradingai/aiwiki/contracts`, and `@itradingai/aiwiki/extension-api` as integration imports. `AIWIKI_PUBLIC_API_VERSION` remains `aiwiki.public.v1`, while `AIWIKI_EXTENSION_API_VERSION` is `aiwiki.extension.v1`. Internal paths under `@itradingai/aiwiki/src/**` and `@itradingai/aiwiki/dist/src/**` must remain absent from the export map.

When an exports entry, public type, or public API version changes, the task must update the packed-tarball consumer contract test and both language versions of the public documentation. The exact tarball smoke must prove all of the following before the PR is opened:

- root, `/contracts`, and `/extension-api` ESM imports work from an installed package;
- generated public `.d.ts` files are present and compile for an external TypeScript consumer;
- internal deep imports fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`; and
- the CLI bin and `createAiwikiCli().run()` preserve the required command behavior.

Ordinary Core tasks still do not bump the package version, create tags, or publish npm packages. CORE-0404 defines and verifies the public Extension API path; it adds no Extension Host, plugin CLI, or automatic Skill match.

## Schema Compatibility Gate

CORE-0403 keeps `aiwiki.context.v1` and `aiwiki.context.capsule.v1` stable, reads legacy workspace `schema_version: 1` as `aiwiki.workspace.v1`, and provides only an internal read-only migration plan. The task must prove that legacy config and unknown additive frontmatter are not rewritten, and that a future major becomes a manual-review result.

The packed tarball must include `docs/schema/`. CORE-0403 added no Schema CLI; CORE-0404 adds the declaration-only Extension API, and CORE-0407 owns future Skill matching behavior.

## Contract Test Matrix

CORE-0406 establishes this reusable Core contract suite. Run it with `npm run test:contracts`. It runs only the compiled tests under `tests/contracts/`; `npm test` remains the full repository suite. The matrix protects these stable boundaries:

- `public-api.test.ts`: installed-package public imports, declarations, and blocked deep imports.
- `cli-compatibility.test.ts`: installed-package CLI version, Core commands, context schema versions, and explicit plugin administration only.
- `skill-matching.test.ts`: installed-package full Skill-bundle sync, workspace guidance, command-first prompts, and explicit extension intent.
- `extension-api.test.ts`: the declaration-only extension author API and its package boundary.
- `schema-compatibility.test.ts`: legacy schema readability, read-only migration planning, future-major manual review, and stable context schemas.
- `extension-failure-isolation.test.ts`: manifest containment, explicit enablement, command ownership, and failed-extension isolation.
- `release-gate.test.ts`: Core 0.5 package version/lockfile, JSON pack manifest, Health Report metrics contract, bilingual release path, and public delivery boundary.

Extensions and future Pro integrations may depend only on the documented public package entries and explicit Core CLI surfaces above. This matrix locks full packaged Skill matching and forbids automatic extension discovery, enablement, and execution; it adds no Pro behavior. A real rebuildability contract requires the later rebuildable state model and is deferred to `CORE-0501`; do not claim that coverage before then.

## Version and Tags

`package.json` is the version source. `aiwiki --version` reads it at runtime.

Do not bump a version for ordinary Core tasks. At a named release gate, prepare the version on the isolated task branch before its `task -> dev` PR. The verified dev merge then becomes the source of the `dev -> main` pull request:

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
  -> push task branch
  -> branch CI / verify
  -> publish dry-run on the exact task branch
  -> npm pack with a recorded SHA-256
  -> install the exact tarball on the remote test server
  -> run Core 0.5 CLI, API, extension, Schema, Skill bundle, Health Report, and failure-isolation smoke
  -> task pull request -> dev
  -> dev merge CI / verify and a freshly packed exact dev tarball remote smoke
  -> release-gate pull request dev -> main
  -> CI / verify on the proposed merge result and completed technical review
  -> merge main
  -> main push CI and a freshly packed exact main tarball remote smoke
  -> tag
  -> publish workflow
  -> npm registry verification
  -> post-publish remote sanity
```

If the remote smoke fails, do not open or merge the relevant pull request. Fix locally, rebuild, repack, and rerun the remote smoke.

The Core 0.5 exact-tarball smoke must install the SHA-256-verified package in a task-specific temporary consumer and exercise:

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
aiwiki health --json --path <workspace>
aiwiki health --write --json --path <workspace>
aiwiki repair --plan --json --path <workspace>
aiwiki agent sync --path <workspace> --yes --json
aiwiki agent sync --agent codex --yes --json
aiwiki agent check --agent codex --json
aiwiki plugin list --json --path <workspace>
```

The remote consumer must also import `@itradingai/aiwiki`, `/contracts`, and `/extension-api`, reject an internal deep import with `ERR_PACKAGE_PATH_NOT_EXPORTED`, compare every installed Skill file with the Codex target bundle, prove that a failing extension is disabled while Core `status` still works, and verify that `aiwiki.health_report.v1` contains metrics plus dashboard and run paths while leaving knowledge Markdown and derived state unchanged.

Expected stable contracts:

- Default `context` remains `schema_version: "aiwiki.context.v1"`.
- Capsule context returns `schema_version: "aiwiki.context.capsule.v1"`.
- Default `query` is capsule-oriented.
- `query --view files` remains available.
- Capsule lint modes run without turning legacy metadata absence into default lint noise.

## Publishing

AIWiki uses npm Trusted Publishing. The workflow defaults to verification-only mode. Run it first from the exact task branch, then again from the dev merge selected for the release PR:

```bash
gh workflow run publish.yml --repo iTradingAI/aiwiki --ref task/CORE-0506-knowledge-health-release -f mode=dry-run
gh run watch --repo iTradingAI/aiwiki
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

Then create a new remote temporary consumer that installs only `@itradingai/aiwiki@0.5.0` from the registry and reruns the CLI, public import, schema-document, Skill bundle, and Health Report sanity checks. Do not announce the release before this registry sanity passes.

If Trusted Publishing fails, verify the npm Trusted Publisher settings, repository name, workflow filename, and `id-token: write` permission.

`id-token: write` is granted only to the `Publish @itradingai/aiwiki` job. The `Publish / verify` dry-run job has read-only repository permission and cannot receive npm Trusted Publishing credentials.

## Package Images

The README uses GitHub raw URLs for public images so GitHub and npm can render them without bundling `docs/assets/` into the npm package.

If `npm pack --dry-run` includes unexpected assets or private planning files, fix `package.json.files` before publishing.
