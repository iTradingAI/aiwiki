# AIWiki Demo Run

This folder records one generated run from the current CLI contract.

## Inputs

- `input/local-article.md`: local Markdown input for `aiwiki ingest-file`.
- `input/agent-enriched-payload.json`: host-Agent payload with `analysis`, claims, topics, assets, and outline requests.

## Commands

```bash
aiwiki setup --path ../obsidian-vault-sample --yes
aiwiki ingest-file --file input/local-article.md --path ../obsidian-vault-sample
aiwiki ingest-agent --payload input/agent-enriched-payload.json --path ../obsidian-vault-sample
aiwiki status --path ../obsidian-vault-sample
aiwiki query "LLM Wiki" --path ../obsidian-vault-sample
aiwiki context "LLM Wiki" --path ../obsidian-vault-sample
aiwiki lint --json --path ../obsidian-vault-sample
```

The captured `*-output.*` files replace machine-specific paths with `<sample-vault>` and `<aiwiki-home>`.

## What To Inspect

- Core artifacts appear for both examples: Raw, Source Card, Wiki Entry, Run Summary, and Processing Summary.
- Optional directories are absent for the plain local-file ingest.
- Optional claims, assets, topics, and outline appear only for the enriched Agent payload that requested or supplied them.
