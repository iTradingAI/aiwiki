import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { compactRuns } from "../src/cli/commands/runs.js";
import { ingestPayload } from "../src/ingest.js";
import { scanRuns } from "../src/runs.js";
import { tempRoot } from "./helpers.js";

function payload(content: string) {
  return {
    schema_version: "aiwiki.agent_payload.v1",
    source: {
      kind: "text",
      title: "Run V2 Provenance",
      content_format: "markdown",
      content,
      fetcher: "test",
      fetch_status: "ok",
      captured_at: "2026-08-30T00:00:00.000Z"
    },
    request: { mode: "ingest", outputs: ["source_card", "wiki_entry", "processing_summary"], language: "zh-CN" }
  };
}

test("run v2 canonical Raw present and body complete", async () => {
  const root = await tempRoot("aiwiki-run-v2");
  try {
    const content = "A complete canonical source body.";
    const result = await ingestPayload(root, payload(content));
    assert.deepEqual((await readdir(result.runDir)).sort(), ["manifest.json", "processing-summary.md"]);
    const manifest = JSON.parse(await readFile(path.join(result.runDir, "manifest.json"), "utf8"));
    assert.equal(manifest.schema_version, "aiwiki.run.v2");
    assert.equal(manifest.artifacts.raw, "02-raw/articles/run-v2-provenance.md");
    assert.equal(manifest.source.content, undefined);
    const raw = await readFile(path.join(root, manifest.artifacts.raw), "utf8");
    assert.match(raw, /A complete canonical source body\./);
    const [record] = await scanRuns(root);
    assert.equal(record.classification, "v2_ingest");
    assert.equal(record.manifest?.run_id, result.runId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("direct ingestPayload rejects oversized input before workspace seed", async () => {
  const root = await tempRoot("aiwiki-run-limit");
  await rm(root, { recursive: true, force: true });
  try {
    await assert.rejects(
      ingestPayload(root, payload("x".repeat(11 * 1024 * 1024))),
      (error: unknown) => error instanceof Error && error.message.includes("maximum size")
    );
    await assert.rejects(readdir(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createLegacyRun(root: string, content = "Legacy content that has canonical artifacts.") {
  const generated = await ingestPayload(root, payload(content));
  const manifest = JSON.parse(await readFile(path.join(generated.runDir, "manifest.json"), "utf8")) as {
    artifacts: { raw: string; source_card: string; wiki_entry: string };
  };
  const legacyDir = path.join(root, "09-runs", "legacy-run");
  await mkdir(legacyDir);
  await writeFile(path.join(legacyDir, "payload.json"), `${JSON.stringify(payload(content), null, 2)}\n`, "utf8");
  await copyFile(path.join(generated.runDir, "processing-summary.md"), path.join(legacyDir, "processing-summary.md"));
  await Promise.all([
    copyFile(path.join(root, manifest.artifacts.raw), path.join(legacyDir, "raw.md")),
    copyFile(path.join(root, manifest.artifacts.source_card), path.join(legacyDir, "source-card.md")),
    copyFile(path.join(root, manifest.artifacts.wiki_entry), path.join(legacyDir, "wiki-entry.md"))
  ]);
  return legacyDir;
}

test("compact dry-run is byte-preserving and --yes atomically reaches v2 terminal layout", async () => {
  const root = await tempRoot("aiwiki-run-compact");
  try {
    const legacyDir = await createLegacyRun(root);
    const legacyRecord = (await scanRuns(root)).find((candidate) => candidate.dirName === "legacy-run");
    assert.equal(legacyRecord?.compactAction, "safe_delete", JSON.stringify(legacyRecord));
    const before = await readFile(path.join(legacyDir, "raw.md"), "utf8");
    const dryRun = await compactRuns(root, false);
    assert.equal(dryRun.dry_run, true);
    assert.equal(await readFile(path.join(legacyDir, "raw.md"), "utf8"), before);
    const compacted = await compactRuns(root, true);
    assert.equal(compacted.executed_actions > 0, true, JSON.stringify(compacted));
    assert.deepEqual((await readdir(legacyDir)).sort(), ["manifest.json", "processing-summary.md"]);
    const [record] = (await scanRuns(root)).filter((candidate) => candidate.dirName === "legacy-run");
    assert.equal(record.classification, "v2_ingest");
    const second = await compactRuns(root, true);
    assert.equal(second.executed_actions, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("compact requires byte equality and leaves divergent legacy copies for manual review", async () => {
  const root = await tempRoot("aiwiki-run-mismatch");
  try {
    const legacyDir = await createLegacyRun(root);
    await writeFile(path.join(legacyDir, "raw.md"), `${await readFile(path.join(legacyDir, "raw.md"), "utf8")}manually modified legacy copy\n`, "utf8");
    const result = await compactRuns(root, true);
    assert.equal(result.warnings.some((warning) => warning.includes("fingerprint_mismatch")), true, JSON.stringify(result));
    await readFile(path.join(legacyDir, "payload.json"), "utf8");
    await readFile(path.join(legacyDir, "raw.md"), "utf8");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("compact migrates fetch-failed payloads without success-only manifest fields", async () => {
  const root = await tempRoot("aiwiki-run-fetch-failed");
  try {
    const legacyDir = path.join(root, "09-runs", "legacy-fetch-failed");
    await mkdir(legacyDir, { recursive: true });
    await writeFile(path.join(legacyDir, "processing-summary.md"), "# failed\n", "utf8");
    await writeFile(path.join(legacyDir, "payload.json"), JSON.stringify({
      schema_version: "aiwiki.agent_payload.v1",
      source: { kind: "url", title: "Failed", fetch_status: "failed", fetcher: "test", captured_at: "2026-08-30T00:00:00.000Z" },
      request: { mode: "record_fetch_failure", outputs: [] }
    }), "utf8");
    const result = await compactRuns(root, true);
    assert.equal(result.executed_actions, 2);
    const manifest = JSON.parse(await readFile(path.join(legacyDir, "manifest.json"), "utf8"));
    assert.equal(manifest.status, "fetch_failed");
    assert.deepEqual(manifest.artifacts, { processing_summary: "09-runs/legacy-fetch-failed/processing-summary.md" });
    assert.equal(manifest.generation, undefined);
    assert.deepEqual((await readdir(legacyDir)).sort(), ["manifest.json", "processing-summary.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
