import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

function run(command: string, args: string[], cwd: string, options: { shell?: boolean } = {}): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: options.shell ?? false,
    env: { ...process.env, npm_config_fund: "false", npm_config_audit: "false" }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout;
}

function runNpm(args: string[], cwd: string): string {
  if (existsSync(npmExecPath)) return run(process.execPath, [npmExecPath, ...args], cwd);
  return run(npmCommand, args, cwd, { shell: false });
}

test("packed CLI preserves Core command and schema compatibility", () => {
  const repositoryRoot = process.cwd();
  const consumerRoot = mkdtempSync(path.join(os.tmpdir(), "aiwiki-cli-contract-"));
  const vaultRoot = path.join(consumerRoot, "vault");
  try {
    const packageVersion = (JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8")) as { version: string }).version;
    writeFileSync(path.join(consumerRoot, "package.json"), JSON.stringify({ private: true }, null, 2), "utf8");
    const packed = JSON.parse(runNpm(["pack", repositoryRoot, "--json", "--ignore-scripts"], consumerRoot)) as Array<{ filename?: string }>;
    const tarballName = packed[0]?.filename;
    assert.ok(tarballName, "npm pack did not report a tarball filename");
    runNpm(["install", "--ignore-scripts", "--no-package-lock", tarballName], consumerRoot);

    const cliPath = path.join(consumerRoot, "node_modules", "@itradingai", "aiwiki", "dist", "src", "cli.js");
    assert.equal(run(process.execPath, [cliPath, "--version"], consumerRoot).trim(), `aiwiki ${packageVersion}`);
    run(process.execPath, [cliPath, "init", "--path", vaultRoot, "--yes"], consumerRoot);

    const context = JSON.parse(run(process.execPath, [cliPath, "context", "contract", "--path", vaultRoot], consumerRoot)) as { schema_version: string };
    const capsule = JSON.parse(run(process.execPath, [cliPath, "context", "contract", "--view", "capsule", "--path", vaultRoot], consumerRoot)) as { schema_version: string };
    const plugins = JSON.parse(run(process.execPath, [cliPath, "plugin", "list", "--json", "--path", vaultRoot], consumerRoot)) as { extensions: unknown[] };
    const help = run(process.execPath, [cliPath, "--help"], consumerRoot);

    assert.equal(context.schema_version, "aiwiki.context.v1");
    assert.equal(capsule.schema_version, "aiwiki.context.capsule.v1");
    assert.ok(Array.isArray(plugins.extensions));
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
