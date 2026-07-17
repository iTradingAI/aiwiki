import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const npmExecPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const requiredPackageFiles = [
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
  "examples/extensions/local-quality-extension/index.mjs"
];
const forbiddenPackagePrefixes = ["docs/assets/", ".omx/", ".npm-cache/", "Plan/", "node_modules/", "tests/"];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: options.shell ?? false,
    stdio: options.stdio ?? "pipe"
  });
}

function runNpm(args) {
  if (existsSync(npmExecPath)) return run(process.execPath, [npmExecPath, ...args]);
  return run(process.platform === "win32" ? "npm.cmd" : "npm", args, { shell: process.platform === "win32" });
}

function regularFiles(directory, relative = "") {
  return readdirSync(path.join(directory, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const next = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) return regularFiles(directory, next);
      return entry.isFile() ? [next.split(path.sep).join("/")] : [];
    })
    .sort();
}

export function validatePackManifest(files, skillFiles) {
  const packedFiles = new Set(files);
  const requiredFiles = [...requiredPackageFiles, ...skillFiles.map((file) => `skill/${file}`)];
  const missing = requiredFiles.filter((file) => !packedFiles.has(file));
  const forbidden = files.filter((file) => forbiddenPackagePrefixes.some((prefix) => file.startsWith(prefix)));
  const errors = [];

  if (missing.length > 0) errors.push(`missing package files: ${missing.join(", ")}`);
  if (forbidden.length > 0) errors.push(`forbidden package files: ${forbidden.join(", ")}`);
  if (errors.length > 0) throw new Error(errors.join("\n"));
}

function readPackManifest(packageVersion) {
  const packOutput = runNpm(["pack", "--dry-run", "--json", "--ignore-scripts"]);
  const [pack] = JSON.parse(packOutput);
  const files = pack?.files?.flatMap((file) => typeof file?.path === "string" ? [file.path] : []) ?? [];

  if (pack?.name !== "@itradingai/aiwiki" || pack?.version !== packageVersion || files.length === 0) {
    throw new Error("npm pack dry-run did not return the expected AIWiki package manifest");
  }
  return files;
}

export function runReleaseCheck() {
  const packageJson = JSON.parse(run(process.execPath, ["-e", "process.stdout.write(JSON.stringify(require('./package.json')))"]));
  const versionOutput = run(process.execPath, ["dist/src/cli.js", "--version"]).trim();
  if (versionOutput !== `aiwiki ${packageJson.version}`) {
    throw new Error(`version mismatch: ${versionOutput} != aiwiki ${packageJson.version}`);
  }

  const skillFiles = regularFiles(path.join(root, "skill"));
  validatePackManifest(readPackManifest(packageJson.version), skillFiles);

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
    if (!ingestOutput.includes("ingested: yes")) {
      throw new Error("release-check ingest did not succeed");
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runReleaseCheck();
  console.log("release-check: ok");
}
