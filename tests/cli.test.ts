import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { runCli } from "../src/app.js";
import { parseArgs } from "../src/args.js";
import { createCommandContext } from "../src/cli/command-context.js";
import { CommandRegistry, createCoreCommandRegistry, type CoreCommandHandlers } from "../src/cli/command-registry.js";
import { createCoreCommandHandlers } from "../src/cli/commands/core-handlers.js";
import { fixturePath, MemoryWritable, tempRoot } from "./helpers.js";

test("help exposes core commands and only the implemented plugin commands", async () => {
  const stdout = new MemoryWritable();
  const stderr = new MemoryWritable();
  const code = await runCli(["--help"], { stdout, stderr });
  const text = stdout.text();
  assert.equal(code, 0);
  assert.match(text, /aiwiki setup/);
  assert.match(text, /aiwiki agent sync --yes/);
  assert.match(text, /aiwiki agent check --json/);
  assert.match(text, /aiwiki ingest-agent --stdin/);
  assert.match(text, /aiwiki ingest-file --file <file>/);
  assert.match(text, /aiwiki show <query>/);
  assert.match(text, /aiwiki context <query>/);
  assert.match(text, /aiwiki query <query>/);
  assert.match(text, /aiwiki lint/);
  assert.match(text, /aiwiki lint --capsules --json/);
  assert.match(text, /aiwiki lint --strict --json/);
  assert.match(text, /aiwiki lint --fix-empty-dirs --json/);
  assert.match(text, /aiwiki plugin list --json/);
  assert.match(text, /aiwiki plugin add <directory>/);
  assert.match(text, /aiwiki plugin enable <id>/);
  assert.doesNotMatch(text, /aiwiki init/);
  assert.doesNotMatch(text, /aiwiki agent install/);
  assert.doesNotMatch(text, /aiwiki prompt agent/);
  assert.doesNotMatch(text, /aiwiki next/);
  assert.doesNotMatch(text, /aiwiki config show/);
  assert.doesNotMatch(text, /aiwiki ingest-url/);
  assert.doesNotMatch(text, /aiwiki ingest-agent --payload/);
  assert.doesNotMatch(text, /aiwiki plugin disable/i);
  assert.doesNotMatch(text, /aiwiki plugin remove/i);
  assert.doesNotMatch(text, /aiwiki plugin doctor/i);
  assert.doesNotMatch(text, /aiwiki extension/i);
  assert.doesNotMatch(text, /prompt qclaw/i);
  assert.doesNotMatch(text, /kb add|kb list|kb default/i);
  assert.equal(stderr.text(), "");
});

test("CLI plugin list add and enable manage only explicitly registered local extensions", async () => {
  const root = await tempRoot("aiwiki-cli-plugin");
  const extensionRoot = await tempRoot("aiwiki-cli-plugin-extension");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    await writeFile(path.join(extensionRoot, "aiwiki-extension.json"), JSON.stringify({
      schema_version: "aiwiki.extension.v1",
      id: "example.cli-quality",
      name: "CLI quality extension",
      version: "0.1.0",
      api_version: "aiwiki.extension.v1",
      entry: "index.mjs"
    }, null, 2), "utf8");
    await writeFile(path.join(extensionRoot, "index.mjs"), [
      "export default {",
      '  id: "example.cli-quality",',
      '  name: "CLI quality extension",',
      '  version: "0.1.0",',
      '  apiVersion: "aiwiki.extension.v1"',
      "};",
      ""
    ].join("\n"), "utf8");

    const before = new MemoryWritable();
    assert.equal(await runCli(["plugin", "list", "--json", "--path", root], { stdout: before, stderr: new MemoryWritable() }), 0);
    assert.equal((JSON.parse(before.text()) as { extensions: Array<{ id: string; status: string }> }).extensions
      .some((extension) => extension.id === "example.cli-quality"), false);

    const added = new MemoryWritable();
    assert.equal(await runCli(["plugin", "add", extensionRoot, "--json", "--path", root], { stdout: added, stderr: new MemoryWritable() }), 0);
    assert.equal((JSON.parse(added.text()) as { extension: { id: string; status: string } }).extension.status, "available");

    const enabled = new MemoryWritable();
    assert.equal(await runCli(["plugin", "enable", "example.cli-quality", "--json", "--path", root], { stdout: enabled, stderr: new MemoryWritable() }), 0);
    assert.equal((JSON.parse(enabled.text()) as { extension: { id: string; status: string } }).extension.status, "enabled");
    await access(path.join(root, ".aiwiki", "extensions", "state", "example.cli-quality"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(extensionRoot, { recursive: true, force: true });
  }
});

test("enabled extension commands and lint rules run without letting a broken rule stop Core lint", async () => {
  const root = await tempRoot("aiwiki-cli-extension-runtime");
  const healthyRoot = await tempRoot("aiwiki-cli-extension-healthy");
  const brokenRoot = await tempRoot("aiwiki-cli-extension-broken");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    await writeFile(path.join(root, "05-wiki", "source-knowledge", "extension.md"), "# Extension fixture\n", "utf8");

    await writeFile(path.join(healthyRoot, "aiwiki-extension.json"), JSON.stringify({
      schema_version: "aiwiki.extension.v1",
      id: "example.runtime-quality",
      name: "Runtime quality extension",
      version: "0.1.0",
      api_version: "aiwiki.extension.v1",
      entry: "index.mjs"
    }, null, 2), "utf8");
    await writeFile(path.join(healthyRoot, "index.mjs"), [
      "export default {",
      '  id: "example.runtime-quality",',
      '  name: "Runtime quality extension",',
      '  version: "0.1.0",',
      '  apiVersion: "aiwiki.extension.v1",',
      "  commands: [{",
      '    kind: "command",',
      '    id: "example.runtime-quality.command",',
      '    path: ["example", "quality"],',
      '    summary: "Print quality status",',
      '    async run({ argv }) { return { exitCode: 0, stdout: "quality:" + argv.join(",") }; }',
      "  }],",
      "  lintRules: [{",
      '    kind: "lint_rule",',
      '    id: "example.runtime-quality.lint",',
      '    defaultSeverity: "warning",',
      "    async evaluate({ artifacts }) {",
      '      if (artifacts.some((artifact) => "absolutePath" in artifact || "body" in artifact)) throw new Error("unsafe artifact projection");',
      '      return [{ severity: "warning", category: "runtime_quality", message: "Runtime quality finding", suggestion: "Review extension fixture." }];',
      "    }",
      "  }],",
      "  contextProviders: [{",
      '    kind: "context_provider",',
      '    id: "example.runtime-quality.context",',
      '    namespace: "runtime-quality",',
      '    async provide() { throw new Error("context provider must not run"); }',
      "  }],",
      "  artifactGenerators: [{",
      '    kind: "artifact_generator",',
      '    id: "example.runtime-quality.generator",',
      '    generates: ["wiki_entry"],',
      '    async generate() { throw new Error("artifact generator must not run"); }',
      "  }]",
      "};",
      ""
    ].join("\n"), "utf8");

    await writeFile(path.join(brokenRoot, "aiwiki-extension.json"), JSON.stringify({
      schema_version: "aiwiki.extension.v1",
      id: "example.broken-lint",
      name: "Broken lint extension",
      version: "0.1.0",
      api_version: "aiwiki.extension.v1",
      entry: "index.mjs"
    }, null, 2), "utf8");
    await writeFile(path.join(brokenRoot, "index.mjs"), [
      "export default {",
      '  id: "example.broken-lint",',
      '  name: "Broken lint extension",',
      '  version: "0.1.0",',
      '  apiVersion: "aiwiki.extension.v1",',
      "  lintRules: [{",
      '    kind: "lint_rule",',
      '    id: "example.broken-lint.rule",',
      '    defaultSeverity: "warning",',
      '    async evaluate() { throw new Error("broken lint callback"); }',
      "  }]",
      "};",
      ""
    ].join("\n"), "utf8");

    for (const extensionRoot of [healthyRoot, brokenRoot]) {
      assert.equal(await runCli(["plugin", "add", extensionRoot, "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() }), 0);
    }
    for (const id of ["example.runtime-quality", "example.broken-lint"]) {
      assert.equal(await runCli(["plugin", "enable", id, "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() }), 0);
    }

    const command = new MemoryWritable();
    assert.equal(await runCli(["example", "quality", "first", "--path", root], { stdout: command, stderr: new MemoryWritable() }), 0);
    assert.match(command.text(), /quality:first/);

    const flaggedCommand = new MemoryWritable();
    assert.equal(await runCli([
      "example", "quality", "--mode", "fast", "--format=json", "tail", "--path", root
    ], { stdout: flaggedCommand, stderr: new MemoryWritable() }), 0);
    assert.match(flaggedCommand.text(), /quality:--mode,fast,--format=json,tail/);

    const lint = new MemoryWritable();
    assert.equal(await runCli(["lint", "--json", "--path", root], { stdout: lint, stderr: new MemoryWritable() }), 0);
    const report = JSON.parse(lint.text()) as { issues: Array<{ category?: string; message?: string }> };
    assert.equal(report.issues.some((issue) => issue.category === "runtime_quality" && issue.message === "Runtime quality finding"), true);

    const statuses = new MemoryWritable();
    assert.equal(await runCli(["plugin", "list", "--json", "--path", root], { stdout: statuses, stderr: new MemoryWritable() }), 0);
    const plugins = JSON.parse(statuses.text()) as { extensions: Array<{ id: string; status: string; disabledReason?: string }> };
    assert.equal(plugins.extensions.find((extension) => extension.id === "example.runtime-quality")?.status, "enabled");
    const broken = plugins.extensions.find((extension) => extension.id === "example.broken-lint");
    assert.equal(broken?.status, "disabled");
    assert.match(broken?.disabledReason ?? "", /broken lint callback/i);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(healthyRoot, { recursive: true, force: true });
    await rm(brokenRoot, { recursive: true, force: true });
  }
});

test("checked-in local extension can be explicitly added, enabled, and exercised", async () => {
  const root = await tempRoot("aiwiki-cli-checked-in-extension");
  const extensionRoot = path.join(process.cwd(), "examples", "extensions", "local-quality-extension");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    assert.equal(await runCli(["plugin", "add", extensionRoot, "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() }), 0);
    assert.equal(await runCli(["plugin", "enable", "example.local-quality", "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() }), 0);

    const command = new MemoryWritable();
    assert.equal(await runCli(["example", "quality", "--path", root], { stdout: command, stderr: new MemoryWritable() }), 0);
    assert.match(command.text(), /Local quality extension is enabled/);

    const lint = new MemoryWritable();
    assert.equal(await runCli(["lint", "--json", "--path", root], { stdout: lint, stderr: new MemoryWritable() }), 0);
    const report = JSON.parse(lint.text()) as { issues: Array<{ category?: string; message?: string }> };
    assert.equal(report.issues.some((issue) => issue.category === "local_quality" && issue.message === "Local quality extension found no artifacts."), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bundled extensions remain inactive until explicit enable", async () => {
  const root = await tempRoot("aiwiki-cli-bundled-extension");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const before = new MemoryWritable();
    assert.equal(await runCli(["plugin", "list", "--json", "--path", root], { stdout: before, stderr: new MemoryWritable() }), 0);
    assert.equal((JSON.parse(before.text()) as { extensions: Array<{ id: string; status: string }> }).extensions
      .find((extension) => extension.id === "aiwiki.bundled-example")?.status, "available");

    assert.equal(await runCli(["plugin", "enable", "aiwiki.bundled-example", "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() }), 0);
    const command = new MemoryWritable();
    assert.equal(await runCli(["example", "bundled", "--path", root], { stdout: command, stderr: new MemoryWritable() }), 0);
    assert.match(command.text(), /AIWiki bundled example is enabled/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failing extension command is disabled while Core status still runs", async () => {
  const root = await tempRoot("aiwiki-cli-broken-command");
  const extensionRoot = await tempRoot("aiwiki-cli-broken-command-extension");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    await writeFile(path.join(extensionRoot, "aiwiki-extension.json"), JSON.stringify({
      schema_version: "aiwiki.extension.v1",
      id: "example.broken-command",
      name: "Broken command extension",
      version: "0.1.0",
      api_version: "aiwiki.extension.v1",
      entry: "index.mjs"
    }, null, 2), "utf8");
    await writeFile(path.join(extensionRoot, "index.mjs"), [
      "export default {",
      '  id: "example.broken-command",',
      '  name: "Broken command extension",',
      '  version: "0.1.0",',
      '  apiVersion: "aiwiki.extension.v1",',
      "  commands: [{",
      '    kind: "command",',
      '    id: "example.broken-command.run",',
      '    path: ["example", "broken-command"],',
      '    summary: "Fails deliberately",',
      '    async run() { throw new Error("broken command callback"); }',
      "  }]",
      "};",
      ""
    ].join("\n"), "utf8");

    assert.equal(await runCli(["plugin", "add", extensionRoot, "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() }), 0);
    assert.equal(await runCli(["plugin", "enable", "example.broken-command", "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() }), 0);

    const failed = new MemoryWritable();
    assert.equal(await runCli(["example", "broken-command", "--path", root], { stdout: new MemoryWritable(), stderr: failed }), 1);
    assert.match(failed.text(), /broken command callback/);

    const list = new MemoryWritable();
    assert.equal(await runCli(["plugin", "list", "--json", "--path", root], { stdout: list, stderr: new MemoryWritable() }), 0);
    assert.equal((JSON.parse(list.text()) as { extensions: Array<{ id: string; status: string }> }).extensions
      .find((extension) => extension.id === "example.broken-command")?.status, "disabled");

    assert.equal(await runCli(["status", "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() }), 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(extensionRoot, { recursive: true, force: true });
  }
});

test("agent and context help explain sync and filters", async () => {
  const agentOut = new MemoryWritable();
  assert.equal(await runCli(["agent", "sync", "--help"], { stdout: agentOut, stderr: new MemoryWritable() }), 0);
  assert.match(agentOut.text(), /aiwiki agent sync --yes/);
  assert.match(agentOut.text(), /backed up before overwrite/);

  const contextOut = new MemoryWritable();
  assert.equal(await runCli(["context", "--help"], { stdout: contextOut, stderr: new MemoryWritable() }), 0);
  assert.match(contextOut.text(), /aiwiki show <topic>/);
  assert.match(contextOut.text(), /--view capsule/);
  assert.match(contextOut.text(), /--source-role/);
  assert.match(contextOut.text(), /result_quality/);
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

test("documentation, Skill, prompt, and workspace guidance share the Core intent matrix", async () => {
  const [handoff, handoffChinese, skill, queryProtocol, lintProtocol, ...publicDocs] = await Promise.all([
    readFile("docs/AGENT_HANDOFF.md", "utf8"),
    readFile("docs/AGENT_HANDOFF.zh-CN.md", "utf8"),
    readFile("skill/SKILL.md", "utf8"),
    readFile("skill/QUERY_PROTOCOL.md", "utf8"),
    readFile("skill/LINT_PROTOCOL.md", "utf8"),
    ...[
      "README.md",
      "README.zh-CN.md",
      "docs/README.md",
      "docs/README.zh-CN.md",
      "docs/USAGE.md",
      "docs/USAGE.zh-CN.md",
      "docs/FAQ.md",
      "docs/FAQ.zh-CN.md",
      "docs/SHOWCASE.md",
      "docs/SHOWCASE.zh-CN.md"
    ].map((file) => readFile(file, "utf8"))
  ]);
  const commandFirstTerms = [
    "aiwiki setup",
    "aiwiki agent check",
    "aiwiki ingest-agent --stdin",
    "aiwiki query",
    "aiwiki context",
    "aiwiki lint --json",
    "aiwiki lint --fix-empty-dirs --json"
  ];

  assert.match(handoff, /Core Intent Matrix/);
  assert.match(handoffChinese, /Core Intent Matrix/);
  for (const text of [handoff, handoffChinese, skill]) {
    for (const term of commandFirstTerms) {
      assert.ok(text.includes(term), `expected command contract to contain ${term}`);
    }
    assert.match(text, /fallback/i);
  }
  assert.match(queryProtocol, /fallback/i);
  assert.match(lintProtocol, /fallback/i);
  for (const text of publicDocs) {
    assert.match(text, /Core Intent Matrix/);
  }

  const promptOut = new MemoryWritable();
  assert.equal(await runCli(["prompt", "agent"], { stdout: promptOut, stderr: new MemoryWritable() }), 0);
  for (const term of [
    "aiwiki setup --path <workspace> --yes",
    "aiwiki agent check --json",
    "aiwiki agent sync --dry-run",
    "aiwiki agent sync --yes",
    "aiwiki doctor --path <workspace>",
    "aiwiki status --path <workspace>",
    "aiwiki ingest-agent --stdin",
    "aiwiki context",
    "result_quality",
    "recommended_next_action",
    "aiwiki lint --json",
    "aiwiki prompt agent",
    "fallback"
  ]) {
    assert.ok(promptOut.text().includes(term), `expected prompt output to contain ${term}`);
  }

  const root = await tempRoot("aiwiki-cli-intent-matrix");
  try {
    assert.equal(await runCli(["agent", "sync", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() }), 0);
    const guidance = await readFile(path.join(root, "AGENTS.md"), "utf8");
    for (const term of [
      ...commandFirstTerms,
      "aiwiki agent sync --dry-run",
      "aiwiki agent sync --yes",
      "result_quality",
      "recommended_next_action",
      "aiwiki prompt agent"
    ]) {
      assert.ok(guidance.includes(term), `expected workspace guidance to contain ${term}`);
    }
    assert.match(guidance, /fallback/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("version flag prints CLI version", async () => {
  const stdout = new MemoryWritable();
  const code = await runCli(["--version"], { stdout, stderr: new MemoryWritable() });
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
  assert.equal(code, 0);
  assert.equal(stdout.text().trim(), `aiwiki ${packageJson.version}`);
});

test("CLI routing preserves version aliases, scoped help precedence, and unknown command errors", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
  const versionAliases = [["--version"], ["version"], ["-v"]];

  for (const argv of versionAliases) {
    const stdout = new MemoryWritable();
    const stderr = new MemoryWritable();
    assert.equal(await runCli(argv, { stdout, stderr }), 0, argv.join(" "));
    assert.equal(stdout.text().trim(), `aiwiki ${packageJson.version}`, argv.join(" "));
    assert.equal(stderr.text(), "", argv.join(" "));
  }

  const agentHelp = new MemoryWritable();
  assert.equal(await runCli(["agent", "sync", "--help"], { stdout: agentHelp, stderr: new MemoryWritable() }), 0);
  assert.match(agentHelp.text(), /AIWiki Agent commands/);
  assert.match(agentHelp.text(), /aiwiki agent sync --yes/);

  for (const command of ["context", "query", "show"]) {
    const stdout = new MemoryWritable();
    assert.equal(await runCli([command, "--help"], { stdout, stderr: new MemoryWritable() }), 0, command);
    assert.match(stdout.text(), /AIWiki context\/query/, command);
  }

  const globalHelp = new MemoryWritable();
  assert.equal(await runCli(["setup", "--help"], { stdout: globalHelp, stderr: new MemoryWritable() }), 0);
  assert.match(globalHelp.text(), /aiwiki setup/);
  assert.doesNotMatch(globalHelp.text(), /aiwiki init/);
  assert.doesNotMatch(globalHelp.text(), /aiwiki ingest-url/);

  const unknownError = new MemoryWritable();
  assert.equal(await runCli(["unknown-command"], { stdout: new MemoryWritable(), stderr: unknownError }), 1);
  assert.match(unknownError.text(), /错误: 未知命令: unknown-command/);
});

test("CommandRegistry dispatches the first declared matching command", async () => {
  const calls: string[] = [];
  const registry = new CommandRegistry([
    {
      id: "first",
      matches: (context) => context.command === "help",
      handle: async () => {
        calls.push("first");
        return 0;
      }
    },
    {
      id: "second",
      matches: () => true,
      handle: async () => {
        calls.push("second");
        return 1;
      }
    }
  ]);

  const context = createCommandContext(parseArgs(["help"]), { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
  assert.equal(await registry.dispatch(context), 0);
  assert.deepEqual(calls, ["first"]);
});

test("CommandRegistry preserves declared help entry order", () => {
  const registry = new CommandRegistry([
    {
      id: "setup",
      matches: () => false,
      handle: async () => 0,
      help: [
        { usage: "aiwiki setup", visibility: "public", scope: "base" },
        { usage: "aiwiki setup --path <path> --yes", visibility: "public", scope: "base" }
      ]
    },
    {
      id: "agent-sync",
      matches: () => false,
      handle: async () => 0,
      help: [{ usage: "aiwiki agent sync --yes", visibility: "public", scope: "base" }]
    }
  ]);

  assert.deepEqual(registry.help("base"), [
    "aiwiki setup",
    "aiwiki setup --path <path> --yes",
    "aiwiki agent sync --yes"
  ]);
});

test("Core CommandRegistry dispatches every public and compatibility route", async () => {
  const calls: string[] = [];
  const handlerIds = [
    "version",
    "agentHelp",
    "retrievalHelp",
    "help",
    "setup",
    "agentInstall",
    "agentSync",
    "agentCheck",
    "agentList",
    "promptAgent",
    "init",
    "configShow",
    "doctor",
    "status",
    "context",
    "query",
    "show",
    "next",
    "lint",
    "plugin",
    "ingestAgent",
    "ingestFile",
    "ingestUrl"
  ] as const;
  const handlers = Object.fromEntries(handlerIds.map((id) => [id, async () => {
    calls.push(id);
    return 0;
  }])) as unknown as CoreCommandHandlers;
  const registry = createCoreCommandRegistry(handlers);
  const routes: ReadonlyArray<readonly [string[], (typeof handlerIds)[number]]> = [
    [["--version"], "version"],
    [["agent", "sync", "--help"], "agentHelp"],
    [["show", "--help"], "retrievalHelp"],
    [["--help"], "help"],
    [["setup"], "setup"],
    [["agent", "install"], "agentInstall"],
    [["agent", "sync"], "agentSync"],
    [["agent", "check"], "agentCheck"],
    [["agent", "list"], "agentList"],
    [["prompt"], "promptAgent"],
    [["init"], "init"],
    [["config", "show"], "configShow"],
    [["doctor"], "doctor"],
    [["status"], "status"],
    [["context", "topic"], "context"],
    [["query", "topic"], "query"],
    [["show", "topic"], "show"],
    [["next"], "next"],
    [["lint"], "lint"],
    [["plugin", "list"], "plugin"],
    [["ingest-agent"], "ingestAgent"],
    [["ingest-file"], "ingestFile"],
    [["ingest-url"], "ingestUrl"]
  ];

  for (const [argv, expected] of routes) {
    calls.length = 0;
    const context = createCommandContext(parseArgs(argv), { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    assert.equal(await registry.dispatch(context), 0, argv.join(" "));
    assert.deepEqual(calls, [expected], argv.join(" "));
  }
});

test("Registry help entries stay aligned with public CLI help output", async () => {
  const handlers = new Proxy({}, { get: () => async () => 0 }) as unknown as CoreCommandHandlers;
  const registry = createCoreCommandRegistry(handlers);
  const cases: ReadonlyArray<readonly ["base" | "agent" | "retrieval", string[]]> = [
    ["base", ["--help"]],
    ["agent", ["agent", "--help"]],
    ["retrieval", ["context", "--help"]]
  ];

  for (const [scope, argv] of cases) {
    const stdout = new MemoryWritable();
    assert.equal(await runCli(argv, { stdout, stderr: new MemoryWritable() }), 0, scope);
    const output = stdout.text();
    for (const usage of registry.help(scope)) {
      assert.ok(output.includes(usage), `${scope} help is missing ${usage}`);
    }
  }
});

test("Core handlers read arguments and streams from the dispatched context", async () => {
  const stdout = new MemoryWritable();
  const registry = createCoreCommandRegistry(createCoreCommandHandlers());
  const context = createCommandContext(parseArgs(["--version"]), { stdout, stderr: new MemoryWritable() });

  assert.equal(await registry.dispatch(context), 0);
  assert.match(stdout.text(), /^aiwiki /);
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
    assert.match(setupOut.text(), /新建数据库文件数: 13/);
    assert.match(setupOut.text(), /知识库根指导: action=installed/);
    assert.match(setupOut.text(), /Obsidian 入口: dashboards\/AIWiki Home\.md/);
    assert.match(setupOut.text(), /aiwiki agent sync --yes/);
    assert.match(setupOut.text(), /aiwiki ingest-agent --stdin/);

    const guidance = await readFile(path.join(root, "AGENTS.md"), "utf8");
    assert.match(guidance, /AIWIKI:AGENT-GUIDANCE:START/);
    assert.match(guidance, /aiwiki show <topic> --path <workspace>/);
    assert.match(guidance, /aiwiki context <topic> --view capsule --path <workspace>/);
    assert.match(guidance, /aiwiki query <topic> --view files --path <workspace>/);
    assert.match(guidance, /aiwiki lint --capsules --json --path <workspace>/);
    assert.doesNotMatch(guidance, /Keep host-Agent guidance current/);

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

test("CLI agent sync installs, previews, reports json, and backs up changed skills", async () => {
  const codexHome = await tempRoot("aiwiki-cli-agent-sync-codex");
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;
  try {
    const target = path.join(codexHome, "skills", "aiwiki", "SKILL.md");

    const dryRunOut = new MemoryWritable();
    assert.equal(await runCli(["agent", "sync", "--agent", "codex", "--dry-run"], { stdout: dryRunOut, stderr: new MemoryWritable() }), 0);
    assert.match(dryRunOut.text(), /action=would_install/);
    await assert.rejects(access(target));

    const installOut = new MemoryWritable();
    assert.equal(await runCli(["agent", "sync", "--agent", "codex", "--yes"], { stdout: installOut, stderr: new MemoryWritable() }), 0);
    assert.match(installOut.text(), /action=installed/);
    assert.match(await readFile(target, "utf8"), /name: aiwiki/);

    const currentJson = new MemoryWritable();
    assert.equal(await runCli(["agent", "sync", "--agent", "codex", "--yes", "--json"], { stdout: currentJson, stderr: new MemoryWritable() }), 0);
    const parsed = JSON.parse(currentJson.text()) as { schema_version: string; results: Array<{ action: string; state: string; changed: boolean }> };
    assert.equal(parsed.schema_version, "aiwiki.agent_sync.v1");
    assert.equal(parsed.results[0]?.action, "current");
    assert.equal(parsed.results[0]?.state, "current");
    assert.equal(parsed.results[0]?.changed, false);

    await writeFile(target, "old user edited aiwiki skill", "utf8");
    const updateOut = new MemoryWritable();
    assert.equal(await runCli(["agent", "sync", "--agent", "codex", "--yes"], { stdout: updateOut, stderr: new MemoryWritable() }), 0);
    assert.match(updateOut.text(), /action=updated/);
    assert.match(updateOut.text(), /backup:/);
    const files = await readdir(path.dirname(target));
    assert.ok(files.some((file) => /^SKILL\.md\.bak-/.test(file)));
    assert.match(await readFile(target, "utf8"), /name: aiwiki/);
  } finally {
    restoreEnv("CODEX_HOME", previousCodexHome);
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("CLI agent sync installs marker-bounded workspace command guidance", async () => {
  const root = await tempRoot("aiwiki-cli-agent-sync-workspace");
  const target = path.join(root, "AGENTS.md");
  try {
    await writeFile(target, "# Project Rules\n\nKeep existing instructions.\n", "utf8");

    const staleJson = new MemoryWritable();
    assert.equal(await runCli(["agent", "check", "--agent", "workspace", "--path", root, "--json"], { stdout: staleJson, stderr: new MemoryWritable() }), 0);
    const stale = JSON.parse(staleJson.text()) as { targets: Array<{ id: string; state: string }> };
    assert.equal(stale.targets.find((item) => item.id === "workspace")?.state, "different");

    const dryRunOut = new MemoryWritable();
    assert.equal(await runCli(["agent", "sync", "--agent", "workspace", "--path", root, "--dry-run"], { stdout: dryRunOut, stderr: new MemoryWritable() }), 0);
    assert.match(dryRunOut.text(), /action=would_update/);

    const syncOut = new MemoryWritable();
    assert.equal(await runCli(["agent", "sync", "--agent", "workspace", "--path", root, "--yes"], { stdout: syncOut, stderr: new MemoryWritable() }), 0);
    assert.match(syncOut.text(), /workspace: Workspace AGENTS\.md/);
    assert.match(syncOut.text(), /action=updated/);
    assert.match(syncOut.text(), /backup:/);

    const installed = await readFile(target, "utf8");
    assert.match(installed, /Keep existing instructions/);
    assert.match(installed, /AIWIKI:AGENT-GUIDANCE:START/);
    assert.match(installed, /aiwiki setup --path <workspace> --yes/);
    assert.match(installed, /aiwiki agent check --path <workspace> --json/);
    assert.match(installed, /aiwiki lint --json --path <workspace>/);
    assert.match(installed, /aiwiki lint --fix-empty-dirs --json --path <workspace>/);
    assert.match(installed, /aiwiki ingest-file --file <file> --path <workspace>/);
    assert.match(installed, /aiwiki ingest-agent --stdin --path <workspace>/);
    assert.match(installed, /aiwiki status --path <workspace>/);
    assert.match(installed, /aiwiki query <topic> --path <workspace>/);
    assert.match(installed, /aiwiki context <topic> --path <workspace>/);
    assert.match(installed, /aiwiki show <topic> --path <workspace>/);
    assert.match(installed, /aiwiki context <topic> --view capsule --path <workspace>/);
    assert.match(installed, /aiwiki query <topic> --view files --path <workspace>/);
    assert.match(installed, /aiwiki lint --capsules --json --path <workspace>/);

    const currentJson = new MemoryWritable();
    assert.equal(await runCli(["agent", "check", "--agent", "workspace", "--path", root, "--json"], { stdout: currentJson, stderr: new MemoryWritable() }), 0);
    const current = JSON.parse(currentJson.text()) as { targets: Array<{ id: string; state: string; installed: boolean }> };
    const workspace = current.targets.find((item) => item.id === "workspace");
    assert.equal(workspace?.installed, true);
    assert.equal(workspace?.state, "current");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI setup refreshes existing workspace guidance during upgrades", async () => {
  const root = await tempRoot("aiwiki-cli-setup-upgrade-guidance");
  const target = path.join(root, "AGENTS.md");
  try {
    await writeFile(target, `# Project Rules

Keep existing project guidance.

<!-- AIWIKI:AGENT-GUIDANCE:START -->
# AIWiki Agent Command Contract

Required command-first loop:

1. Ensure the workspace exists with \`aiwiki setup --path <workspace> --yes\`.
2. Keep host-Agent guidance current with \`aiwiki agent sync --path <workspace> --yes\` and verify with \`aiwiki agent check --path <workspace> --json\`.
3. Inspect structure with \`aiwiki lint --json --path <workspace>\`; apply only safe fixes with \`aiwiki lint --fix-empty-dirs --json --path <workspace>\`.
4. Ingest local material with \`aiwiki ingest-file --file <file> --path <workspace>\` or \`aiwiki ingest-agent --stdin --path <workspace>\`.
5. Check progress with \`aiwiki status --path <workspace>\`.
6. Retrieve reusable knowledge with \`aiwiki query <topic> --path <workspace>\` or \`aiwiki context <topic> --path <workspace>\`.
<!-- AIWIKI:AGENT-GUIDANCE:END -->
`, "utf8");

    const setupOut = new MemoryWritable();
    assert.equal(await runCli(["setup", "--path", root, "--yes"], { stdout: setupOut, stderr: new MemoryWritable() }), 0);
    assert.match(setupOut.text(), /知识库根指导: action=updated/);
    assert.match(setupOut.text(), /知识库根指导备份:/);

    const files = await readdir(root);
    assert.ok(files.some((file) => /^AGENTS\.md\.bak-/.test(file)));

    const refreshed = await readFile(target, "utf8");
    assert.match(refreshed, /Keep existing project guidance/);
    assert.match(refreshed, /aiwiki show <topic> --path <workspace>/);
    assert.match(refreshed, /aiwiki context <topic> --view capsule --path <workspace>/);
    assert.match(refreshed, /aiwiki query <topic> --view files --path <workspace>/);
    assert.match(refreshed, /aiwiki lint --capsules --json --path <workspace>/);
    assert.doesNotMatch(refreshed, /Keep host-Agent guidance current/);

    const currentJson = new MemoryWritable();
    assert.equal(await runCli(["agent", "check", "--agent", "workspace", "--path", root, "--json"], { stdout: currentJson, stderr: new MemoryWritable() }), 0);
    const current = JSON.parse(currentJson.text()) as { targets: Array<{ id: string; state: string }> };
    assert.equal(current.targets.find((item) => item.id === "workspace")?.state, "current");
  } finally {
    await rm(root, { recursive: true, force: true });
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
    assert.match(installed, /AIWiki Agent Handoff/);
    assert.match(installed, /aiwiki ingest-agent --stdin/);
    assert.match(installed, /wiki_entry/);
    assert.match(installed, /aiwiki context/);
    assert.match(installed, /aiwiki lint/);
    assert.match(installed, /Do not install Dataview for the user/);
    assert.match(installed, /Do not edit `\.obsidian`/);
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
      query_scope: { filters: Record<string, string>; limit: number };
      result_quality: { total_matches: number; has_wiki_entry: boolean };
      recommended_next_action: string;
      reuse_guidance: { writing: string; research: string; decision: string; review: string };
      matches: {
        wiki_entries: Array<{ path: string; quality: string; grounding_needs_review?: boolean; grounding_markers: string[]; warnings: string[]; match_reasons: string[]; quality_signals: string[]; related_refs: string[] }>;
        raw_refs: unknown[];
      };
    };
    assert.equal(parsed.schema_version, "aiwiki.context.v1");
    assert.equal(parsed.query_scope.limit, 10);
    assert.equal(parsed.result_quality.has_wiki_entry, true);
    assert.equal(parsed.recommended_next_action, "review_grounding_or_enrich_entry");
    assert.match(parsed.reuse_guidance.writing, /outlines/);
    assert.match(parsed.reuse_guidance.research, /Source Cards/);
    assert.match(parsed.reuse_guidance.decision, /prior judgments/);
    assert.match(parsed.reuse_guidance.review, /quality_signals/);
    assert.equal(parsed.matches.wiki_entries[0]?.path, "05-wiki/source-knowledge/ai-agent-workflow-notes.md");
    assert.equal(parsed.matches.wiki_entries[0]?.quality, "scaffold");
    assert.equal(parsed.matches.wiki_entries[0]?.grounding_needs_review, false);
    assert.deepEqual(parsed.matches.wiki_entries[0]?.grounding_markers, []);
    assert.ok(parsed.matches.wiki_entries[0]?.match_reasons.length);
    assert.ok(parsed.matches.wiki_entries[0]?.quality_signals.includes("quality:scaffold"));
    assert.ok(parsed.matches.wiki_entries[0]?.related_refs.length);
    assert.match(parsed.matches.wiki_entries[0]?.warnings.join("\n") ?? "", /deterministic fallback/);
    assert.equal(parsed.matches.raw_refs.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI context supports capsule view without changing default v1 schema", async () => {
  const root = await tempRoot("aiwiki-cli-context-capsule");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    await runCli(["ingest-agent", "--payload", fixturePath("agent_payload.analysis.grounded.json"), "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });

    const defaultOut = new MemoryWritable();
    assert.equal(await runCli(["context", "Grounded", "--path", root], { stdout: defaultOut, stderr: new MemoryWritable() }), 0);
    assert.equal((JSON.parse(defaultOut.text()) as { schema_version: string }).schema_version, "aiwiki.context.v1");

    const capsuleOut = new MemoryWritable();
    assert.equal(await runCli(["context", "Grounded", "--view", "capsule", "--path", root], { stdout: capsuleOut, stderr: new MemoryWritable() }), 0);
    const parsed = JSON.parse(capsuleOut.text()) as {
      schema_version: string;
      query_scope: { view: string; filters: { type?: string; status?: string } };
      capsules: Array<{ id: string; primary?: { path: string }; okf: { ready: boolean } }>;
      recommended_next_action: string;
    };
    assert.equal(parsed.schema_version, "aiwiki.context.capsule.v1");
    assert.equal(parsed.query_scope.view, "capsule");
    assert.equal(parsed.capsules.length, 1);
    assert.match(parsed.capsules[0]?.id ?? "", /^src_/);
    assert.equal(parsed.capsules[0]?.primary?.path, "05-wiki/source-knowledge/grounded-notes.md");
    assert.equal(parsed.capsules[0]?.okf.ready, true);
    assert.equal(parsed.recommended_next_action, "use_capsules_for_answer");

    const filteredOut = new MemoryWritable();
    assert.equal(await runCli(["context", "Grounded", "--view", "capsule", "--type", "wiki_entries", "--status", "active", "--path", root], { stdout: filteredOut, stderr: new MemoryWritable() }), 0);
    const filtered = JSON.parse(filteredOut.text()) as { query_scope: { filters: { type: string; status: string } }; capsules: unknown[] };
    assert.deepEqual(filtered.query_scope.filters, { type: "wiki_entries", status: "active" });
    assert.equal(filtered.capsules.length, 1);

    const noMatchOut = new MemoryWritable();
    assert.equal(await runCli(["context", "Grounded", "--view", "capsule", "--type", "source_cards", "--status", "ready", "--path", root], { stdout: noMatchOut, stderr: new MemoryWritable() }), 0);
    const noMatch = JSON.parse(noMatchOut.text()) as { capsules: unknown[]; missing_context: string[] };
    assert.equal(noMatch.capsules.length, 0);
    assert.ok(noMatch.missing_context.includes("matching_capsule"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI context supports filters and limit for Agent JSON", async () => {
  const root = await tempRoot("aiwiki-cli-context-filters");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    await runCli(["ingest-agent", "--payload", fixturePath("agent_payload.url.valid.json"), "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const out = new MemoryWritable();
    assert.equal(await runCli(["context", "AI Agent", "--type", "wiki_entries", "--source-role", "input", "--wiki-type", "source_knowledge", "--status", "active", "--limit", "1", "--path", root], { stdout: out, stderr: new MemoryWritable() }), 0);
    const parsed = JSON.parse(out.text()) as {
      query_scope: { filters: { type: string; source_role: string; wiki_type: string; status: string }; limit: number; searched_groups: string[] };
      matches: { wiki_entries: Array<{ source_role: string; wiki_type: string; status: string }>; source_cards: unknown[] };
    };
    assert.deepEqual(parsed.query_scope.filters, {
      type: "wiki_entries",
      source_role: "input",
      wiki_type: "source_knowledge",
      status: "active"
    });
    assert.equal(parsed.query_scope.limit, 1);
    assert.deepEqual(parsed.query_scope.searched_groups, ["wiki_entries"]);
    assert.equal(parsed.matches.wiki_entries.length, 1);
    assert.equal(parsed.matches.wiki_entries[0]?.source_role, "input");
    assert.equal(parsed.matches.wiki_entries[0]?.wiki_type, "source_knowledge");
    assert.equal(parsed.matches.wiki_entries[0]?.status, "active");
    assert.equal(parsed.matches.source_cards.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI query defaults to capsule view and preserves file view", async () => {
  const root = await tempRoot("aiwiki-cli-query");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    await runCli(["ingest-agent", "--payload", fixturePath("agent_payload.url.valid.json"), "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const queryOut = new MemoryWritable();
    assert.equal(await runCli(["query", "AI Agent", "--path", root], { stdout: queryOut, stderr: new MemoryWritable() }), 0);
    assert.match(queryOut.text(), /AIWiki 查询: AI Agent/);
    assert.match(queryOut.text(), /Source Capsules:/);
    assert.match(queryOut.text(), /view: capsule/);
    assert.match(queryOut.text(), /primary=05-wiki\/source-knowledge\/ai-agent-workflow-notes\.md/);

    const filteredQueryOut = new MemoryWritable();
    assert.equal(await runCli(["query", "AI Agent", "--type", "source_cards", "--status", "ready", "--path", root], { stdout: filteredQueryOut, stderr: new MemoryWritable() }), 0);
    assert.match(filteredQueryOut.text(), /Source Capsules: 0/);
    assert.doesNotMatch(filteredQueryOut.text(), /primary=05-wiki\/source-knowledge\/ai-agent-workflow-notes\.md/);

    const fileViewOut = new MemoryWritable();
    assert.equal(await runCli(["query", "AI Agent", "--view", "files", "--path", root], { stdout: fileViewOut, stderr: new MemoryWritable() }), 0);
    assert.match(fileViewOut.text(), /AIWiki 查询: AI Agent/);
    assert.match(fileViewOut.text(), /结果质量: matches=/);
    assert.match(fileViewOut.text(), /Reuse workflows:/);
    assert.match(fileViewOut.text(), /writing:/);
    assert.match(fileViewOut.text(), /decision:/);
    assert.match(fileViewOut.text(), /review:/);
    assert.match(fileViewOut.text(), /reasons=/);
    assert.match(fileViewOut.text(), /quality=/);
    assert.match(fileViewOut.text(), /Wiki 条目/);
    assert.match(fileViewOut.text(), /05-wiki\/source-knowledge\/ai-agent-workflow-notes\.md/);

    const contextOut = new MemoryWritable();
    assert.equal(await runCli(["context", "AI Agent", "--path", root], { stdout: contextOut, stderr: new MemoryWritable() }), 0);
    const parsed = JSON.parse(contextOut.text()) as { schema_version: string };
    assert.equal(parsed.schema_version, "aiwiki.context.v1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI show displays one Source Capsule by query, id, and json", async () => {
  const root = await tempRoot("aiwiki-cli-show");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    await runCli(["ingest-agent", "--payload", fixturePath("agent_payload.analysis.grounded.json"), "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });

    const showOut = new MemoryWritable();
    assert.equal(await runCli(["show", "Grounded", "--path", root], { stdout: showOut, stderr: new MemoryWritable() }), 0);
    assert.match(showOut.text(), /Source Capsule: Grounded Notes/);
    assert.match(showOut.text(), /primary: 05-wiki\/source-knowledge\/grounded-notes\.md/);
    assert.match(showOut.text(), /OKF readiness:/);

    const jsonOut = new MemoryWritable();
    assert.equal(await runCli(["show", "Grounded", "--json", "--path", root], { stdout: jsonOut, stderr: new MemoryWritable() }), 0);
    const parsed = JSON.parse(jsonOut.text()) as { id: string; primary?: { path: string }; artifacts: Array<{ path: string }> };
    assert.match(parsed.id, /^src_/);
    assert.equal(parsed.primary?.path, "05-wiki/source-knowledge/grounded-notes.md");

    const idOut = new MemoryWritable();
    assert.equal(await runCli(["show", "--id", parsed.id, "--path", root], { stdout: idOut, stderr: new MemoryWritable() }), 0);
    assert.match(idOut.text(), new RegExp(`id: ${parsed.id}`));

    const artifactOut = new MemoryWritable();
    assert.equal(await runCli(["show", "--artifact-path", "05-wiki/source-knowledge/grounded-notes.md", "--path", root], { stdout: artifactOut, stderr: new MemoryWritable() }), 0);
    assert.match(artifactOut.text(), /Source Capsule: Grounded Notes/);

    const legacyPathOut = new MemoryWritable();
    assert.equal(await runCli(["show", "--path", "05-wiki/source-knowledge/grounded-notes.md", "--workspace", root], { stdout: legacyPathOut, stderr: new MemoryWritable() }), 0);
    assert.match(legacyPathOut.text(), /Source Capsule: Grounded Notes/);
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
    assert.match(freshOut.text(), /aiwiki agent sync --yes/);

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
    assert.match(out.text(), /aiwiki agent sync --agent qclaw --yes/);
    const jsonOut = new MemoryWritable();
    assert.equal(await runCli(["agent", "check", "--json"], { stdout: jsonOut, stderr: new MemoryWritable() }), 0);
    const parsed = JSON.parse(jsonOut.text()) as { schema_version: string; targets: Array<{ id: string; state: string; installed: boolean }> };
    assert.equal(parsed.schema_version, "aiwiki.agent_check.v1");
    assert.equal(parsed.targets.find((target) => target.id === "codex")?.state, "current");
    assert.equal(parsed.targets.find((target) => target.id === "qclaw")?.state, "missing");
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

test("CLI lint supports capsule lifecycle OKF and strict modes", async () => {
  const root = await tempRoot("aiwiki-cli-lint-capsule-modes");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const orphanPath = path.join(root, "03-sources", "article-cards", "orphan-capsule.md");
    await writeFile(orphanPath, `---
title: "Orphan Capsule"
type: "source_card"
status: "to-review"
capsule_id: "src_orphan"
artifact_role: "source_card"
visibility: "supporting"
created_at: "2026-06-30T00:00:00.000Z"
knowledge_status: "active"
confidence_level: "medium"
valid_until: "2000-01-01T00:00:00.000Z"
staleness: "fresh"
evidence_count: 0
---

# Orphan Capsule

Source card without a matching Wiki Entry.
`, "utf8");

    const capsuleOut = new MemoryWritable();
    assert.equal(await runCli(["lint", "--capsules", "--json", "--path", root], { stdout: capsuleOut, stderr: new MemoryWritable() }), 0);
    const capsuleReport = JSON.parse(capsuleOut.text()) as { issues: Array<{ severity: string; category?: string }> };
    assert.equal(capsuleReport.issues.some((issue) => issue.category === "capsule_missing_primary" && issue.severity === "warning"), true);

    const lifecycleOut = new MemoryWritable();
    assert.equal(await runCli(["lint", "--lifecycle", "--json", "--path", root], { stdout: lifecycleOut, stderr: new MemoryWritable() }), 0);
    const lifecycleReport = JSON.parse(lifecycleOut.text()) as { issues: Array<{ category?: string; message?: string }> };
    assert.equal(lifecycleReport.issues.some((issue) => issue.category === "lifecycle" && /active_but_valid_until_expired/.test(issue.message ?? "")), true);

    const okfOut = new MemoryWritable();
    assert.equal(await runCli(["lint", "--okf", "--json", "--path", root], { stdout: okfOut, stderr: new MemoryWritable() }), 0);
    const okfReport = JSON.parse(okfOut.text()) as { issues: Array<{ category?: string; message?: string }> };
    assert.equal(okfReport.issues.some((issue) => issue.category === "okf_readiness" && /okf_missing/.test(issue.message ?? "")), true);

    const strictOut = new MemoryWritable();
    assert.equal(await runCli(["lint", "--strict", "--json", "--path", root], { stdout: strictOut, stderr: new MemoryWritable() }), 0);
    const strictReport = JSON.parse(strictOut.text()) as { issues: Array<{ severity: string; category?: string }> };
    assert.equal(strictReport.issues.some((issue) => issue.category === "capsule_missing_primary" && issue.severity === "error"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI lint fix-empty-dirs removes only known empty optional directories", async () => {
  const root = await tempRoot("aiwiki-cli-lint-empty-dirs");
  try {
    await runCli(["init", "--path", root, "--yes"], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    await mkdir(path.join(root, "04-claims", "_suggestions"), { recursive: true });
    await mkdir(path.join(root, "06-assets", "_suggestions"), { recursive: true });
    await mkdir(path.join(root, "07-topics", "ready"), { recursive: true });
    await mkdir(path.join(root, "08-outputs", "outlines"), { recursive: true });
    await mkdir(path.join(root, "08-outputs", "custom"), { recursive: true });
    await writeFile(path.join(root, "08-outputs", "custom", "keep.md"), "keep", "utf8");

    const beforeOut = new MemoryWritable();
    assert.equal(await runCli(["lint", "--json", "--path", root], { stdout: beforeOut, stderr: new MemoryWritable() }), 0);
    const before = JSON.parse(beforeOut.text()) as { safe_fixes: { available: number; only_safe_fixes: boolean }; issues: Array<{ category?: string; safe_fix?: { action: string; path: string } }> };
    assert.equal(before.issues.some((issue) => issue.category === "empty_optional_directory"), true);
    assert.equal(before.safe_fixes.available >= 4, true);
    assert.equal(before.safe_fixes.only_safe_fixes, true);

    const fixOut = new MemoryWritable();
    assert.equal(await runCli(["lint", "--fix-empty-dirs", "--json", "--path", root], { stdout: fixOut, stderr: new MemoryWritable() }), 0);
    const fixed = JSON.parse(fixOut.text()) as { safe_fixes: { available: number; applied: Array<{ path: string }> } };
    assert.equal(fixed.safe_fixes.available, 0);
    assert.ok(fixed.safe_fixes.applied.some((item) => item.path === "04-claims/_suggestions"));
    await assert.rejects(access(path.join(root, "04-claims", "_suggestions")));
    await assert.rejects(access(path.join(root, "06-assets", "_suggestions")));
    await assert.rejects(access(path.join(root, "07-topics", "ready")));
    await assert.rejects(access(path.join(root, "04-claims")));
    await access(path.join(root, "08-outputs", "custom", "keep.md"));
    await access(path.join(root, "02-raw", "articles"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checked-in examples reflect core-first artifact contract", async () => {
  const sampleRoot = path.join(process.cwd(), "examples", "obsidian-vault-sample");
  const demoRoot = path.join(process.cwd(), "examples", "demo-run");

  await access(path.join(demoRoot, "README.md"));
  assert.match(await readFile(path.join(demoRoot, "ingest-file-output.txt"), "utf8"), /wiki_entry_quality: scaffold/);
  assert.match(await readFile(path.join(demoRoot, "ingest-agent-output.txt"), "utf8"), /wiki_entry_quality: enriched/);

  await access(path.join(sampleRoot, "02-raw", "articles", "local-article.md"));
  await access(path.join(sampleRoot, "03-sources", "article-cards", "local-article.md"));
  await access(path.join(sampleRoot, "05-wiki", "source-knowledge", "local-article.md"));
  await assert.rejects(access(path.join(sampleRoot, "04-claims", "_suggestions", "local-article-claims.md")));

  await access(path.join(sampleRoot, "04-claims", "_suggestions", "llm-wiki-notes-claims.md"));
  await access(path.join(sampleRoot, "06-assets", "_suggestions", "llm-wiki-notes-assets.md"));
  await access(path.join(sampleRoot, "07-topics", "ready", "llm-wiki-notes-topics.md"));
  await access(path.join(sampleRoot, "08-outputs", "outlines", "llm-wiki-notes-outline.md"));
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
    assert.match(out.text(), /capsule_count: 0/);
    assert.match(out.text(), /capsule_with_primary_count: 0/);
    assert.match(out.text(), /entropy_risk: low/);
    assert.match(out.text(), /lifecycle_risk: low/);
    assert.match(out.text(), /okf_ready_count: 0/);
    assert.match(out.text(), /lint_status: missing/);
    assert.match(out.text(), /system_files: _system\/purpose\.md=ok/);
    assert.match(out.text(), /next_action: aiwiki agent sync --yes/);

    await runCli(["ingest-agent", "--payload", fixturePath("agent_payload.analysis.grounded.json"), "--path", root], { stdout: new MemoryWritable(), stderr: new MemoryWritable() });
    const afterIngest = new MemoryWritable();
    assert.equal(await runCli(["status", "--path", root], { stdout: afterIngest, stderr: new MemoryWritable() }), 0);
    assert.match(afterIngest.text(), /capsule_count: 1/);
    assert.match(afterIngest.text(), /capsule_with_primary_count: 1/);
    assert.match(afterIngest.text(), /okf_ready_count: 1/);
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
