# AIWiki Operating Feedback Loop

AIWiki uses a feedback-light operating loop. Low group feedback is treated as a signal to create clearer trials, cases, and questions; it is not a reason to jump into broad new features.

This document connects public trial feedback, quiet periods, monthly roadmap review, and the managed development queue.

## Weekly Trial Feedback Template

Use this once per week when reviewing WeChat group posts, GitHub issues, direct messages, trial notes, and silence.

```text
Week:
Reviewer:
Sources reviewed:
- WeChat group:
- GitHub issues:
- Direct messages:
- Trial notes:
- Silent trial paths:

Signal classification:
- installation:
  - Node.js/npm install:
  - global command path:
  - assistant reload:
- first-use:
  - setup clarity:
  - placeholder/path confusion:
  - first successful command:
- ingest-result:
  - source type:
  - generated files understood:
  - failure recorded clearly:
- directory:
  - could find run/source/wiki files:
  - Obsidian or plain Markdown view:
  - lint/doctor clarity:
- query-reuse:
  - useful match:
  - match reasons understood:
  - writing/research/decision/review reuse:
- feature-request:
  - requested capability:
  - affected workflow:
  - suggested classification: keep / defer / Pro / reject

Silent signals:
- Trial step with no feedback:
- Likely friction:
- Next prompt, case, or doc to publish:

This week's decision:
- keep:
- defer:
- Pro:
- reject:
- no-change:

Queue candidates:
- Candidate:
  - user problem:
  - evidence:
  - affected first-use/reuse/maintenance path:
  - boundary check:
```

## Signal Categories

Use these categories before deciding whether anything belongs in the development queue.

| Category | What It Means | Typical Response |
| --- | --- | --- |
| installation | Node.js, npm, global command, assistant reload, or path setup failed. | Improve install prompt, FAQ, or `doctor` guidance before adding product features. |
| first-use | The user did not know what to do after install. | Improve Quick Start, Usage, Showcase, or sample scenarios. |
| ingest-result | The first source did not become understandable files. | Improve Agent handoff, examples, generated-file explanation, or ingest diagnostics. |
| directory | The user could not find or trust generated files. | Improve docs, dashboard examples, status/lint output, or file naming guidance. |
| query-reuse | `query`/`context` found content but the reuse value was unclear. | Improve reuse guidance, examples, and assistant instructions. |
| feature-request | The user asks for crawling, multi-KB, vector search, RBAC, RSS, or similar expansion. | Classify through keep/defer/Pro/reject before entering the base queue. |

## Monthly Roadmap Review Template

Use this once per month, or after a concentrated public trial round.

```text
Month:
Reviewer:
Package version reviewed:

1. What improved first-use success?
- Evidence:
- Keep doing:

2. What reduced user understanding cost?
- Evidence:
- Keep doing:

3. What improved knowledge reuse?
- Evidence:
- Keep doing:

4. What kept Agent behavior command-first?
- Evidence:
- Keep doing:

5. What created repeated support load?
- Evidence:
- Candidate action:

6. What should not enter the base queue?
- Requested item:
- Reason: outside base / too early / Pro / no evidence / conflicts with local-first boundary

7. Queue decisions
- keep:
  - task:
  - evidence:
  - acceptance criteria:
- defer:
  - topic:
  - missing evidence:
- Pro:
  - topic:
  - why base should not absorb it:
- reject:
  - topic:
  - reason:

8. Next operating moves
- trial task to run:
- case to publish:
- FAQ or docs improvement:
- question to ask the group:
```

## Queue Entry Criteria

Group feedback does not directly become a feature. A candidate must satisfy at least two criteria before entering the base AIWiki queue:

- improves first-use success;
- reduces user understanding cost;
- improves local knowledge reuse;
- makes host Agents use AIWiki commands more reliably;
- reduces repeated support questions;
- preserves the base product boundary.

The candidate must also include:

- user problem;
- source of evidence;
- affected workflow step;
- acceptance criteria;
- explicit out-of-scope checks;
- remote verification plan when the package needs publishing.

## Low-Feedback Operating Mode

When group feedback is low:

- run a small trial task yourself and publish the exact steps;
- publish one scenario from `examples/public-trial-scenarios/`;
- ask one narrow question instead of asking for general opinions;
- classify silence by trial step, not by imagined feature demand;
- improve the next trial prompt before adding new CLI surface;
- keep a `no-change` decision when there is no evidence.

Do not interpret silence as permission to add crawling, vector search, browser plugins, multi-KB, RBAC, RSS, scheduled collection, or telemetry.

## Telemetry Boundary

AIWiki does not add CLI telemetry in this operating loop.

Any future telemetry must be designed as a separate opt-in task with clear user consent, data fields, storage, retention, disable behavior, and documentation. Until then, feedback is collected through templates, issues, group discussion, and manual trial notes.
