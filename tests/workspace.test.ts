import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { test } from "node:test";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { directorySummary, doctor, initWorkspace, readConfig, statusSummary } from "../src/workspace.js";
import { tempRoot } from "./helpers.js";

test("init creates layout and keeps existing config", async () => {
  const root = await tempRoot("aiwiki-init");
  try {
    const first = await initWorkspace(root);
    assert.equal(first.createdConfig, true);
    assert.equal(first.createdDirs.length, 9);
    assert.equal(first.seededFiles.filter((file) => file.created).length, 13);

    const configPath = path.join(root, "aiwiki.yaml");
    const original = await readFile(configPath, "utf8");
    const dashboardPath = path.join(root, "dashboards", "AIWiki Home.md");
    const reviewQueuePath = path.join(root, "dashboards", "Review Queue.md");
    const sourceCapsulesPath = path.join(root, "dashboards", "Source Capsules.md");
    const purposePath = path.join(root, "_system", "purpose.md");
    const indexPath = path.join(root, "_system", "index.md");
    const logPath = path.join(root, "_system", "log.md");
    const customDashboard = "# Custom AIWiki Home\n";
    const customReviewQueue = "# Custom Review Queue\n";
    const customPurpose = "# Custom Purpose\n";
    await writeFile(dashboardPath, customDashboard, "utf8");
    await writeFile(reviewQueuePath, customReviewQueue, "utf8");
    await writeFile(purposePath, customPurpose, "utf8");
    const second = await initWorkspace(root);
    const after = await readFile(configPath, "utf8");

    assert.equal(second.createdConfig, false);
    assert.equal(second.seededFiles.filter((file) => file.created).length, 0);
    assert.equal(after, original);
    assert.equal(await readFile(dashboardPath, "utf8"), customDashboard);
    assert.equal(await readFile(reviewQueuePath, "utf8"), customReviewQueue);
    assert.equal(await readFile(purposePath, "utf8"), customPurpose);
    assert.match(await readFile(indexPath, "utf8"), /AIWiki System Index/);
    assert.match(await readFile(logPath, "utf8"), /AIWiki System Log/);
    assert.match(await readFile(sourceCapsulesPath, "utf8"), /Source Capsules/);
    assert.match(await readFile(path.join(root, "_system", "schemas", "aiwiki-frontmatter.md"), "utf8"), /Dataview/);

    const summary = await directorySummary(root);
    assert.equal(summary.missing.length, 0);
    await assert.rejects(access(path.join(root, "04-claims", "_suggestions")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("config and doctor report fresh workspace", async () => {
  const root = await tempRoot("aiwiki-doctor");
  try {
    await initWorkspace(root);
    const config = await readConfig(root);
    assert.equal(config.product, "aiwiki");
    assert.equal(config.schemaVersion, "1");
    assert.match(config.createdAt, /^\d{4}-/);

    const checks = await doctor(root);
    assert.equal(checks.some((check) => check.status !== "ok"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor diagnostics never invoke mutation methods", async () => {
  const root = await tempRoot("aiwiki-doctor-read-only");
  const mutationMethods = ["writeFile", "unlink", "mkdir", "rename", "rm"] as const;
  const originals = new Map<string, unknown>();
  const calls: string[] = [];
  try {
    await initWorkspace(root);
    for (const method of mutationMethods) {
      originals.set(method, fs[method]);
      Object.defineProperty(fs, method, {
        configurable: true,
        value: async () => {
          calls.push(method);
          throw new Error(`diagnostic mutation attempted: ${method}`);
        }
      });
    }

    await doctor(root);
    assert.deepEqual(calls, []);
  } finally {
    for (const [method, original] of originals) {
      Object.defineProperty(fs, method, { configurable: true, value: original });
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor ignores missing optional enhancement directories", async () => {
  const root = await tempRoot("aiwiki-doctor-optional-dirs");
  try {
    await initWorkspace(root);
    await mkdir(path.join(root, "04-claims", "_suggestions"), { recursive: true });
    await rm(path.join(root, "04-claims"), { recursive: true, force: true });
    const checks = await doctor(root);
    assert.equal(checks.some((check) => check.name === "04-claims/_suggestions"), false);
    assert.equal(checks.some((check) => check.status !== "ok"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("status reads run directory without state machine", async () => {
  const root = await tempRoot("aiwiki-status");
  try {
    await initWorkspace(root);
    const summary = await statusSummary(root);
    assert.equal(summary.runCount, 0);
    assert.equal(summary.failedCount, 0);
    assert.equal(summary.fallbackCount, 0);
    assert.equal(summary.groundingReviewCount, 0);
    assert.equal(summary.lintStatus, "missing");
    assert.deepEqual(summary.systemFiles, [
      { path: "_system/purpose.md", status: "ok" },
      { path: "_system/index.md", status: "ok" },
      { path: "_system/log.md", status: "ok" }
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("status six run types health not runCount unknown not success", async () => {
  const root = await tempRoot("aiwiki-status-run-classification");
  const manifest = (runId: string, status: "success" | "fetch_failed") => ({
    schema_version: "aiwiki.run.v2",
    run_id: runId,
    status,
    created_at: "2026-08-30T00:00:00.000Z",
    source: {
      kind: "text",
      title: runId,
      content_format: "markdown",
      content_bytes: 1,
      content_fingerprint: "sha256:test",
      fetcher: "test",
      fetch_status: status === "success" ? "ok" : "failed"
    },
    artifacts: status === "success"
      ? { processing_summary: `09-runs/${runId}/processing-summary.md`, raw: "02-raw/articles/raw.md", source_card: "03-sources/article-cards/card.md", wiki_entry: "05-wiki/source-knowledge/wiki.md" }
      : { processing_summary: `09-runs/${runId}/processing-summary.md` },
    ...(status === "success" ? { generation: { wiki_entry_mode: "agent_enriched", wiki_entry_quality: "enriched" } } : {}),
    warnings: []
  });
  try {
    await initWorkspace(root);
    const runs = path.join(root, "09-runs");
    for (const name of ["legacy-success", "legacy-fetch-failed", "v2-success", "v2-fetch-failed", "health-test", "unknown-run"]) {
      await mkdir(path.join(runs, name));
    }
    await writeFile(path.join(runs, "legacy-success", "payload.json"), JSON.stringify({ source: { fetch_status: "ok" } }), "utf8");
    await writeFile(path.join(runs, "legacy-fetch-failed", "payload.json"), JSON.stringify({ source: { fetch_status: "failed" } }), "utf8");
    for (const [name, status] of [["v2-success", "success"], ["v2-fetch-failed", "fetch_failed"]] as const) {
      await writeFile(path.join(runs, name, "manifest.json"), JSON.stringify(manifest(name, status)), "utf8");
      await writeFile(path.join(runs, name, "processing-summary.md"), "# Summary\n", "utf8");
    }
    await writeFile(path.join(runs, "health-test", "health-report.json"), "{}\n", "utf8");
    await writeFile(path.join(runs, "unknown-run", "notes.txt"), "unknown\n", "utf8");

    const summary = await statusSummary(root);

    assert.equal(summary.runCount, 4);
    assert.equal(summary.failedCount, 2);
    assert.notEqual(summary.lastRunId, "health-test");
    assert.notEqual(summary.lastSuccessRunId, "health-test");
    assert.notEqual(summary.lastSuccessRunId, "unknown-run");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor reports missing purpose index and log files", async () => {
  const root = await tempRoot("aiwiki-doctor-system-files");
  try {
    await initWorkspace(root);
    await rm(path.join(root, "_system", "purpose.md"), { force: true });
    const checks = await doctor(root);
    const purpose = checks.find((check) => check.name === "_system/purpose.md");
    const index = checks.find((check) => check.name === "_system/index.md");
    assert.equal(purpose?.status, "missing");
    assert.equal(index?.status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
