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
| Derived state | `aiwiki.state.*.v1` | `.aiwiki/state/*.json` | Rebuildable cache only; see [Derived State v1](STATE.md). |
| Structured index | `aiwiki.index.v1` | `.aiwiki/state/index.json` | Explicitly built removable metadata; not semantic or vector search. |
| Relationship graph | `aiwiki.graph.v1` | `.aiwiki/state/graph.json` | Explicitly built deterministic local-relationship metadata; does not change Context v1. |
| Health snapshot | `aiwiki.health.v1` | JSON output | Read-only eight-domain maintenance snapshot; it does not create a dashboard or derived state. |
| Health report | `aiwiki.health_report.v1` | `dashboards/Knowledge Health.md` and `09-runs/health-*/health-report.json` | Explicit `health --write` output; refreshes only marker-bounded dashboard content and writes an immutable JSON run record. |
| Repair plan | `aiwiki.repair_plan.v1` | JSON output | Read-only advisory findings with evidence, risk, affected files, and suggested commands. |
| Extension author contract | `aiwiki.extension.v1` | Package public contract | Declaration API remains stable; explicit hosting is documented separately. |
| Extension Host | `aiwiki.extension-host.v1` | Local host state | Explicit local/bundled loading, state, and failure isolation; see [Extension Host v0.1](EXTENSION_HOST.md). |

`aiwiki.context.v2` is active as the explicit graph-aware Context view; default Context remains `aiwiki.context.v1`, and Context v2 never builds graph state automatically. `aiwiki.extension.v1` is active as the [Extension API v0.1](EXTENSION_SCHEMA.md). CORE-0405 adds only the explicit [Extension Host v0.1](EXTENSION_HOST.md): `plugin add` and `plugin enable` activate local or bundled extensions; there is no automatic discovery.

## Compatibility And Migration

- Existing `schema_version: 1` workspaces are read as `aiwiki.workspace.v1`; AIWiki does not rewrite that config.
- Missing frontmatter schema markers are read as the active v1 contract. Unknown frontmatter fields remain tolerated and are never removed by this feature.
- A declared unknown or future major version is non-writable and requires manual review. The internal `planSchemaMigration()` report is always `dry_run: true` and `would_write: false`.
- CORE-0403 intentionally exposes no migration CLI command and no `--apply` path. A future migration must be explicitly designed, reviewed, and separately released.
- `aiwiki health --json` and `aiwiki repair --plan --json` emit the additive, read-only `aiwiki.health.v1` and `aiwiki.repair_plan.v1` contracts. `aiwiki health --write --json` explicitly emits `aiwiki.health_report.v1`: it refreshes only marker-bounded dashboard content and writes an immutable JSON run record. No health path modifies knowledge Markdown or builds derived state.

Optional frontmatter markers are available only when a producer needs to declare them:

```yaml
aiwiki_schema: "aiwiki.artifact.v1"
aiwiki_capsule_schema: "aiwiki.capsule.v1"
aiwiki_lifecycle_schema: "aiwiki.lifecycle.v1"
aiwiki_relationships_schema: "aiwiki.relationships.v1"
```

## Skill Matching Boundary

Extension API v0.1 does not add a new natural-language intent, command, or automatic Skill match. Existing command-first matching remains unchanged, and CORE-0405 owns loading while CORE-0407 owns the future Skill matching contract, including examples, precedence, fallback, and acceptance tests.

Derived state adds one explicit maintenance intent only: inspect or rebuild `.aiwiki/state/` when the user asks for it. It does not change normal query, context, show, lint, or status matching. See [Derived State v1](STATE.md).

Structured index adds a separate explicit intent only: check, build, or rebuild `.aiwiki/state/index.json` when the user asks for it. It does not alter retrieval and must not be built automatically from query, context, show, lint, status, ingest, or generic maintenance work. See [Derived State v1](STATE.md).

Relationship graph adds another separate explicit intent only: check, build, or rebuild `.aiwiki/state/graph.json` when the user asks for it. It records deterministic local relationships only, does not alter `aiwiki.context.v1`, and must not be built automatically from query, context, show, lint, status, ingest, or generic maintenance work. See [Derived State v1](STATE.md).
