import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { directorySummary, doctor, initWorkspace, readConfig, statusSummary } from "../src/workspace.js";
import { tempRoot } from "./helpers.js";

test("init creates layout and keeps existing config", async () => {
  const root = await tempRoot("aiwiki-init");
  try {
    const first = await initWorkspace(root);
    assert.equal(first.createdConfig, true);
    assert.equal(first.createdDirs.length, 13);
    assert.equal(first.seededFiles.filter((file) => file.created).length, 12);

    const configPath = path.join(root, "aiwiki.yaml");
    const original = await readFile(configPath, "utf8");
    const dashboardPath = path.join(root, "dashboards", "AIWiki Home.md");
    const reviewQueuePath = path.join(root, "dashboards", "Review Queue.md");
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
    assert.match(await readFile(path.join(root, "_system", "schemas", "aiwiki-frontmatter.md"), "utf8"), /Dataview/);

    const summary = await directorySummary(root);
    assert.equal(summary.missing.length, 0);
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

test("status reads run directory without state machine", async () => {
  const root = await tempRoot("aiwiki-status");
  try {
    await initWorkspace(root);
    const summary = await statusSummary(root);
    assert.equal(summary.runCount, 0);
    assert.equal(summary.failedCount, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
