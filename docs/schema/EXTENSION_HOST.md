# AIWiki Extension Host v0.1

## Scope

CORE-0405 activates the minimal host for the public `aiwiki.extension.v1` author contract. It supports only an explicit bundled catalog and local extension directories. There is no package discovery, registry download, background process, scheduler, connector, or automatic Skill match.

## Explicit Commands

```text
aiwiki plugin list --json
aiwiki plugin add <directory> --path <workspace>
aiwiki plugin enable <id> --path <workspace>
```

`plugin list` reads host state and does not import local modules or create state files. `plugin add` reads and validates `aiwiki-extension.json` only. `plugin enable` revalidates the manifest, imports the declared ESM module, validates the declaration, and then creates the extension's host-managed state root.

## Local Manifest

Each local extension directory contains `aiwiki-extension.json`:

```json
{
  "schema_version": "aiwiki.extension.v1",
  "id": "example.local-quality",
  "name": "Local quality extension",
  "version": "0.1.0",
  "api_version": "aiwiki.extension.v1",
  "entry": "index.mjs"
}
```

The schema and API markers must exactly equal `aiwiki.extension.v1`. IDs are lowercase identifiers. The entry must be a relative `.js` or `.mjs` file that resolves inside the extension root; absolute paths, traversal, and symlink escape are rejected.

## Runtime Boundary

Only command and lint rule callbacks run in CORE-0405. Commands receive argv tokens only. Lint rules receive read-only vault-relative artifact snapshots without absolute paths or full bodies. Context providers and artifact generators are not invoked.

Core command roots are reserved. An extension command cannot override a Core command or another enabled extension command.

## State And Failure Isolation

Host data is stored under:

```text
.aiwiki/extensions/
  installed.json
  enabled.json
  state/<extension-id>/
```

Host writes use temporary-file rename. Loading, declaration validation, command execution, or lint callback failure records a disabled reason in `enabled.json`. Core commands and healthy extensions continue to run.

This is not a sandbox. Locally loaded JavaScript can import Node.js capabilities on its own; the Host merely avoids injecting filesystem, process, network, scheduler, or Core-state capabilities. Permission policy belongs to CORE-0603.

## Skill Boundary

These commands are explicit administration commands. CORE-0405 does not add natural-language extension intent, automatic matching, precedence, or fallback. CORE-0407 owns those Skill matching rules and acceptance tests.
