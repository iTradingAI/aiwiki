# Complete Security Guide

AIWiki is a local CLI. It writes Markdown, JSON, derived metadata, and configuration files under paths selected by the caller. This guide explains the operational boundaries that supplement the vulnerability-reporting policy in the repository root.

## Trust boundaries

### Workspace and local files

AIWiki operates on local files within the workspace or another path explicitly supplied by the caller. A workspace path, its symlinks, generated Markdown, and every input payload are untrusted until the caller has reviewed them. Do not treat a command as authorization to read or write unrelated personal directories, and investigate any path traversal, symlink escape, or write outside the explicit target as a security issue.

### Agent synchronization

Agent synchronization is an explicit local operation. AIWiki updates supported local Agent integration files only when the caller invokes the corresponding Agent-sync command; it does not discover, connect to, or synchronize with Agents automatically. Review the command, target workspace, and files to be changed before running it.

### Extensions

Extensions remain inactive until explicitly enabled. Enablement is the containment boundary: it is the only administration operation that imports a declared extension module. Inspect, add, disable, remove, and doctor operate on metadata or static declarations without importing that entry. If an extension cannot be loaded or its declaration is invalid, treat the failure as isolated to that extension; keep it disabled and investigate it before another explicit enablement attempt.

## No-telemetry policy

AIWiki has no telemetry, analytics, or automatic reporting. It does not upload workspace contents, command data, identifiers, diagnostics, or derived metadata. All knowledge-base processing and configuration writes occur locally. The host assistant, not AIWiki, decides whether to read external sources and what content to pass to the CLI.

## Supply-chain verification

Use the following steps when installing or publishing the npm package:

1. Install the expected package name and version from the npm registry, preferably with a committed lockfile and `npm ci`. Do not bypass npm integrity failures or substitute an unverified tarball.
2. Before a release, run `npm run release:check` and `npm pack --dry-run`. Confirm that the package contains the root reporting policy and both complete security guides, and inspect the file list for unexpected executable or configuration content.
3. After publishing, confirm the published package name, version, tarball URL, and integrity metadata with `npm view @itradingai/aiwiki@<version> dist.tarball dist.integrity`. Install or inspect that exact published artifact through npm rather than trusting a copied package directory.
4. For local extensions, review the declared entry and its dependency closure before explicitly enabling it. The future cryptographic verification path is described in [Plugin Signing Proposal](plugins/PERMISSIONS.md#plugin-signing-proposal); it is a proposal only and does not provide signature verification today.

Report suspected package substitution, integrity failures, or unexpected extension execution through the private vulnerability-reporting process in [SECURITY.md](../SECURITY.md).
