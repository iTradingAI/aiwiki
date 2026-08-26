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

## Plugin Signing Proposal

> This is a proposal only; no signature verification is implemented in this release.

This proposal describes a future supply-chain trust boundary for plugins. It does not change the current declaration-only permission model or enable any new runtime capability.

1. **Threat model and current gap.** The design must address supply-chain attacks, substituted or tampered plugin packages, and malicious extensions. Today, a local plugin directory and its declared entry are trusted without publisher authentication or cryptographic content verification; that is the trust gap this proposal is intended to close.
2. **Approach and key management.** The intended direction is asymmetric signing: publishers sign release identities with private keys kept in secure storage, while verifiers use the corresponding public keys. The eventual design must specify key generation, access control, backup, loss response, and retirement rather than treating a digest alone as a signature system.
3. **Trust roots.** Trust roots must come from a controlled configuration and trusted registry, with authenticated distribution and updates. The design must define root rotation and the failure semantics for handoff between old and new roots; an unverified, unavailable, or inconsistent handoff must fail closed.
4. **Publisher authorization.** A verified publisher identity and its authorized signing keys must be bound to a specific plugin ID and version namespace. A valid signature from a key not authorized for that namespace must not authorize a release.
5. **Signed identity and coverage.** A signature must cover a canonical manifest and the complete executable payload closure, including the entry module hash and every executable module or asset that can affect execution. Verification must identify the exact immutable bytes, not merely a package label or top-level manifest.
6. **Revocation authority and format.** The design must name the authoritative revocation source and define an authenticated revocation data format, such as a signed revocation list or CRL, including publisher/key/release identifiers, reason, issuance metadata, and the authority permitted to publish it.
7. **Revocation delivery and unavailable data.** Revocation data must have an authenticated distribution path and explicit offline, unavailable, and expired-data behavior. When policy requires current revocation information and freshness cannot be established, verification must fail closed rather than silently using stale or absent data.
8. **Key rotation interaction.** A key-rollover protocol must state how verifiers recognize old and new authorized keys, how overlap is authenticated, and when old keys cease to be valid. Signature verification must apply that protocol together with trust-root and revocation state.
9. **Pre-import fail-closed verification.** Every enable or import must verify immutable bytes immediately before module import and fail closed on failure. `add` accepts a mutable directory, while load imports the declared `entryPath` directly; therefore verification cannot be satisfied only at add time. Any changed content, incomplete payload closure, read mismatch, or time-of-check/time-of-use race between verification and import must prevent import.
10. **Monotonic versioning and freshness.** Signed metadata and authenticated revocation state must carry issue time, expiry, sequence, and a monotonic version or epoch. The design must set a maximum acceptable age, fail closed on replay or stale data, and resist local state rollback so an older signed release or revocation view cannot regain authority.
11. **Downgrade protection.** Verification must prevent fallback to an unsigned release or an otherwise less-protected prior release when a signed policy applies. Compatibility handling must never create a path that silently downgrades a protected plugin to unsigned trust.
12. **Progressive rollout and failure behavior.** Adoption must be phased with explicitly defined compatibility states, operator migration steps, and failure behavior for legacy plugins, registries, and clients. A state that requires signing must reject invalid, missing, or unverifiable signatures; it must not silently relax to unsigned execution.

This is a proposal only; no signature verification is implemented in this release.
