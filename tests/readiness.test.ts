import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { rm } from "node:fs/promises";
import { test } from "node:test";

import { buildWorkspaceDiagnosticSnapshot, deriveWorkspaceReadiness, statusEnvelope, type WorkspaceDiagnosticSnapshot } from "../src/readiness.js";
import { initWorkspace } from "../src/workspace.js";
import { tempRoot } from "./helpers.js";

const baseSnapshot: WorkspaceDiagnosticSnapshot = {
  generatedAt: "2026-08-12T10:00:00.000Z",
  workspace: "/tmp/aiwiki",
  workspaceAccess: "ok",
  writeCapability: { state: "ok", method: "access_check", detail: "/tmp/aiwiki" },
  schema: "compatible",
  checks: [],
  activity: { runCount: 1, failedCount: 0, lastRunId: "success", lastSuccessRunId: "success" },
  content: {
    wikiEntries: 1,
    sourceCards: 1,
    rawFiles: 1,
    topics: 0,
    outlines: 0,
    fallbackEntries: 0,
    groundingReviewEntries: 0,
    capsuleCount: 1,
    capsuleWithPrimaryCount: 1,
    entropyRisk: "low",
    lifecycleRisk: "low",
    okfReadyCount: 1
  },
  lint: {
    live: { source: "live", errors: 0, warnings: 0, info: 0 },
    stored: { state: "missing", observedAt: null, reportPath: null }
  }
};

test("readiness derives the five states in fixed priority order", () => {
  const cases: Array<[string, WorkspaceDiagnosticSnapshot, string]> = [
    ["blocked access", { ...baseSnapshot, workspaceAccess: "blocked" }, "repair_required"],
    ["missing structure", { ...baseSnapshot, checks: [{ id: "workspace_config", name: "aiwiki.yaml", state: "missing", method: "exists", detail: "/tmp/aiwiki/aiwiki.yaml" }] }, "setup_required"],
    ["empty workspace", { ...baseSnapshot, activity: { runCount: 0, failedCount: 0 } }, "first_ingest_required"],
    ["live warning", { ...baseSnapshot, lint: { ...baseSnapshot.lint, live: { source: "live", errors: 0, warnings: 1, info: 0 } } }, "review_required"],
    ["healthy", baseSnapshot, "ready"]
  ];
  for (const [label, snapshot, expected] of cases) {
    assert.equal(deriveWorkspaceReadiness(snapshot).state, expected, label);
  }
});

test("repair conditions take priority over setup and expose manual recovery", () => {
  const snapshot: WorkspaceDiagnosticSnapshot = {
    ...baseSnapshot,
    workspaceAccess: "blocked",
    schema: "unsupported",
    checks: [{ id: "workspace_config", name: "aiwiki.yaml", state: "missing", method: "exists", detail: "/tmp/aiwiki/aiwiki.yaml" }],
    activity: { runCount: 0, failedCount: 0 }
  };
  const result = deriveWorkspaceReadiness(snapshot);
  assert.equal(result.state, "repair_required");
  assert.equal(result.actions[0]?.id, "restore_workspace_access");
  assert.equal(result.actions[0]?.kind, "manual");
  assert.equal(result.actions[0]?.verification_command?.args[0], "doctor");
});

test("unsupported schema and live lint errors are blocking repair states", () => {
  const schemaResult = deriveWorkspaceReadiness({ ...baseSnapshot, schema: "unsupported" });
  assert.equal(schemaResult.state, "repair_required");
  assert.equal(schemaResult.actions[0]?.id, "review_schema");

  const lintResult = deriveWorkspaceReadiness({
    ...baseSnapshot,
    lint: { ...baseSnapshot.lint, live: { source: "live", errors: 1, warnings: 0, info: 0 } }
  });
  assert.equal(lintResult.state, "repair_required");
  assert.equal(lintResult.actions[0]?.id, "review_repair_plan");
});

test("zero successful runs precede low-quality review and later success clears an old failure", () => {
  const emptyLowQuality = {
    ...baseSnapshot,
    activity: { runCount: 1, failedCount: 1, lastRunId: "failed", lastFailureRunId: "failed" },
    content: { ...baseSnapshot.content, fallbackEntries: 1 }
  };
  assert.equal(deriveWorkspaceReadiness(emptyLowQuality).state, "first_ingest_required");

  const laterSuccess = {
    ...baseSnapshot,
    activity: { runCount: 2, failedCount: 1, lastRunId: "success", lastSuccessRunId: "success", lastFailureRunId: "failed" }
  };
  assert.equal(deriveWorkspaceReadiness(laterSuccess).state, "ready");
});

test("readiness actions expose stable ordered machine contracts", () => {
  const result = deriveWorkspaceReadiness({ ...baseSnapshot, activity: { runCount: 0, failedCount: 0 } });
  assert.deepEqual(result.actions, [{
    rank: 1,
    id: "ingest_first_source",
    kind: "aiwiki_command",
    blocking: true,
    reason_code: "no_successful_ingest",
    command: { executable: "aiwiki", args: ["ingest-file", "--file", "<file>", "--path", "/tmp/aiwiki"] },
    verification_command: { executable: "aiwiki", args: ["status", "--json", "--path", "/tmp/aiwiki"] }
  }]);
});

test("review actions retain stable precedence and contiguous ranks", () => {
  const snapshot: WorkspaceDiagnosticSnapshot = {
    ...baseSnapshot,
    writeCapability: { ...baseSnapshot.writeCapability, state: "unknown" },
    activity: { runCount: 2, failedCount: 1, lastRunId: "failure", lastSuccessRunId: "success", lastFailureRunId: "failure" },
    content: { ...baseSnapshot.content, fallbackEntries: 1 },
    lint: { ...baseSnapshot.lint, live: { source: "live", errors: 0, warnings: 1, info: 0 } }
  };
  const result = deriveWorkspaceReadiness(snapshot);
  assert.equal(result.state, "review_required");
  assert.deepEqual(result.actions.map(({ rank, id }) => ({ rank, id })), [
    { rank: 1, id: "verify_workspace_access" },
    { rank: 2, id: "inspect_failed_run" },
    { rank: 3, id: "review_repair_plan" },
    { rank: 4, id: "review_low_quality_content" }
  ]);
});

test("shared snapshot is deterministic at a fixed time and performs no mutations", async () => {
  const root = await tempRoot("aiwiki-readiness-read-only");
  const mutationMethods = ["writeFile", "appendFile", "unlink", "mkdir", "rename", "rm", "copyFile"] as const;
  const originals = new Map<string, unknown>();
  const calls: string[] = [];
  const now = "2026-08-12T10:00:00.000Z";
  try {
    await initWorkspace(root);
    for (const method of mutationMethods) {
      originals.set(method, fs[method]);
      Object.defineProperty(fs, method, {
        configurable: true,
        value: async (..._args: unknown[]) => {
          calls.push(method);
          throw new Error(`unexpected mutation: ${method}`);
        }
      });
    }

    const first = await buildWorkspaceDiagnosticSnapshot(root, now);
    const second = await buildWorkspaceDiagnosticSnapshot(root, now);
    assert.deepEqual(second, first);
    assert.deepEqual(calls, []);
    assert.equal(first.lint.live.source, "live");

    const status = statusEnvelope(first);
    assert.deepEqual(status.lint, {
      live: { source: "live", reason_code: null, errors: 0, warnings: 0, info: first.lint.live.info },
      stored: { state: "missing", observed_at: null, report_path: null }
    });
  } finally {
    for (const [method, original] of originals) {
      Object.defineProperty(fs, method, { configurable: true, value: original });
    }
    await rm(root, { recursive: true, force: true });
  }
});
