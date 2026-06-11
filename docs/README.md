# AIWiki Docs

AIWiki is a local Markdown knowledge base for AI assistants.

This docs folder keeps the public guides short and task-oriented. The main README is the product entry point; these files explain daily use, assistant handoff, examples, release checks, and roadmap boundaries.

## Start Here

- [Main README](../README.md)
- [Chinese README](../README.zh-CN.md)
- [Usage Guide](USAGE.md)
- [FAQ](FAQ.md)
- [Agent Handoff](AGENT_HANDOFF.md)
- [Showcase](SHOWCASE.md)
- [Trial Feedback Template](TRIAL_FEEDBACK_TEMPLATE.md)
- [Roadmap](ROADMAP.md)
- [Release Notes](RELEASE.md)

## Chinese Docs

- [Chinese Docs Home](README.zh-CN.md)
- [Chinese Usage Guide](USAGE.zh-CN.md)
- [Chinese Agent Handoff](AGENT_HANDOFF.zh-CN.md)
- [Chinese FAQ](FAQ.zh-CN.md)
- [Chinese Showcase](SHOWCASE.zh-CN.md)
- [Chinese Roadmap](ROADMAP.zh-CN.md)
- [Chinese Release Notes](RELEASE.zh-CN.md)

## Examples

- [`../examples/demo-run/`](../examples/demo-run/) records input files, CLI commands, and outputs from a regenerated run.
- [`../examples/obsidian-vault-sample/`](../examples/obsidian-vault-sample/) is a sample Markdown vault showing the current core-first artifact contract.
- [`../examples/public-trial-scenarios/`](../examples/public-trial-scenarios/) contains three public-trial scenarios: article research, topic planning, and project decision memory.

## Core Workflow

```text
AI assistant reads a source
  -> AIWiki writes local Markdown artifacts
  -> assistant retrieves context with aiwiki context
  -> aiwiki lint checks structure and consistency
```

For public trials, keep the first loop to one source and one question: setup, ingest, inspect the run artifacts, query/context reuse, lint/doctor, and a short feedback note.

The scenario pack gives users copyable sample inputs, expected generated artifacts, reuse prompts, long-term maintenance value, and WeChat-group-ready copy for each trial path.

## Important Boundaries

AIWiki does not fetch webpages, call an LLM, install Obsidian plugins, run vector search, or manage multiple knowledge bases. The host assistant reads sources; AIWiki validates, writes, links, queries, and checks the local Markdown knowledge base.
