import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stagePackage } from "./package-stage.mjs";

const root = process.cwd();
const evidenceFilename = "release-evidence.json";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    shell: process.platform === "win32" && command.endsWith(".cmd"),
    stdio: options.stdio ?? "pipe"
  });
}

function npmCommand() {
  const npmExecPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  return existsSync(npmExecPath)
    ? { command: process.execPath, prefix: [npmExecPath] }
    : { command: process.platform === "win32" ? "npm.cmd" : "npm", prefix: [] };
}

function runNpm(args, options = {}) {
  const npm = npmCommand();
  return run(npm.command, [...npm.prefix, ...args], options);
}

function digest(buffer, algorithm, encoding) {
  return createHash(algorithm).update(buffer).digest(encoding);
}

function loadEvidence(directory) {
  const evidencePath = path.join(directory, evidenceFilename);
  if (!existsSync(evidencePath)) throw new Error(`missing release evidence: ${evidencePath}`);
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  if (evidence?.schema_version !== "aiwiki.release_artifact.v1") {
    throw new Error(`unsupported release evidence schema in ${evidencePath}`);
  }
  return evidence;
}

export function verifyArtifact(directory) {
  const evidence = loadEvidence(directory);
  if (
    evidence.readme_strategy !== "S" ||
    !Array.isArray(evidence.transformations) ||
    evidence.transformations.length !== 3 ||
    evidence.tag !== `v${evidence.version}` ||
    evidence.integrity !== evidence.npm_integrity ||
    !Array.isArray(evidence.manifest) ||
    evidence.manifest.length === 0
  ) {
    throw new Error("release evidence metadata is incomplete or inconsistent");
  }
  if (process.env.GITHUB_SHA && evidence.source_sha !== process.env.GITHUB_SHA) {
    throw new Error(`artifact source SHA mismatch: ${evidence.source_sha} != ${process.env.GITHUB_SHA}`);
  }
  const manifestPaths = evidence.manifest.map((file) => file?.path);
  if (
    manifestPaths.some((file) => typeof file !== "string" || file.startsWith("/") || file.split("/").some((part) => part === "..")) ||
    new Set(manifestPaths).size !== manifestPaths.length
  ) {
    throw new Error("release evidence manifest contains unsafe or duplicate paths");
  }
  const artifactPath = path.join(directory, evidence.filename);
  if (!existsSync(artifactPath)) throw new Error(`missing release artifact: ${artifactPath}`);
  const bytes = readFileSync(artifactPath);
  const sha256 = digest(bytes, "sha256", "hex");
  const integrity = `sha512-${digest(bytes, "sha512", "base64")}`;
  if (sha256 !== evidence.sha256) throw new Error(`artifact SHA-256 mismatch: ${sha256} != ${evidence.sha256}`);
  if (integrity !== evidence.integrity) throw new Error(`artifact integrity mismatch: ${integrity} != ${evidence.integrity}`);
  return { artifactPath, evidence };
}

export function buildArtifact(directory) {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const sourceSha = process.env.GITHUB_SHA || run("git", ["rev-parse", "HEAD"]).trim();
  if (!/^[0-9a-f]{40}$/i.test(sourceSha)) throw new Error(`invalid source SHA: ${sourceSha}`);

  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const stageParent = mkdtempSync(path.join(tmpdir(), "aiwiki-package-stage-"));
  let packOutput;
  let transformations;
  try {
    const staged = stagePackage(path.join(stageParent, "package"));
    transformations = staged.transformations;
    packOutput = JSON.parse(runNpm([
      "pack",
      staged.stageRoot,
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      directory
    ]));
  } finally {
    rmSync(stageParent, { recursive: true, force: true });
  }
  if (!Array.isArray(packOutput) || packOutput.length !== 1) throw new Error("npm pack must produce exactly one artifact");
  const [pack] = packOutput;
  if (pack.name !== packageJson.name || pack.version !== packageJson.version || !pack.filename) {
    throw new Error("npm pack returned unexpected package metadata");
  }
  const tgzFiles = readdirSync(directory).filter((file) => file.endsWith(".tgz"));
  if (tgzFiles.length !== 1 || tgzFiles[0] !== pack.filename) {
    throw new Error(`expected exactly ${pack.filename}, found: ${tgzFiles.join(", ")}`);
  }
  const bytes = readFileSync(path.join(directory, pack.filename));
  const evidence = {
    schema_version: "aiwiki.release_artifact.v1",
    name: packageJson.name,
    version: packageJson.version,
    homepage: packageJson.homepage,
    tag: `v${packageJson.version}`,
    source_sha: sourceSha,
    readme_strategy: "S",
    transformations,
    filename: pack.filename,
    sha256: digest(bytes, "sha256", "hex"),
    integrity: `sha512-${digest(bytes, "sha512", "base64")}`,
    npm_integrity: pack.integrity,
    npm_shasum: pack.shasum,
    manifest: (pack.files ?? []).map((file) => ({ path: file.path, size: file.size, mode: file.mode }))
  };
  if (evidence.integrity !== evidence.npm_integrity) {
    throw new Error(`locally computed integrity does not match npm pack: ${evidence.integrity} != ${evidence.npm_integrity}`);
  }
  writeFileSync(path.join(directory, evidenceFilename), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  verifyArtifact(directory);
  return evidence;
}

export async function verifyRegistry(directory) {
  const { evidence } = verifyArtifact(directory);
  const encodedName = evidence.name.replace("/", "%2f");
  const endpoint = `https://registry.npmjs.org/${encodedName}`;
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const response = await fetch(endpoint, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`registry returned HTTP ${response.status}`);
      const metadata = await response.json();
      const published = metadata.versions?.[evidence.version];
      if (!published) throw new Error(`registry does not expose ${evidence.name}@${evidence.version}`);
      if (metadata["dist-tags"]?.latest !== evidence.version) {
        throw new Error(`latest dist-tag mismatch: ${metadata["dist-tags"]?.latest} != ${evidence.version}`);
      }
      if (published.dist?.integrity !== evidence.integrity) {
        throw new Error(`registry integrity mismatch: ${published.dist?.integrity} != ${evidence.integrity}`);
      }
      if (published.homepage !== evidence.homepage) {
        throw new Error(`registry homepage mismatch: ${published.homepage} != ${evidence.homepage}`);
      }
      if (metadata.readmeFilename !== "README.md") {
        throw new Error(`registry README selection mismatch: ${metadata.readmeFilename} != README.md`);
      }
      const registryReadme = typeof metadata.readme === "string" ? metadata.readme : "";
      const releaseMarker = `Current release: **${evidence.version}**`;
      const localeLink = "<a href=\"./docs/README.zh-CN.md\">中文</a>";
      if ((registryReadme.split(releaseMarker).length - 1) !== 1) {
        throw new Error(`registry README is not the English ${evidence.version} release body`);
      }
      if ((registryReadme.split(localeLink).length - 1) !== 1 || registryReadme.includes("./README.zh-CN.md")) {
        throw new Error("registry README has an invalid staged Chinese locale link");
      }
      if (!published.dist?.attestations?.url) throw new Error("registry provenance attestation is missing");
      return published;
    } catch (error) {
      lastError = error;
      if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
  throw lastError;
}

async function main() {
  const [command, directoryArg] = process.argv.slice(2);
  const directory = path.resolve(directoryArg || path.join(root, "release-artifact"));
  if (command === "build") {
    const evidence = buildArtifact(directory);
    console.log(JSON.stringify(evidence, null, 2));
    return;
  }
  if (command === "verify") {
    const { evidence } = verifyArtifact(directory);
    console.log(`release-artifact: verified ${evidence.filename}`);
    return;
  }
  if (command === "verify-registry") {
    const published = await verifyRegistry(directory);
    console.log(`release-artifact: registry verified ${published.name}@${published.version}`);
    return;
  }
  throw new Error("usage: node scripts/release-artifact.mjs <build|verify|verify-registry> [artifact-directory]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
