# AIWiki Schema Compatibility

AIWiki Core records its current data contracts in one catalog. The catalog is an internal compatibility boundary, not a new CLI surface; Extension API v0.1 is documented separately.

## Active Catalog

| Area | Canonical version | Storage | Rule |
| --- | --- | --- | --- |
| Workspace | `aiwiki.workspace.v1` | `aiwiki.yaml` | `schema_version: 1` remains a supported legacy alias. |
| Artifact | `aiwiki.artifact.v1` | Markdown frontmatter | Unknown additive fields are preserved. |
| Source Capsule | `aiwiki.capsule.v1` | Markdown frontmatter | Metadata remains optional for legacy workspaces. |
| Lifecycle | `aiwiki.lifecycle.v1` | Markdown frontmatter | Existing lifecycle fields remain additive. |
| Relationships | `aiwiki.relationships.v1` | Markdown frontmatter | Existing relationship fields remain additive. |
| Context | `aiwiki.context.v1` | Agent JSON output | Current default output remains stable. |
| Capsule context | `aiwiki.context.capsule.v1` | Agent JSON output | Explicit capsule view remains stable. |
| Agent payload | `aiwiki.agent_payload.v1` | Agent JSON input | Input validation remains strict. |
| Agent sync/check | `aiwiki.agent_sync.v1`, `aiwiki.agent_check.v1` | Agent JSON output | Existing output contracts remain stable. |
| First-use doctor | `aiwiki.doctor.v1` | JSON output | Read-only blocking-check diagnostics; additive fields only. |
| First-use status | `aiwiki.status.v1` | JSON output | Read-only activity/content/lint/readiness summary; additive fields only. |
| First-use next | `aiwiki.next.v1` | JSON output | Read-only ordered readiness actions; it never executes an action. |
| Derived state | `aiwiki.state.*.v1` | `.aiwiki/state/*.json` | Rebuildable cache only; see [Derived State v1](STATE.md). |
| Structured index | `aiwiki.index.v1` | `.aiwiki/state/index.json` | Explicitly built removable metadata; not semantic or vector search. |
| Relationship graph | `aiwiki.graph.v1` | `.aiwiki/state/graph.json` | Explicitly built deterministic local-relationship metadata; does not change Context v1. |
| Health snapshot | `aiwiki.health.v1` | JSON output | Read-only eight-domain maintenance snapshot; it does not create a dashboard or derived state. |
| Health report | `aiwiki.health_report.v1` | `dashboards/Knowledge Health.md` and `09-runs/health-*/health-report.json` | Explicit `health --write` output; refreshes only marker-bounded dashboard content and writes an immutable JSON run record. |
| Repair plan | `aiwiki.repair_plan.v1` | JSON output | Read-only advisory findings with evidence, risk, affected files, and suggested commands. |
| Extension author contract | `aiwiki.extension.v1` | Package public contract | Declaration API remains stable; explicit hosting is documented separately. |
| Extension Host | `aiwiki.extension-host.v1` | Local host state | Explicit local/bundled loading, state, and failure isolation; see [Extension Host v0.1](EXTENSION_HOST.md). |

`aiwiki.context.v2` is active as the explicit graph-aware Context view; default Context remains `aiwiki.context.v1`, and Context v2 never builds graph state automatically. `aiwiki.extension.v1` is active as the [Extension API v0.1](EXTENSION_SCHEMA.md). The [Extension Host v0.1](EXTENSION_HOST.md) adds only explicit `plugin add` and `plugin enable` administration for local or bundled extensions; there is no automatic discovery.

## Schema Compatibility

`AIWIKI_SCHEMAS` is the authoritative internal directory. Its 24 frozen keys are `workspace`, `artifact`, `capsule`, `lifecycle`, `relationships`, `stateArtifacts`, `stateCapsules`, `stateRelationships`, `stateLifecycle`, `stateIndex`, `stateGraph`, `context`, `capsuleContext`, `agentPayload`, `agentSync`, `agentCheck`, `contextV2`, `health`, `healthReport`, `repairPlan`, `doctor`, `status`, `next`, and `extension`.

Every directory entry is a complete `{ id, status, aliases, storage, compatibility }` record. `id` is the canonical version, `status` says whether the record is active or reserved, `aliases` contains accepted legacy versions, `storage` identifies its persistence or interchange boundary, and `compatibility` declares how consumers treat the version.

The Core 1.0 contract freeze locks these entries under an additive-only policy: a future catalog change MAY add a new key and canonical version, but MUST NOT rename, remove, or alter the five fields of an existing key. For `additive_fields_only` contracts, producers MAY add fields but MUST NOT remove, rename, or reinterpret existing fields. `aiwiki.agent_payload.v1` remains `strict_input_version`; its input version is not an additive field contract. These guarantees document the existing internal compatibility boundary and do not introduce a CLI, SDK, or Extension API surface.

## Compatibility And Migration

- Existing `schema_version: 1` workspaces are read as `aiwiki.workspace.v1`; AIWiki does not rewrite that config.
- Missing frontmatter schema markers are read as the active v1 contract. Unknown frontmatter fields remain tolerated and are never removed by this feature.
- A declared unknown or future major version is non-writable and requires manual review. The internal `planSchemaMigration()` report is always `dry_run: true` and `would_write: false`.
- Schema compatibility intentionally exposes no migration CLI command and no `--apply` path. A future migration must be explicitly designed, reviewed, and separately released.
- `aiwiki health --json` and `aiwiki repair --plan --json` emit the additive, read-only `aiwiki.health.v1` and `aiwiki.repair_plan.v1` contracts. `aiwiki health --write --json` explicitly emits `aiwiki.health_report.v1`: it refreshes only marker-bounded dashboard content and writes an immutable JSON run record. No health path modifies knowledge Markdown or builds derived state.
- `aiwiki doctor --json`, `aiwiki status --json`, and `aiwiki next --json` are separate first-use JSON envelopes, each with `would_write: false` and an additive-fields-only compatibility policy. `next` additionally returns `actions_executed: false`; recommendations never execute automatically. `doctor` may exit `1` for a blocking check while still returning parseable JSON, while `status` and `next` return `0` after producing a report.
- Their shared readiness object has exactly five stable states: `repair_required`, `setup_required`, `first_ingest_required`, `review_required`, and `ready`. Machine consumers use action IDs rather than localized prose: `run_setup`, `restore_workspace_access`, `verify_workspace_access`, `review_schema`, `review_repair_plan`, `ingest_first_source`, `inspect_failed_run`, `review_low_quality_content`, and `query_knowledge`.
- Readiness is deliberately narrower than `aiwiki.health.v1` / `aiwiki.repair_plan.v1` maintenance diagnostics and separate from `aiwiki.agent_check.v1` host-Agent and root-guidance checks. `ready` means the workspace can proceed to retrieval; it does not certify knowledge correctness.

## Migration Guide

Legacy workspaces with `schema_version: 1` remain read-only compatible: AIWiki identifies them as `aiwiki.workspace.v1` and does not rewrite their configuration.

For a manual migration, prefer this review-first process:

1. Back up the complete legacy workspace before making any changes.
2. Initialize a new workspace with `aiwiki init --path "<new-workspace>" --yes --set-default`.
3. Review each legacy page individually, including its content, frontmatter, and any schema markers.
4. Manually ingest only the pages and source material you approve into the new workspace.

The following legacy commands remain keep-compatible and have no behavior changes:

- `aiwiki init --path "<workspace>" --yes --set-default` continues to initialize the specified workspace and set it as the default.
- `aiwiki ingest-url --content-file "<file>" "<url>"` continues to use the URL as metadata only; it never fetches the URL.
- `aiwiki agent install --agent "<agent>" --yes --force` continues to install the requested Agent integration.
- `aiwiki next` remains a read-only readiness report and does not execute recommended actions.

There is no migration CLI and no `--apply` automatic path. For a future major schema version, preserve the legacy workspace, review the migration design and affected content manually, then migrate only after that review; any automated migration would require separate design, review, and release.

Optional frontmatter markers are available only when a producer needs to declare them:

```yaml
aiwiki_schema: "aiwiki.artifact.v1"
aiwiki_capsule_schema: "aiwiki.capsule.v1"
aiwiki_lifecycle_schema: "aiwiki.lifecycle.v1"
aiwiki_relationships_schema: "aiwiki.relationships.v1"
```

## Skill Matching Boundary

Extension API v0.1 does not add a new natural-language intent, command, or automatic Skill match. Existing command-first matching remains unchanged; loading is explicit, and future matching changes require documented examples, precedence, fallback, and acceptance tests.

Derived state adds one explicit maintenance intent only: inspect or rebuild `.aiwiki/state/` when the user asks for it. It does not change normal query, context, show, lint, or status matching. See [Derived State v1](STATE.md).

Structured index adds a separate explicit intent only: check, build, or rebuild `.aiwiki/state/index.json` when the user asks for it. It does not alter retrieval and must not be built automatically from query, context, show, lint, status, ingest, or generic maintenance work. See [Derived State v1](STATE.md).

Relationship graph adds another separate explicit intent only: check, build, or rebuild `.aiwiki/state/graph.json` when the user asks for it. It records deterministic local relationships only, does not alter `aiwiki.context.v1`, and must not be built automatically from query, context, show, lint, status, ingest, or generic maintenance work. See [Derived State v1](STATE.md).
