# AIWiki Schema Compatibility

AIWiki Core records its current data contracts in one catalog. The catalog is an internal compatibility boundary, not a new CLI surface or Extension API.

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

`aiwiki.context.v2` and `aiwiki.extension.v1` are reserved only. Core does not emit Context v2, provide an Extension API, or load extensions.

## Compatibility And Migration

- Existing `schema_version: 1` workspaces are read as `aiwiki.workspace.v1`; AIWiki does not rewrite that config.
- Missing frontmatter schema markers are read as the active v1 contract. Unknown frontmatter fields remain tolerated and are never removed by this feature.
- A declared unknown or future major version is non-writable and requires manual review. The internal `planSchemaMigration()` report is always `dry_run: true` and `would_write: false`.
- CORE-0403 intentionally exposes no migration CLI command and no `--apply` path. A future migration must be explicitly designed, reviewed, and separately released.

Optional frontmatter markers are available only when a producer needs to declare them:

```yaml
aiwiki_schema: "aiwiki.artifact.v1"
aiwiki_capsule_schema: "aiwiki.capsule.v1"
aiwiki_lifecycle_schema: "aiwiki.lifecycle.v1"
aiwiki_relationships_schema: "aiwiki.relationships.v1"
```

## Skill Matching Boundary

Schema cataloging does not add a new natural-language intent, command, or automatic Skill match. Existing command-first matching remains unchanged in CORE-0403. CORE-0407 owns the future Skill matching contract and must define its examples, precedence, fallback, and acceptance tests before any behavior changes.
