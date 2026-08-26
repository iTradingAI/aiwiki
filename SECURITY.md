# Security Policy

AIWiki is a local CLI that writes Markdown, JSON, derived metadata, and configuration files under paths selected by the caller.

## Supported Versions

| Version | Supported |
| --- | --- |
| 0.5.1 | Yes |
| 0.5.0 and earlier | No |

Security fixes are delivered in the latest patch release. Upgrade before reporting a problem that is already fixed there.

## Security Boundary

AIWiki does not upload a knowledge base, fetch webpages, bypass authentication or paywalls, install Obsidian plugins, or scan unrelated personal directories by itself. The host assistant is responsible for reading external sources and deciding what content to pass to AIWiki.

AIWiki is not a sandbox. It runs with the operating-system permissions of the invoking user. Commands may write within the workspace or other explicit target paths, and explicit Agent-sync commands may update supported local Agent integration files. Treat untrusted payloads, local extensions, workspace paths, symlinks, and generated Markdown as untrusted input.

Examples of security-sensitive behavior include path traversal or symlink escape, writes outside an explicit target, unintended disclosure of local content, unsafe extension containment, or corruption that crosses the documented workspace boundary.

## Report a Vulnerability Privately

Do **not** disclose vulnerability details in a public GitHub issue, discussion, pull request, or other public channel.

Submit a private report through [GitHub Private Vulnerability Reporting](https://github.com/iTradingAI/aiwiki/security/advisories/new). Include, when safe:

- the affected AIWiki version and operating system;
- the command and relevant flags;
- the expected and observed path behavior;
- a minimal reproduction using non-sensitive sample data;
- the impact and any known mitigations.

If the private-report form is unavailable, do not post the details publicly. Publication is blocked until the project provides a working private route.

Public, non-security bugs may be reported through [GitHub Issues](https://github.com/iTradingAI/aiwiki/issues) after removing secrets, private paths, and sensitive knowledge-base content.

## Response Expectations

Maintainers aim to acknowledge a private report within 3 business days and provide an initial assessment within 7 calendar days. Validation, remediation, and coordinated disclosure timing depend on severity and reproducibility. Please allow maintainers to investigate and prepare a fix before public disclosure.

See [docs/SECURITY.md](docs/SECURITY.md) for the complete security guide.
