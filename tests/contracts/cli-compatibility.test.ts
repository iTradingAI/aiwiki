import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

type RunOptions = Readonly<{ shell?: boolean; env?: NodeJS.ProcessEnv }>;
type RunResult = Readonly<{ status: number | null; stdout: string; stderr: string }>;

function runResult(command: string, args: string[], cwd: string, options: RunOptions = {}): RunResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: options.shell ?? false,
    env: { ...process.env, npm_config_fund: "false", npm_config_audit: "false", ...options.env }
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function run(command: string, args: string[], cwd: string, options: RunOptions = {}): string {
  const result = runResult(command, args, cwd, options);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout;
}

function runNpm(args: string[], cwd: string): string {
  if (existsSync(npmExecPath)) return run(process.execPath, [npmExecPath, ...args], cwd);
  return run(npmCommand, args, cwd, { shell: false });
}

function installedCliPath(consumerRoot: string): string {
  const binRoot = path.join(consumerRoot, "node_modules", ".bin");
  return path.join(binRoot, process.platform === "win32" ? "aiwiki.cmd" : "aiwiki");
}

function runInstalledCli(consumerRoot: string, args: string[], options: RunOptions = {}): string {
  if (process.platform !== "win32") return run(installedCliPath(consumerRoot), args, consumerRoot, options);
  return run(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", ["node_modules\\.bin\\aiwiki.cmd", ...args].join(" ")], consumerRoot, options);
}

function runInstalledCliResult(consumerRoot: string, args: string[], options: RunOptions = {}): RunResult {
  if (process.platform !== "win32") return runResult(installedCliPath(consumerRoot), args, consumerRoot, options);
  return runResult(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", ["node_modules\\.bin\\aiwiki.cmd", ...args].join(" ")], consumerRoot, options);
}

function fileSnapshot(root: string): string[] {
  const visit = (directory: string): string[] => {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return visit(absolute);
      if (entry.isFile()) return [path.relative(root, absolute).replace(/\\/g, "/")];
      return [];
    });
  };
  return visit(root).sort();
}

test("packed CLI preserves Core command and Context view compatibility", () => {
  const repositoryRoot = process.cwd();
  const consumerRoot = mkdtempSync(path.join(os.tmpdir(), "aiwiki-cli-contract-"));
  const vaultPath = "vault";
  const isolatedHome = path.join(consumerRoot, "isolated-home");
  const isolatedCliOptions: RunOptions = {
    env: {
      AIWIKI_HOME: isolatedHome,
      HOME: isolatedHome,
      USERPROFILE: isolatedHome,
      CODEX_HOME: path.join(isolatedHome, "codex")
    }
  };
  try {
    const packageVersion = (JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8")) as { version: string }).version;
    writeFileSync(path.join(consumerRoot, "package.json"), JSON.stringify({ private: true }, null, 2), "utf8");
    const packed = JSON.parse(runNpm(["pack", repositoryRoot, "--json", "--ignore-scripts"], consumerRoot)) as Array<{ filename?: string }>;
    const tarballName = packed[0]?.filename;
    assert.ok(tarballName, "npm pack did not report a tarball filename");
    runNpm(["install", "--ignore-scripts", "--no-package-lock", tarballName], consumerRoot);

    const cliPath = installedCliPath(consumerRoot);
    assert.equal(existsSync(cliPath), true, "installed package did not create the aiwiki bin");
    assert.equal(runInstalledCli(consumerRoot, ["--version"]).trim(), `aiwiki ${packageVersion}`);
    const initOutput = runInstalledCli(consumerRoot, ["init", "--path", vaultPath, "--yes", "--set-default"], isolatedCliOptions);

    const vaultRoot = path.join(consumerRoot, vaultPath);
    assert.match(initOutput, /AIWiki 已初始化:/);
    const defaultConfig = JSON.parse(readFileSync(path.join(isolatedHome, "config.json"), "utf8")) as { defaultPath: string };
    assert.equal(defaultConfig.defaultPath, path.resolve(consumerRoot, vaultPath));
    const initPathFile = path.join(consumerRoot, "not-a-directory");
    writeFileSync(initPathFile, "not a workspace directory\n", "utf8");
    const initBlockedPath = runInstalledCliResult(consumerRoot, ["init", "--path", initPathFile, "--yes"], isolatedCliOptions);
    assert.notEqual(initBlockedPath.status, 0);
    assert.match(initBlockedPath.stderr, /EEXIST/);
    const beforeDiagnostics = fileSnapshot(vaultRoot);
    const diagnosticReadiness: unknown[] = [];
    for (const [command, schema] of [
      ["doctor", "aiwiki.doctor.v1"],
      ["status", "aiwiki.status.v1"],
      ["next", "aiwiki.next.v1"]
    ] as const) {
      const result = JSON.parse(runInstalledCli(consumerRoot, [command, "--json", "--path", vaultPath])) as {
        schema_version: string;
        would_write: boolean;
        readiness: { state: string; actions: unknown[] };
      };
      assert.equal(result.schema_version, schema);
      assert.equal(result.would_write, false);
      assert.equal(result.readiness.state, "first_ingest_required");
      diagnosticReadiness.push(result.readiness);
    }
    assert.deepEqual(diagnosticReadiness[0], diagnosticReadiness[1]);
    assert.deepEqual(diagnosticReadiness[1], diagnosticReadiness[2]);
    assert.deepEqual(fileSnapshot(vaultRoot), beforeDiagnostics);
    assert.equal(existsSync(path.join(vaultRoot, "_system", "logs", ".doctor-write-test")), false);
    const nextText = runInstalledCli(consumerRoot, ["next", "--path", vaultPath]);
    assert.match(nextText, /No ingest records yet/);
    const nextMissingWorkspace = runInstalledCliResult(consumerRoot, ["next", "--path", "missing-workspace"], isolatedCliOptions);
    assert.equal(nextMissingWorkspace.status, 1);
    assert.match(nextMissingWorkspace.stderr, /未找到配置文件/);
    const graphPath = path.join(vaultRoot, ".aiwiki", "state", "graph.json");
    mkdirSync(path.join(vaultRoot, "02-raw", "articles"), { recursive: true });
    mkdirSync(path.join(vaultRoot, "05-wiki", "source-knowledge"), { recursive: true });
    writeFileSync(path.join(vaultRoot, "02-raw", "articles", "source.md"), [
      "---",
      'type: "raw_article"',
      'title: "Source Evidence"',
      'capsule_id: "source-evidence"',
      "---",
      "",
      "Source evidence"
    ].join("\n"), "utf8");
    writeFileSync(path.join(vaultRoot, "05-wiki", "source-knowledge", "graph-contract.md"), [
      "---",
      'type: "wiki_entry"',
      'title: "Graph Contract"',
      'capsule_id: "contract-graph"',
      "relationships:",
      '  - type: "derives_from"',
      '    target: "02-raw/articles/source.md"',
      "---",
      "",
      "Graph contract entry"
    ].join("\n"), "utf8");

    const health = JSON.parse(runInstalledCli(consumerRoot, ["health", "--json", "--path", vaultPath])) as {
      schema_version: string;
      summary: { by_domain: Record<string, number> };
      derived_state: { index: string; graph: string };
    };
    const repair = JSON.parse(runInstalledCli(consumerRoot, ["repair", "--plan", "--json", "--path", vaultPath])) as {
      schema_version: string;
      dry_run: boolean;
      would_write: boolean;
      items: Array<{ evidence: string[]; suggested_changes: string[]; risk: string; affected_files: string[]; suggested_command: string }>;
    };
    const repairApply = runInstalledCliResult(consumerRoot, ["repair", "--apply", "--path", vaultPath]);
    assert.equal(health.schema_version, "aiwiki.health.v1");
    assert.ok(Object.keys(health.summary.by_domain).includes("relationship"));
    assert.equal(health.derived_state.index, "missing");
    assert.equal(health.derived_state.graph, "missing");
    assert.equal(repair.schema_version, "aiwiki.repair_plan.v1");
    assert.equal(repair.dry_run, true);
    assert.equal(repair.would_write, false);
    assert.ok(repair.items.every((item) => item.evidence.length > 0 && item.suggested_changes.length > 0 && item.risk && item.affected_files.length > 0 && item.suggested_command.startsWith("aiwiki ")));
    assert.equal(repairApply.status, 1);
    assert.match(repairApply.stderr, /repair --plan is the only Core repair mode/);
    assert.equal(existsSync(path.join(vaultRoot, ".aiwiki", "state")), false);
    assert.equal(existsSync(path.join(vaultRoot, "dashboards", "Knowledge Health.md")), false);

    const writtenHealth = JSON.parse(runInstalledCli(consumerRoot, ["health", "--write", "--json", "--path", vaultPath])) as {
      schema_version: string;
      dashboard_path: string;
      run_path: string;
      health: { schema_version: string };
    };
    assert.equal(writtenHealth.schema_version, "aiwiki.health_report.v1");
    assert.equal(writtenHealth.health.schema_version, "aiwiki.health.v1");
    assert.equal(existsSync(path.join(vaultRoot, writtenHealth.dashboard_path)), true);
    assert.equal(existsSync(path.join(vaultRoot, writtenHealth.run_path)), true);

    const graphMissing = JSON.parse(runInstalledCli(consumerRoot, ["context", "Graph Contract", "--view", "graph", "--path", vaultPath])) as { schema_version: string; graph: { state: string }; relationships: unknown[]; recommended_next_action: string };
    assert.equal(graphMissing.schema_version, "aiwiki.context.v2");
    assert.equal(graphMissing.graph.state, "missing");
    assert.deepEqual(graphMissing.relationships, []);
    assert.equal(graphMissing.recommended_next_action, "inspect_or_build_graph_explicitly");
    assert.equal(existsSync(graphPath), false);

    const graphBuild = JSON.parse(runInstalledCli(consumerRoot, ["graph", "build", "--json", "--path", vaultPath])) as { action: string };
    assert.equal(graphBuild.action, "built");
    const graphContext = JSON.parse(runInstalledCli(consumerRoot, ["context", "Graph Contract", "--view", "graph", "--graph-depth", "1", "--path", vaultPath])) as {
      schema_version: string;
      graph: { state: string };
      relationships: Array<{ target: { path?: string }; relationship_path: Array<{ type: string; traversal: string }> }>;
    };
    assert.equal(graphContext.schema_version, "aiwiki.context.v2");
    assert.equal(graphContext.graph.state, "fresh");
    assert.ok(graphContext.relationships.some((item) => item.target.path === "02-raw/articles/source.md"
      && item.relationship_path[0]?.type === "derives_from"
      && item.relationship_path[0]?.traversal === "outbound"));

    const freshGraph = readFileSync(graphPath, "utf8");
    mkdirSync(path.join(vaultRoot, "07-topics", "ready"), { recursive: true });
    writeFileSync(path.join(vaultRoot, "07-topics", "ready", "stale.md"), "# Stale graph\n", "utf8");
    const graphStale = JSON.parse(runInstalledCli(consumerRoot, ["context", "Graph Contract", "--view", "graph", "--path", vaultPath])) as { graph: { state: string }; relationships: unknown[] };
    assert.equal(graphStale.graph.state, "stale");
    assert.deepEqual(graphStale.relationships, []);
    assert.equal(readFileSync(graphPath, "utf8"), freshGraph);

    writeFileSync(graphPath, "not json\n", "utf8");
    const graphInvalid = JSON.parse(runInstalledCli(consumerRoot, ["context", "Graph Contract", "--view", "graph", "--path", vaultPath])) as { graph: { state: string }; relationships: unknown[] };
    assert.equal(graphInvalid.graph.state, "invalid");
    assert.deepEqual(graphInvalid.relationships, []);
    assert.equal(readFileSync(graphPath, "utf8"), "not json\n");
    const invalidGraphDepth = runInstalledCliResult(consumerRoot, ["context", "Graph Contract", "--graph-depth", "1", "--path", vaultPath]);
    assert.equal(invalidGraphDepth.status, 1);
    assert.match(invalidGraphDepth.stderr, /graph-depth requires context --view graph/);

    const context = JSON.parse(runInstalledCli(consumerRoot, ["context", "contract", "--path", vaultPath])) as { schema_version: string };
    const capsule = JSON.parse(runInstalledCli(consumerRoot, ["context", "contract", "--view", "capsule", "--path", vaultPath])) as { schema_version: string };
    const plugins = JSON.parse(runInstalledCli(consumerRoot, ["plugin", "list", "--json", "--path", vaultPath])) as { extensions: Array<{ id: string; source: string; status: string }> };
    const help = runInstalledCli(consumerRoot, ["--help"]);
    const rebuildHelp = runInstalledCli(consumerRoot, ["rebuild", "--help"]);
    const indexHelp = runInstalledCli(consumerRoot, ["index", "--help"]);
    const indexBuild = JSON.parse(runInstalledCli(consumerRoot, ["index", "build", "--json", "--path", vaultPath])) as { schema_version: string; action: string };
    const indexStatus = JSON.parse(runInstalledCli(consumerRoot, ["index", "status", "--json", "--path", vaultPath])) as { schema_version: string; state: string };
    const unknown = runInstalledCliResult(consumerRoot, ["not-a-command", "--path", vaultPath]);
    const packageRoot = path.join(consumerRoot, "node_modules", "@itradingai", "aiwiki");

    assert.equal(context.schema_version, "aiwiki.context.v1");
    assert.equal(capsule.schema_version, "aiwiki.context.capsule.v1");
    assert.deepEqual(
      plugins.extensions.find((extension) => extension.id === "aiwiki.bundled-example"),
      { id: "aiwiki.bundled-example", name: "AIWiki bundled example", version: "0.1.0", source: "bundled", status: "available" }
    );
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /未知命令: not-a-command/);
    assert.equal(indexBuild.schema_version, "aiwiki.index_command.v1");
    assert.equal(indexBuild.action, "built");
    assert.equal(indexStatus.schema_version, "aiwiki.index_status.v1");
    assert.equal(indexStatus.state, "fresh");
    for (const command of [
      "aiwiki setup",
      "aiwiki doctor --json",
      "aiwiki status --json",
      "aiwiki next --json",
      "aiwiki context <query>",
      "aiwiki context <query> --view graph --graph-depth 1",
      "aiwiki lint --maintenance --json",
      "aiwiki health --json",
      "aiwiki health --write --json",
      "aiwiki repair --plan --json",
      "aiwiki index build --path <workspace> --json",
      "aiwiki index status --path <workspace> --json",
      "aiwiki index rebuild --path <workspace> --json",
      "aiwiki plugin list --json",
      "aiwiki plugin inspect <id>",
      "aiwiki plugin add <directory>",
      "aiwiki plugin enable <id>",
      "aiwiki plugin disable <id>",
      "aiwiki plugin remove <id>",
      "aiwiki plugin doctor"
    ]) {
      assert.match(help, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(rebuildHelp, /AIWiki rebuild/);
    assert.match(rebuildHelp, /aiwiki rebuild --check --json/);
    assert.match(rebuildHelp, /aiwiki rebuild --dry-run --json/);
    assert.match(indexHelp, /AIWiki index/);
    assert.match(indexHelp, /aiwiki index build --path <workspace> --json/);
    assert.match(indexHelp, /aiwiki index status --path <workspace> --json/);
    assert.match(indexHelp, /aiwiki index rebuild --path <workspace> --json/);
    assert.equal(existsSync(path.join(packageRoot, "docs", "schema", "STATE.md")), true);
    assert.equal(existsSync(path.join(packageRoot, "docs", "schema", "STATE.zh-CN.md")), true);
    for (const unsupported of ["aiwiki pro"]) {
      assert.doesNotMatch(help, new RegExp(unsupported.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    const codexTarget = path.join(isolatedHome, "codex", "skills", "aiwiki", "SKILL.md");
    mkdirSync(path.dirname(codexTarget), { recursive: true });
    writeFileSync(codexTarget, "legacy skill\n", "utf8");
    const agentInstallWithoutForce = runInstalledCliResult(consumerRoot, ["agent", "install", "--agent", "codex", "--yes"], isolatedCliOptions);
    assert.equal(agentInstallWithoutForce.status, 1);
    assert.match(agentInstallWithoutForce.stderr, /目标文件已存在/);
    const agentInstallWithForce = runInstalledCli(consumerRoot, ["agent", "install", "--agent", "codex", "--yes", "--force"], isolatedCliOptions);
    assert.match(agentInstallWithForce, /已安装: Codex/);
    assert.match(readFileSync(codexTarget, "utf8"), /name: aiwiki/);

    const contentFile = path.join(consumerRoot, "offline-source.md");
    const sourceContent = "# Offline source\n\nLocal content must be ingested without fetching.\n";
    const offlineUrl = "http://127.0.0.1:9/never-fetched";
    writeFileSync(contentFile, sourceContent, "utf8");
    const ingestUrl = runInstalledCli(consumerRoot, ["ingest-url", offlineUrl, "--content-file", contentFile, "--path", vaultPath]);
    assert.match(ingestUrl, /fetch_status: ok/);
    assert.match(ingestUrl, new RegExp(`source_url: ${offlineUrl}`));
    const runId = /run_id: (.+)/.exec(ingestUrl)?.[1]?.trim();
    assert.ok(runId);
    const ingestPayload = JSON.parse(readFileSync(path.join(vaultRoot, "09-runs", runId, "payload.json"), "utf8")) as {
      source: { url: string; content: string; fetcher: string; fetch_status: string };
    };
    assert.equal(ingestPayload.source.url, offlineUrl);
    assert.equal(ingestPayload.source.content, sourceContent);
    assert.equal(ingestPayload.source.fetcher, "content-file");
    assert.equal(ingestPayload.source.fetch_status, "ok");
    const ingestUrlWithoutContent = runInstalledCliResult(consumerRoot, ["ingest-url", offlineUrl, "--path", vaultPath]);
    assert.equal(ingestUrlWithoutContent.status, 1);
    assert.match(ingestUrlWithoutContent.stderr, /不抓取网页。请提供 --content-file/);
    const ingestUrlWithoutUrl = runInstalledCliResult(consumerRoot, ["ingest-url", "--content-file", contentFile, "--path", vaultPath]);
    assert.equal(ingestUrlWithoutUrl.status, 1);
    assert.match(ingestUrlWithoutUrl.stderr, /请提供 URL/);
  } finally {
    rmSync(consumerRoot, { recursive: true, force: true });
  }
});
