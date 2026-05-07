import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
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
  assert.match(text, /aiwiki setup/);
  assert.match(text, /aiwiki init/);
  assert.match(text, /aiwiki skill install/);
  assert.match(text, /aiwiki prompt agent/);
  assert.doesNotMatch(text, /prompt qclaw/i);
  assert.doesNotMatch(text, /kb add|kb list|kb default/i);
  assert.equal(stderr.text(), "");
});

test("prompt agent prints neutral Agent handoff instructions", async () => {
  const stdout = new MemoryWritable();
  const stderr = new MemoryWritable();
  const code = await runCli(["prompt", "agent"], { stdout, stderr });
  const text = stdout.text();
  assert.equal(code, 0);
  assert.match(text, /入库 <url>/);
  assert.match(text, /aiwiki ingest-agent --stdin/);
  assert.match(text, /普通会话中不要把所有 URL 都自动入库/);
  assert.doesNotMatch(text, /qclaw/i);
  assert.equal(stderr.text(), "");
});

test("version flag prints CLI version", async () => {
  const stdout = new MemoryWritable();
  const code = await runCli(["--version"], { stdout, stderr: new MemoryWritable() });
  assert.equal(code, 0);
  assert.match(stdout.text(), /^aiwiki 0\.1\.3/);
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

test("CLI setup stores default workspace for no-path commands", async () => {
  const root = await tempRoot("aiwiki-cli-setup-root");
  const configHome = await tempRoot("aiwiki-cli-setup-home");
  const previousHome = process.env.AIWIKI_HOME;
  process.env.AIWIKI_HOME = configHome;
  try {
    const setupOut = new MemoryWritable();
    assert.equal(await runCli(["setup", "--path", root, "--yes"], { stdout: setupOut, stderr: new MemoryWritable() }), 0);
    assert.match(setupOut.text(), /default_path:/);
    assert.match(setupOut.text(), /user_config:/);
    assert.match(setupOut.text(), /aiwiki skill install/);
    assert.match(setupOut.text(), /aiwiki prompt agent/);
    assert.match(setupOut.text(), /after Agent setup/);

    const doctorOut = new MemoryWritable();
    assert.equal(await runCli(["doctor"], { stdout: doctorOut, stderr: new MemoryWritable() }), 0);
    assert.match(doctorOut.text(), /ok: aiwiki.yaml/);

    const statusOut = new MemoryWritable();
    assert.equal(await runCli(["status"], { stdout: statusOut, stderr: new MemoryWritable() }), 0);
    assert.match(statusOut.text(), new RegExp(`path: ${escapeRegExp(path.resolve(root))}`));

    const ingestOut = new MemoryWritable();
    assert.equal(await runCli(["ingest-agent", "--payload", fixturePath("agent_payload.url.valid.json")], { stdout: ingestOut, stderr: new MemoryWritable() }), 0);
    assert.match(ingestOut.text(), /ingested: yes/);
  } finally {
    if (previousHome === undefined) {
      delete process.env.AIWIKI_HOME;
    } else {
      process.env.AIWIKI_HOME = previousHome;
    }
    await rm(root, { recursive: true, force: true });
    await rm(configHome, { recursive: true, force: true });
  }
});

test("CLI skill install copies bundled skill to Codex home", async () => {
  const codexHome = await tempRoot("aiwiki-cli-codex-home");
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;
  try {
    const out = new MemoryWritable();
    assert.equal(await runCli(["skill", "install"], { stdout: out, stderr: new MemoryWritable() }), 0);
    assert.match(out.text(), /status: installed/);
    assert.match(out.text(), /skills[\\/]aiwiki[\\/]SKILL\.md/);

    const installed = await readFile(path.join(codexHome, "skills", "aiwiki", "SKILL.md"), "utf8");
    assert.match(installed, /name: aiwiki/);
    assert.match(installed, /aiwiki ingest-agent --stdin/);

    const duplicateErr = new MemoryWritable();
    assert.equal(await runCli(["skill", "install"], { stdout: new MemoryWritable(), stderr: duplicateErr }), 1);
    assert.match(duplicateErr.text(), /already exists/);

    const forceOut = new MemoryWritable();
    assert.equal(await runCli(["skill", "install", "--force"], { stdout: forceOut, stderr: new MemoryWritable() }), 0);
    assert.match(forceOut.text(), /status: updated/);
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("CLI setup refuses silent non-interactive defaults", async () => {
  const configHome = await tempRoot("aiwiki-cli-setup-noninteractive-home");
  try {
    const result = spawnSync(process.execPath, ["dist/src/cli.js", "setup"], {
      cwd: process.cwd(),
      env: { ...process.env, AIWIKI_HOME: configHome },
      input: "",
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Interactive setup requires a terminal/);
    await assert.rejects(access(path.join(configHome, "config.json")));
  } finally {
    await rm(configHome, { recursive: true, force: true });
  }
});

test("CLI no-path commands guide users to setup when no default exists", async () => {
  const configHome = await tempRoot("aiwiki-cli-no-default");
  const previousHome = process.env.AIWIKI_HOME;
  process.env.AIWIKI_HOME = configHome;
  try {
    const stderr = new MemoryWritable();
    assert.equal(await runCli(["doctor"], { stdout: new MemoryWritable(), stderr }), 1);
    assert.match(stderr.text(), /aiwiki setup/);
  } finally {
    if (previousHome === undefined) {
      delete process.env.AIWIKI_HOME;
    } else {
      process.env.AIWIKI_HOME = previousHome;
    }
    await rm(configHome, { recursive: true, force: true });
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("CLI ingest-agent payload and ingest-url boundary", async () => {
  const root = await tempRoot("aiwiki-cli-ingest");
  try {
    assert.equal(await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() }), 0);
    const out = new MemoryWritable();
    const err = new MemoryWritable();
    const payload = fixturePath("agent_payload.url.valid.json");
    assert.equal(await runCli(["ingest-agent", "--payload", payload, "--path", root], { stdout: out, stderr: err }), 0);
    assert.match(out.text(), /ingested: yes/);
    assert.match(out.text(), /recorded: yes/);
    assert.match(out.text(), /fetch_status: ok/);
    assert.match(out.text(), /fit_score: \d+/);
    assert.match(out.text(), /fit_level: (high|medium|low)/);
    assert.match(out.text(), /summary:/);
    assert.match(out.text(), /run_id:/);
    assert.match(out.text(), /processing_summary:/);
    assert.match(out.text(), /source_card:/);
    assert.match(out.text(), /draft_outline:/);
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

test("CLI ingest-agent reports fetch failure without claiming ingestion success", async () => {
  const root = await tempRoot("aiwiki-cli-fetch-failed-report");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const out = new MemoryWritable();
    const err = new MemoryWritable();
    assert.equal(await runCli(["ingest-agent", "--payload", fixturePath("agent_payload.fetch_failed.valid.json"), "--path", root], { stdout: out, stderr: err }), 0);
    assert.match(out.text(), /ingested: no/);
    assert.match(out.text(), /recorded: yes/);
    assert.match(out.text(), /fetch_status: failed/);
    assert.match(out.text(), /fit_score: 0/);
    assert.match(out.text(), /fit_level: fetch_failed/);
    assert.match(out.text(), /processing_summary:/);
    assert.doesNotMatch(out.text(), /source_card:/);
    assert.equal(err.text(), "");
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
