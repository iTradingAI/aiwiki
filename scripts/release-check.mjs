import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const npmExecPath = process.env.npm_execpath;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: options.shell ?? false,
    stdio: options.stdio ?? "pipe"
  });
}

const versionOutput = run(process.execPath, ["dist/src/cli.js", "--version"]).trim();
const packageJson = JSON.parse(run(process.execPath, ["-e", "process.stdout.write(JSON.stringify(require('./package.json')))"]));
if (versionOutput !== `aiwiki ${packageJson.version}`) {
  throw new Error(`version mismatch: ${versionOutput} != aiwiki ${packageJson.version}`);
}

const packOutput = npmExecPath
  ? run(process.execPath, [npmExecPath, "pack", "--dry-run"])
  : run(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", "--dry-run"], { shell: process.platform === "win32" });
if (!packOutput.includes(`@itradingai/aiwiki@${packageJson.version}`)) {
  throw new Error("npm pack dry-run did not include the expected package version");
}
if (packOutput.includes("docs/assets/")) {
  throw new Error("npm package unexpectedly includes docs/assets");
}

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

console.log("release-check: ok");
