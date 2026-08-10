# Research Workflow Pack

The Research Workflow Pack is a command-and-lint-only extension for source-backed research checks. It uses the extension compatibility marker `aiwiki.extension.v1`; its two declared capabilities are exactly `command` and `lint_rule`, and its declared permission is exactly `workspace:read`.

It declares no `context_provider` or `artifact_generator`. Those capability names remain declaration-only in the current Host and are not invoked by `inspect`, `doctor`, command execution, lint evaluation, or any new path. Commands and lint rules receive no writer; this pack creates no draft write path.

For the declared-permission boundary, see [permission declarations](PERMISSIONS.md). For manifest and lifecycle rules, see [Extension API schema](../schema/EXTENSION_SCHEMA.md) and [Extension Host](../schema/EXTENSION_HOST.md).

## Included variants

| Variant | Id | Location | Registration |
| --- | --- | --- | --- |
| Bundled | `aiwiki.research-workflow` | Built into AIWiki's fixed catalog | Available immediately; enable it explicitly. |
| On-disk example | `example.research-workflow` | `examples/plugins/research-workflow` | Add its directory explicitly, then enable it. |

The ids are distinct, but both variants expose the same research-workflow command paths. Choose one variant at a time: enabled extension command paths cannot overlap. If one is enabled, disable it before enabling the other.

## Behavior

After explicit enablement, the pack offers `research-workflow inspect` and `research-workflow status`. They return a normal extension command result describing the pack's availability or enabled status and identify the `command` and `lint_rule` capabilities with `workspace:read` as the declared permission.

Its lint rule reports a warning for each research artifact lacking `source_url`. Findings are flat validated lint findings with the `research_workflow` category, a missing-source message, a suggestion to add `source_url`, and a vault path when present.

## Install or select a variant

The complete explicit management subcommand list is:

```text
aiwiki plugin list [--path <workspace>] [--json]
aiwiki plugin inspect <id> [--path <workspace>] [--json]
aiwiki plugin add <directory> [--path <workspace>] [--json]
aiwiki plugin enable <id> [--path <workspace>] [--json]
aiwiki plugin disable <id> [--path <workspace>] [--json]
aiwiki plugin remove <id> [--path <workspace>] [--json]
aiwiki plugin doctor [--path <workspace>] [--json]
```

### Bundled variant

The bundled id is already present in `list`; do not add a directory for it.

```text
aiwiki plugin inspect aiwiki.research-workflow --path <workspace>
aiwiki plugin enable aiwiki.research-workflow --path <workspace>
```

`inspect` and `doctor` read static descriptors only and never import an entry. `enable` is the only administration command that imports and validates the declared ESM module. To stop using the bundled variant, run `disable`; `remove` rejects bundled ids.

### On-disk example

Add the packaged example directory, then enable its distinct id:

```text
aiwiki plugin add examples/plugins/research-workflow --path <workspace>
aiwiki plugin inspect example.research-workflow --path <workspace>
aiwiki plugin enable example.research-workflow --path <workspace>
```

To switch back to the bundled variant, disable `example.research-workflow` before enabling `aiwiki.research-workflow`. `remove example.research-workflow` unregisters only local metadata: it preserves the example source directory and `.aiwiki/extensions/state/example.research-workflow/`, so it can be added again later.
