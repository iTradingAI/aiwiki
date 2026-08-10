# AIWiki Extension API v0.1

## Scope

The public authoring entry is <code>@itradingai/aiwiki/extension-api</code>. Its compatibility marker is <code>aiwiki.extension.v1</code>. Extension API v0.1 defines declarations; it does not itself load an extension, add a CLI command, discover a package, register a scheduler, or write a workspace.

The current explicit Host is documented in [Extension Host v0.1](EXTENSION_HOST.md). Permission declarations and their trust boundary are documented in [permission declarations](../plugins/PERMISSIONS.md).

## Manifest compatibility

A local `aiwiki-extension.json` requires these legacy fields:

```json
{
  "schema_version": "aiwiki.extension.v1",
  "id": "example.research-workflow",
  "name": "Research Workflow Pack",
  "version": "0.1.0",
  "api_version": "aiwiki.extension.v1",
  "entry": "index.mjs"
}
```

`schema_version` and `api_version` are both required and must exactly equal `aiwiki.extension.v1`. This legacy dual-marker behavior remains required even when the optional additive fields below are used:

| JSON field | Meaning |
| --- | --- |
| `aiwiki_api` | Optional API compatibility range evaluated against implemented version `1.0.0`. It does not replace required `api_version`. |
| `capabilities` | Optional array of declared capability names. |
| `permissions` | Optional array of declared permission tokens. |

Supported `aiwiki_api` grammar is an exact `x.y.z` version, a caret range such as `^1.0.0`, a tilde range such as `~1.0.0`, or whitespace-separated comparator bounds such as `>=1.0.0 <2.0.0`. Unsupported or malformed expressions are rejected. A manifest without all optional fields remains compatible with the legacy contract.

The capability vocabulary is `command`, `lint_rule`, `context_provider`, and `artifact_generator`. The permission vocabulary is `workspace:read`, `workspace:write:<path>`, `state:read`, and `state:write`; see [permission declarations](../plugins/PERMISSIONS.md) for safe write-path rules and the advisory model.

## Authoring surfaces

| Surface | Input | Output | Current Host behavior |
| --- | --- | --- | --- |
| Command | readonly argv tokens | exit code plus optional stdout, stderr, or JSON | Invoked only after explicit enablement and command dispatch. No writer is supplied. |
| Lint rule | readonly artifact snapshots | readonly lint findings | Invoked only for enabled extensions during lint evaluation. No writer is supplied. |
| Context provider | query, optional limit and filters, readonly artifact snapshots | namespaced context fragment | Declaration-only; not invoked by the current Host. |
| Artifact generator | request plus readonly artifact snapshots | artifact drafts with suggested paths | Declaration-only; not invoked by the current Host; no draft write path exists. |

<code>defineExtension()</code> returns the declaration unchanged. It does not validate, execute, register, clone, or freeze callbacks. Snapshots use vault-relative paths, constrained artifact kind, role, and visibility values, JSON-compatible metadata, and an optional body preview. They do not require absolute paths, full file bodies, parser objects, or Core runtime state.
This is not a sandbox: a locally loaded module can still import Node APIs or call `fetch` directly; declarations grant no injected capability.

`context_provider` and `artifact_generator` are not invoked by `inspect`, `doctor`, command execution, lint evaluation, or any new path.

## Plugin administration

The complete explicit Host subcommand list is:

```text
aiwiki plugin list [--path <workspace>] [--json]
aiwiki plugin inspect <id> [--path <workspace>] [--json]
aiwiki plugin add <directory> [--path <workspace>] [--json]
aiwiki plugin enable <id> [--path <workspace>] [--json]
aiwiki plugin disable <id> [--path <workspace>] [--json]
aiwiki plugin remove <id> [--path <workspace>] [--json]
aiwiki plugin doctor [--path <workspace>] [--json]
```

`list`, `inspect`, `add`, `disable`, `remove`, and `doctor` operate on metadata without importing an extension entry. `enable` is the sole administration operation that imports the declared ESM module. `inspect` returns `aiwiki.plugin_inspection.v1` JSON and `doctor` returns `aiwiki.plugin_doctor.v1` JSON; doctor reports every extension and exits nonzero when the report is unhealthy.

Disable records metadata and can be reversed by a successful enable. Remove atomically removes a local extension's registration and lifecycle entry in one immutable combined revision, so no intermediate state is observable; it preserves the local source directory and Host state directory. Bundled extensions cannot be removed. Host reads select the highest numeric revision. Revisions are completed in a temporary file and published with no-replace `fs.link`, retrying bounded `EEXIST` contention; published revisions are never modified or deleted. `installed.json` and `enabled.json` are bootstrap-only legacy input.

## Compatibility and Skill boundary

- Additive fields are the only compatible extension contract change in this major version.
- Public extensions must import only package export-map paths. Deep imports under <code>src</code> or <code>dist/src</code> are unsupported and fail with <code>ERR_PACKAGE_PATH_NOT_EXPORTED</code>.
- Extension API v0.1 creates no persistent Workspace or Markdown extension schema and adds no migration path.
- Extension API v0.1 creates no user-facing command or automatic natural-language Skill match. Host assistants must continue to use the existing command-first intent matrix and preserve the documented extension-intent precedence, fallback behavior, and matching acceptance boundaries.
