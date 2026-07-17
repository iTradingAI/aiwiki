import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("packed CLI preserves Core command and schema compatibility", () => {
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

    const context = JSON.parse(runInstalledCli(consumerRoot, ["context", "contract", "--path", vaultPath])) as { schema_version: string };
    const capsule = JSON.parse(runInstalledCli(consumerRoot, ["context", "contract", "--view", "capsule", "--path", vaultPath])) as { schema_version: string };
    const plugins = JSON.parse(runInstalledCli(consumerRoot, ["plugin", "list", "--json", "--path", vaultPath])) as { extensions: Array<{ id: string; source: string; status: string }> };
    const help = runInstalledCli(consumerRoot, ["--help"]);
    const unknown = runInstalledCliResult(consumerRoot, ["not-a-command", "--path", vaultPath]);

    assert.equal(context.schema_version, "aiwiki.context.v1");
    assert.equal(capsule.schema_version, "aiwiki.context.capsule.v1");
    assert.deepEqual(
      plugins.extensions.find((extension) => extension.id === "aiwiki.bundled-example"),
      { id: "aiwiki.bundled-example", name: "AIWiki bundled example", version: "0.1.0", source: "bundled", status: "available" }
    );
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /未知命令: not-a-command/);
    for (const command of ["aiwiki setup", "aiwiki context <query>", "aiwiki plugin list --json", "aiwiki plugin add <directory>", "aiwiki plugin enable <id>"]) {
      assert.match(help, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    for (const unsupported of ["aiwiki pro", "aiwiki plugin disable", "aiwiki plugin remove", "aiwiki plugin doctor"]) {
      assert.doesNotMatch(help, new RegExp(unsupported.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  } finally {
    rmSync(consumerRoot, { recursive: true, force: true });
  }
});
