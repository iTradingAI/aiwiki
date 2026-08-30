import assert from "node:assert/strict";
import fsModule from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { copyFile, mkdir, readFile, readdir, rm, stat, truncate, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { compactRuns, inspectRuns } from "../src/cli/commands/runs.js";
import { runCli } from "../src/app.js";
import { ingestPayload } from "../src/ingest.js";
import { createManifestFromLegacy, scanRuns } from "../src/runs.js";
import { MemoryWritable, tempRoot } from "./helpers.js";

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

async function directoryBytes(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    total += entry.isDirectory() ? await directoryBytes(file) : (await stat(file)).size;
  }
  return total;
}


test("B2/D8: a 5MiB source ingest keeps its run below 1MiB and below ten percent of source size", async () => {
  const root = await tempRoot("aiwiki-run-size-invariant");
  try {
    const source = "x".repeat(5 * 1024 * 1024);
    const result = await ingestPayload(root, payload(source));
    const runBytes = await directoryBytes(result.runDir);

    assert.ok(runBytes < 1024 * 1024, `run size ${runBytes} must be below 1MiB`);
    assert.ok(runBytes < Buffer.byteLength(source, "utf8") * 0.1, `run size ${runBytes} must be below ten percent of source`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
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
      (error: unknown) => error instanceof Error && "code" in error && "workspaceWritten" in error &&
        error.message.includes("maximum size") &&
        error.code === "AIWIKI_INGEST_PAYLOAD_TOO_LARGE" &&
        error.workspaceWritten === false
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

test("C6: compact --yes preserves query/context/show hits and lint core results", async () => {
  const root = await tempRoot("aiwiki-run-compact-retrieval");
  try {
    await createLegacyRun(root);
    const cliText = async (args: string[]): Promise<string> => {
      const stdout = new MemoryWritable();
      const stderr = new MemoryWritable();
      assert.equal(await runCli(args, { stdout, stderr }), 0, stderr.text());
      return stdout.text();
    };
    const before = {
      query: await cliText(["query", "Run V2", "--path", root]),
      context: await cliText(["context", "Run V2", "--path", root]),
      show: await cliText(["show", "Run V2", "--json", "--path", root]),
      lint: await cliText(["lint", "--json", "--path", root])
    };
    assert.match(before.query, /Source Capsules: [1-9]/);
    assert.match(before.query, /primary=05-wiki\/source-knowledge\/run-v2-provenance\.md/);
    assert.match(before.context, /"total_matches":\s*[1-9]/);
    assert.match(before.context, /05-wiki\/source-knowledge\/run-v2-provenance\.md/);
    assert.match(before.show, /"path": "05-wiki\/source-knowledge\/run-v2-provenance\.md"/);
    assert.doesNotMatch(before.lint, /broken_link/);

    const compacted = await compactRuns(root, true);
    assert.ok(compacted.executed_actions > 0, JSON.stringify(compacted));
    const after = {
      query: await cliText(["query", "Run V2", "--path", root]),
      context: await cliText(["context", "Run V2", "--path", root]),
      show: await cliText(["show", "Run V2", "--json", "--path", root]),
      lint: await cliText(["lint", "--json", "--path", root])
    };

    assert.match(after.query, /Source Capsules: [1-9]/);
    assert.match(after.query, /primary=05-wiki\/source-knowledge\/run-v2-provenance\.md/);
    assert.match(after.context, /"total_matches":\s*[1-9]/);
    assert.match(after.context, /05-wiki\/source-knowledge\/run-v2-provenance\.md/);
    assert.match(after.show, /"path": "05-wiki\/source-knowledge\/run-v2-provenance\.md"/);
    assert.doesNotMatch(after.lint, /broken_link/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("C10: compact reports derived state changes without rebuilding index or graph state", async () => {
  const root = await tempRoot("aiwiki-run-compact-derived-state");
  try {
    await createLegacyRun(root);
    for (const command of [["index", "build"], ["graph", "build"]]) {
      assert.equal(
        await runCli([...command, "--json", "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() }),
        0
      );
    }
    const indexPath = path.join(root, ".aiwiki", "state", "index.json");
    const graphPath = path.join(root, ".aiwiki", "state", "graph.json");
    const before = await Promise.all([indexPath, graphPath].map(async (file) => ({
      content: await readFile(file, "utf8"),
      mtimeMs: (await stat(file)).mtimeMs
    })));

    const compacted = await compactRuns(root, true);

    assert.equal(compacted.derived_state_changed, true);
    assert.match(compacted.recommended_next_action, /rebuild --check/);
    const after = await Promise.all([indexPath, graphPath].map(async (file) => ({
      content: await readFile(file, "utf8"),
      mtimeMs: (await stat(file)).mtimeMs
    })));
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
function payloadWithInvalidUtf8(content = "canonical \uFFFD body"): Buffer {
  const encoded = Buffer.from(JSON.stringify(payload(content), null, 2), "utf8");
  const replacement = Buffer.from("\uFFFD", "utf8");
  const index = encoded.indexOf(replacement);
  if (index < 0) throw new Error("expected replacement character in legacy payload");
  return Buffer.concat([encoded.subarray(0, index), Buffer.from([0xff]), encoded.subarray(index + replacement.length)]);
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
test("C9: v2 partial compact preserves a payload whose body changed after manifest recovery", async () => {
  const root = await tempRoot("aiwiki-run-partial-payload-fingerprint");
  try {
    const legacyDir = await createLegacyRun(root, "canonical content");
    const [legacyRecord] = (await scanRuns(root)).filter((candidate) => candidate.dirName === "legacy-run");
    assert.ok(legacyRecord);
    const recoveredManifest = await createManifestFromLegacy(legacyRecord);
    await writeFile(path.join(legacyDir, "manifest.json"), `${JSON.stringify(recoveredManifest, null, 2)}\n`, "utf8");

    const payloadPath = path.join(legacyDir, "payload.json");
    const modified = JSON.parse(await readFile(payloadPath, "utf8"));
    modified.source.content = "modified payload body after manifest recovery";
    await writeFile(payloadPath, JSON.stringify(modified), "utf8");
    assert.equal((await scanRuns(root)).find((candidate) => candidate.dirName === "legacy-run")?.classification, "v2_partial_compact");

    const result = await compactRuns(root, true);

    assert.equal(result.warnings.some((warning) => warning.includes("payload_content_fingerprint_mismatch")), true, JSON.stringify(result));
    assert.deepEqual((await readdir(legacyDir)).sort(), ["manifest.json", "payload.json", "processing-summary.md", "raw.md", "source-card.md", "wiki-entry.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("C9: compact fails closed when a success payload cannot losslessly prove its body", async () => {
  const root = await tempRoot("aiwiki-run-invalid-payload-content");
  const invalidContents: Array<["missing" | "non-string" | "empty" | "lossy-utf8", unknown]> = [
    ["missing", undefined],
    ["non-string", 42],
    ["empty", ""],
    ["lossy-utf8", "\ud800"]
  ];
  try {
    for (const [name, content] of invalidContents) {
      const legacyDir = await createLegacyRun(root, "canonical content", `invalid-${name}`);
      const payloadPath = path.join(legacyDir, "payload.json");
      const modified = JSON.parse(await readFile(payloadPath, "utf8"));
      if (content === undefined) delete modified.source.content;
      else modified.source.content = content;
      await writeFile(payloadPath, JSON.stringify(modified), "utf8");

      const result = await compactRuns(root, true);

      assert.equal(result.warnings.some((warning) => warning.includes("manual_review_required (invalid_payload_content)")), true, JSON.stringify(result));
      assert.deepEqual((await readdir(legacyDir)).sort(), ["payload.json", "processing-summary.md", "raw.md", "source-card.md", "wiki-entry.md"]);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("C9: compact preserves a legacy run with an invalid UTF-8 payload source", async () => {
  const root = await tempRoot("aiwiki-run-invalid-utf8-legacy");
  try {
    const legacyDir = await createLegacyRun(root, "canonical \uFFFD body");
    await writeFile(path.join(legacyDir, "payload.json"), payloadWithInvalidUtf8());

    const result = await compactRuns(root, true);

    assert.equal(result.executed_actions, 0, JSON.stringify(result));
    assert.equal(result.warnings.some((warning) => warning.includes("manual_review_required (invalid_payload_source)")), true, JSON.stringify(result));
    assert.equal((await scanRuns(root)).find((record) => record.dirName === "legacy-run")?.compactAction, "manual_review_required");
    assert.deepEqual((await readdir(legacyDir)).sort(), ["payload.json", "processing-summary.md", "raw.md", "source-card.md", "wiki-entry.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("C9: compact preserves a v2 partial run with an invalid UTF-8 payload source", async () => {
  const root = await tempRoot("aiwiki-run-invalid-utf8-partial");
  try {
    const legacyDir = await createLegacyRun(root, "canonical \uFFFD body");
    const legacyRecord = (await scanRuns(root)).find((record) => record.dirName === "legacy-run");
    assert.ok(legacyRecord);
    await writeFile(path.join(legacyDir, "manifest.json"), `${JSON.stringify(await createManifestFromLegacy(legacyRecord), null, 2)}\n`, "utf8");
    await writeFile(path.join(legacyDir, "payload.json"), payloadWithInvalidUtf8());

    const result = await compactRuns(root, true);

    assert.equal(result.executed_actions, 0, JSON.stringify(result));
    assert.equal(result.warnings.some((warning) => warning.includes("manual_review_required (invalid_payload_source)")), true, JSON.stringify(result));
    assert.equal((await scanRuns(root)).find((record) => record.dirName === "legacy-run")?.compactAction, "manual_review_required");
    assert.deepEqual((await readdir(legacyDir)).sort(), ["manifest.json", "payload.json", "processing-summary.md", "raw.md", "source-card.md", "wiki-entry.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("C9: compact accepts a valid multibyte UTF-8 payload source", async () => {
  const root = await tempRoot("aiwiki-run-valid-utf8");
  try {
    const legacyDir = await createLegacyRun(root, "中文正文与 emoji 🚀");

    const result = await compactRuns(root, true);

    assert.equal(result.warnings.length, 0, JSON.stringify(result));
    assert.equal(result.executed_actions, 5, JSON.stringify(result));
    assert.deepEqual((await readdir(legacyDir)).sort(), ["manifest.json", "processing-summary.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});



test("C11: compact streams a 12MiB canonical raw duplicate without full read helpers", async () => {
  const root = await tempRoot("aiwiki-run-streaming-compact");
  const originalReadFile = fsModule.promises.readFile;
  const originalReadFileSync = fsModule.readFileSync;
  const originalCreateReadStream = fsModule.createReadStream;
  let largeStreamChunks = 0;
  try {
    const legacyDir = await createLegacyRun(root);
    const [legacyRecord] = (await scanRuns(root)).filter((candidate) => candidate.dirName === "legacy-run");
    const rawDuplicate = legacyRecord?.legacyDuplicates.find((duplicate) => duplicate.artifactType === "raw");
    if (!rawDuplicate?.canonicalPath) throw new Error("expected canonical raw duplicate");
    const largePaths = new Set([path.resolve(rawDuplicate.runPath), path.resolve(rawDuplicate.canonicalPath)]);
    await Promise.all([
      truncate(rawDuplicate.runPath, 12 * 1024 * 1024),
      truncate(rawDuplicate.canonicalPath, 12 * 1024 * 1024)
    ]);

    fsModule.promises.readFile = ((...args: Parameters<typeof originalReadFile>) => {
      if (typeof args[0] === "string" && largePaths.has(path.resolve(args[0]))) throw new Error("full read is forbidden");
      return originalReadFile(...args);
    }) as typeof fsModule.promises.readFile;
    fsModule.readFileSync = ((...args: Parameters<typeof originalReadFileSync>) => {
      if (typeof args[0] === "string" && largePaths.has(path.resolve(args[0]))) throw new Error("full read is forbidden");
      return originalReadFileSync(...args);
    }) as typeof fsModule.readFileSync;
    fsModule.createReadStream = ((...args: Parameters<typeof originalCreateReadStream>) => {
      const stream = originalCreateReadStream(...args);
      if (typeof args[0] === "string" && largePaths.has(path.resolve(args[0]))) {
        stream.on("data", () => { largeStreamChunks += 1; });
      }
      return stream;
    }) as typeof fsModule.createReadStream;
    syncBuiltinESMExports();

    const result = await compactRuns(root, true);

    assert.equal(result.warnings.some((warning) => warning.includes("fingerprint_mismatch")), false, JSON.stringify(result));
    assert.equal(result.executed_actions, 5, JSON.stringify(result));
    assert.equal(largeStreamChunks > 2, true);
    assert.deepEqual((await readdir(legacyDir)).sort(), ["manifest.json", "processing-summary.md"]);
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
test("C9: v2 partial compact deletes a fetch-failed payload with no body", async () => {
  const root = await tempRoot("aiwiki-run-partial-fetch-failed");
  try {
    const legacyDir = path.join(root, "09-runs", "legacy-fetch-failed");
    await mkdir(legacyDir, { recursive: true });
    await writeFile(path.join(legacyDir, "processing-summary.md"), "# failed\n", "utf8");
    await writeFile(path.join(legacyDir, "payload.json"), JSON.stringify({
      schema_version: "aiwiki.agent_payload.v1",
      source: { kind: "url", title: "Failed", fetch_status: "failed", fetcher: "test", captured_at: "2026-08-30T00:00:00.000Z" },
      request: { mode: "record_fetch_failure", outputs: [] }
    }), "utf8");
    const [legacyRecord] = (await scanRuns(root)).filter((candidate) => candidate.dirName === "legacy-fetch-failed");
    assert.ok(legacyRecord);
    await writeFile(path.join(legacyDir, "manifest.json"), `${JSON.stringify(await createManifestFromLegacy(legacyRecord), null, 2)}\n`, "utf8");
    assert.equal((await scanRuns(root)).find((candidate) => candidate.dirName === "legacy-fetch-failed")?.classification, "v2_partial_compact");

    const result = await compactRuns(root, true);

    assert.equal(result.warnings.length, 0, JSON.stringify(result));
    assert.equal(result.executed_actions, 1);
    assert.deepEqual((await readdir(legacyDir)).sort(), ["manifest.json", "processing-summary.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
