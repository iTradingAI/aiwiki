import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

type RunOptions = Readonly<{ shell?: boolean }>;
type RunResult = Readonly<{ status: number | null; stdout: string; stderr: string }>;

function runResult(command: string, args: string[], cwd: string, options: RunOptions = {}): RunResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: options.shell ?? false,
    env: { ...process.env, npm_config_fund: "false", npm_config_audit: "false" }
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

function runInstalledCli(consumerRoot: string, args: string[]): string {
  if (process.platform !== "win32") return run(installedCliPath(consumerRoot), args, consumerRoot);
  return run(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", ["node_modules\\.bin\\aiwiki.cmd", ...args].join(" ")], consumerRoot);
}

function runInstalledCliResult(consumerRoot: string, args: string[]): RunResult {
  if (process.platform !== "win32") return runResult(installedCliPath(consumerRoot), args, consumerRoot);
  return runResult(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", ["node_modules\\.bin\\aiwiki.cmd", ...args].join(" ")], consumerRoot);
}

test("packed CLI preserves Core command and Context view compatibility", () => {
  const repositoryRoot = process.cwd();
  const consumerRoot = mkdtempSync(path.join(os.tmpdir(), "aiwiki-cli-contract-"));
  const vaultPath = "vault";
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
    runInstalledCli(consumerRoot, ["init", "--path", vaultPath, "--yes"]);

    const vaultRoot = path.join(consumerRoot, vaultPath);
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
      "aiwiki context <query>",
      "aiwiki context <query> --view graph --graph-depth 1",
      "aiwiki index build --path <workspace> --json",
      "aiwiki index status --path <workspace> --json",
      "aiwiki index rebuild --path <workspace> --json",
      "aiwiki plugin list --json",
      "aiwiki plugin add <directory>",
      "aiwiki plugin enable <id>"
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
    for (const unsupported of ["aiwiki pro", "aiwiki plugin disable", "aiwiki plugin remove", "aiwiki plugin doctor"]) {
      assert.doesNotMatch(help, new RegExp(unsupported.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  } finally {
    rmSync(consumerRoot, { recursive: true, force: true });
  }
});
