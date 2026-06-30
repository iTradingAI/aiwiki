# AIWiki 0.3.0 Release Smoke Runbook

This runbook is the release and remote-verification gate for AIWiki 0.3.0.

It is intentionally separate from the implementation plan because GitHub update and npm release readiness depend on the exact package artifact, not only source-tree tests.

## Blocking Rule

Do not update GitHub for the 0.3.0 release until:

1. Local validation passes.
2. `npm pack --dry-run --json` has been inspected.
3. The exact packed tarball passes local clean-install smoke.
4. The same tarball passes remote clean-install smoke.

## Local Validation

Run from the repository root:

```bash
npm run build
npm test
npm run release:check
npm pack --dry-run --json
```

The dry-run output must be reviewed for:

- `package.json` version is `0.3.0`.
- `dist/src` runtime files are included.
- Public docs and `skill` files are included.
- Internal 0.3.0 planning docs are not included by default.
- Unexpected assets, temp files, `.omx`, `.npm-cache`, or private planning files are absent.

## Exact Local Tarball Smoke

Create the actual tarball:

```bash
npm pack --json
```

Record the tarball filename and shasum from the output.

Then run a clean install smoke from a sibling temp directory:

```bash
mkdir ../aiwiki-v030-pack-smoke
cd ../aiwiki-v030-pack-smoke
npm init -y
npm install ../aiwiki/itradingai-aiwiki-0.3.0.tgz
npx aiwiki --version
npx aiwiki init --path ./vault --yes
npx aiwiki ingest-agent --payload ../aiwiki/tests/fixtures/agent_payload.analysis.grounded.json --path ./vault
npx aiwiki show "Grounded Notes" --path ./vault
npx aiwiki show --artifact-path 05-wiki/source-knowledge/grounded-notes.md --path ./vault
npx aiwiki show "Grounded Notes" --json --path ./vault
npx aiwiki query "Grounded Notes" --path ./vault
npx aiwiki query "Grounded Notes" --view files --path ./vault
npx aiwiki context "Grounded Notes" --path ./vault
npx aiwiki context "Grounded Notes" --view capsule --path ./vault
npx aiwiki lint --path ./vault
npx aiwiki lint --capsules --path ./vault
npx aiwiki lint --lifecycle --path ./vault
npx aiwiki lint --okf --path ./vault
npx aiwiki status --path ./vault
```

Expected:

- Version command prints `0.3.0`.
- Ingest succeeds.
- `show --artifact-path` resolves by artifact path while `--path` continues to mean workspace path.
- `show --json` is parseable JSON.
- Default `context` is `aiwiki.context.v1`.
- Capsule context is `aiwiki.context.capsule.v1`.
- `query --view files` remains available.
- Lint commands run without crashing.
- Status includes capsule metrics.

## Remote Host Assumption

Current remembered remote smoke host for AIWiki base release work is:

```text
170.106.73.197
```

This must be re-verified before execution because the context snapshot still marks the exact remote command and access path as unknown.

If the SSH target, user, port, or deployment path differs, update this runbook with the observed command before claiming remote smoke is complete.

## Remote Smoke Script Requirements

Use an LF-only script.

Do not write assertions against guessed output text. First inspect actual CLI output from the packaged artifact, then assert only stable contracts:

- exit code
- version
- JSON schema fields
- required generated files
- presence of capsule metrics

Suggested remote script shape:

```bash
set -euo pipefail

TARBALL="$1"
WORKDIR="$(mktemp -d /tmp/aiwiki-v030-smoke-XXXXXX)"
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

cd "$WORKDIR"
npm init -y >/dev/null
npm install "$TARBALL"
npx aiwiki --version
npx aiwiki init --path ./vault --yes
npx aiwiki ingest-agent --payload ./agent_payload.analysis.grounded.json --path ./vault
npx aiwiki show "Grounded Notes" --path ./vault
npx aiwiki show --artifact-path 05-wiki/source-knowledge/grounded-notes.md --path ./vault
npx aiwiki show "Grounded Notes" --json --path ./vault > show.json
npx aiwiki query "Grounded Notes" --path ./vault
npx aiwiki query "Grounded Notes" --view files --path ./vault
npx aiwiki context "Grounded Notes" --path ./vault > context-v1.json
npx aiwiki context "Grounded Notes" --view capsule --path ./vault > context-capsule.json
npx aiwiki lint --path ./vault
npx aiwiki lint --capsules --path ./vault
npx aiwiki lint --lifecycle --path ./vault
npx aiwiki lint --okf --path ./vault
npx aiwiki status --path ./vault
node -e "const f=require('fs'); const v=JSON.parse(f.readFileSync('context-v1.json','utf8')); if(v.schema_version!=='aiwiki.context.v1') process.exit(1)"
node -e "const f=require('fs'); const v=JSON.parse(f.readFileSync('context-capsule.json','utf8')); if(v.schema_version!=='aiwiki.context.capsule.v1') process.exit(1)"
```

The real script must also copy or create the grounded payload fixture on the remote host before `ingest-agent`.

## Remote Transfer Flow

Recommended shape:

1. Build and pack locally.
2. Copy the tarball to the remote temp directory.
3. Copy the smoke script with LF line endings.
4. Copy the grounded payload fixture.
5. Run the remote script with the remote tarball path.
6. Record host, command, tarball path, exit code, and key output.

Example placeholders:

```bash
scp ./itradingai-aiwiki-0.3.0.tgz <user>@170.106.73.197:/tmp/
scp ./tmp-aiwiki-v030-smoke.sh <user>@170.106.73.197:/tmp/
scp ./tests/fixtures/agent_payload.analysis.grounded.json <user>@170.106.73.197:/tmp/
ssh <user>@170.106.73.197 'bash /tmp/tmp-aiwiki-v030-smoke.sh /tmp/itradingai-aiwiki-0.3.0.tgz'
```

Replace `<user>` and any SSH port/options with the observed current access path.

## Pass Criteria

Remote smoke passes only when:

- The exact tarball built locally is installed remotely.
- The remote CLI reports `0.3.0`.
- All listed smoke commands exit successfully.
- The two context schema assertions pass.
- The output proves `show`, `show --artifact-path`, capsule query, file query, capsule context, lint modes, and status all run from the installed package.

## Failure Policy

- If local tests fail, do not pack.
- If dry-run package contents are wrong, fix `package.json.files` or generated artifacts before tarball smoke.
- If local exact-tarball smoke fails, do not run remote smoke.
- If remote smoke fails, do not update GitHub.
- If local npm auth fails but GitHub Trusted Publishing is healthy, do not treat local auth as the blocker; use the workflow-based release path after source and remote verification are complete.

## Evidence Template

Record this in the release handoff or development log:

```text
AIWiki 0.3.0 release smoke evidence

Local build:
Local tests:
Release check:
Pack dry-run:
Actual tarball:
Tarball shasum:
Local tarball smoke:
Remote host:
Remote command:
Remote tarball path:
Remote smoke result:
GitHub commit pushed after remote smoke:
NPM publish verification:
Post-publish remote sanity:
```
