import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const sourceChineseReadme = "README.zh-CN.md";
const stagedChineseReadme = "docs/README.zh-CN.md";
const sourceHeroHref = "./README.zh-CN.md";
const stagedHeroHref = "./docs/README.zh-CN.md";
const repositoryBlobRoot = "https://github.com/iTradingAI/aiwiki/blob/main/";
const repositoryTreeRoot = "https://github.com/iTradingAI/aiwiki/tree/main/";

const englishPackageLinkRewrites = new Map([
  ["docs/AGENT_HANDOFF.md#core-intent-matrix", `${repositoryBlobRoot}docs/AGENT_HANDOFF.md#core-intent-matrix`],
  ["docs/AGENT_HANDOFF.md", `${repositoryBlobRoot}docs/AGENT_HANDOFF.md`],
  ["docs/RELEASE.md", `${repositoryBlobRoot}docs/RELEASE.md`],
  ["docs/TRIAL_FEEDBACK_TEMPLATE.md", `${repositoryBlobRoot}docs/TRIAL_FEEDBACK_TEMPLATE.md`],
  ["examples/demo-run/", `${repositoryTreeRoot}examples/demo-run`],
  ["examples/obsidian-vault-sample/", `${repositoryTreeRoot}examples/obsidian-vault-sample`],
  ["examples/public-trial-scenarios/", `${repositoryTreeRoot}examples/public-trial-scenarios`]
]);

const chinesePackageLinkRewrites = new Map([
  ["./README.md", "../README.md"],
  ["./docs/README.zh-CN.md", "./README.zh-CN.md"],
  ["./docs/USAGE.zh-CN.md", "./USAGE.zh-CN.md"],
  ["./docs/FAQ.zh-CN.md", "./FAQ.zh-CN.md"],
  ["CHANGELOG.md", "../CHANGELOG.md"],
  ["CHANGELOG.zh-CN.md", "../CHANGELOG.zh-CN.md"],
  ["LICENSE", "../LICENSE"],
  ["SECURITY.md", "../SECURITY.md"],
  ["SECURITY.zh-CN.md", "../SECURITY.zh-CN.md"],
  ["docs/AGENT_HANDOFF.zh-CN.md#core-intent-matrix", `${repositoryBlobRoot}docs/AGENT_HANDOFF.zh-CN.md#core-intent-matrix`],
  ["docs/AGENT_HANDOFF.zh-CN.md", `${repositoryBlobRoot}docs/AGENT_HANDOFF.zh-CN.md`],
  ["docs/FAQ.zh-CN.md", "./FAQ.zh-CN.md"],
  ["docs/README.zh-CN.md", "./README.zh-CN.md"],
  ["docs/RELEASE.zh-CN.md", `${repositoryBlobRoot}docs/RELEASE.zh-CN.md`],
  ["docs/ROADMAP.zh-CN.md", "./ROADMAP.zh-CN.md"],
  ["docs/SHOWCASE.zh-CN.md", "./SHOWCASE.zh-CN.md"],
  ["docs/USAGE.zh-CN.md#3-入库资料", "./USAGE.zh-CN.md#3-入库资料"],
  ["docs/USAGE.zh-CN.md", "./USAGE.zh-CN.md"],
  ["docs/schema/README.zh-CN.md", "./schema/README.zh-CN.md"],
  ["docs/schema/STATE.zh-CN.md", "./schema/STATE.zh-CN.md"],
  ["examples/demo-run/", `${repositoryTreeRoot}examples/demo-run`],
  ["examples/obsidian-vault-sample/", `${repositoryTreeRoot}examples/obsidian-vault-sample`]
]);

function rewriteLinkTargets(document, rewrites) {
  const rewrite = (target) => rewrites.get(target) ?? target;
  return document
    .replace(/(href=")([^"]+)(")/g, (_match, prefix, target, suffix) => `${prefix}${rewrite(target)}${suffix}`)
    .replace(/(\]\()([^)]+)(\))/g, (_match, prefix, target, suffix) => `${prefix}${rewrite(target)}${suffix}`);
}

function digest(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function safeRelativePath(file) {
  const normalized = file.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`unsafe package staging path: ${file}`);
  }
  return normalized;
}

function assertNoEscapingSymlinks(absolutePath, packagePath, canonicalRoot) {
  if (!existsSync(absolutePath)) throw new Error(`missing package staging source: ${packagePath}`);
  const stat = lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    const target = realpathSync(absolutePath);
    const relativeTarget = path.relative(canonicalRoot, target);
    if (relativeTarget === ".." || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
      throw new Error(`package staging symlink escapes root: ${packagePath} -> ${target}`);
    }
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(absolutePath)) {
    assertNoEscapingSymlinks(path.join(absolutePath, entry), `${packagePath}/${entry}`, canonicalRoot);
  }
}
function copyEntry(source, destination) {
  const resolvedSource = lstatSync(source).isSymbolicLink() ? realpathSync(source) : source;
  const stat = lstatSync(resolvedSource);
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(resolvedSource)) {
      copyEntry(path.join(resolvedSource, entry), path.join(destination, entry));
    }
    return;
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(resolvedSource, destination);
}


export function stagePackage(destination) {
  const canonicalRoot = realpathSync(root);
  const packageJsonPath = path.join(root, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (!Array.isArray(packageJson.files)) throw new Error("package.json files must be an array");
  const sourceFiles = packageJson.files.map(safeRelativePath);
  if (!sourceFiles.includes(sourceChineseReadme) || !sourceFiles.includes("README.md")) {
    throw new Error("README staging requires both source root README files");
  }
  for (const entry of sourceFiles) {
    assertNoEscapingSymlinks(path.join(root, ...entry.split("/")), entry, canonicalRoot);
  }

  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  for (const entry of sourceFiles) {
    if (entry === sourceChineseReadme) continue;
    const target = path.join(destination, ...entry.split("/"));
    copyEntry(path.join(root, ...entry.split("/")), target);
  }

  const stagedReadmePath = path.join(destination, "README.md");
  const sourceReadme = readFileSync(path.join(root, "README.md"), "utf8");
  const sourceLink = `<a href="${sourceHeroHref}">中文</a>`;
  const stagedLink = `<a href="${stagedHeroHref}">中文</a>`;
  if ((sourceReadme.match(new RegExp(sourceLink.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length !== 1) {
    throw new Error(`README.md must contain exactly one ${sourceLink} before staging`);
  }
  const stagedEnglishReadme = rewriteLinkTargets(sourceReadme.replace(sourceLink, stagedLink), englishPackageLinkRewrites);
  writeFileSync(stagedReadmePath, stagedEnglishReadme, "utf8");
  const stagedReadme = readFileSync(stagedReadmePath, "utf8");
  if (stagedReadme.includes(sourceLink) || (stagedReadme.match(new RegExp(stagedLink.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length !== 1) {
    throw new Error("staged README.md locale link transformation is incomplete");
  }

  const stagedChinesePath = path.join(destination, ...stagedChineseReadme.split("/"));
  mkdirSync(path.dirname(stagedChinesePath), { recursive: true });
  rmSync(stagedChinesePath, { force: true });
  const sourceChineseDocument = readFileSync(path.join(root, sourceChineseReadme), "utf8");
  const stagedChineseDocument = rewriteLinkTargets(sourceChineseDocument, chinesePackageLinkRewrites);
  writeFileSync(stagedChinesePath, stagedChineseDocument, "utf8");
  if (existsSync(path.join(destination, sourceChineseReadme))) {
    throw new Error(`staged package must not contain root ${sourceChineseReadme}`);
  }

  const stagedPackageJson = {
    ...packageJson,
    files: sourceFiles.filter((entry) => entry !== sourceChineseReadme)
  };
  const stagedPackageJsonPath = path.join(destination, "package.json");
  writeFileSync(stagedPackageJsonPath, `${JSON.stringify(stagedPackageJson, null, 2)}\n`, "utf8");

  const transformations = [
    {
      operation: "rewrite",
      source: "README.md",
      destination: "README.md",
      change: `${sourceHeroHref} -> ${stagedHeroHref}`,
      source_sha256: digest(path.join(root, "README.md")),
      staged_sha256: digest(stagedReadmePath)
    },
    {
      operation: "replace-and-relocate",
      source: sourceChineseReadme,
      replaced_source: stagedChineseReadme,
      destination: stagedChineseReadme,
      source_sha256: digest(path.join(root, sourceChineseReadme)),
      change: "relocate to docs/ and rebase package-relative links",
      replaced_source_sha256: digest(path.join(root, stagedChineseReadme)),
      staged_sha256: digest(stagedChinesePath)
    },
    {
      operation: "rewrite",
      source: "package.json",
      destination: "package.json",
      change: `remove ${sourceChineseReadme} from files; ${stagedChineseReadme} remains selected`,
      source_sha256: digest(packageJsonPath),
      staged_sha256: digest(stagedPackageJsonPath)
    }
  ];
  return { stageRoot: destination, transformations };
}

function runNpmPack(stageRoot, dryRun) {
  const npmExecPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const args = existsSync(npmExecPath)
    ? [npmExecPath, "pack", stageRoot, "--json", "--ignore-scripts", ...(dryRun ? ["--dry-run"] : [])]
    : ["pack", stageRoot, "--json", "--ignore-scripts", ...(dryRun ? ["--dry-run"] : [])];
  const command = existsSync(npmExecPath) ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32" && command.endsWith(".cmd")
  });
}

export function packDryRun() {
  const parent = mkdtempSync(path.join(tmpdir(), "aiwiki-package-stage-"));
  try {
    const { stageRoot, transformations } = stagePackage(path.join(parent, "package"));
    const [pack] = JSON.parse(runNpmPack(stageRoot, true));
    return { pack, transformations };
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

async function main() {
  const [command, destinationArg] = process.argv.slice(2);
  if (command === "stage") {
    const destination = path.resolve(destinationArg || path.join(root, ".package-stage"));
    console.log(JSON.stringify(stagePackage(destination), null, 2));
    return;
  }
  if (command === "dry-run") {
    console.log(JSON.stringify(packDryRun(), null, 2));
    return;
  }
  throw new Error("usage: node scripts/package-stage.mjs <stage [directory]|dry-run>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
