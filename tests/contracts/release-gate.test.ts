import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

type ReleaseCheckModule = {
  validatePackManifest: (files: string[], skillFiles: string[]) => void;
};

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, npm_config_fund: "false", npm_config_audit: "false" }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout;
}

function runNpm(args: string[]): string {
  if (existsSync(npmExecPath)) return run(process.execPath, [npmExecPath, ...args]);
  return run(npmCommand, args);
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

test("release check exposes executable pack manifest validation", async () => {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "release-check.mjs")).href;
  const releaseCheck = await import(moduleUrl) as Partial<ReleaseCheckModule>;

  assert.equal(typeof releaseCheck.validatePackManifest, "function");
  const validatePackManifest = releaseCheck.validatePackManifest as ReleaseCheckModule["validatePackManifest"];
  const skillFiles = ["EXTENSION_PROTOCOL.md", "LINT_PROTOCOL.md", "QUERY_PROTOCOL.md", "SKILL.md", "UPGRADE_NOTES.md"];
  const complete = [
    "dist/src/cli.js",
    "dist/src/public/index.js",
    "dist/src/public/index.d.ts",
    "dist/src/public/contracts.js",
    "dist/src/public/contracts.d.ts",
    "dist/src/extension/api.js",
    "dist/src/extension/api.d.ts",
    "docs/RELEASE.md",
    "docs/RELEASE.zh-CN.md",
    "docs/AGENT_HANDOFF.md",
    "docs/AGENT_HANDOFF.zh-CN.md",
    "docs/schema/README.md",
    "docs/schema/README.zh-CN.md",
    "README.md",
    "README.zh-CN.md",
    "examples/extensions/local-quality-extension/index.mjs",
    ...skillFiles.map((file) => `skill/${file}`)
  ];

  assert.doesNotThrow(() => validatePackManifest(complete, skillFiles));
  assert.throws(
    () => validatePackManifest(complete.filter((file) => file !== "skill/EXTENSION_PROTOCOL.md"), skillFiles),
    /missing package files: skill\/EXTENSION_PROTOCOL\.md/
  );
  assert.throws(
    () => validatePackManifest([...complete, "Plan/private-release-note.md"], skillFiles),
    /forbidden package files: Plan\/private-release-note\.md/
  );
});

test("Core 0.4 release manifest and bilingual release guides expose the public delivery contract", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8")) as { packages: Record<string, { version?: string }> };
  const packageFiles = JSON.parse(runNpm(["pack", "--dry-run", "--json", "--ignore-scripts"])) as Array<{ files?: Array<{ path?: string }> }>;
  const packedPaths = packageFiles[0]?.files?.flatMap((file) => file.path ? [file.path] : []) ?? [];
  const skillFiles = regularFiles(path.join(process.cwd(), "skill"));
  const release = readFileSync("docs/RELEASE.md", "utf8");
  const releaseZh = readFileSync("docs/RELEASE.zh-CN.md", "utf8");

  assert.equal(packageJson.version, "0.4.0");
  assert.equal(lockfile.packages[""]?.version, "0.4.0");
  for (const required of [
    "dist/src/cli.js",
    "dist/src/public/index.js",
    "dist/src/public/contracts.js",
    "dist/src/extension/api.js",
    "docs/RELEASE.md",
    "docs/RELEASE.zh-CN.md",
    "docs/AGENT_HANDOFF.md",
    "docs/AGENT_HANDOFF.zh-CN.md",
    "docs/schema/README.md",
    "docs/schema/README.zh-CN.md",
    "README.md",
    "README.zh-CN.md",
    "examples/extensions/local-quality-extension/index.mjs",
    ...skillFiles.map((file) => `skill/${file}`)
  ]) {
    assert.ok(packedPaths.includes(required), `missing ${required}`);
  }
  for (const forbiddenPrefix of ["docs/assets/", ".omx/", ".npm-cache/", "Plan/", "node_modules/", "tests/"]) {
    assert.equal(packedPaths.some((file) => file.startsWith(forbiddenPrefix)), false, `unexpected ${forbiddenPrefix}`);
  }
  for (const [document, marker] of [[release, "Core 0.4 Release Gate"], [releaseZh, "Core 0.4 发布门禁"]] as const) {
    assert.match(document, new RegExp(marker));
    assert.match(document, /task -> dev/);
    assert.match(document, /dev -> main/);
    assert.match(document, /main push CI/);
    assert.match(document, /release-gate\.test\.ts/);
    for (const contract of ["CLI", "Public API", "Extension API", "Schema", "failure isolation", "Skill bundle"]) {
      assert.match(document, new RegExp(contract, "i"));
    }
  }
});
