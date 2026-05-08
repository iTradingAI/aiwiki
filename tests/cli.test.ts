import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, rm } from "node:fs/promises";
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
  assert.match(text, /aiwiki agent list/);
  assert.match(text, /aiwiki agent install/);
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
  assert.match(text, /已加入 Obsidian 审阅队列/);
  assert.match(text, /Dataview 是可选增强/);
  assert.doesNotMatch(text, /qclaw/i);
  assert.equal(stderr.text(), "");
});

test("version flag prints CLI version", async () => {
  const stdout = new MemoryWritable();
  const code = await runCli(["--version"], { stdout, stderr: new MemoryWritable() });
  assert.equal(code, 0);
  assert.match(stdout.text(), /^aiwiki 0\.2\.1/);
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
    assert.match(setupOut.text(), /database files created: 7/);
    assert.match(setupOut.text(), /obsidian_entry: dashboards\/AIWiki Home\.md/);
    assert.match(setupOut.text(), /aiwiki agent install/);
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

test("CLI agent list prints detected and unsupported hosts", async () => {
  const codexHome = await tempRoot("aiwiki-cli-codex-home");
  const qclawHome = await tempRoot("aiwiki-cli-qclaw-home");
  const openclawHome = await tempRoot("aiwiki-cli-openclaw-home");
  const previousCodexHome = process.env.CODEX_HOME;
  const previousQclawHome = process.env.QCLAW_HOME;
  const previousOpenclawHome = process.env.OPENCLAW_HOME;
  const previousOpencodeHome = process.env.OPENCODE_HOME;
  process.env.CODEX_HOME = codexHome;
  process.env.QCLAW_HOME = qclawHome;
  process.env.OPENCLAW_HOME = openclawHome;
  process.env.OPENCODE_HOME = path.join(codexHome, "missing-opencode");
  try {
    const out = new MemoryWritable();
    assert.equal(await runCli(["agent", "list"], { stdout: out, stderr: new MemoryWritable() }), 0);
    assert.match(out.text(), /codex: Codex \| detected=yes \| installable=yes/);
    assert.match(out.text(), /qclaw: QClaw \| detected=yes \| installable=yes/);
    assert.match(out.text(), /openclaw: OpenClaw \| detected=yes \| installable=yes/);
    assert.match(out.text(), /opencode: opencode \| detected=no \| installable=no/);
  } finally {
    restoreEnv("CODEX_HOME", previousCodexHome);
    restoreEnv("QCLAW_HOME", previousQclawHome);
    restoreEnv("OPENCLAW_HOME", previousOpenclawHome);
    restoreEnv("OPENCODE_HOME", previousOpencodeHome);
    await rm(codexHome, { recursive: true, force: true });
    await rm(qclawHome, { recursive: true, force: true });
    await rm(openclawHome, { recursive: true, force: true });
  }
});

test("CLI agent install copies bundled skill to selected host", async () => {
  const codexHome = await tempRoot("aiwiki-cli-codex-home");
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;
  try {
    const out = new MemoryWritable();
    assert.equal(await runCli(["agent", "install", "--agent", "codex", "--yes"], { stdout: out, stderr: new MemoryWritable() }), 0);
    const target = path.join(codexHome, "skills", "aiwiki", "SKILL.md");
    assert.match(out.text(), /installed: Codex/);
    assert.match(out.text(), new RegExp(`target: ${escapeRegExp(target)}`));

    const installed = await readFile(target, "utf8");
    assert.match(installed, /name: aiwiki/);
    assert.match(installed, /aiwiki ingest-agent --stdin/);

    const duplicateErr = new MemoryWritable();
    assert.equal(await runCli(["agent", "install", "--agent", "codex", "--yes"], { stdout: new MemoryWritable(), stderr: duplicateErr }), 1);
    assert.match(duplicateErr.text(), /Target already exists/);

    const forceOut = new MemoryWritable();
    assert.equal(await runCli(["agent", "install", "--agent", "codex", "--yes", "--force"], { stdout: forceOut, stderr: new MemoryWritable() }), 0);
    assert.match(forceOut.text(), /installed: Codex/);
  } finally {
    restoreEnv("CODEX_HOME", previousCodexHome);
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("CLI agent install writes Claude prompt command", async () => {
  const claudeHome = await tempRoot("aiwiki-cli-claude-home");
  const previousClaudeHome = process.env.CLAUDE_HOME;
  process.env.CLAUDE_HOME = claudeHome;
  await mkdir(claudeHome, { recursive: true });
  try {
    const out = new MemoryWritable();
    assert.equal(await runCli(["agent", "install", "--agent", "claude", "--yes"], { stdout: out, stderr: new MemoryWritable() }), 0);
    const target = path.join(claudeHome, "commands", "aiwiki.md");
    assert.match(out.text(), /installed: Claude Code/);

    const installed = await readFile(target, "utf8");
    assert.match(installed, /AIWiki Agent 对接说明/);
    assert.match(installed, /aiwiki ingest-agent --stdin/);
    assert.match(installed, /dashboard/);
    assert.match(installed, /review_queue/);
    assert.match(installed, /不要替用户安装 Dataview/);
    assert.match(installed, /不要修改 `\.obsidian`/);
  } finally {
    restoreEnv("CLAUDE_HOME", previousClaudeHome);
    await rm(claudeHome, { recursive: true, force: true });
  }
});

test("CLI agent install rejects unsupported detected hosts", async () => {
  const opencodeHome = await tempRoot("aiwiki-cli-opencode-home");
  const previousOpencodeHome = process.env.OPENCODE_HOME;
  process.env.OPENCODE_HOME = opencodeHome;
  try {
    const err = new MemoryWritable();
    assert.equal(await runCli(["agent", "install", "--agent", "opencode", "--yes"], { stdout: new MemoryWritable(), stderr: err }), 1);
    assert.match(err.text(), /automatic installation is not configured/);
  } finally {
    restoreEnv("OPENCODE_HOME", previousOpencodeHome);
    await rm(opencodeHome, { recursive: true, force: true });
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

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
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
    assert.match(out.text(), /source_card: 03-sources\/article-cards\/ai-agent-workflow-notes\.md/);
    assert.match(out.text(), /draft_outline:/);
    assert.match(out.text(), /dashboard: dashboards\/AIWiki Home\.md/);
    assert.match(out.text(), /review_queue: dashboards\/Review Queue\.md/);
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
    assert.match(out.text(), /dashboard: dashboards\/AIWiki Home\.md/);
    assert.match(out.text(), /review_queue: dashboards\/Review Queue\.md/);
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
