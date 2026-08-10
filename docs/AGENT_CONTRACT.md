# AIWiki Agent Contract

This contract defines how an agent creates, retrieves, evaluates, and maintains local AIWiki knowledge. It is a behavior contract over the versioned public API (`aiwiki.public.v1`), CLI, and MCP server; it does not authorize an agent to make unsupported factual claims.

## Lifecycle flow

Use the knowledge lifecycle as a feedback loop, not a one-way publishing pipeline:

```text
ingest
  → rebuild/index/graph when explicitly requested
  → context/query
  → show
  → lint
  → health
  → repair, re-ingest, or reassess
  └───────────────────────────────────────→
```

1. **Ingest** an inline agent payload with captured source content and source metadata. Preserve provenance and represent failed capture honestly.
2. **Rebuild/index/graph** only when the user explicitly requests status, build, or rebuild. Retrieval remains Markdown-backed when derived metadata is missing, stale, or invalid; do not silently write derived data during an ordinary answer.
3. **Context/query** to select reusable knowledge. Prefer `context` for structured agent decisions and `query` for a human-readable capsule list.
4. **Show** when the answer depends on one capsule's provenance, artifacts, lifecycle, or OKF readiness.
5. **Lint** before a maintenance or cleanup claim. Use its category, severity, and suggested action to identify the source of a problem.
6. **Health** to evaluate the whole workspace and prioritize the next maintenance action. Health must lead back to repair, re-ingest, lifecycle review, or evidence enrichment where needed.

## Stable result contracts

Agents must branch on `schema_version`, not on incidental field order or rendered text. These result contracts are stable within `aiwiki.public.v1`:

| Schema version | Producer | Required agent behavior |
| --- | --- | --- |
| `aiwiki.context.v1` | simple context | Inspect `query_scope`, `result_quality`, match-level grounding fields, warnings, and `recommended_next_action`. |
| `aiwiki.context.capsule.v1` | capsule context | Inspect primary artifact, lifecycle warnings, `okf.ready`, `missing_context`, and recommendation before reuse. |
| `aiwiki.context.v2` | graph context | Inspect graph state, relationship path/origin, evidence status, lifecycle/risk, `must_not_claim`, missing context, and recommendation before relationship claims. |
| `aiwiki.health.v1` | health | Use summary/metrics and recommended actions to prioritize maintenance; do not treat the report as source evidence for a domain claim. |

Additive fields may appear in a compatible release. Agents must ignore unknown fields and must not assume an omitted optional field has a positive meaning.

## Retrieval and answer protocol

1. Query the narrowest appropriate view. For a general knowledge question, start with `context`; for a source package, provenance, lifecycle, or readiness question, use capsule context or `show`; use graph context only for explicit relationship tracing when graph state is fresh.
2. Read quality and gap signals before drafting. A no-match, warning, stale graph, missing primary, or missing evidence signal must narrow the answer or trigger the recommended next action.
3. Prefer a capsule with a primary artifact, no lifecycle warnings, and `okf.ready: true`. Explain when that standard cannot be met.
4. Include source/provenance, confidence, known gaps, lifecycle/OKF warnings, and the next action when they materially affect the answer.
5. Do not automatically build/rebuild the index or graph. Do not convert a relationship path, generated metadata, or a weak evidence status into an unsupported causal or factual assertion.

The detailed retrieval rules are in [`skill/QUERY_PROTOCOL.md`](../skill/QUERY_PROTOCOL.md). Maintenance and repair rules are in [`skill/LINT_PROTOCOL.md`](../skill/LINT_PROTOCOL.md).

## OKF readiness protocol

OKF readiness is a reusable-knowledge quality gate projected from an artifact. A capsule is ready only when its projection has no readiness warnings. The primary artifact should provide:

- a `type` (missing type is an error);
- a title;
- a description or summary;
- a `resource` or source URL when applicable;
- a `timestamp` or `created_at` value; and
- a `Citations` section or equivalent source evidence in the body.

`okf.ready: false` is not an automatic rejection of the content. It means the agent must report the missing readiness evidence, avoid presenting the capsule as fully reusable, and follow `review_okf_readiness` or the lint guidance. Run `lint --okf --json` (or strict/maintenance lint as appropriate) to obtain actionable findings.

## Lifecycle state machine

`KnowledgeStatus` values are `active`, `needs_review`, `stale`, `superseded`, `contradicted`, `archived`, and `unknown`. AIWiki validates and projects these states but does not infer an unrecorded state transition. An agent changing lifecycle frontmatter must make the transition evidence-backed and update related references.

```text
unknown ──(classify)────────────────────────────→ active | needs_review
active ──(review needed / evidence expires)─────→ needs_review | stale
needs_review ──(confirm with evidence)──────────→ active
needs_review ──(not current)────────────────────→ stale | superseded | contradicted | archived
stale ──(reconfirm)─────────────────────────────→ active | needs_review
active / needs_review / stale ──(replaced)──────→ superseded
active / needs_review / stale ──(refuted)───────→ contradicted
any nonterminal state ──(retire)────────────────→ archived
```

`superseded`, `contradicted`, and `archived` are high-risk for current-answer reuse. Record the corresponding target in `superseded_by` or `contradicted_by` when applicable. Never reactivate such knowledge solely because it matches a query: review the replacement, contradiction, or archive rationale first. `unknown` is a parsing/default state that requires qualification. `isAnswerSafeByDefault` is true only for `active` and `unknown`, and is not a substitute for evidence review.

## Evidence requirements (AD3)

Evidence travels with results and must be evaluated where it appears:

- Lifecycle: inspect `evidenceCount`, `evidenceRefs`, confidence, staleness, validity window, and warnings.
- Simple context: inspect grounding availability/review flags, grounding markers, quality signals, match reasons, and warnings on each match.
- Capsule context/show: inspect the primary artifact, lifecycle, quality, and OKF projection.
- Graph context: inspect every relationship's path, `evidence_status`, lifecycle status, risk, and `must_not_claim` list.

A claim must be traceable to local artifacts or explicitly qualified as lacking support. Generated metadata, capsule membership, or a local wikilink is weaker than explicit frontmatter evidence. An empty or missing evidence collection never grants permission to infer support.

## Relationship semantics (AD2)

A typed relationship is `{ type, target, evidence?, confidenceLevel?, note? }`. The accepted `RelationshipType` values are:

| Type | Intended meaning |
| --- | --- |
| `derives_from` | this item is derived from the target |
| `derived_from` | compatibility spelling of derivation from the target |
| `summarizes` | this item summarizes the target |
| `supports` | this item supplies support for the target |
| `contradicts` | this item conflicts with the target |
| `updates` | this item updates the target |
| `supersedes` | this item replaces the target |
| `superseded_by` | this item is replaced by the target |
| `related_to` | related without a stronger asserted direction |
| `used_by` | the target uses this item |
| `mentions_topic` | this item mentions the target topic |
| `uses` | this item uses the target |
| `depends_on` | this item depends on the target |
| `mentions` | this item mentions the target |

Use frontmatter codec functions to normalize relationships, graph operations to materialize/check `aiwiki.graph.v1`, and graph context v2 to trace them. Validate every relationship before writing it. Relationship syntax does not itself prove the assertion; include `evidence`, confidence, and note when available.

## MCP-to-CLI mapping

| MCP tool | Equivalent CLI intent | Notes |
| --- | --- | --- |
| `aiwiki_ingest` | `aiwiki ingest-agent --stdin --path <workspace>` | MCP only accepts an inline payload; CLI may use its supported ingestion inputs. |
| `aiwiki_context` | `aiwiki context <query> --path <workspace>` | MCP `view: "graph"` corresponds to `--view graph`; simple is the default. |
| `aiwiki_query` | `aiwiki query <query> --path <workspace>` | Both render a human-readable capsule query. |
| `aiwiki_show` | `aiwiki show <query-or-id> --path <workspace>` | MCP also supports confined `artifactPath`. |
| `aiwiki_lint` | `aiwiki lint --path <workspace> --json` | MCP exposes the baseline workspace lint. |
| `aiwiki_health` | `aiwiki health --path <workspace> --json` | Both compute a health report rather than writing a dashboard. |

## Versioning

All agent-facing contracts are versioned. The SDK boundary is `aiwiki.public.v1`; machine-readable result schemas carry their own `schema_version`; MCP negotiates protocol version `2025-06-18`. Before using a result, verify its advertised version is one the agent understands. On an unknown major contract version, preserve the result for inspection and decline to make automation decisions from it.
