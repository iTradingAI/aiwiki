import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { normalizePayload } from "../src/payload.js";
import { fixturePath } from "./helpers.js";

async function readFixture(name: string) {
  return JSON.parse(await readFile(fixturePath(name), "utf8"));
}

test("normalizes valid payload", async () => {
  const payload = normalizePayload(await readFixture("agent_payload.url.valid.json"), "2026-05-06T00:00:00.000Z");
  assert.equal(payload.source.fetch_status, "ok");
  assert.equal(payload.source.content?.includes("AI Agent"), true);
  assert.equal(payload.request.mode, "ingest");
});

test("normalizes legacy metadata payload", async () => {
  const payload = normalizePayload(
    JSON.parse(await readFile(fixturePath("legacy", "agent_payload.metadata.compat.json"), "utf8")),
    "2026-05-06T00:00:00.000Z"
  );
  assert.equal(payload.source.fetcher, "legacy-host-agent");
  assert.equal(payload.source.captured_at, "2026-05-06T10:35:00+08:00");
  assert.equal(payload.source.content?.includes("兼容测试"), true);
  assert.equal(payload.warnings.some((warning) => warning.includes("metadata.captured_at")), true);
});

test("fills missing captured time with run start", async () => {
  const runStartedAt = "2026-05-06T00:00:00.000Z";
  const payload = normalizePayload(await readFixture("agent_payload.missing_captured_at.valid.json"), runStartedAt);
  assert.equal(payload.source.captured_at, runStartedAt);
  assert.equal(payload.warnings.some((warning) => warning.includes("缺少 captured_at")), true);
});

test("rejects missing source and URL without content", async () => {
  assert.throws(() => normalizePayload({ schema_version: "aiwiki.agent_payload.v1" }, "now"), /source is required/);
  await assert.rejects(async () => {
    normalizePayload(await readFixture("agent_payload.url_without_content.invalid.json"), "now");
  }, /source.content is required/);
});

test("rejects output path control fields", async () => {
  await assert.rejects(async () => {
    normalizePayload(await readFixture("agent_payload.path_escape.invalid.json"), "now");
  }, /output paths/);
});

test("rejects failed status with content to avoid silent data loss", () => {
  assert.throws(() => {
    normalizePayload({
      schema_version: "aiwiki.agent_payload.v1",
      source: {
        kind: "url",
        fetch_status: "failed",
        content: "正文不应该和失败状态并存"
      },
      request: { mode: "record_fetch_failure", outputs: ["processing_summary"] }
    }, "now");
  }, /must be empty/);
});
