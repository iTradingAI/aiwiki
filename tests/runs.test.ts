import assert from "node:assert/strict";
import fsModule from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { copyFile, mkdir, readFile, readdir, rm, truncate, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { compactRuns, inspectRuns } from "../src/cli/commands/runs.js";
import { ingestPayload } from "../src/ingest.js";
import { createManifestFromLegacy, scanRuns, streamingHash } from "../src/runs.js";
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

test("runs inspect oversized legacy_duplicate compactable", async () => {
  const root = await tempRoot("aiwiki-runs-inspect-storage");
  try {
    const legacyDir = await createLegacyRun(root);
    await writeFile(path.join(legacyDir, "oversized-copy.md"), "x".repeat(11 * 1024 * 1024), "utf8");

    const report = await inspectRuns(root);

    assert.equal(report.oversized_files.length, 1);
    assert.equal(report.oversized_files[0]?.bytes, 11 * 1024 * 1024);
    assert.equal(report.legacy_duplicate_artifacts, 3);
    assert.deepEqual(report.compactable_runs, ["legacy-run"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createLegacyRun(root: string, content = "Legacy content that has canonical artifacts.", runName = "legacy-run") {
  const generated = await ingestPayload(root, payload(content));
  const manifest = JSON.parse(await readFile(path.join(generated.runDir, "manifest.json"), "utf8")) as {
    artifacts: { raw: string; source_card: string; wiki_entry: string };
  };
  const legacyDir = path.join(root, "09-runs", runName);
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

test("C4: compact canonical missing requires manual review and preserves legacy files", async () => {
  const root = await tempRoot("aiwiki-run-canonical-missing");
  try {
    const legacyDir = await createLegacyRun(root);
    const [record] = (await scanRuns(root)).filter((candidate) => candidate.dirName === "legacy-run");
    assert.ok(record?.legacyDuplicates[0]?.canonicalPath);
    await rm(record.legacyDuplicates[0].canonicalPath);

    const result = await compactRuns(root, true);

    assert.equal(result.executed_actions, 0, JSON.stringify(result));
    assert.equal((await scanRuns(root)).find((candidate) => candidate.dirName === "legacy-run")?.compactAction, "manual_review_required");
    await readFile(path.join(legacyDir, "payload.json"), "utf8");
    await readFile(path.join(legacyDir, "raw.md"), "utf8");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("C9: invalid manifest is unknown and compact preserves an otherwise compactable legacy run", async () => {
  const root = await tempRoot("aiwiki-run-invalid-manifest");
  try {
    const legacyDir = await createLegacyRun(root);
    await writeFile(path.join(legacyDir, "manifest.json"), "{ malformed", "utf8");

    const [record] = (await scanRuns(root)).filter((candidate) => candidate.dirName === "legacy-run");
    assert.equal(record?.classification, "unknown");
    assert.equal(record?.compactAction, "manual_review_required");
    const result = await compactRuns(root, true);
    assert.equal(result.executed_actions, 0, JSON.stringify(result));
    await readFile(path.join(legacyDir, "payload.json"), "utf8");
    await readFile(path.join(legacyDir, "raw.md"), "utf8");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("C9: compact resumes only an exactly matching manifest tmp and rejects a mismatched one", async () => {
  const root = await tempRoot("aiwiki-run-tmp-recovery");
  try {
    const legacyDir = await createLegacyRun(root);
    const first = await compactRuns(root, false);
    assert.equal(first.compactableRuns.includes("legacy-run"), true);
    const legacyRecord = (await scanRuns(root)).find((candidate) => candidate.dirName === "legacy-run");
    assert.ok(legacyRecord);
    const expected = await createManifestFromLegacy(legacyRecord);
    await writeFile(path.join(legacyDir, "manifest.json.tmp"), `${JSON.stringify(expected, null, 2)}\n`, "utf8");

    const resumed = await compactRuns(root, true);
    assert.equal(resumed.executed_actions > 0, true, JSON.stringify(resumed));
    assert.deepEqual((await readdir(legacyDir)).sort(), ["manifest.json", "processing-summary.md"]);

    const rejectedDir = await createLegacyRun(root, "Different legacy content.", "rejected-run");
    await writeFile(path.join(rejectedDir, "manifest.json.tmp"), `${JSON.stringify(expected, null, 2)}\n`, "utf8");

    const rejected = await compactRuns(root, true);
    assert.equal(rejected.warnings.some((warning) => warning.includes("manual_review_required")), true, JSON.stringify(rejected));
    await readFile(path.join(rejectedDir, "payload.json"), "utf8");
    await readFile(path.join(rejectedDir, "raw.md"), "utf8");
    await readFile(path.join(rejectedDir, "manifest.json.tmp"), "utf8");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("C9: C-2 rejects manifests with prohibited fields or partial fetch-failed artifacts", async () => {
  const root = await tempRoot("aiwiki-run-manifest-keys");
  try {
    const generated = await ingestPayload(root, payload("canonical"));
    const manifestPath = path.join(generated.runDir, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.source.content = "prohibited";
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    let [record] = await scanRuns(root);
    assert.equal(record.classification, "unknown");
    assert.equal(record.compactAction, "manual_review_required");

    const failedDir = path.join(root, "09-runs", "partial-failure");
    await mkdir(failedDir);
    await writeFile(path.join(failedDir, "processing-summary.md"), "# failed\n", "utf8");
    await writeFile(path.join(failedDir, "manifest.json"), JSON.stringify({
      ...manifest,
      run_id: "partial-failure",
      status: "fetch_failed",
      source: { ...manifest.source, fetch_status: "failed" },
      artifacts: { processing_summary: "09-runs/partial-failure/processing-summary.md", raw: manifest.artifacts.raw },
      generation: undefined
    }), "utf8");
    [, record] = await scanRuns(root);
    assert.equal(record.classification, "unknown");
    assert.equal(record.compactAction, "manual_review_required");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("C9: payload content fingerprint must match verified canonical Raw before deletion", async () => {
  const root = await tempRoot("aiwiki-run-payload-fingerprint");
  try {
    const legacyDir = await createLegacyRun(root, "canonical content");
    const payloadPath = path.join(legacyDir, "payload.json");
    const modified = JSON.parse(await readFile(payloadPath, "utf8"));
    modified.source.content = "modified payload body";
    await writeFile(payloadPath, JSON.stringify(modified), "utf8");

    const result = await compactRuns(root, true);

    assert.equal(result.warnings.some((warning) => warning.includes("payload_content_fingerprint_mismatch")), true, JSON.stringify(result));
    await readFile(payloadPath, "utf8");
    await readFile(path.join(legacyDir, "raw.md"), "utf8");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("C11: compact hashing streams a 200MiB run artifact without full read helpers", async () => {
  const root = await tempRoot("aiwiki-run-streaming-hash");
  const large = path.join(root, "large.md");
  const originalReadFile = fsModule.promises.readFile;
  const originalReadFileSync = fsModule.readFileSync;
  const originalCreateReadStream = fsModule.createReadStream;
  let streamChunks = 0;
  try {
    await writeFile(large, "start");
    await truncate(large, 200 * 1024 * 1024);
    fsModule.promises.readFile = (() => { throw new Error("full read is forbidden"); }) as typeof fsModule.promises.readFile;
    fsModule.readFileSync = (() => { throw new Error("full read is forbidden"); }) as typeof fsModule.readFileSync;
    fsModule.createReadStream = ((...args: Parameters<typeof originalCreateReadStream>) => {
      const stream = originalCreateReadStream(...args);
      stream.on("data", () => { streamChunks += 1; });
      return stream;
    }) as typeof fsModule.createReadStream;
    syncBuiltinESMExports();

    const digest = await streamingHash(large);

    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.equal(streamChunks > 1, true);
  } finally {
    fsModule.promises.readFile = originalReadFile;
    fsModule.readFileSync = originalReadFileSync;
    fsModule.createReadStream = originalCreateReadStream;
    syncBuiltinESMExports();
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
