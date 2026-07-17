import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

type RunResult = Readonly<{ status: number | null; stdout: string; stderr: string }>;
type BundleStatus = { complete: boolean; files: Array<{ path: string; state: string }> };
type AgentSyncReport = { results: Array<{ id: string; state: string; action: string; bundle?: BundleStatus }> };

function runResult(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): RunResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...env, npm_config_fund: "false", npm_config_audit: "false" }
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  const result = runResult(command, args, cwd, env);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout;
}

function runNpm(args: string[], cwd: string): string {
  if (existsSync(npmExecPath)) return run(process.execPath, [npmExecPath, ...args], cwd);
  return run(npmCommand, args, cwd);
}

function installedCliPath(consumerRoot: string): string {
  return path.join(consumerRoot, "node_modules", ".bin", process.platform === "win32" ? "aiwiki.cmd" : "aiwiki");
}

function runInstalledCli(consumerRoot: string, args: string[], env: NodeJS.ProcessEnv): string {
  if (process.platform !== "win32") return run(installedCliPath(consumerRoot), args, consumerRoot, env);
  return run(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", ["node_modules\\.bin\\aiwiki.cmd", ...args].join(" ")], consumerRoot, env);
}

function regularFiles(root: string, relative = ""): string[] {
  return readdirSync(path.join(root, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const next = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) return regularFiles(root, next);
      return entry.isFile() ? [next.split(path.sep).join("/")] : [];
    })
    .sort();
}

function fileContents(root: string, files: string[]): Map<string, string> {
  return new Map(files.map((file) => [file, readFileSync(path.join(root, ...file.split("/")), "utf8")]));
}

test("packed Skill bundle installs every protocol and locks explicit extension intent", () => {
  const repositoryRoot = process.cwd();
  const consumerRoot = mkdtempSync(path.join(os.tmpdir(), "aiwiki-skill-contract-"));
  const codexHome = path.join(consumerRoot, "codex-home");
  const vaultRoot = path.join(consumerRoot, "vault");
  try {
    writeFileSync(path.join(consumerRoot, "package.json"), JSON.stringify({ private: true }, null, 2), "utf8");
    const packed = JSON.parse(runNpm(["pack", repositoryRoot, "--json", "--ignore-scripts"], consumerRoot)) as Array<{ filename?: string }>;
    const tarballName = packed[0]?.filename;
    assert.ok(tarballName, "npm pack did not report a tarball filename");
    runNpm(["install", "--ignore-scripts", "--no-package-lock", tarballName], consumerRoot);

    const packageRoot = path.join(consumerRoot, "node_modules", "@itradingai", "aiwiki");
    const packagedSkillRoot = path.join(packageRoot, "skill");
    const bundleFiles = regularFiles(packagedSkillRoot);
    assert.ok(bundleFiles.includes("SKILL.md"));
    assert.ok(bundleFiles.includes("QUERY_PROTOCOL.md"));
    assert.ok(bundleFiles.includes("LINT_PROTOCOL.md"));
    assert.ok(bundleFiles.includes("UPGRADE_NOTES.md"));
    assert.ok(bundleFiles.includes("EXTENSION_PROTOCOL.md"));

    const env = { ...process.env, CODEX_HOME: codexHome };
    const sync = JSON.parse(runInstalledCli(consumerRoot, ["agent", "sync", "--agent", "codex", "--yes", "--json"], env)) as AgentSyncReport;
    const codex = sync.results.find((result) => result.id === "codex");
    assert.equal(codex?.action, "installed");
    assert.equal(codex?.bundle?.complete, true);
    assert.deepEqual(codex?.bundle?.files.map((file) => file.path), bundleFiles);

    const installedSkillRoot = path.join(codexHome, "skills", "aiwiki");
    assert.deepEqual(regularFiles(installedSkillRoot), bundleFiles);
    assert.deepEqual(fileContents(installedSkillRoot, bundleFiles), fileContents(packagedSkillRoot, bundleFiles));

    runInstalledCli(consumerRoot, ["setup", "--path", vaultRoot, "--yes"], env);
    const workspaceCheck = JSON.parse(runInstalledCli(consumerRoot, ["agent", "check", "--agent", "workspace", "--path", vaultRoot, "--json"], env)) as { targets: Array<{ id: string; state: string }> };
    assert.equal(workspaceCheck.targets.find((target) => target.id === "workspace")?.state, "current");

    const prompt = runInstalledCli(consumerRoot, ["prompt", "agent"], env);
    const handoff = readFileSync(path.join(packageRoot, "docs", "AGENT_HANDOFF.md"), "utf8");
    const skill = readFileSync(path.join(packagedSkillRoot, "SKILL.md"), "utf8");
    const extensionProtocol = readFileSync(path.join(packagedSkillRoot, "EXTENSION_PROTOCOL.md"), "utf8");
    for (const [text, requiredCommands] of [
      [prompt, ["aiwiki setup", "aiwiki doctor", "aiwiki status", "aiwiki ingest-agent", "aiwiki context", "aiwiki show", "aiwiki lint", "aiwiki agent check", "aiwiki agent sync"]],
      [handoff, ["aiwiki setup", "aiwiki doctor", "aiwiki status", "aiwiki ingest-file", "aiwiki ingest-agent", "aiwiki context", "aiwiki show", "aiwiki lint", "aiwiki agent check", "aiwiki agent sync"]],
      [skill, ["aiwiki setup", "aiwiki doctor", "aiwiki status", "aiwiki ingest-file", "aiwiki ingest-agent", "aiwiki context", "aiwiki show", "aiwiki lint", "aiwiki agent check", "aiwiki agent sync"]]
    ] as const) {
      for (const command of requiredCommands) {
        assert.ok(text.includes(command), `missing ${command}`);
      }
    }
    for (const text of [prompt, handoff, skill, extensionProtocol]) {
      assert.match(text, /aiwiki plugin list/);
      assert.match(text, /aiwiki plugin add <directory>/);
      assert.match(text, /aiwiki plugin enable <id>/);
    }
    assert.match(extensionProtocol, /do not automatically discover, enable, or execute/i);
    assert.match(prompt, /不要自动发现、启用或执行/);
    assert.match(extensionProtocol, /does not add Pro behavior/i);
    assert.match(extensionProtocol, /entitlement checks, license checks, scheduling/i);
  } finally {
    rmSync(consumerRoot, { recursive: true, force: true });
  }
});
