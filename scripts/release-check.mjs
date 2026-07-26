import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packDryRun } from "./package-stage.mjs";

const root = process.cwd();
const stageHomepage = "https://maxking.cc/aiwiki";

// Phase 0 npm/source experiments reject K and R for the locked source-link
// contract. Strategy S is the isolated, approved source-to-package transform.
export const README_STRATEGY = Object.freeze({
  id: "S",
  packagePaths: ["README.md", "docs/README.zh-CN.md"]
});

const requiredPackageFiles = [
  "package.json",
  "dist/src/cli.js",
  "dist/src/public/index.js",
  "dist/src/public/index.d.ts",
  "dist/src/public/contracts.js",
  "dist/src/public/contracts.d.ts",
  "dist/src/extension/api.js",
  "dist/src/extension/api.d.ts",
  "LICENSE",
  "CHANGELOG.md",
  "CHANGELOG.zh-CN.md",
  "SECURITY.md",
  "SECURITY.zh-CN.md",
  "docs/README.md",
  "docs/README.zh-CN.md",
  "docs/FAQ.md",
  "docs/FAQ.zh-CN.md",
  "docs/OPERATING_FEEDBACK_LOOP.md",
  "docs/OPERATING_FEEDBACK_LOOP.zh-CN.md",
  "docs/ROADMAP.md",
  "docs/ROADMAP.zh-CN.md",
  "docs/SHOWCASE.md",
  "docs/SHOWCASE.zh-CN.md",
  "docs/USAGE.md",
  "docs/USAGE.zh-CN.md",
  "docs/schema/README.md",
  "docs/schema/README.zh-CN.md",
  "examples/extensions/local-quality-extension/aiwiki-extension.json",
  "examples/extensions/local-quality-extension/index.mjs"
];
const forbiddenPackagePrefixes = [
  ".git/",
  ".github/",
  ".npm-cache/",
  ".omx/",
  "Plan/",
  "docs/assets/",
  "docs/archive/",
  "node_modules/",
  "scripts/",
  "site/",
  "src/",
  "tests/",
  "website/"
];
const forbiddenPackageFiles = new Set([
  "CONTRIBUTING.md",
  "docs/AGENT_HANDOFF.md",
  "docs/AGENT_HANDOFF.zh-CN.md",
  "docs/OBSIDIAN_DATAVIEW_PLAN.md",
  "docs/RELEASE.md",
  "docs/RELEASE.zh-CN.md",
  "docs/TRIAL_FEEDBACK_TEMPLATE.md",
  "docs/development-log.md"
]);
const consumerTextExtensions = new Set([".cjs", ".d.ts", ".js", ".json", ".md", ".mjs", ".txt", ".yaml", ".yml"]);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    shell: options.shell ?? false,
    stdio: options.stdio ?? "pipe"
  });
}


function normalizePackagePath(file) {
  return file.replaceAll("\\", "/");
}

function assertSafeRelativePath(file, label = "package path") {
  const normalized = normalizePackagePath(file);
  const segments = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    segments.includes("") ||
    segments.includes(".") ||
    segments.includes("..") ||
    normalized.includes("\0")
  ) {
    throw new Error(`${label} escapes package root: ${file}`);
  }
  return normalized;
}

function regularFiles(directory, relative = "") {
  return readdirSync(path.join(directory, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const next = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) return regularFiles(directory, next);
      return entry.isFile() ? [normalizePackagePath(next)] : [];
    })
    .sort();
}

function validateReadmeStrategy(files) {
  if (README_STRATEGY.id !== "S") {
    throw new Error(`unsupported README strategy: ${README_STRATEGY.id}`);
  }
  const packed = new Set(files);
  const missing = README_STRATEGY.packagePaths.filter((file) => !packed.has(file));
  if (missing.length > 0) throw new Error(`README strategy ${README_STRATEGY.id} missing package files: ${missing.join(", ")}`);
  const candidates = files.filter((file) => /^README(?:\.[^/]+)?\.md$/i.test(file));
  const expected = [...README_STRATEGY.packagePaths].filter((file) => /^README(?:\.[^/]+)?\.md$/i.test(file)).sort();
  if (JSON.stringify(candidates.sort()) !== JSON.stringify(expected)) {
    throw new Error(`README strategy ${README_STRATEGY.id} has wrong root candidates: ${candidates.join(", ")}`);
  }
}

function validateBilingualPairs(files) {
  const packed = new Set(files);
  const requiredPairs = [
    ["CHANGELOG.md", "CHANGELOG.zh-CN.md"],
    ["SECURITY.md", "SECURITY.zh-CN.md"],
    ["docs/README.md", "docs/README.zh-CN.md"]
  ];
  for (const file of files) {
    if (!file.startsWith("docs/") || !file.endsWith(".md")) continue;
    if (file.endsWith(".zh-CN.md")) requiredPairs.push([file.replace(/\.zh-CN\.md$/, ".md"), file]);
    else requiredPairs.push([file, file.replace(/\.md$/, ".zh-CN.md")]);
  }
  const missing = [...new Map(requiredPairs.map((pair) => [pair.join("\0"), pair])).values()]
    .flatMap(([english, chinese]) => packed.has(english) && packed.has(chinese) ? [] : [`${english} <-> ${chinese}`]);
  if (missing.length > 0) throw new Error(`missing bilingual package pairs: ${missing.join(", ")}`);
}

export function validatePackManifest(files, skillFiles) {
  const normalizedFiles = files.map((file) => assertSafeRelativePath(file));
  const packedFiles = new Set(normalizedFiles);
  const normalizedSkillFiles = skillFiles.map((file) => assertSafeRelativePath(file, "Skill path"));
  const requiredFiles = [
    ...requiredPackageFiles,
    ...README_STRATEGY.packagePaths,
    ...normalizedSkillFiles.map((file) => `skill/${file}`)
  ];
  const missing = requiredFiles.filter((file) => !packedFiles.has(file));
  const forbidden = normalizedFiles.filter((file) =>
    forbiddenPackageFiles.has(file) ||
    forbiddenPackagePrefixes.some((prefix) => file.startsWith(prefix)) ||
    file.startsWith("docs/AIWiki-0.3.0-") ||
    file.startsWith("docs/20260607-")
  );
  const unexpectedSkillFiles = normalizedFiles
    .filter((file) => file.startsWith("skill/"))
    .filter((file) => !normalizedSkillFiles.includes(file.slice("skill/".length)));
  const errors = [];

  if (missing.length > 0) errors.push(`missing package files: ${missing.join(", ")}`);
  if (forbidden.length > 0) errors.push(`forbidden package files: ${forbidden.join(", ")}`);
  if (unexpectedSkillFiles.length > 0) errors.push(`undeclared Skill package files: ${unexpectedSkillFiles.join(", ")}`);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  validateReadmeStrategy(normalizedFiles);
  validateBilingualPairs(normalizedFiles);
}

function validateSelectedSymlinks(rootDirectory, packageEntries) {
  const canonicalRoot = realpathSync(rootDirectory);
  const visit = (absolutePath, packagePath) => {
    if (!existsSync(absolutePath)) return;
    const stat = lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      const target = realpathSync(absolutePath);
      const relativeTarget = path.relative(canonicalRoot, target);
      if (relativeTarget === ".." || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
        throw new Error(`package symlink escapes root: ${packagePath} -> ${target}`);
      }
      return;
    }
    if (!stat.isDirectory()) return;
    for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
      visit(path.join(absolutePath, entry.name), `${packagePath}/${entry.name}`);
    }
  };
  for (const entry of packageEntries) {
    const safeEntry = assertSafeRelativePath(entry, "package.json files entry");
    visit(path.join(rootDirectory, ...safeEntry.split("/")), safeEntry);
  }
}

function currentReleaseValues(text, language) {
  const expression = language === "en"
    ? /Current release:\s*(?:\*\*)?v?(\d+\.\d+\.\d+)(?:\*\*)?/gi
    : /当前版本[：:]\s*(?:\*\*)?v?(\d+\.\d+\.\d+)(?:\*\*)?/g;
  return [...text.matchAll(expression)].map((match) => match[1]);
}

function firstChangelogVersion(text, file) {
  const match = text.match(/^##\s+(?:\[)?v?(\d+\.\d+\.\d+)(?:\])?(?:\s|$)/m);
  if (!match) throw new Error(`${file} has no release heading`);
  return match[1];
}

function privateSecurityRoutes(text) {
  const routes = new Set();
  for (const match of text.matchAll(/https:\/\/github\.com\/iTradingAI\/aiwiki\/security\/advisories\/new|mailto:[^\s)>]+/gi)) {
    routes.add(match[0].toLowerCase());
  }
  return routes;
}

function validateConsumerContents(rootDirectory, files) {
  for (const file of files) {
    const extension = file.endsWith(".d.ts") ? ".d.ts" : path.extname(file).toLowerCase();
    if (!consumerTextExtensions.has(extension)) continue;
    const sourceFile = file === "docs/README.zh-CN.md" ? "README.zh-CN.md" : file;
    const absolutePath = path.join(rootDirectory, ...sourceFile.split("/"));
    if (!existsSync(absolutePath)) continue;
    const text = readFileSync(absolutePath, "utf8");
    if (/CORE-[0-9]+/.test(text)) throw new Error(`consumer package contains internal CORE identifier: ${file}`);
  }
}

export function validateReleaseTree(rootDirectory, packFiles) {
  const readJson = (file) => JSON.parse(readFileSync(path.join(rootDirectory, file), "utf8"));
  const readText = (file) => readFileSync(path.join(rootDirectory, file), "utf8");
  const packageJson = readJson("package.json");
  const lockfile = readJson("package-lock.json");
  if (lockfile.version !== packageJson.version) {
    throw new Error(`package-lock.json version mismatch: ${lockfile.version} != ${packageJson.version}`);
  }
  if (lockfile.packages?.[""]?.version !== packageJson.version) {
    throw new Error(`package-lock.json root package version mismatch: ${lockfile.packages?.[""]?.version} != ${packageJson.version}`);
  }
  if (packageJson.homepage !== stageHomepage) {
    throw new Error(`package.json stage homepage mismatch: ${packageJson.homepage} != ${stageHomepage}`);
  }
  validateSelectedSymlinks(rootDirectory, packageJson.files ?? []);

  const skill = readText("skill/SKILL.md");
  const skillVersions = [...skill.matchAll(/<!--\s*aiwiki-skill-version:\s*(\d+\.\d+\.\d+)\s*-->/g)].map((match) => match[1]);
  if (skillVersions.length !== 1 || skillVersions[0] !== packageJson.version) {
    throw new Error(`skill/SKILL.md version mismatch: ${skillVersions.join(", ") || "missing"} != ${packageJson.version}`);
  }
  for (const file of ["CHANGELOG.md", "CHANGELOG.zh-CN.md"]) {
    const version = firstChangelogVersion(readText(file), file);
    if (version !== packageJson.version) throw new Error(`${file} current release mismatch: ${version} != ${packageJson.version}`);
  }
  for (const [file, language] of [
    ["README.md", "en"],
    ["README.zh-CN.md", "zh-CN"],
    ["docs/README.md", "en"],
    ["docs/README.zh-CN.md", "zh-CN"]
  ]) {
    const versions = currentReleaseValues(readText(file), language);
    if (versions.length !== 1 || versions[0] !== packageJson.version) {
      throw new Error(`${file} must declare current release ${packageJson.version} exactly once; found ${versions.join(", ") || "none"}`);
    }
  }

  const readme = readText("README.md");
  const chineseLinks = readme.match(/<a href="\.\/README\.zh-CN\.md">中文<\/a>/g) ?? [];
  if (chineseLinks.length !== 1 || /<a href="\.\/README\.zh-CN\.md">Chinese<\/a>/.test(readme)) {
    throw new Error("README.md must contain exactly one ./README.zh-CN.md hero link labeled 中文");
  }

  const security = readText("SECURITY.md");
  const securityZh = readText("SECURITY.zh-CN.md");
  const englishRoutes = privateSecurityRoutes(security);
  const chineseRoutes = privateSecurityRoutes(securityZh);
  const sharedRoutes = [...englishRoutes].filter((route) => chineseRoutes.has(route));
  if (sharedRoutes.length === 0) {
    throw new Error("SECURITY.md and SECURITY.zh-CN.md must share a private vulnerability reporting route");
  }

  if (packFiles) validateConsumerContents(rootDirectory, packFiles);
  return packageJson;
}

export function validateStagingTransformations(transformations) {
  const expectedTransformations = [
    ["rewrite", "README.md", "README.md"],
    ["replace-and-relocate", "README.zh-CN.md", "docs/README.zh-CN.md"],
    ["rewrite", "package.json", "package.json"]
  ];
  const actualTransformations = transformations.map(({ operation, source, destination }) => [operation, source, destination]);
  if (JSON.stringify(actualTransformations) !== JSON.stringify(expectedTransformations)) {
    throw new Error(`undeclared README staging transformations: ${JSON.stringify(actualTransformations)}`);
  }
}

function readPackManifest(packageVersion) {
  const { pack, transformations } = packDryRun();
  const files = pack?.files?.flatMap((file) => typeof file?.path === "string" ? [file.path] : []) ?? [];
  validateStagingTransformations(transformations);
  if (pack?.name !== "@itradingai/aiwiki" || pack?.version !== packageVersion || files.length === 0) {
    throw new Error("npm pack dry-run did not return the expected staged AIWiki package manifest");
  }
  return files;
}

export function runReleaseCheck() {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const versionOutput = run(process.execPath, ["dist/src/cli.js", "--version"]).trim();
  if (versionOutput !== `aiwiki ${packageJson.version}`) {
    throw new Error(`version mismatch: ${versionOutput} != aiwiki ${packageJson.version}`);
  }

  const skillFiles = regularFiles(path.join(root, "skill"));
  const packFiles = readPackManifest(packageJson.version);
  validatePackManifest(packFiles, skillFiles);
  validateReleaseTree(root, packFiles);

  const tempRoot = mkdtempSync(path.join(tmpdir(), "aiwiki-release-check-"));
  try {
    run(process.execPath, ["dist/src/cli.js", "init", "--path", tempRoot, "--yes"]);
    const payloadFile = path.join(tempRoot, "payload.json");
    writeFileSync(
      payloadFile,
      JSON.stringify({
        schema_version: "aiwiki.agent_payload.v1",
        source: {
          kind: "text",
          title: "Release check",
          content_format: "markdown",
          content: "这是一条发布前检查内容。",
          fetcher: "release-check",
          fetch_status: "ok",
          captured_at: new Date().toISOString()
        },
        request: {
          mode: "ingest",
          outputs: ["source_card"],
          language: "zh-CN"
        }
      }),
      "utf8"
    );
    const ingestOutput = run(process.execPath, ["dist/src/cli.js", "ingest-agent", "--path", tempRoot, "--payload", payloadFile]);
    if (!ingestOutput.includes("ingested: yes")) throw new Error("release-check ingest did not succeed");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runReleaseCheck();
    console.log("release-check: ok");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
