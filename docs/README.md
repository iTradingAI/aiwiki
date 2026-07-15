# AIWiki Docs

AIWiki is a local Markdown knowledge base for AI assistants.

This docs folder keeps the public guides short and task-oriented. The main README is the product entry point; these files explain daily use, assistant handoff, examples, release checks, and roadmap boundaries.

## Start Here

- [Main README](../README.md)
- [Chinese README](../README.zh-CN.md)
- [Usage Guide](USAGE.md)
- [FAQ](FAQ.md)
- [Agent Handoff](AGENT_HANDOFF.md)
- [Core Intent Matrix](AGENT_HANDOFF.md#core-intent-matrix)
- [Showcase](SHOWCASE.md)
- [Trial Feedback Template](TRIAL_FEEDBACK_TEMPLATE.md)
- [Operating Feedback Loop](OPERATING_FEEDBACK_LOOP.md)
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
  -> AIWiki groups them as a Source Capsule
  -> assistant retrieves context with aiwiki context
  -> aiwiki lint checks structure and consistency
```

In 0.3.0, human `aiwiki query` output defaults to Source Capsules. Agent integrations can keep using stable `aiwiki.context.v1`, or request capsule JSON with `aiwiki context "<topic>" --view capsule`.

For public trials, keep the first loop to one source and one question: setup, ingest, inspect the run artifacts, query/context reuse, lint/doctor, and a short feedback note.

The scenario pack gives users copyable sample inputs, expected generated artifacts, reuse prompts, long-term maintenance value, and WeChat-group-ready copy for each trial path.

For natural-language matching, use the [Core Intent Matrix](AGENT_HANDOFF.md#core-intent-matrix): every supported path identifies the preferred command, how to interpret its output, and when a fallback is allowed.

Use the [Operating Feedback Loop](OPERATING_FEEDBACK_LOOP.md) to classify trial feedback into installation, first-use, ingest-result, directory, query-reuse, and feature-request signals before promoting anything into the managed queue.

## Public Integration API

Core integrations use only these ESM package entry points:

```ts
import { AIWIKI_PUBLIC_API_VERSION, createAiwikiCli, type AiwikiArtifact } from "@itradingai/aiwiki";
import type { ContextResult } from "@itradingai/aiwiki/contracts";

const cli = createAiwikiCli();
console.log(AIWIKI_PUBLIC_API_VERSION); // aiwiki.public.v1
void cli;
void (undefined as AiwikiArtifact | ContextResult | undefined);
```

`@itradingai/aiwiki` exports the stable Core facade. `@itradingai/aiwiki/contracts` exports the version marker and public types for compatibility checks. Do not import `@itradingai/aiwiki/src/**`, `@itradingai/aiwiki/dist/src/**`, or any other unlisted deep path: those are internal implementation details and are intentionally blocked by the package export map.

## Important Boundaries

AIWiki does not fetch webpages, call an LLM, install Obsidian plugins, run vector search, or manage multiple knowledge bases. The host assistant reads sources; AIWiki validates, writes, links, queries, and checks the local Markdown knowledge base.
