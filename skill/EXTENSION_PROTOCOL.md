# AIWiki Extension Protocol

Use this protocol only when the user explicitly asks to administer an AIWiki extension in a specific workspace.

## Explicit Intent Mapping

| User request | Command | Required input | Response boundary |
| --- | --- | --- | --- |
| List installed or available extensions | `aiwiki plugin list --json --path <workspace>` | Workspace path | Report the listed state; do not select or enable one. |
| Inspect an extension | `aiwiki plugin inspect <id> --json --path <workspace>` | An exact extension ID supplied by the user | Report static metadata; do not infer an ID. |
| Add an extension | `aiwiki plugin add <directory> --path <workspace>` | A directory supplied by the user | Report the registered extension; do not enable it unless separately requested. |
| Enable an extension | `aiwiki plugin enable <id> --path <workspace>` | An exact extension ID supplied by the user | Report the resulting state and any command or lint effect. |
| Disable an extension | `aiwiki plugin disable <id> --path <workspace>` | An exact extension ID supplied by the user | Report the disabled state; do not infer an ID. |
| Remove a local extension | `aiwiki plugin remove <id> --path <workspace>` | An exact local extension ID supplied by the user | Report the result; bundled IDs cannot be removed. |
| Diagnose registered extensions | `aiwiki plugin doctor --json --path <workspace>` | Workspace path | Report the static diagnosis without selecting an extension. |

## Ambiguous Requests

Do not automatically discover, inspect, enable, execute, disable, or remove extensions. Do not scan the machine for extension directories, choose a skill, infer an ID, or run an extension command from a vague request.

For requests such as "find a plugin", "auto choose a skill", or "enable a suitable extension", explain that AIWiki needs one explicit action and, where applicable, a user-supplied directory or exact ID. Offer these explicit `aiwiki.extension.v1` actions:

```bash
aiwiki plugin list --json --path <workspace>
aiwiki plugin inspect <id> --json --path <workspace>
aiwiki plugin add <directory> --path <workspace>
aiwiki plugin enable <id> --path <workspace>
aiwiki plugin disable <id> --path <workspace>
aiwiki plugin remove <id> --path <workspace>
aiwiki plugin doctor --json --path <workspace>
```

The Host uses the declared-permission audit + no-injection default; NOT a runtime OS sandbox.

## Core Boundary

This protocol does not add Pro behavior, entitlement checks, license checks, scheduling, automatic matching, or automatic execution. Keep normal setup, ingest, query, context, show, lint, doctor, status, and Agent sync/check requests on their existing command-first paths.
