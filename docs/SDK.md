# AIWiki SDK Reference

The supported Node.js SDK entry point is `@itradingai/aiwiki`. Its compatibility boundary is the API version constant:

```ts
import * as aiwiki from "@itradingai/aiwiki";

if (aiwiki.AIWIKI_PUBLIC_API_VERSION !== "aiwiki.public.v1") {
  throw new Error("Unsupported AIWiki public API");
}
```

`aiwiki.public.v1` is additive and stable from AIWiki 0.7.0. A compatible release may add exports, optional fields, enum values, or result fields, but will not remove or change the meaning of existing public exports within this version. Consumers must ignore result fields they do not understand and should preserve unknown frontmatter fields. Breaking changes require a future v2 public API.

All path arguments identify a workspace root unless otherwise noted. Operations that read a workspace are asynchronous because they traverse local Markdown artifacts.

## Install and entry points

```ts
import {
  buildContext,
  buildGraphContext,
  buildHealthReport,
  ingestPayload,
  lintWorkspace,
  createAiwikiCli
} from "@itradingai/aiwiki";
import type { ContextResult, GraphContextResult, HealthReport } from "@itradingai/aiwiki/contracts";
```

The `/contracts` entry point exports the complete public type surface, including graph, health, relationship, lifecycle, and option types. The root entry point re-exports the commonly used types listed in [Public types](#public-types).

## Ingest

```ts
function ingestPayload(rootPath: string, rawPayload: unknown): Promise<IngestResult>
function ingestFile(rootPath: string, filePath: string): Promise<IngestResult>
```

`ingestPayload` validates and stores an `aiwiki.agent_payload.v1`-compatible inline payload. `ingestFile` creates a payload from a non-empty UTF-8 file; it is appropriate for SDK/CLI callers, but is deliberately unavailable through MCP. Both return an `IngestResult` with `runId`, `runDir`, `generatedFiles`, `warnings`, and `agentReport`.

### 1.0.2 safety-hotfix deviation

`ingestPayload` and `ingestFile` now reject payloads larger than 10 MiB before any workspace write. The public signatures and `IngestResult` fields remain unchanged, but new successful runs retain only `manifest.json` and `processing-summary.md`; `generatedFiles` therefore no longer contains duplicate run copies of Raw, Source Card, or Wiki Entry. Legacy workspaces remain readable. Catch the rejection, reduce or split the input, and retry.

```ts
const result = await ingestPayload("./knowledge", {
  schema_version: "aiwiki.agent_payload.v1",
  source: {
    kind: "web",
    title: "Example source",
    url: "https://example.test/article",
    content_format: "markdown",
    content: "Captured source text",
    fetcher: "host-agent",
    fetch_status: "ok",
    captured_at: new Date().toISOString()
  },
  request: { mode: "ingest", outputs: ["source_card", "wiki_entry"], language: "en" }
});
console.log(result.generatedFiles);
```

## Context and query

```ts
function buildContext(rootPath: string, query: string, options?: ContextOptions, now?: string): Promise<ContextResult>
function buildCapsuleContext(rootPath: string, query: string, options?: CapsuleContextOptions, now?: string): Promise<CapsuleContextResult>
function renderCapsuleQuery(rootPath: string, query: string, options?: CapsuleQueryOptions): Promise<string>
function showCapsule(rootPath: string, options: ShowCapsuleOptions): Promise<string>
function resolveCapsule(rootPath: string, options: ShowCapsuleOptions): Promise<SourceCapsule | undefined>
function renderCapsule(capsule: SourceCapsule, options?: Pick<ShowCapsuleOptions, "debug" | "allArtifacts">): string
```

`buildContext` returns the stable `aiwiki.context.v1` structured search result. `ContextOptions` accepts `filters` (`type`, `source_role`, `wiki_type`, `status`) and a positive `limit`. `buildCapsuleContext` returns `aiwiki.context.capsule.v1` with capsule readiness and missing-context guidance. `renderCapsuleQuery` and `showCapsule` return human-readable Markdown/text; set `ShowCapsuleOptions.json` when a serialized capsule is needed.

```ts
const context = await buildContext("./knowledge", "retrieval evaluation", {
  filters: { status: "active", type: "wiki_entry" },
  limit: 5
});
for (const item of context.matches.wiki_entries) console.log(item.path, item.score);

const capsule = await showCapsule("./knowledge", { id: "capsule-id", json: true });
```

## Source capsules and artifacts

```ts
function discoverArtifacts(root: string): Promise<AiwikiArtifact[]>
function readArtifact(root: string, absolutePath: string): Promise<AiwikiArtifact>
function buildCapsules(rootPath: string, now?: string): Promise<SourceCapsule[]>
```

Artifacts are the local Markdown files that AIWiki recognizes; capsules group related artifacts into a reusable source unit. `readArtifact` requires an absolute artifact path. Use `SourceCapsule` and `AiwikiArtifact` to inspect their normalized metadata, primary artifact, lifecycle, quality, and OKF readiness.

## Lint and health

```ts
function lintWorkspace(rootPath: string, now?: string, options?: CapsuleLintOptions): Promise<LintReport>
function buildHealthReport(rootPath: string, now?: string): Promise<HealthReport>
```

`lintWorkspace` reports structural, capsule, evidence, lifecycle, relationship, index, user-view, and quality findings. `buildHealthReport` returns the stable `aiwiki.health.v1` report with summary, metrics, ratios, lint-derived issues, and recommended actions.

`writeHealthReport(rootPath, report, now?)` is intentionally **internal**. It writes a dashboard and is not exported by `aiwiki.public.v1`; callers should consume `buildHealthReport` and decide themselves whether and where to persist it.

## Lifecycle and evidence

```ts
function defaultLifecycle(now: string): KnowledgeLifecycle
function lifecycleFromFrontmatter(frontmatter: Record<string, FrontmatterValue>): KnowledgeLifecycle
function lifecycleToFrontmatter(lifecycle: KnowledgeLifecycle): Record<string, FrontmatterValue>
function lifecyclePenalty(lifecycle: KnowledgeLifecycle): number
function lifecycleWarnings(lifecycle: KnowledgeLifecycle): string[]
function isAnswerSafeByDefault(lifecycle: KnowledgeLifecycle): boolean
```

Lifecycle metadata includes `knowledgeStatus`, confidence, validity window, staleness, evidence count/references, supersession/contradiction references, and warnings. `isAnswerSafeByDefault` is true only for `active` and `unknown` status; it is a conservative default, not a proof of factual correctness.

### Evidence API (AD3)

Evidence is an attribute of returned knowledge, not a detached lookup API. Inspect it where the result is consumed:

- `KnowledgeLifecycle` contains `evidenceCount`, `evidenceRefs`, confidence, staleness, and warnings.
- `ContextResult` match items expose `grounding_evidence_available`, `grounding_needs_review`, `grounding_markers`, quality signals, and warnings.
- `GraphContextResult.relationships` includes `evidence_status`, a complete `relationship_path`, lifecycle status, risk, and `must_not_claim` constraints.
- `SourceCapsule` carries lifecycle, quality, primary-artifact, and OKF data.

Agents must cite or qualify claims according to these attributes; absence of an evidence field is not evidence of support.

## Relationships and graph context

```ts
function relationshipsFromFrontmatter(frontmatter: Record<string, FrontmatterValue>): TypedRelationship[]
function relationshipsToFrontmatter(relationships: TypedRelationship[]): unknown[]
function validateRelationships(relationships: TypedRelationship[]): string[]
function isRelationshipType(value: string | undefined): value is RelationshipType

function buildRelationshipGraph(rootPath: string, now?: string): Promise<RelationshipGraph>
function inspectRelationshipGraph(rootPath: string): Promise<RelationshipGraphStatus>
function readRelationshipGraph(rootPath: string): Promise<RelationshipGraphRead>
function buildGraphContext(rootPath: string, query: string, options?: GraphContextOptions, now?: string): Promise<GraphContextResult>
```

### Relationship API (AD2): three layers

1. **Codec.** `relationshipsFromFrontmatter` and `relationshipsToFrontmatter` translate normalized frontmatter and `TypedRelationship[]`; `validateRelationships` returns validation warning codes before data is persisted.
2. **Graph engine.** `buildRelationshipGraph` materializes `aiwiki.graph.v1`; `readRelationshipGraph` returns both the graph and its freshness status, while `inspectRelationshipGraph` returns status alone. Graph edges retain their origin (`frontmatter`, compatibility frontmatter, wikilink, capsule membership, or generated metadata).
3. **Graph-context v2.** `buildGraphContext` consumes search seeds plus a graph, returning `aiwiki.context.v2`. Pass `graphDepth: 1 | 2 | 3`; inspect `graph.state`, `missing_context`, relationship evidence/risk, and `recommended_next_action` before answering.

```ts
const graph = await buildRelationshipGraph("./knowledge");
const context = await buildGraphContext("./knowledge", "rate limiting", { graphDepth: 2, limit: 5 });
if (context.graph.state === "fresh") {
  for (const relationship of context.relationships) {
    console.log(relationship.target.id, relationship.evidence_status, relationship.risk);
  }
}
```

## CLI adapter and workspace resolution

```ts
function createAiwikiCli(): AiwikiCli
function resolveWorkspace(rootPath: string): string
```

`createAiwikiCli()` returns an immutable adapter with `apiVersion` and `run(argv, streams?)`, where `run` resolves to the CLI exit code. `resolveWorkspace` resolves an explicit root according to the same workspace rules used by the CLI.

```ts
const cli = createAiwikiCli();
const exitCode = await cli.run(["lint", "--path", "./knowledge", "--json"]);
```

## Public types

The root entry point exports these types: `AiwikiArtifact`, `AiwikiCli`, `AiwikiCliStreams`, `CapsuleContextResult`, `ContextFilters`, `ContextResult`, `IngestResult`, `KnowledgeLifecycle`, `LintReport`, and `SourceCapsule`.

`@itradingai/aiwiki/contracts` additionally exports `FrontmatterValue`; graph types (`RelationshipGraph`, status/read/node/edge/summary types and `GraphEdgeOrigin`); `GraphContextOptions` and `GraphContextResult`; health types; `KnowledgeStatus`, `ConfidenceLevel`, and `Staleness`; `CapsuleQueryOptions`; `RelationshipType` and `TypedRelationship`; and `ShowCapsuleOptions`.
