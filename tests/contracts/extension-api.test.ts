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
    throw new Error([
      command + " " + args.join(" ") + " failed with exit " + result.status,
      "stdout:",
      result.stdout,
      "stderr:",
      result.stderr
    ].join("\n"));
  }
  return result.stdout;
}

function runNpm(args: string[], cwd: string): string {
  if (existsSync(npmExecPath)) return run(process.execPath, [npmExecPath, ...args], cwd);
  return run(npmCommand, args, cwd, { shell: false });
}

test("packed package exposes a self-contained extension author API", () => {
  const repositoryRoot = process.cwd();
  const consumerRoot = mkdtempSync(path.join(os.tmpdir(), "aiwiki-extension-api-"));
  try {
    writeFileSync(path.join(consumerRoot, "package.json"), JSON.stringify({ private: true }, null, 2), "utf8");
    const packed = JSON.parse(runNpm(["pack", repositoryRoot, "--json", "--ignore-scripts"], consumerRoot)) as Array<{ filename?: string }>;
    const tarballName = packed[0]?.filename;
    assert.ok(tarballName, "npm pack did not report a tarball filename");
    const tarballPath = path.join(consumerRoot, tarballName);

    runNpm(["install", "--ignore-scripts", "--no-package-lock", tarballPath], consumerRoot);

    const installedRoot = path.join(consumerRoot, "node_modules", "@itradingai", "aiwiki");
    for (const relativePath of [
      "dist/src/extension/api.js",
      "dist/src/extension/api.d.ts",
      "docs/schema/EXTENSION_SCHEMA.md",
      "docs/schema/EXTENSION_SCHEMA.zh-CN.md",
      "docs/schema/EXTENSION_HOST.md",
      "docs/schema/EXTENSION_HOST.zh-CN.md",
      "examples/extensions/local-quality-extension/aiwiki-extension.json",
      "examples/extensions/local-quality-extension/index.mjs",
      "examples/plugins/research-workflow/aiwiki-extension.json",
      "examples/plugins/research-workflow/index.mjs"
    ]) {
      assert.doesNotThrow(() => readFileSync(path.join(installedRoot, relativePath), "utf8"), relativePath);
    }
    const declaration = readFileSync(path.join(installedRoot, "dist/src/extension/api.d.ts"), "utf8");
    assert.doesNotMatch(declaration, /(?:\.\.\/(?:app|artifact|cli|context|lint)|node:(?:child_process|fs))/);

    writeFileSync(path.join(consumerRoot, "consumer.mjs"), [
      'import assert from "node:assert/strict";',
      'import * as api from "@itradingai/aiwiki/extension-api";',
      "",
      "let callbacks = 0;",
      "const extension = api.defineExtension({",
      '  id: "example.extension",',
      '  name: "Example extension",',
      '  version: "0.1.0",',
      "  apiVersion: api.AIWIKI_EXTENSION_API_VERSION,",
      "  commands: [{",
      '    kind: "command",',
      '    id: "example.command",',
      '    path: ["example"],',
      '    summary: "Example command",',
      '    async run() { callbacks += 1; return { exitCode: 0, stdout: "ok" }; }',
      "  }],",
      "  lintRules: [{",
      '    kind: "lint_rule",',
      '    id: "example.lint",',
      '    defaultSeverity: "info",',
      "    async evaluate() { callbacks += 1; return []; }",
      "  }],",
      "  contextProviders: [{",
      '    kind: "context_provider",',
      '    id: "example.context",',
      '    namespace: "example",',
      '    async provide() { callbacks += 1; return { namespace: "example", items: [] }; }',
      "  }],",
      "  artifactGenerators: [{",
      '    kind: "artifact_generator",',
      '    id: "example.generator",',
      '    generates: ["wiki_entry"],',
      "    async generate() { callbacks += 1; return []; }",
      "  }]",
      "});",
      "",
      'assert.equal(api.AIWIKI_EXTENSION_API_VERSION, "aiwiki.extension.v1");',
      'assert.deepEqual(Object.keys(api).sort(), ["AIWIKI_EXTENSION_API_VERSION", "defineExtension"]);',
      'assert.equal(extension.id, "example.extension");',
      "assert.equal(callbacks, 0);",
      'for (const name of ["fetch", "spawn", "exec", "schedule", "connector", "writeFile", "loadExtension", "registerExtension"]) {',
      "  assert.equal(name in api, false, name);",
      "}",
      "for (const specifier of [",
      '  "@itradingai/aiwiki/dist/src/extension/api.js",',
      '  "@itradingai/aiwiki/src/extension/api.js"',
      "]) {",
      '  await assert.rejects(() => import(specifier), (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED");',
      "}",
      ""
    ].join("\n"), "utf8");
    run(process.execPath, ["consumer.mjs"], consumerRoot);

    for (const relativePath of [
      "dist/src/app.js",
      "dist/src/cli",
      "dist/src/context.js",
      "dist/src/context.d.ts",
      "dist/src/lint.js",
      "dist/src/lint.d.ts",
      "dist/src/artifact.js",
      "dist/src/artifact.d.ts"
    ]) {
      rmSync(path.join(installedRoot, relativePath), { recursive: true, force: true });
    }
    writeFileSync(path.join(consumerRoot, "self-contained-import.mjs"), [
      'import assert from "node:assert/strict";',
      'import { AIWIKI_EXTENSION_API_VERSION, defineExtension } from "@itradingai/aiwiki/extension-api";',
      "",
      'assert.equal(AIWIKI_EXTENSION_API_VERSION, "aiwiki.extension.v1");',
      'assert.equal(typeof defineExtension, "function");',
      ""
    ].join("\n"), "utf8");
    run(process.execPath, ["self-contained-import.mjs"], consumerRoot);

    writeFileSync(path.join(consumerRoot, "consumer.ts"), [
      "import {",
      "  AIWIKI_EXTENSION_API_VERSION,",
      "  defineExtension,",
      "  type AiwikiExtension,",
      "  type ExtensionArtifactGenerator,",
      "  type ExtensionArtifactSnapshot,",
      "  type ExtensionCommandDefinition,",
      "  type ExtensionContextProvider,",
      "  type ExtensionLintRule",
      '} from "@itradingai/aiwiki/extension-api";',
      "",
      "const artifact: ExtensionArtifactSnapshot = {",
      '  vaultPath: "05-wiki/source-knowledge/example.md",',
      '  kind: "wiki_entry",',
      '  role: "primary",',
      '  visibility: "primary",',
      '  title: "Example",',
      '  summary: "Example artifact",',
      '  frontmatter: { type: "wiki_entry", tags: ["example"] },',
      '  bodyPreview: "Example preview"',
      "};",
      "const command: ExtensionCommandDefinition = {",
      '  kind: "command",',
      '  id: "example.command",',
      '  path: ["example"],',
      '  summary: "Example command",',
      "  async run({ argv }) {",
      "    return { exitCode: argv.length, json: { accepted: true } };",
      "  }",
      "};",
      "const lintRule: ExtensionLintRule = {",
      '  kind: "lint_rule",',
      '  id: "example.lint",',
      '  defaultSeverity: "warning",',
      "  async evaluate({ artifacts }) {",
      '    return artifacts.length ? [{ severity: "warning", message: "Example lint finding" }] : [];',
      "  }",
      "};",
      "const contextProvider: ExtensionContextProvider = {",
      '  kind: "context_provider",',
      '  id: "example.context",',
      '  namespace: "example",',
      "  async provide({ query }) {",
      '    return { namespace: "example", items: [{ id: query, title: "Example", content: query, sourcePaths: [] }] };',
      "  }",
      "};",
      "const artifactGenerator: ExtensionArtifactGenerator = {",
      '  kind: "artifact_generator",',
      '  id: "example.generator",',
      '  generates: ["wiki_entry"],',
      "  async generate() {",
      '    return [{ suggestedPath: "08-outputs/outlines/example.md", content: "Example output" }];',
      "  }",
      "};",
      "const extension: AiwikiExtension = defineExtension({",
      '  id: "example.extension",',
      '  name: "Example extension",',
      '  version: "0.1.0",',
      "  apiVersion: AIWIKI_EXTENSION_API_VERSION,",
      "  commands: [command],",
      "  lintRules: [lintRule],",
      "  contextProviders: [contextProvider],",
      "  artifactGenerators: [artifactGenerator]",
      "});",
      "void [artifact, extension];",
      ""
    ].join("\n"), "utf8");
    writeFileSync(
      path.join(consumerRoot, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            noEmit: true,
            module: "NodeNext",
            moduleResolution: "NodeNext",
            target: "ES2022"
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

test("Extension API v0.1 never invokes declaration-only callbacks through Core host paths", () => {
  const repositoryRoot = process.cwd();
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "aiwiki-extension-declaration-host-"));
  const extensionRoot = mkdtempSync(path.join(os.tmpdir(), "aiwiki-extension-declaration-fixture-"));
  const cliPath = path.join(repositoryRoot, "dist", "src", "cli.js");
  const callbackCountPath = path.join(extensionRoot, "callback-counts.json");
  const readCallbackCounts = () => JSON.parse(readFileSync(callbackCountPath, "utf8")) as {
    command: number;
    lint: number;
    provider: number;
    generator: number;
  };
  const assertDeclarationOnlyCallbacksWereNotInvoked = () => {
    const counts = readCallbackCounts();
    assert.equal(counts.provider, 0, "context provider callback must remain declaration-only");
    assert.equal(counts.generator, 0, "artifact generator callback must remain declaration-only");
    return counts;
  };

  try {
    writeFileSync(path.join(extensionRoot, "aiwiki-extension.json"), JSON.stringify({
      schema_version: "aiwiki.extension.v1",
      id: "example.declaration-host",
      name: "Declaration Host Fixture",
      version: "0.1.0",
      api_version: "aiwiki.extension.v1",
      entry: "index.mjs"
    }, null, 2), "utf8");
    writeFileSync(callbackCountPath, JSON.stringify({ command: 0, lint: 0, provider: 0, generator: 0 }), "utf8");
    writeFileSync(path.join(extensionRoot, "index.mjs"), [
      'import { readFileSync, writeFileSync } from "node:fs";',
      'const callbackCountPath = new URL("./callback-counts.json", import.meta.url);',
      "function count(name) {",
      '  const counts = JSON.parse(readFileSync(callbackCountPath, "utf8"));',
      "  counts[name] += 1;",
      '  writeFileSync(callbackCountPath, JSON.stringify(counts), "utf8");',
      "}",
      "export default {",
      '  id: "example.declaration-host",',
      '  name: "Declaration Host Fixture",',
      '  version: "0.1.0",',
      '  apiVersion: "aiwiki.extension.v1",',
      "  commands: [{",
      '    kind: "command",',
      '    id: "example.declaration-host.command",',
      '    path: ["fixture", "callbacks"],',
      '    summary: "Exercise the command callback",',
      '    async run() { count("command"); return { exitCode: 0, stdout: "command callback ran" }; }',
      "  }],",
      "  lintRules: [{",
      '    kind: "lint_rule",',
      '    id: "example.declaration-host.lint",',
      '    defaultSeverity: "info",',
      '    async evaluate() { count("lint"); return []; }',
      "  }],",
      "  contextProviders: [{",
      '    kind: "context_provider",',
      '    id: "example.declaration-host.context",',
      '    namespace: "fixture",',
      '    async provide() { count("provider"); return { namespace: "fixture", items: [] }; }',
      "  }],",
      "  artifactGenerators: [{",
      '    kind: "artifact_generator",',
      '    id: "example.declaration-host.generator",',
      '    generates: ["wiki_entry"],',
      '    async generate() { count("generator"); return []; }',
      "  }]",
      "};",
      ""
    ].join("\n"), "utf8");

    run(process.execPath, [cliPath, "init", "--path", workspaceRoot, "--yes"], repositoryRoot);
    run(process.execPath, [cliPath, "plugin", "add", extensionRoot, "--path", workspaceRoot], repositoryRoot);
    run(process.execPath, [cliPath, "plugin", "enable", "example.declaration-host", "--path", workspaceRoot], repositoryRoot);

    const inspection = run(process.execPath, [
      cliPath, "plugin", "inspect", "example.declaration-host", "--json", "--path", workspaceRoot
    ], repositoryRoot);
    assert.match(inspection, /example\.declaration-host/);

    const doctor = run(process.execPath, [
      cliPath, "plugin", "doctor", "--json", "--path", workspaceRoot
    ], repositoryRoot);
    assert.match(doctor, /example\.declaration-host/);

    assert.match(run(process.execPath, [
      cliPath, "fixture", "callbacks", "--path", workspaceRoot
    ], repositoryRoot), /command callback ran/);
    assert.deepEqual(assertDeclarationOnlyCallbacksWereNotInvoked(), { command: 1, lint: 0, provider: 0, generator: 0 });

    JSON.parse(run(process.execPath, [cliPath, "lint", "--json", "--path", workspaceRoot], repositoryRoot));
    assert.deepEqual(assertDeclarationOnlyCallbacksWereNotInvoked(), { command: 1, lint: 1, provider: 0, generator: 0 });
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
    rmSync(extensionRoot, { recursive: true, force: true });
  }
});

test("extension API documentation keeps host and Skill matching boundaries explicit", () => {
  const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), "utf8");
  const schema = read("docs/schema/EXTENSION_SCHEMA.md");
  const schemaChinese = read("docs/schema/EXTENSION_SCHEMA.zh-CN.md");
  const host = read("docs/schema/EXTENSION_HOST.md");
  const hostChinese = read("docs/schema/EXTENSION_HOST.zh-CN.md");
  const schemaIndex = read("docs/schema/README.md");
  const schemaIndexChinese = read("docs/schema/README.zh-CN.md");
  const release = read("docs/RELEASE.md");
  const releaseChinese = read("docs/RELEASE.zh-CN.md");
  const usage = read("docs/USAGE.md");
  const usageChinese = read("docs/USAGE.zh-CN.md");
  const handoff = read("docs/AGENT_HANDOFF.md");
  const handoffChinese = read("docs/AGENT_HANDOFF.zh-CN.md");
  const skill = read("skill/SKILL.md");

  const pluginCommands = [
    "aiwiki plugin list",
    "aiwiki plugin inspect",
    "aiwiki plugin add",
    "aiwiki plugin enable",
    "aiwiki plugin disable",
    "aiwiki plugin remove",
    "aiwiki plugin doctor"
  ];
  for (const text of [schema, schemaChinese, host, hostChinese]) {
    for (const command of pluginCommands) {
      assert.match(text, new RegExp(command));
    }
    assert.match(text, /aiwiki\.extension\.v1/);
  }
  for (const text of [host, hostChinese]) {
    assert.doesNotMatch(text, /CORE-[0-9]+/);
  }
  for (const text of [schema, schemaChinese]) {
    for (const field of ["aiwiki_api", "capabilities", "permissions"]) {
      assert.match(text, new RegExp(field));
    }
  }
  assert.match(host, /not a sandbox/i);
  assert.match(hostChinese, /不是.*sandbox/);
  assert.match(schema, /not a sandbox/i);
  assert.match(schemaChinese, /不是.*sandbox/);
  assert.match(schema, /formal.*deviation.*Extension API 1\.0/is);
  assert.match(schema, /declarations only/i);
  assert.match(schema, /transferred to the follow-up Core documentation and migration task/i);
  assert.match(schema, /implements no signing behavior/i);
  assert.match(schemaChinese, /正式记录相对于源计划 Extension API 1\.0 的偏差/);
  assert.match(schema, /types, interfaces, and documentation remain stable/i);
  assert.match(schema, /requires restoration of the Pro track/i);
  assert.match(schemaChinese, /类型、接口和文档保持稳定/);
  assert.match(schemaChinese, /Pro 赛道恢复后才能重新开放/);
  assert.match(schemaChinese, /只冻结声明/);
  assert.match(schemaChinese, /移交给后续 Core 文档与迁移任务/);
  assert.match(schemaChinese, /不实现任何签名行为/);
  for (const text of [schemaIndex, schemaIndexChinese]) {
    assert.match(text, /aiwiki\.extension\.v1/);
  }
  assert.doesNotMatch(schemaIndex, /does not provide an Extension API/i);
  assert.doesNotMatch(schemaIndexChinese, /不提供 Extension API/);
  for (const text of [release, releaseChinese]) {
    assert.match(text, /@itradingai\/aiwiki\/extension-api/);
    assert.match(text, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
  }
  for (const text of [usage, usageChinese, handoff, handoffChinese, skill]) {
    assert.doesNotMatch(text, /CORE-[0-9]+/);
    assert.match(text, /aiwiki plugin list/);
    assert.match(text, /aiwiki plugin add/);
    assert.match(text, /aiwiki plugin enable/);
  }
});
