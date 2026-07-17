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
      "examples/extensions/local-quality-extension/index.mjs"
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

  for (const text of [schema, schemaChinese]) {
    assert.match(text, /aiwiki\.extension\.v1/);
    assert.match(text, /CORE-0405/);
    assert.match(text, /CORE-0407/);
  }
  for (const text of [host, hostChinese]) {
    assert.match(text, /aiwiki plugin list/);
    assert.match(text, /aiwiki plugin add/);
    assert.match(text, /aiwiki plugin enable/);
    assert.match(text, /aiwiki\.extension\.v1/);
    assert.match(text, /CORE-0407/);
  }
  assert.match(host, /not a sandbox/i);
  assert.match(hostChinese, /不是.*sandbox/);
  assert.match(schema, /not a sandbox/i);
  assert.match(schemaChinese, /不是.*sandbox/);
  for (const text of [schemaIndex, schemaIndexChinese]) {
    assert.match(text, /aiwiki\.extension\.v1/);
    assert.match(text, /CORE-0405/);
  }
  assert.doesNotMatch(schemaIndex, /does not provide an Extension API/i);
  assert.doesNotMatch(schemaIndexChinese, /不提供 Extension API/);
  for (const text of [release, releaseChinese]) {
    assert.match(text, /@itradingai\/aiwiki\/extension-api/);
    assert.match(text, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
  }
  for (const text of [usage, usageChinese, handoff, handoffChinese, skill]) {
    assert.match(text, /CORE-0407/);
    assert.match(text, /CORE-0405/);
    assert.match(text, /aiwiki plugin list/);
    assert.match(text, /aiwiki plugin add/);
    assert.match(text, /aiwiki plugin enable/);
  }
});
