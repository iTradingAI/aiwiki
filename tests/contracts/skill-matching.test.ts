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

function assertPackagedReadmeLinks(packageRoot: string, readmePath: string): void {
  const absoluteReadme = path.join(packageRoot, ...readmePath.split("/"));
  const document = readFileSync(absoluteReadme, "utf8");
  const targets = [...document.matchAll(/(?:href="([^"]+)"|\]\(([^)]+)\))/g)]
    .map((match) => match[1] ?? match[2])
    .filter((target): target is string => Boolean(target) && !/^(?:https?:|mailto:|#)/i.test(target));
  for (const target of targets) {
    const pathname = target.split("#", 1)[0].split("?", 1)[0];
    const resolved = path.resolve(path.dirname(absoluteReadme), pathname);
    assert.ok(resolved.startsWith(`${path.resolve(packageRoot)}${path.sep}`), `${readmePath} link escapes package: ${target}`);
    assert.equal(existsSync(resolved), true, `${readmePath} link target is absent: ${target}`);
  }
}

test("five surfaces runs commands present", () => {
  const repositoryRoot = process.cwd();
  const consumerRoot = mkdtempSync(path.join(os.tmpdir(), "aiwiki-skill-contract-"));
  const codexHome = path.join(consumerRoot, "codex-home");
  const vaultRoot = path.join(consumerRoot, "vault");
  try {
    writeFileSync(path.join(consumerRoot, "package.json"), JSON.stringify({ private: true }, null, 2), "utf8");
    const artifactDirectory = path.join(consumerRoot, "release-artifact");
    run(process.execPath, [path.join(repositoryRoot, "scripts", "release-artifact.mjs"), "build", artifactDirectory], repositoryRoot);
    const evidence = JSON.parse(readFileSync(path.join(artifactDirectory, "release-evidence.json"), "utf8")) as { filename: string };
    const tarballPath = path.join(artifactDirectory, evidence.filename);
    assert.equal(existsSync(tarballPath), true, "release artifact helper did not produce the recorded tarball");
    runNpm(["install", "--ignore-scripts", "--no-package-lock", tarballPath], consumerRoot);

    const packageRoot = path.join(consumerRoot, "node_modules", "@itradingai", "aiwiki");
    const packagedSkillRoot = path.join(packageRoot, "skill");
    const bundleFiles = regularFiles(packagedSkillRoot);
    assert.ok(bundleFiles.includes("SKILL.md"));
    assert.ok(bundleFiles.includes("QUERY_PROTOCOL.md"));
    assert.ok(bundleFiles.includes("LINT_PROTOCOL.md"));
    assert.ok(bundleFiles.includes("UPGRADE_NOTES.md"));
    assert.ok(bundleFiles.includes("EXTENSION_PROTOCOL.md"));
    assert.equal(existsSync(path.join(packageRoot, "README.zh-CN.md")), false);
    const packagedReadme = readFileSync(path.join(packageRoot, "README.md"), "utf8");
    assert.match(packagedReadme, /<a href="\.\/docs\/README\.zh-CN\.md">中文<\/a>/);
    const packagedChineseReadme = readFileSync(path.join(packageRoot, "docs", "README.zh-CN.md"), "utf8");
    assert.notEqual(packagedChineseReadme, readFileSync(path.join(repositoryRoot, "README.zh-CN.md"), "utf8"));
    assert.match(packagedChineseReadme, /\]\(\.\.\/CHANGELOG\.zh-CN\.md\)/);
    assertPackagedReadmeLinks(packageRoot, "README.md");
    assertPackagedReadmeLinks(packageRoot, "docs/README.zh-CN.md");

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
    const workspaceSync = JSON.parse(runInstalledCli(consumerRoot, ["agent", "sync", "--path", vaultRoot, "--yes", "--json"], env)) as AgentSyncReport;
    assert.deepEqual(workspaceSync.results.map((result) => result.id), ["workspace"]);
    assert.equal(workspaceSync.results[0]?.action, "current");

    const agentHelp = runInstalledCli(consumerRoot, ["agent", "--help"], env);
    const prompt = runInstalledCli(consumerRoot, ["prompt", "agent"], env);
    const usage = readFileSync(path.join(packageRoot, "docs", "USAGE.md"), "utf8");
    const skill = readFileSync(path.join(packagedSkillRoot, "SKILL.md"), "utf8");
    const workspaceGuidance = readFileSync(path.join(vaultRoot, "AGENTS.md"), "utf8");
    const handoff = readFileSync(path.join(repositoryRoot, "docs", "AGENT_HANDOFF.md"), "utf8");
    const extensionProtocol = readFileSync(path.join(packagedSkillRoot, "EXTENSION_PROTOCOL.md"), "utf8");
    for (const text of [agentHelp, skill, workspaceGuidance, prompt, `${usage}\n${handoff}`]) {
      assert.match(text, /aiwiki runs inspect/);
      assert.match(text, /aiwiki runs compact --dry-run/);
      assert.match(text, /aiwiki runs compact --yes/);
    }
    for (const [text, requiredCommands] of [
      [prompt, ["aiwiki setup", "aiwiki doctor", "aiwiki status", "aiwiki ingest-agent", "aiwiki context", "aiwiki show", "aiwiki lint", "aiwiki index status", "aiwiki agent check", "aiwiki agent sync"]],
      [usage, ["aiwiki setup", "aiwiki doctor", "aiwiki status", "aiwiki ingest-file", "aiwiki ingest-agent", "aiwiki context", "aiwiki show", "aiwiki lint", "aiwiki index status", "aiwiki agent check", "aiwiki agent sync"]],
      [skill, ["aiwiki setup", "aiwiki doctor", "aiwiki status", "aiwiki ingest-file", "aiwiki ingest-agent", "aiwiki context", "aiwiki show", "aiwiki lint", "aiwiki index status", "aiwiki agent check", "aiwiki agent sync"]]
    ] as const) {
      for (const command of requiredCommands) {
        assert.ok(text.includes(command), `missing ${command}`);
      }
    }
    for (const text of [prompt, usage, skill, extensionProtocol]) {
      assert.match(text, /aiwiki plugin list/);
      assert.match(text, /aiwiki plugin inspect/);
      assert.match(text, /aiwiki plugin add <directory>/);
      assert.match(text, /aiwiki plugin enable <id>/);
      assert.match(text, /aiwiki plugin disable/);
      assert.match(text, /aiwiki plugin remove/);
      assert.match(text, /aiwiki plugin doctor/);
    }
    assert.match(extensionProtocol, /do not automatically discover, inspect, enable, execute, disable, or remove/i);
    assert.match(prompt, /不要自动发现、选择、启用、执行、禁用或移除/);
    assert.match(extensionProtocol, /does not add Pro behavior/i);
    assert.match(extensionProtocol, /entitlement checks, license checks, scheduling/i);
    assert.match(prompt, /不要自动构建或重建索引/);
    for (const text of [usage, skill]) {
      assert.match(text, /Do not automatically build or rebuild the index/i);
      assert.match(text, /Markdown-backed retrieval remains available/i);
    }
  } finally {
    rmSync(consumerRoot, { recursive: true, force: true });
  }
});
