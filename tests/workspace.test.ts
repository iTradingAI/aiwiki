import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { directorySummary, doctor, initWorkspace, readConfig, statusSummary } from "../src/workspace.js";
import { tempRoot } from "./helpers.js";

test("init creates layout and keeps existing config", async () => {
  const root = await tempRoot("aiwiki-init");
  try {
    const first = await initWorkspace(root);
    assert.equal(first.createdConfig, true);
    assert.equal(first.createdDirs.length, 12);

    const configPath = path.join(root, "aiwiki.yaml");
    const original = await readFile(configPath, "utf8");
    const second = await initWorkspace(root);
    const after = await readFile(configPath, "utf8");

    assert.equal(second.createdConfig, false);
    assert.equal(after, original);

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
