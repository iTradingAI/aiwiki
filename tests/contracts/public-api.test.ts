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

test("packed package exposes only the stable public API", () => {
  const repositoryRoot = process.cwd();
  const consumerRoot = mkdtempSync(path.join(os.tmpdir(), "aiwiki-public-api-"));
  try {
    writeFileSync(path.join(consumerRoot, "package.json"), JSON.stringify({ private: true }, null, 2), "utf8");
    const packed = JSON.parse(runNpm(["pack", repositoryRoot, "--json", "--ignore-scripts"], consumerRoot)) as Array<{ filename?: string }>;
    const tarballName = packed[0]?.filename;
    assert.ok(tarballName, "npm pack did not report a tarball filename");
    const tarballPath = path.join(consumerRoot, tarballName);

    runNpm(["install", "--ignore-scripts", "--no-package-lock", tarballPath], consumerRoot);

    const installedRoot = path.join(consumerRoot, "node_modules", "@itradingai", "aiwiki");
    for (const relativePath of [
      "dist/src/public/index.js",
      "dist/src/public/index.d.ts",
      "dist/src/public/contracts.js",
      "dist/src/public/contracts.d.ts"
    ]) {
      assert.doesNotThrow(() => readFileSync(path.join(installedRoot, relativePath), "utf8"), relativePath);
    }

    writeFileSync(
      path.join(consumerRoot, "consumer.mjs"),
      `import assert from "node:assert/strict";
import { Writable } from "node:stream";
import * as api from "@itradingai/aiwiki";
import * as contracts from "@itradingai/aiwiki/contracts";

assert.equal(api.AIWIKI_PUBLIC_API_VERSION, "aiwiki.public.v1");
assert.equal(contracts.AIWIKI_PUBLIC_API_VERSION, "aiwiki.public.v1");
for (const name of [
  "createAiwikiCli", "ingestPayload", "ingestFile", "discoverArtifacts",
  "readArtifact", "buildCapsules", "buildCapsuleContext", "buildContext",
  "lintWorkspace", "resolveWorkspace"
]) assert.equal(typeof api[name], "function", name);

const chunks = [];
const sink = new Writable({ write(chunk, _encoding, done) { chunks.push(String(chunk)); done(); } });
const cli = api.createAiwikiCli();
assert.equal(cli.apiVersion, "aiwiki.public.v1");
assert.equal(await cli.run(["--version"], { stdout: sink, stderr: sink }), 0);
assert.match(chunks.join(""), /^aiwiki \\d+\\.\\d+\\.\\d+\\n$/);
assert.equal(api.resolveWorkspace("."), process.cwd());
for (const specifier of ["@itradingai/aiwiki/dist/src/app.js", "@itradingai/aiwiki/src/app.js"]) {
  await assert.rejects(() => import(specifier), (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED");
}
`,
      "utf8"
    );
    run(process.execPath, ["consumer.mjs"], consumerRoot);

    writeFileSync(
      path.join(consumerRoot, "consumer.ts"),
      `import {
  AIWIKI_PUBLIC_API_VERSION,
  createAiwikiCli,
  type AiwikiArtifact,
  type AiwikiCli,
  type AiwikiCliStreams,
  type CapsuleContextResult,
  type ContextFilters,
  type ContextResult,
  type IngestResult,
  type KnowledgeLifecycle,
  type LintReport,
  type SourceCapsule
} from "@itradingai/aiwiki";
import type { AiwikiArtifact as ContractArtifact, ContextResult as ContractContextResult } from "@itradingai/aiwiki/contracts";

const apiVersion: "aiwiki.public.v1" = AIWIKI_PUBLIC_API_VERSION;
const cli: AiwikiCli = createAiwikiCli();
const streams: AiwikiCliStreams | undefined = undefined;
const artifact: AiwikiArtifact | ContractArtifact | undefined = undefined;
const capsule: SourceCapsule | undefined = undefined;
const lifecycle: KnowledgeLifecycle | undefined = undefined;
const filters: ContextFilters | undefined = undefined;
const context: ContextResult | ContractContextResult | CapsuleContextResult | undefined = undefined;
const ingest: IngestResult | undefined = undefined;
const lint: LintReport | undefined = undefined;
void [apiVersion, cli, streams, artifact, capsule, lifecycle, filters, context, ingest, lint];
`,
      "utf8"
    );
    writeFileSync(
      path.join(consumerRoot, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            noEmit: true,
            module: "NodeNext",
            moduleResolution: "NodeNext",
            target: "ES2022",
            types: ["node"],
            typeRoots: [path.join(repositoryRoot, "node_modules", "@types")]
          },
          files: ["consumer.ts"]
        },
        null,
        2
      ),
      "utf8"
    );
    run(process.execPath, [path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"), "--project", "tsconfig.json"], consumerRoot);
  } finally {
    rmSync(consumerRoot, { recursive: true, force: true });
  }
});
