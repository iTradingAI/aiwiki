# Extension permission declarations

Extension manifests use the compatibility marker `aiwiki.extension.v1`. Their `permissions` and `capabilities` fields are metadata declarations, not injected handles. The Host audits the declarations while handling a manifest and while enabling an extension; its default is to provide no filesystem, process, network, scheduler, Core-state, draft, or writer capability to command or lint callbacks.

> declared-permission audit + no-injection default; NOT a runtime OS sandbox

For manifest field rules, see [Extension API schema](../schema/EXTENSION_SCHEMA.md); for metadata-only administration, see [Extension Host](../schema/EXTENSION_HOST.md).

## Exact token vocabulary

Only these permission tokens are accepted:

| Token | Declared scope |
| --- | --- |
| `workspace:read` | Read access declaration for the workspace. |
| `workspace:write:<path>` | Write declaration for one safe workspace-relative root. |
| `state:read` | Read access declaration for the extension's Host-managed state. |
| `state:write` | Write access declaration for the extension's Host-managed state. |

There are no `network` or `process` tokens. A `workspace:write:<path>` root must be nonempty, relative, and forward-slash-separated. It must not be absolute, drive-qualified, backslash-separated, or contain an empty, `.` or `..` segment.

The capability vocabulary is `command`, `lint_rule`, `context_provider`, and `artifact_generator`. The Host can report advisory declaration mismatches, including a workspace-write declaration without `artifact_generator`, an `artifact_generator` declaration without workspace-write, and the current declaration-only status of provider and generator capabilities.

## Advisory boundary

Declarations do not stop a local module from importing `node:fs` or `node:child_process`, or from calling `fetch` directly. They do not grant such access either. Command and lint callbacks receive no writer. This work creates no draft mediation or draft write path.

The current Host invokes only enabled command and lint-rule callbacks. `context_provider` and `artifact_generator` remain declaration-only and are not invoked by `inspect`, `doctor`, command execution, lint evaluation, or any new path.

## Plugin administration

The complete explicit subcommand list is:

```text
aiwiki plugin list [--path <workspace>] [--json]
aiwiki plugin inspect <id> [--path <workspace>] [--json]
aiwiki plugin add <directory> [--path <workspace>] [--json]
aiwiki plugin enable <id> [--path <workspace>] [--json]
aiwiki plugin disable <id> [--path <workspace>] [--json]
aiwiki plugin remove <id> [--path <workspace>] [--json]
aiwiki plugin doctor [--path <workspace>] [--json]
```

`list`, `inspect`, `add`, `disable`, `remove`, and `doctor` inspect or change metadata without importing an entry. `enable` is the only administration command that imports the declared ESM module. `inspect` and `doctor` are static-descriptor checks; `doctor` reports manifest and declaration issues without writing state.
