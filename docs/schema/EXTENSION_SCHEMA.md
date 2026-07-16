# AIWiki Extension API v0.1

## Scope

The public authoring entry is <code>@itradingai/aiwiki/extension-api</code>. Its compatibility marker is <code>aiwiki.extension.v1</code>. Extension API v0.1 defines a declaration contract only; it does not load an extension, add a CLI command, discover a package, register a scheduler, or write a workspace.

An extension declares its id, name, version, apiVersion, and optional command, lint rule, context provider, and artifact generator arrays. <code>defineExtension()</code> returns that declaration unchanged. It does not validate, execute, register, clone, or freeze callbacks.

## Authoring Surfaces

| Surface | Input | Output | Boundary |
| --- | --- | --- | --- |
| Command | readonly argv tokens | exit code plus optional stdout, stderr, or JSON | No CliStreams, parser, command matcher, or Core handler. |
| Lint rule | readonly artifact snapshots | readonly lint findings | No safe fix, report writer, or file mutation. |
| Context provider | query, optional limit and filters, readonly artifact snapshots | namespaced context fragment | It does not modify <code>aiwiki.context.v1</code> or Core ranking fields. |
| Artifact generator | request plus readonly artifact snapshots | artifact drafts with suggested paths | A draft is not a filesystem write authorization. |

Snapshots use vault-relative paths, constrained artifact kind, role, and visibility values, JSON-compatible metadata, and an optional body preview. They do not require absolute paths, full file bodies, parser objects, or Core runtime state.

## Capability Boundary

The API injects no network client, process executor, scheduler, connector runtime, writable stream, filesystem writer, or Core state mutator. It is not a sandbox: locally loaded JavaScript can still import capabilities on its own. Permission policy, allowed module loading, input projection, path validation, draft handling, and failure isolation belong to CORE-0405.

No extension manifest format, local or bundled loader, plugin command, automatic discovery, background process, or extension state directory exists in CORE-0404.

## Compatibility

- The active contract marker is <code>aiwiki.extension.v1</code>.
- Additive fields are the only compatible extension contract change in this major version.
- Public extensions must import only package export-map paths. Deep imports under <code>src</code> or <code>dist/src</code> are unsupported and fail with <code>ERR_PACKAGE_PATH_NOT_EXPORTED</code>.
- CORE-0404 does not create a persistent Workspace or Markdown extension schema and does not add a migration path.

## Skill Matching Boundary

Extension API v0.1 creates no user-facing command or automatic natural-language Skill match. Host assistants must continue to use the existing command-first intent matrix. CORE-0407 owns extension-related intent examples, precedence, fallback behavior, and matching acceptance tests.
