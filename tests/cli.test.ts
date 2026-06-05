import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  assert.match(text, /aiwiki context <query>/);
  assert.match(text, /aiwiki lint/);
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
  assert.match(text, /AIWiki 已完成入库，并生成 Wiki 条目/);
  assert.match(text, /aiwiki context/);
  assert.match(text, /aiwiki lint/);
  assert.match(text, /Dataview 是可选增强/);
  assert.match(text, /_system\/purpose\.md/);
  assert.doesNotMatch(text, /qclaw/i);
  assert.equal(stderr.text(), "");
});

test("version flag prints CLI version", async () => {
  const stdout = new MemoryWritable();
  const code = await runCli(["--version"], { stdout, stderr: new MemoryWritable() });
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
  assert.equal(code, 0);
  assert.equal(stdout.text().trim(), `aiwiki ${packageJson.version}`);
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
    assert.match(configOut.text(), /产品: aiwiki/);
    assert.match(configOut.text(), /创建时间:/);

    const doctorOut = new MemoryWritable();
    assert.equal(await runCli(["doctor", "--path", root], { stdout: doctorOut, stderr: new MemoryWritable() }), 0);
    assert.match(doctorOut.text(), /正常: aiwiki.yaml/);

    const statusOut = new MemoryWritable();
    assert.equal(await runCli(["status", "--path", root], { stdout: statusOut, stderr: new MemoryWritable() }), 0);
    assert.deepEqual(statusOut.text().split(/\r?\n/).slice(0, 4), [
      `知识库路径: ${path.resolve(root)}`,
      "处理次数: 0",
      "失败次数: 0",
      "最近处理: 无"
    ]);
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
    assert.match(setupOut.text(), /默认知识库:/);
    assert.match(setupOut.text(), /用户配置:/);
    assert.match(setupOut.text(), /新建数据库文件数: 12/);
    assert.match(setupOut.text(), /Obsidian 入口: dashboards\/AIWiki Home\.md/);
    assert.match(setupOut.text(), /aiwiki agent install/);
    assert.match(setupOut.text(), /Agent 设置完成后/);

    const doctorOut = new MemoryWritable();
    assert.equal(await runCli(["doctor"], { stdout: doctorOut, stderr: new MemoryWritable() }), 0);
    assert.match(doctorOut.text(), /正常: aiwiki.yaml/);

    const statusOut = new MemoryWritable();
    assert.equal(await runCli(["status"], { stdout: statusOut, stderr: new MemoryWritable() }), 0);
    assert.deepEqual(statusOut.text().split(/\r?\n/).slice(0, 4), [
      `知识库路径: ${path.resolve(root)}`,
      "处理次数: 0",
      "失败次数: 0",
      "最近处理: 无"
    ]);

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
    assert.match(out.text(), /codex: Codex \| 已检测=是 \| 可安装=是/);
    assert.match(out.text(), /qclaw: QClaw \| 已检测=是 \| 可安装=是/);
    assert.match(out.text(), /openclaw: OpenClaw \| 已检测=是 \| 可安装=是/);
    assert.match(out.text(), /opencode: opencode \| 已检测=否 \| 可安装=否/);
    assert.match(out.text(), /安装到 Codex 用户 skills 目录/);
    assert.match(out.text(), /暂未确认稳定的用户提示目录/);
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
    assert.match(out.text(), /已安装: Codex/);
    assert.match(out.text(), new RegExp(`目标路径: ${escapeRegExp(target)}`));

    const installed = await readFile(target, "utf8");
    assert.match(installed, /name: aiwiki/);
    assert.match(installed, /aiwiki ingest-agent --stdin/);

    const duplicateErr = new MemoryWritable();
    assert.equal(await runCli(["agent", "install", "--agent", "codex", "--yes"], { stdout: new MemoryWritable(), stderr: duplicateErr }), 1);
    assert.match(duplicateErr.text(), /目标文件已存在/);

    const forceOut = new MemoryWritable();
    assert.equal(await runCli(["agent", "install", "--agent", "codex", "--yes", "--force"], { stdout: forceOut, stderr: new MemoryWritable() }), 0);
    assert.match(forceOut.text(), /已安装: Codex/);
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
    assert.match(out.text(), /已安装: Claude Code/);

    const installed = await readFile(target, "utf8");
    assert.match(installed, /AIWiki Agent 对接说明/);
    assert.match(installed, /aiwiki ingest-agent --stdin/);
    assert.match(installed, /wiki_entry/);
    assert.match(installed, /aiwiki context/);
    assert.match(installed, /aiwiki lint/);
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
    assert.match(err.text(), /暂未配置自动安装/);
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
    assert.match(result.stderr, /Interactive setup requires a terminal|交互式 setup 需要终端环境/);
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
    assert.match(out.text(), /wiki_entry:/);
    assert.match(out.text(), /wiki_entry: 05-wiki\/source-knowledge\/ai-agent-workflow-notes\.md/);
    assert.match(out.text(), /wiki_entry_generation_mode: deterministic_fallback/);
    assert.match(out.text(), /wiki_entry_quality: scaffold/);
    assert.match(out.text(), /grounding_evidence_available: no/);
    assert.match(out.text(), /grounding_evidence_channel: none/);
    assert.match(out.text(), /grounding_needs_review: no/);
    assert.match(out.text(), /grounding_markers: none/);
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
    assert.doesNotMatch(out.text(), /wiki_entry:/);
    assert.doesNotMatch(out.text(), /source_card:/);
    assert.match(out.text(), /dashboard: dashboards\/AIWiki Home\.md/);
    assert.match(out.text(), /review_queue: dashboards\/Review Queue\.md/);
    assert.equal(err.text(), "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI context returns JSON matches with wiki quality", async () => {
  const root = await tempRoot("aiwiki-cli-context");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    await runCli(["ingest-agent", "--payload", fixturePath("agent_payload.url.valid.json"), "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const out = new MemoryWritable();
    assert.equal(await runCli(["context", "AI Agent", "--path", root], { stdout: out, stderr: new MemoryWritable() }), 0);
    const parsed = JSON.parse(out.text()) as {
      schema_version: string;
      matches: {
        wiki_entries: Array<{ path: string; quality: string; grounding_needs_review?: boolean; grounding_markers: string[]; warnings: string[] }>;
        raw_refs: unknown[];
      };
    };
    assert.equal(parsed.schema_version, "aiwiki.context.v1");
    assert.equal(parsed.matches.wiki_entries[0]?.path, "05-wiki/source-knowledge/ai-agent-workflow-notes.md");
    assert.equal(parsed.matches.wiki_entries[0]?.quality, "scaffold");
    assert.equal(parsed.matches.wiki_entries[0]?.grounding_needs_review, false);
    assert.deepEqual(parsed.matches.wiki_entries[0]?.grounding_markers, []);
    assert.match(parsed.matches.wiki_entries[0]?.warnings.join("\n") ?? "", /deterministic fallback/);
    assert.equal(parsed.matches.raw_refs.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI query renders human-readable context without changing context JSON", async () => {
  const root = await tempRoot("aiwiki-cli-query");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    await runCli(["ingest-agent", "--payload", fixturePath("agent_payload.url.valid.json"), "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const queryOut = new MemoryWritable();
    assert.equal(await runCli(["query", "AI Agent", "--path", root], { stdout: queryOut, stderr: new MemoryWritable() }), 0);
    assert.match(queryOut.text(), /AIWiki 查询: AI Agent/);
    assert.match(queryOut.text(), /Wiki 条目/);
    assert.match(queryOut.text(), /05-wiki\/source-knowledge\/ai-agent-workflow-notes\.md/);

    const contextOut = new MemoryWritable();
    assert.equal(await runCli(["context", "AI Agent", "--path", root], { stdout: contextOut, stderr: new MemoryWritable() }), 0);
    const parsed = JSON.parse(contextOut.text()) as { schema_version: string };
    assert.equal(parsed.schema_version, "aiwiki.context.v1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI next gives setup guidance for fresh workspace and active workspace", async () => {
  const root = await tempRoot("aiwiki-cli-next");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const freshOut = new MemoryWritable();
    assert.equal(await runCli(["next", "--path", root], { stdout: freshOut, stderr: new MemoryWritable() }), 0);
    assert.match(freshOut.text(), /下一步建议/);
    assert.match(freshOut.text(), /aiwiki agent install/);

    await runCli(["ingest-agent", "--payload", fixturePath("agent_payload.url.valid.json"), "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const activeOut = new MemoryWritable();
    assert.equal(await runCli(["next", "--path", root], { stdout: activeOut, stderr: new MemoryWritable() }), 0);
    assert.match(activeOut.text(), /aiwiki query/);
    assert.match(activeOut.text(), /aiwiki lint/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI next prioritizes lint-needed workspace guidance", async () => {
  const root = await tempRoot("aiwiki-cli-next-lint-needed");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const payloadPath = path.join(root, "invalid-user-view-payload.json");
    await writeFile(payloadPath, JSON.stringify({
      schema_version: "aiwiki.agent_payload.v1",
      source: {
        kind: "text",
        title: "External Article",
        source_role: "input",
        represents_user_view: true,
        content_format: "markdown",
        content: "This external article should not represent the user's view.",
        fetch_status: "ok",
        captured_at: "2026-05-19T00:00:00.000Z"
      },
      request: { mode: "ingest", outputs: ["wiki_entry"], language: "zh-CN" }
    }), "utf8");
    await runCli(["ingest-agent", "--payload", payloadPath, "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const out = new MemoryWritable();
    assert.equal(await runCli(["next", "--path", root], { stdout: out, stderr: new MemoryWritable() }), 0);
    assert.match(out.text(), /结构检查发现/);
    assert.match(out.text(), /aiwiki lint/);
    assert.doesNotMatch(out.text(), /已有入库记录，可以继续/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI agent check reports installed and missing host state", async () => {
  const codexHome = await tempRoot("aiwiki-cli-agent-check-codex");
  const qclawHome = await tempRoot("aiwiki-cli-agent-check-qclaw");
  const previousCodexHome = process.env.CODEX_HOME;
  const previousQclawHome = process.env.QCLAW_HOME;
  process.env.CODEX_HOME = codexHome;
  process.env.QCLAW_HOME = qclawHome;
  try {
    await runCli(["agent", "install", "--agent", "codex", "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const out = new MemoryWritable();
    assert.equal(await runCli(["agent", "check"], { stdout: out, stderr: new MemoryWritable() }), 0);
    assert.match(out.text(), /codex: Codex \| detected=yes \| installed=yes/);
    assert.match(out.text(), /qclaw: QClaw \| detected=yes \| installed=no/);
    assert.match(out.text(), /aiwiki agent install --agent qclaw --yes/);
  } finally {
    restoreEnv("CODEX_HOME", previousCodexHome);
    restoreEnv("QCLAW_HOME", previousQclawHome);
    await rm(codexHome, { recursive: true, force: true });
    await rm(qclawHome, { recursive: true, force: true });
  }
});

test("CLI lint writes dashboard report", async () => {
  const root = await tempRoot("aiwiki-cli-lint");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    await runCli(["ingest-agent", "--payload", fixturePath("agent_payload.url.valid.json"), "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const out = new MemoryWritable();
    assert.equal(await runCli(["lint", "--path", root], { stdout: out, stderr: new MemoryWritable() }), 0);
    assert.match(out.text(), /lint_summary: errors=\d+ warnings=\d+ info=\d+/);
    assert.match(out.text(), /top_issue:/);
    assert.match(out.text(), /AIWiki Lint Report/);
    assert.match(out.text(), /report: dashboards\/Lint Report\.md/);
    assert.match(await readFile(path.join(root, "dashboards", "Lint Report.md"), "utf8"), /deterministic fallback/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI lint supports severity json and no-write modes", async () => {
  const root = await tempRoot("aiwiki-cli-lint-modes");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    await runCli(["ingest-agent", "--payload", fixturePath("agent_payload.url.valid.json"), "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });

    const warningOut = new MemoryWritable();
    assert.equal(await runCli(["lint", "--severity", "warning", "--path", root], { stdout: warningOut, stderr: new MemoryWritable() }), 0);
    assert.match(warningOut.text(), /## Warnings/);
    assert.doesNotMatch(warningOut.text(), /\[info\]/);

    const jsonOut = new MemoryWritable();
    assert.equal(await runCli(["lint", "--json", "--severity", "info", "--path", root], { stdout: jsonOut, stderr: new MemoryWritable() }), 0);
    const parsed = JSON.parse(jsonOut.text()) as { issues: Array<{ severity: string; action?: string; category?: string }> };
    assert.ok(parsed.issues.length > 0);
    assert.equal(parsed.issues.every((issue) => issue.severity === "info"), true);
    assert.equal(parsed.issues.some((issue) => issue.action === "enrich" && issue.category === "stale_scaffold"), true);

    await rm(path.join(root, "dashboards", "Lint Report.md"), { force: true });
    const noWriteOut = new MemoryWritable();
    assert.equal(await runCli(["lint", "--no-write", "--path", root], { stdout: noWriteOut, stderr: new MemoryWritable() }), 0);
    assert.doesNotMatch(noWriteOut.text(), /report: dashboards\/Lint Report\.md/);
    await assert.rejects(access(path.join(root, "dashboards", "Lint Report.md")));
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

test("CLI status reports diagnostic counters and next action", async () => {
  const root = await tempRoot("aiwiki-cli-status-diagnostics");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const out = new MemoryWritable();
    assert.equal(await runCli(["status", "--path", root], { stdout: out, stderr: new MemoryWritable() }), 0);
    assert.match(out.text(), /fallback_entries: 0/);
    assert.match(out.text(), /grounding_review_entries: 0/);
    assert.match(out.text(), /lint_status: missing/);
    assert.match(out.text(), /system_files: _system\/purpose\.md=ok/);
    assert.match(out.text(), /next_action: aiwiki agent install/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI next emits repair order for structure, lint warnings, empty, and healthy states", async () => {
  const root = await tempRoot("aiwiki-cli-next-repair-order");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    await rm(path.join(root, "_system", "purpose.md"), { force: true });

    const structureOut = new MemoryWritable();
    assert.equal(await runCli(["next", "--path", root], { stdout: structureOut, stderr: new MemoryWritable() }), 0);
    assert.match(structureOut.text(), /repair_order: structure/);

    await runCli(["setup", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const emptyOut = new MemoryWritable();
    assert.equal(await runCli(["next", "--path", root], { stdout: emptyOut, stderr: new MemoryWritable() }), 0);
    assert.match(emptyOut.text(), /repair_order: empty_workspace/);

    const payloadPath = path.join(root, "invalid-user-view-payload.json");
    await writeFile(payloadPath, JSON.stringify({
      schema_version: "aiwiki.agent_payload.v1",
      source: {
        kind: "text",
        title: "External Article",
        source_role: "input",
        represents_user_view: true,
        content_format: "markdown",
        content: "This external article should not represent the user's view.",
        fetch_status: "ok",
        captured_at: "2026-05-19T00:00:00.000Z"
      },
      request: { mode: "ingest", outputs: ["wiki_entry"], language: "zh-CN" }
    }), "utf8");
    await runCli(["ingest-agent", "--payload", payloadPath, "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });

    const warningOut = new MemoryWritable();
    assert.equal(await runCli(["next", "--path", root], { stdout: warningOut, stderr: new MemoryWritable() }), 0);
    assert.match(warningOut.text(), /repair_order: lint_warnings/);

    const healthyRoot = await tempRoot("aiwiki-cli-next-healthy");
    try {
      await runCli(["init", "--path", healthyRoot, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
      await runCli(["ingest-agent", "--payload", fixturePath("agent_payload.analysis.grounded.json"), "--path", healthyRoot], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
      const healthyOut = new MemoryWritable();
      assert.equal(await runCli(["next", "--path", healthyRoot], { stdout: healthyOut, stderr: new MemoryWritable() }), 0);
      assert.match(healthyOut.text(), /repair_order: healthy_query/);
    } finally {
      await rm(healthyRoot, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
