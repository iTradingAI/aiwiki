# AIWiki Extension Host v0.1

## Scope

The explicit Host manages extensions whose compatibility marker is `aiwiki.extension.v1`. It supports a fixed bundled catalog and explicitly added local extension directories. It has no package discovery, registry download, background process, scheduler, connector, or automatic Skill match.

For manifest and permission metadata, see [Extension API schema](EXTENSION_SCHEMA.md) and [permission declarations](../plugins/PERMISSIONS.md).

## Plugin administration

All administration is explicit and accepts `--path <workspace>` where applicable. The complete subcommand list, in CLI order, is:

```text
aiwiki plugin list [--path <workspace>] [--json]
aiwiki plugin inspect <id> [--path <workspace>] [--json]
aiwiki plugin add <directory> [--path <workspace>] [--json]
aiwiki plugin enable <id> [--path <workspace>] [--json]
aiwiki plugin disable <id> [--path <workspace>] [--json]
aiwiki plugin remove <id> [--path <workspace>] [--json]
aiwiki plugin doctor [--path <workspace>] [--json]
```

| Command | Reads or imports | Result |
| --- | --- | --- |
| `list` | Reads registry-backed metadata; never imports an extension entry. | Human status list or `aiwiki.plugin_status.v1` JSON. |
| `inspect` | Reads a static descriptor and state; never imports an entry. | Descriptor, status, declaration warnings, and notes; JSON uses `aiwiki.plugin_inspection.v1`. |
| `add` | Validates `aiwiki-extension.json`; never imports its entry. | Registers local metadata only and returns the existing action result shape. |
| `enable` | Re-reads and validates metadata, then imports and validates the declared ESM module. | Enables a valid extension, creates its Host state root, and returns the existing action result shape. |
| `disable` | Changes metadata only; never imports an entry. | Leaves the extension registered but disabled. |
| `remove` | Changes metadata only; never imports an entry. | Removes a local registration; bundled extensions cannot be removed. |
| `doctor` | Reads static descriptors, manifests, and state; never imports entries and never writes state. | Per-extension report; JSON uses `aiwiki.plugin_doctor.v1`, and an unhealthy report exits nonzero. |

`inspect` and `doctor` are deliberately metadata-only checks. For a disabled local extension they can report that runtime validation is deferred to `enable`; they do not execute an entry as part of inspection or diagnosis.

## Local manifest and declared metadata

Each local extension directory contains `aiwiki-extension.json`. `schema_version` and the required legacy `api_version` are both exactly `aiwiki.extension.v1`. The optional `aiwiki_api` field is an additive compatibility range for implemented API `1.0.0`; when it is present, the legacy `api_version` is still required and must remain exactly `aiwiki.extension.v1`.

```json
{
  "schema_version": "aiwiki.extension.v1",
  "id": "example.local-quality",
  "name": "Local quality extension",
  "version": "0.1.0",
  "api_version": "aiwiki.extension.v1",
  "aiwiki_api": "^1.0.0",
  "entry": "index.mjs",
  "capabilities": ["command", "lint_rule"],
  "permissions": ["workspace:read"]
}
```

IDs are lowercase identifiers. `entry` must be a relative `.js` or `.mjs` file resolving inside the extension root; absolute paths, traversal, and symlink escape are rejected. `capabilities` and `permissions` are declared metadata audited during manifest handling and enablement; they do not grant injected runtime authority. The accepted capability and permission vocabularies are documented in [Extension API schema](EXTENSION_SCHEMA.md) and [permission declarations](../plugins/PERMISSIONS.md).

## Runtime boundary

Only command and lint-rule callbacks run. Commands receive argv tokens only. Lint rules receive read-only vault-relative artifact snapshots without absolute paths or full bodies. Command and lint callbacks receive no writer, and this work creates no draft write path.
This is not a sandbox: a locally loaded module can still import Node APIs or call `fetch` directly; declared permissions grant no injected capability.

`context_provider` and `artifact_generator` remain declaration-only capabilities in the current Host. They are not invoked by `inspect`, `doctor`, command execution, lint evaluation, or any new path.

Core command roots are reserved. An extension command cannot override a Core command or another enabled extension command.

## Disable and removal lifecycle

`disable` is metadata-only and idempotent: it records a disabled state without loading the entry. A user disable records `disabled by user` when no prior failure reason exists; an existing failure reason is retained. `enable` is the recoverable transition: after the underlying issue is fixed, a successful enable restores enabled metadata.

The registry is one immutable, combined revision stream: `.aiwiki/extensions/revisions/<N>.json` contains both installed registrations and lifecycle state. Readers use the highest published numeric revision. A writer creates a complete temporary revision and publishes it with a no-replace `fs.link`; on `EEXIST`, it re-reads and retries a bounded number of times. Published revisions are never modified or deleted. The former `installed.json` and `enabled.json` split registries are bootstrap-only legacy input: when both exist they are published as revision `0`; when neither exists, an empty registry is valid.

`remove` applies only to a registered local extension and atomically removes its registration and lifecycle state in one combined revision. `disable` and failure isolation likewise publish a complete combined state transition. Remove does not delete either the local extension source directory or `.aiwiki/extensions/state/<extension-id>/`; source and Host state are preserved for recovery or inspection. A bundled id and an unknown id are rejected before mutation. Loading, declaration validation, command execution, or lint callback failure records a disabled reason in a new revision; Core commands and healthy extensions continue to run.

## Skill boundary

These are explicit administration commands. They do not add natural-language extension intent or automatic matching. Keep the documented Skill matching precedence, fallback, and acceptance boundaries unchanged.
