import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";


type ReleaseCheckModule = {
  README_STRATEGY: { id: string; packagePaths: readonly string[] };
  validatePackManifest: (files: string[], skillFiles: string[]) => void;
  validateReleaseTree: (rootDirectory: string, packFiles?: string[]) => { version: string };
  validateStagingTransformations: (transformations: Array<{ operation: string; source: string; destination: string }>) => void;
};

type ReleaseArtifactModule = {
  buildArtifact: (directory: string) => {
    filename: string;
    sha256: string;
    integrity: string;
    readme_strategy: string;
    transformations: Array<{ operation: string; source: string; destination: string }>;
    manifest: Array<{ path: string }>;
  };
  verifyArtifact: (directory: string) => { artifactPath: string; evidence: { filename: string; sha256: string } };
};

type PackageStageModule = {
  packDryRun: () => {
    pack: { files?: Array<{ path?: string }> };
    transformations: Array<{ operation: string; source: string; destination: string }>;
  };
};


function regularFiles(root: string, relative = ""): string[] {
  return readdirSync(path.join(root, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const next = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) return regularFiles(root, next);
      return entry.isFile() ? [next.split(path.sep).join("/")] : [];
    })
    .sort();
}

// Runtime import is intentional: release scripts remain source .mjs files outside TypeScript output.
async function releaseCheckModule(): Promise<ReleaseCheckModule> {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "release-check.mjs")).href;
  return await import(moduleUrl) as ReleaseCheckModule;
}

function createReleaseFixture(version: string): string {
  const fixture = mkdtempSync(path.join(tmpdir(), "aiwiki-release-fixture-"));
  mkdirSync(path.join(fixture, "skill"), { recursive: true });
  mkdirSync(path.join(fixture, "docs"), { recursive: true });
  writeFileSync(path.join(fixture, "package.json"), JSON.stringify({
    name: "@itradingai/aiwiki",
    version,
    homepage: "https://maxking.cc/aiwiki",
    files: []
  }));
  writeFileSync(path.join(fixture, "package-lock.json"), JSON.stringify({
    name: "@itradingai/aiwiki",
    version,
    packages: { "": { name: "@itradingai/aiwiki", version } }
  }));
  writeFileSync(path.join(fixture, "skill", "SKILL.md"), `<!-- aiwiki-skill-version: ${version} -->\n`);
  writeFileSync(path.join(fixture, "CHANGELOG.md"), `# Changelog\n\n## [${version}] - 2026-07-26\n`);
  writeFileSync(path.join(fixture, "CHANGELOG.zh-CN.md"), `# 更新日志\n\n## [${version}] - 2026-07-26\n`);
  writeFileSync(
    path.join(fixture, "README.md"),
    `Current release: **${version}**\n<a href="./README.zh-CN.md">中文</a>\n`
  );
  writeFileSync(path.join(fixture, "README.zh-CN.md"), `当前版本：**${version}**\n`);
  writeFileSync(path.join(fixture, "docs", "README.md"), `Current release: **${version}**\n`);
  writeFileSync(path.join(fixture, "docs", "README.zh-CN.md"), `当前版本：**${version}**\n`);
  const privateRoute = "https://github.com/iTradingAI/aiwiki/security/advisories/new";
  writeFileSync(path.join(fixture, "SECURITY.md"), `Report privately at ${privateRoute}.\n`);
  writeFileSync(path.join(fixture, "SECURITY.zh-CN.md"), `请通过 ${privateRoute} 私下报告。\n`);
  return fixture;
}

async function readPackPaths(): Promise<string[]> {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "package-stage.mjs")).href;
  // Runtime import is intentional: the test exercises the exact dependency-free staging helper used by CI.
  const packageStage = await import(moduleUrl) as PackageStageModule;
  const { pack, transformations } = packageStage.packDryRun();
  assert.deepEqual(
    transformations.map(({ operation, source, destination }) => [operation, source, destination]),
    [
      ["rewrite", "README.md", "README.md"],
      ["replace-and-relocate", "README.zh-CN.md", "docs/README.zh-CN.md"],
      ["rewrite", "package.json", "package.json"]
    ]
  );
  return pack.files?.flatMap((file) => file.path ? [file.path] : []) ?? [];
}

test("package gate accepts the complete consumer artifact and derives the current version", async () => {
  const releaseCheck = await releaseCheckModule();
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
    version: string;
    packages: Record<string, { version?: string }>;
  };
  const packedPaths = await readPackPaths();
  const skillFiles = regularFiles(path.join(process.cwd(), "skill"));

  assert.equal(lockfile.version, packageJson.version);
  assert.equal(lockfile.packages[""]?.version, packageJson.version);
  assert.doesNotThrow(() => releaseCheck.validatePackManifest(packedPaths, skillFiles));
  assert.equal(releaseCheck.validateReleaseTree(process.cwd(), packedPaths).version, packageJson.version);
});

test("package gate rejects incomplete Skill, forbidden paths, traversal, and broken bilingual pairs", async () => {
  const releaseCheck = await releaseCheckModule();
  const packedPaths = await readPackPaths();
  const skillFiles = regularFiles(path.join(process.cwd(), "skill"));

  assert.throws(
    () => releaseCheck.validatePackManifest(packedPaths.filter((file) => file !== "skill/EXTENSION_PROTOCOL.md"), skillFiles),
    /missing package files: .*skill\/EXTENSION_PROTOCOL\.md/
  );
  assert.throws(
    () => releaseCheck.validatePackManifest([...packedPaths, "docs/RELEASE.md"], skillFiles),
    /forbidden package files: docs\/RELEASE\.md/
  );
  assert.throws(
    () => releaseCheck.validatePackManifest([...packedPaths, "..\\outside.txt"], skillFiles),
    /escapes package root: ..\\outside\.txt/
  );
  assert.throws(
    () => releaseCheck.validatePackManifest(packedPaths.filter((file) => file !== "docs/FAQ.zh-CN.md"), skillFiles),
    /missing package files: .*docs\/FAQ\.zh-CN\.md/
  );
  assert.throws(
    () => releaseCheck.validatePackManifest(packedPaths.filter((file) => file !== "docs/workflows/RESEARCH.md"), skillFiles),
    /missing package files: .*docs\/workflows\/RESEARCH\.md/
  );
  assert.throws(
    () => releaseCheck.validateStagingTransformations([
      { operation: "rewrite", source: "README.md", destination: "README.md" },
      { operation: "replace-and-relocate", source: "README.zh-CN.md", destination: "docs/README.zh-CN.md" },
      { operation: "rewrite", source: "package.json", destination: "package.json" },
      { operation: "copy", source: "private.txt", destination: "docs/private.txt" }
    ]),
    /undeclared README staging transformations/
  );
});

test("release truth rejects dynamic version, declaration, canonical, security, and consumer leakage defects", async () => {
  const releaseCheck = await releaseCheckModule();
  const version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
  const fixture = createReleaseFixture(version);
  try {
    assert.equal(releaseCheck.validateReleaseTree(fixture).version, version);

    const lockPath = path.join(fixture, "package-lock.json");
    const lockfile = JSON.parse(readFileSync(lockPath, "utf8")) as { version: string; packages: Record<string, { version: string }> };
    lockfile.version = "9.9.9";
    writeFileSync(lockPath, JSON.stringify(lockfile));
    assert.throws(() => releaseCheck.validateReleaseTree(fixture), /package-lock\.json version mismatch/);
    lockfile.version = version;
    writeFileSync(lockPath, JSON.stringify(lockfile));

    const readmePath = path.join(fixture, "README.md");
    const readme = readFileSync(readmePath, "utf8");
    writeFileSync(readmePath, `${readme}Current release: **${version}**\n`);
    assert.throws(() => releaseCheck.validateReleaseTree(fixture), /README\.md must declare current release .* exactly once/);
    writeFileSync(readmePath, readme);

    const packagePath = path.join(fixture, "package.json");
    const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as { homepage: string; files: string[] };
    manifest.homepage = "https://aiwiki.maxking.cc";
    writeFileSync(packagePath, JSON.stringify(manifest));
    assert.throws(() => releaseCheck.validateReleaseTree(fixture), /package\.json stage homepage mismatch/);
    manifest.homepage = "https://maxking.cc/aiwiki";
    writeFileSync(packagePath, JSON.stringify(manifest));

    writeFileSync(path.join(fixture, "SECURITY.zh-CN.md"), "请创建公开 issue。\n");
    assert.throws(() => releaseCheck.validateReleaseTree(fixture), /must share a private vulnerability reporting route/);
    const privateRoute = "https://github.com/iTradingAI/aiwiki/security/advisories/new";
    writeFileSync(path.join(fixture, "SECURITY.zh-CN.md"), `请通过 ${privateRoute} 私下报告。\n`);

    writeFileSync(path.join(fixture, "consumer.md"), "Internal CORE-9999 marker\n");
    assert.throws(
      () => releaseCheck.validateReleaseTree(fixture, ["consumer.md"]),
      /consumer package contains internal CORE identifier: consumer\.md/
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("release truth rejects package symlinks that escape the source tree", async (context) => {
  const releaseCheck = await releaseCheckModule();
  const version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
  const fixture = createReleaseFixture(version);
  const outside = path.join(mkdtempSync(path.join(tmpdir(), "aiwiki-release-outside-")), "secret.txt");
  try {
    writeFileSync(outside, "not package content\n");
    const packagePath = path.join(fixture, "package.json");
    const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as { files: string[] };
    manifest.files = ["escape.txt"];
    writeFileSync(packagePath, JSON.stringify(manifest));
    try {
      symlinkSync(outside, path.join(fixture, "escape.txt"), "file");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        context.skip(`symlink creation unavailable: ${code}`);
        return;
      }
      throw error;
    }
    assert.throws(() => releaseCheck.validateReleaseTree(fixture), /package symlink escapes root/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
    rmSync(path.dirname(outside), { recursive: true, force: true });
  }
});

test("artifact helper records and verifies the only staged tgz", async () => {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "release-artifact.mjs")).href;
  // Runtime import is intentional: this test exercises the source helper invoked directly by the workflow.
  const artifactModule = await import(moduleUrl) as ReleaseArtifactModule;
  const artifactDirectory = mkdtempSync(path.join(tmpdir(), "aiwiki-artifact-test-"));
  try {
    const evidence = artifactModule.buildArtifact(artifactDirectory);
    assert.match(evidence.sha256, /^[0-9a-f]{64}$/);
    assert.match(evidence.integrity, /^sha512-/);
    assert.equal(evidence.readme_strategy, "S");
    assert.equal(evidence.transformations.length, 3);
    assert.ok(evidence.manifest.some((file) => file.path === "package.json"));
    assert.ok(evidence.manifest.some((file) => file.path === "README.md"));
    assert.ok(evidence.manifest.some((file) => file.path === "docs/README.zh-CN.md"));
    assert.equal(evidence.manifest.some((file) => file.path === "README.zh-CN.md"), false);
    assert.equal(readdirSync(artifactDirectory).filter((file) => file.endsWith(".tgz")).length, 1);
    assert.equal(artifactModule.verifyArtifact(artifactDirectory).evidence.filename, evidence.filename);

    const artifactPath = path.join(artifactDirectory, evidence.filename);
    writeFileSync(artifactPath, Buffer.concat([readFileSync(artifactPath), Buffer.from("tamper")]));
    assert.throws(() => artifactModule.verifyArtifact(artifactDirectory), /artifact SHA-256 mismatch/);
  } finally {
    rmSync(artifactDirectory, { recursive: true, force: true });
  }
});

test("publish workflow preserves ref and tag guards and publishes only the smoked artifact", () => {
  const workflow = readFileSync(path.join(".github", "workflows", "publish.yml"), "utf8");
  assert.match(workflow, /github\.ref != 'refs\/heads\/main'/);
  assert.match(workflow, /git cat-file -t/);
  assert.match(workflow, /git rev-list -n 1/);
  assert.equal((workflow.match(/release-artifact\.mjs build/g) ?? []).length, 1);
  assert.match(workflow, /artifact-smoke:[\s\S]*needs: build-artifact/);
  assert.match(workflow, /publish:[\s\S]*needs:[\s\S]*- artifact-smoke[\s\S]*- release-gate/);
  assert.match(
    workflow,
    /\n  publish:\n[\s\S]*artifact="\$\(realpath "\$ARTIFACT_DIRECTORY\/\$\(node -p [^\n]+\)"\)"[\s\S]*npm publish "\$artifact"/,
  );
  assert.match(workflow, /npm publish "\$artifact" --access public --provenance/);
  assert.match(workflow, /registry-verify:[\s\S]*needs: publish/);
  assert.match(workflow, /github-release:[\s\S]*needs: registry-verify/);
  assert.match(workflow, /publish:[\s\S]*id-token: write/);
  assert.match(workflow, /github-release:[\s\S]*contents: write/);
});
