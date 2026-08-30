import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

const publicApiValueExports = [
  "AIWIKI_PUBLIC_API_VERSION",
  "buildCapsuleContext",
  "buildCapsules",
  "buildContext",
  "buildGraphContext",
  "buildHealthReport",
  "buildRelationshipGraph",
  "createAiwikiCli",
  "defaultLifecycle",
  "discoverArtifacts",
  "ingestFile",
  "ingestPayload",
  "inspectRelationshipGraph",
  "isAnswerSafeByDefault",
  "isRelationshipType",
  "lifecycleFromFrontmatter",
  "lifecyclePenalty",
  "lifecycleToFrontmatter",
  "lifecycleWarnings",
  "lintWorkspace",
  "readArtifact",
  "readRelationshipGraph",
  "relationshipsFromFrontmatter",
  "relationshipsToFrontmatter",
  "renderCapsule",
  "renderCapsuleQuery",
  "resolveCapsule",
  "resolveWorkspace",
  "showCapsule",
  "validateRelationships"
] as const;

const internalPublicApiSymbols = ["runCli", "resolveRoot", "extensionArgv", "createCoreCommandRegistry"] as const;

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
      "dist/src/public/contracts.d.ts",
      "docs/schema/aiwiki.run.v2.schema.json",
      "docs/schema/README.md",
      "docs/schema/README.zh-CN.md"
    ]) {
      assert.doesNotThrow(() => readFileSync(path.join(installedRoot, relativePath), "utf8"), relativePath);
    }
    const runSchema = JSON.parse(readFileSync(path.join(installedRoot, "docs", "schema", "aiwiki.run.v2.schema.json"), "utf8")) as { $id?: string; allOf?: unknown[] };
    assert.match(runSchema.$id ?? "", /aiwiki\.run\.v2\.schema\.json$/);
    assert.equal(runSchema.allOf?.length, 1);
    for (const index of ["README.md", "README.zh-CN.md"]) assert.match(readFileSync(path.join(installedRoot, "docs", "schema", index), "utf8"), /aiwiki\.run\.v2\.schema\.json/);

    writeFileSync(
      path.join(consumerRoot, "consumer.mjs"),
      `import assert from "node:assert/strict";
import { access, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import * as api from "@itradingai/aiwiki";
import * as contracts from "@itradingai/aiwiki/contracts";

assert.equal(api.AIWIKI_PUBLIC_API_VERSION, "aiwiki.public.v1");
assert.equal(contracts.AIWIKI_PUBLIC_API_VERSION, "aiwiki.public.v1");
const expectedPublicApiValueExports = ${JSON.stringify(publicApiValueExports)};
assert.deepEqual(Object.keys(api).sort(), [...expectedPublicApiValueExports].sort());
for (const name of expectedPublicApiValueExports) {
  if (name !== "AIWIKI_PUBLIC_API_VERSION") assert.equal(typeof api[name], "function", name);
}
for (const name of ${JSON.stringify(internalPublicApiSymbols)}) {
  assert.equal(Object.hasOwn(api, name), false, name + " must remain internal");
}

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
const oversizedFile = path.join(process.cwd(), "oversized.md");
const oversizedWorkspace = path.join(process.cwd(), "oversized-workspace");
await writeFile(oversizedFile, "x".repeat(11 * 1024 * 1024), "utf8");
await assert.rejects(
  api.ingestFile(oversizedWorkspace, oversizedFile),
  (error) => error?.code === "AIWIKI_INGEST_PAYLOAD_TOO_LARGE" && error?.workspaceWritten === false
);
await assert.rejects(access(oversizedWorkspace));
await rm(oversizedFile);
`,
      "utf8"
    );
    run(process.execPath, ["consumer.mjs"], consumerRoot);

    for (const relativePath of [
      "dist/src/app.js",
      "dist/src/cli/command-registry.js",
      "dist/src/cli/commands/core-handlers.js"
    ]) {
      rmSync(path.join(installedRoot, relativePath), { force: true });
    }
    writeFileSync(
      path.join(consumerRoot, "facade-import.mjs"),
      `import assert from "node:assert/strict";
import * as api from "@itradingai/aiwiki";

assert.equal(api.AIWIKI_PUBLIC_API_VERSION, "aiwiki.public.v1");
assert.equal(typeof api.createAiwikiCli, "function");
`,
      "utf8"
    );
    run(process.execPath, ["facade-import.mjs"], consumerRoot);

    writeFileSync(
      path.join(consumerRoot, "consumer.ts"),
      `import {
  AIWIKI_PUBLIC_API_VERSION,
  createAiwikiCli,
  type AiwikiArtifact,
  type AiwikiCli,
  type AiwikiCliStreams,
  type CapsuleContextResult,
  type CapsuleQueryOptions,
  type ConfidenceLevel,
  type ContextFilters,
  type ContextResult,
  type FrontmatterValue,
  type GraphContextOptions,
  type GraphContextResult,
  type GraphEdgeOrigin,
  type HealthReport,
  type WrittenHealthReport,
  type IngestResult,
  type KnowledgeLifecycle,
  type KnowledgeStatus,
  type LintReport,
  type RelationshipGraph,
  type RelationshipGraphArtifactNode,
  type RelationshipGraphCapsuleNode,
  type RelationshipGraphEdge,
  type RelationshipGraphNode,
  type RelationshipGraphRead,
  type RelationshipGraphState,
  type RelationshipGraphStatus,
  type RelationshipGraphSummary,
  type RelationshipType,
  type ShowCapsuleOptions,
  type SourceCapsule,
  type Staleness,
  type TypedRelationship,
  type UnresolvedRelationshipGraphEdge
} from "@itradingai/aiwiki";
import type {
  AiwikiArtifact as ContractArtifact,
  ContextResult as ContractContextResult,
  WrittenHealthReport as ContractWrittenHealthReport
} from "@itradingai/aiwiki/contracts";

type NewSdkTypes = [
  CapsuleQueryOptions, ShowCapsuleOptions, HealthReport, WrittenHealthReport, KnowledgeStatus, ConfidenceLevel, Staleness,
  RelationshipType, TypedRelationship, GraphContextOptions, GraphContextResult, FrontmatterValue,
  RelationshipGraph, RelationshipGraphState, RelationshipGraphStatus, RelationshipGraphRead,
  RelationshipGraphNode, RelationshipGraphArtifactNode, RelationshipGraphCapsuleNode,
  RelationshipGraphEdge, UnresolvedRelationshipGraphEdge, RelationshipGraphSummary, GraphEdgeOrigin,
  ContractWrittenHealthReport
];

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
const newSdkTypes: NewSdkTypes | undefined = undefined;
void [apiVersion, cli, streams, artifact, capsule, lifecycle, filters, context, ingest, lint, newSdkTypes];
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
