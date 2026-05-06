# AIWiki Agent Instructions

This repository contains the AIWiki Skill and CLI.

## Scope Boundary

- User-facing name: `AIWiki Skill`.
- Runtime directory name: `aiwiki`.
- CLI command: `aiwiki`.
- Do not use edition qualifiers in user-facing names, paths, or commands.
- AIWiki supports exactly one knowledge base.
- Multi-knowledge-base support is out of scope for this repository.
- The base CLI must not become a general webpage scraper.
- Host Agents fetch webpages or receive body content; AIWiki structures and writes local knowledge files.

## Implementation Order

1. Keep the documented payload and directory layout stable before changing behavior.
2. Implement P0 commands from the internal PRD.
3. Verify behavior against the internal test spec.

## Verification

- Tests must not write to the user's real knowledge base unless explicitly configured.
- No AIWiki command should expose `kb add`, `kb list`, or `kb default`.
- Fetch failures must produce a useful `processing-summary.md`.
