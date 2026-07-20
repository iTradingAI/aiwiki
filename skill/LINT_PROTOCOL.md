# AIWiki Lint Protocol

Use this protocol when the user asks:

- 整理一下 AIWiki
- 检查知识库有没有问题
- 看看 AIWiki 结构是否健康
- lint AIWiki

## Steps

1. Call JSON lint first:

```bash
aiwiki lint --json
```

2. Run capsule-aware checks only when the user asks for deeper health, release readiness, or Source Capsule validation:

```bash
aiwiki lint --capsules --json
aiwiki lint --lifecycle --json
aiwiki lint --okf --json
aiwiki lint --strict --json
```

Default lint must stay quiet for legacy workspaces that do not have capsule metadata. Use `--strict` for release or CI-style validation, not as the ordinary user cleanup path.

3. When the user explicitly asks for a broad health review, run the read-only snapshot:

```bash
aiwiki health --json
```

Read `aiwiki.health.v1` for all eight maintenance domains, derived-state status, issue evidence, and the recommended next action. It does not modify Markdown, create state, or create a dashboard.

4. When the user explicitly asks to generate or save a health report, run:

```bash
aiwiki health --write --json
```

Read `aiwiki.health_report.v1` for its metrics, dashboard path, and immutable JSON run path. It refreshes only the marker-bounded managed content in `dashboards/Knowledge Health.md` and writes one JSON report under `09-runs/`; it does not modify knowledge Markdown or derived state.

5. When the user explicitly asks for a proposed maintenance checklist, generate the read-only plan:

```bash
aiwiki repair --plan --json
```

Read `aiwiki.repair_plan.v1` for each issue, evidence, suggested changes, risk, affected files, and suggested command. Do not execute suggested commands or infer a workspace write.

6. If `safe_fixes.only_safe_fixes` is true and the user allows cleanup, apply the built-in safe fix and rerun JSON lint:

```bash
aiwiki lint --fix-empty-dirs --json
aiwiki lint --json
```

4. Read the terminal report.
5. Mention the report path, usually:

```text
dashboards/Lint Report.md
```

6. Explain warnings and errors as structure-health feedback.
7. Do not frame lint as "the user must manually audit every note".
8. If `aiwiki next` recommends `aiwiki agent sync --yes`, treat Agent skill setup as the next operational step before asking the user to ingest or query more material.

## Issue Meaning

- `error`: broken structure such as a missing internal link.
- `warning`: likely fix needed, such as missing source fields or stale fallback entries.
- `info`: useful inventory, such as deterministic fallback count or duplicate titles.
- `safe_fixes`: machine-readable count of safe fixes available/applied; `only_safe_fixes` means all current issues are safe to apply with the supported fixer.
- `capsule_missing_primary`: the capsule has no primary Wiki Entry.
- `capsule_duplicate_primary`: more than one artifact claims primary visibility or role.
- `lifecycle`: lifecycle state, confidence, evidence, or relationship metadata needs review.
- `okf_readiness`: the capsule is not ready for OKF-style reuse because resource, description, timestamp, evidence, or citation fields are missing.

## Repair Guidance

Prefer small, traceable fixes:

- Regenerate or enrich missing Wiki Entries.
- Fix broken wikilinks.
- Add missing `source_card` or `raw_file` paths.
- Ask the host Agent to provide `analysis` for scaffold entries.
- Remove empty optional enhancement directories only through `aiwiki lint --fix-empty-dirs --json`; do not delete core directories, unknown directories, non-empty directories, or files.

## Fallback

If lint reports an issue outside the supported safe fix, preserve the report and explain the required review or host-Agent action. Do not bypass `aiwiki lint --json` with bulk Markdown edits, generic directory cleanup, or destructive shell commands.
