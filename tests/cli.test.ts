import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { runCli } from "../src/app.js";
import { fixturePath, MemoryWritable, tempRoot } from "./helpers.js";

test("help exposes only base commands", async () => {
  const stdout = new MemoryWritable();
  const stderr = new MemoryWritable();
  const code = await runCli(["--help"], { stdout, stderr });
  const text = stdout.text();
  assert.equal(code, 0);
  assert.match(text, /aiwiki init/);
  assert.doesNotMatch(text, /kb add|kb list|kb default/i);
  assert.equal(stderr.text(), "");
});

test("version flag prints CLI version", async () => {
  const stdout = new MemoryWritable();
  const code = await runCli(["--version"], { stdout, stderr: new MemoryWritable() });
  assert.equal(code, 0);
  assert.match(stdout.text(), /^aiwiki 0\.1\.0/);
});

test("CLI init config doctor and status", async () => {
  const root = await tempRoot("aiwiki-cli");
  try {
    const stdout = new MemoryWritable();
    const stderr = new MemoryWritable();
    assert.equal(await runCli(["init", "--path", root, "--yes"], { stdout, stderr }), 0);
    assert.equal(stderr.text(), "");

    const configOut = new MemoryWritable();
    assert.equal(await runCli(["config", "show", "--path", root], { stdout: configOut, stderr: new MemoryWritable() }), 0);
    assert.match(configOut.text(), /product: aiwiki/);
    assert.match(configOut.text(), /created_at:/);

    const doctorOut = new MemoryWritable();
    assert.equal(await runCli(["doctor", "--path", root], { stdout: doctorOut, stderr: new MemoryWritable() }), 0);
    assert.match(doctorOut.text(), /ok: aiwiki.yaml/);

    const statusOut = new MemoryWritable();
    assert.equal(await runCli(["status", "--path", root], { stdout: statusOut, stderr: new MemoryWritable() }), 0);
    assert.match(statusOut.text(), /run_count: 0/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("status rejects non-workspace path", async () => {
  const root = await tempRoot("aiwiki-not-workspace");
  try {
    const stderr = new MemoryWritable();
    const code = await runCli(["status", "--path", root], { stdout: new MemoryWritable(), stderr });
    assert.equal(code, 1);
    assert.match(stderr.text(), /未找到配置文件/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI ingest-agent payload and ingest-url boundary", async () => {
  const root = await tempRoot("aiwiki-cli-ingest");
  try {
    assert.equal(await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() }), 0);
    const out = new MemoryWritable();
    const err = new MemoryWritable();
    const payload = fixturePath("agent_payload.url.valid.json");
    assert.equal(await runCli(["ingest-agent", "--payload", payload, "--path", root], { stdout: out, stderr: err }), 0);
    assert.match(out.text(), /run_id:/);
    assert.equal(err.text(), "");

    const boundaryErr = new MemoryWritable();
    const code = await runCli(["ingest-url", "https://example.com/article", "--path", root], {
      stdout: new MemoryWritable(),
      stderr: boundaryErr
    });
    assert.equal(code, 1);
    assert.match(boundaryErr.text(), /不抓取网页/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI ingest-url with content file reuses ingest", async () => {
  const root = await tempRoot("aiwiki-cli-url-file");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const out = new MemoryWritable();
    const code = await runCli(
      ["ingest-url", "https://example.com/article", "--content-file", fixturePath("article.zh.md"), "--path", root],
      { stdout: out, stderr: new MemoryWritable() }
    );
    assert.equal(code, 0);
    const runId = /run_id: (.+)/.exec(out.text())?.[1]?.trim();
    assert.ok(runId);
    const payload = await readFile(path.join(root, "09-runs", runId, "payload.json"), "utf8");
    assert.match(payload, /https:\/\/example.com\/article/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
