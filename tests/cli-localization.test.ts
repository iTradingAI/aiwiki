import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { runCli } from "../src/app.js";
import { initWorkspace } from "../src/workspace.js";
import { MemoryWritable, tempRoot } from "./helpers.js";

type CliResult = Readonly<{ code: number; stdout: string; stderr: string }>;

async function invoke(args: string[]): Promise<CliResult> {
  const stdout = new MemoryWritable();
  const stderr = new MemoryWritable();
  const code = await runCli(args, { stdout, stderr });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("help locale precedence is --lang over AIWIKI_LANG over deterministic zh-CN", { concurrency: false }, async () => {
  const previous = process.env.AIWIKI_LANG;
  try {
    delete process.env.AIWIKI_LANG;
    const fallback = await invoke(["--help"]);
    assert.equal(fallback.code, 0);
    assert.match(fallback.stdout, /^用法:$/m);
    assert.doesNotMatch(fallback.stdout, /^Usage:$/m);

    process.env.AIWIKI_LANG = "en";
    const environment = await invoke(["--help"]);
    assert.equal(environment.code, 0);
    assert.match(environment.stdout, /^Usage:$/m);
    assert.doesNotMatch(environment.stdout, /^用法:$/m);

    const flagOverride = await invoke(["--help", "--lang", "zh-CN"]);
    assert.equal(flagOverride.code, 0);
    assert.match(flagOverride.stdout, /^用法:$/m);
    assert.doesNotMatch(flagOverride.stdout, /^Usage:$/m);

    process.env.AIWIKI_LANG = "de";
    const englishOverride = await invoke(["--lang=en", "--help"]);
    assert.equal(englishOverride.code, 0);
    assert.match(englishOverride.stdout, /^Usage:$/m);
    assert.doesNotMatch(englishOverride.stdout, /^用法:$/m);
  } finally {
    restoreEnvironment("AIWIKI_LANG", previous);
  }
});

test("unsupported help locales fail before routing with an actionable error", { concurrency: false }, async () => {
  const previous = process.env.AIWIKI_LANG;
  try {
    process.env.AIWIKI_LANG = "en";
    const unsupportedFlag = await invoke(["--help", "--lang", "fr"]);
    assert.equal(unsupportedFlag.code, 1);
    assert.equal(unsupportedFlag.stdout, "");
    assert.match(unsupportedFlag.stderr, /^Error: Unsupported help locale "fr"\. Use --lang en or --lang zh-CN\.$/m);

    delete process.env.AIWIKI_LANG;
    const missingFlagValue = await invoke(["--help", "--lang"]);
    assert.equal(missingFlagValue.code, 1);
    assert.match(missingFlagValue.stderr, /不支持的帮助语言 \(missing\).*--lang en.*--lang zh-CN/);

    process.env.AIWIKI_LANG = "de";
    const unsupportedEnvironment = await invoke(["--help"]);
    assert.equal(unsupportedEnvironment.code, 1);
    assert.match(unsupportedEnvironment.stderr, /不支持的帮助语言 "de".*--lang en.*--lang zh-CN/);
  } finally {
    restoreEnvironment("AIWIKI_LANG", previous);
  }
});

test("help locale ignores workspace content language and OS locale", { concurrency: false }, async () => {
  const root = await tempRoot("aiwiki-cli-help-content-locale");
  const previousAiwiki = process.env.AIWIKI_LANG;
  const previousLang = process.env.LANG;
  const previousLcAll = process.env.LC_ALL;
  try {
    await initWorkspace(root);
    const configPath = path.join(root, "aiwiki.yaml");
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("language: zh-CN", "language: en"), "utf8");
    delete process.env.AIWIKI_LANG;
    process.env.LANG = "en_US.UTF-8";
    process.env.LC_ALL = "en_US.UTF-8";

    const result = await invoke(["--help", "--path", root]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /^用法:$/m);
    assert.doesNotMatch(result.stdout, /^Usage:$/m);
  } finally {
    restoreEnvironment("AIWIKI_LANG", previousAiwiki);
    restoreEnvironment("LANG", previousLang);
    restoreEnvironment("LC_ALL", previousLcAll);
    await rm(root, { recursive: true, force: true });
  }
});

test("representative subcommand help and routing errors follow the selected locale", async () => {
  const root = await tempRoot("aiwiki-cli-help-routing");
  try {
    await initWorkspace(root);
    const chineseHelp = await invoke(["index", "--help", "--lang", "zh-CN"]);
    const englishHelp = await invoke(["index", "--help", "--lang", "en"]);
    assert.equal(chineseHelp.code, 0);
    assert.equal(englishHelp.code, 0);
    assert.match(chineseHelp.stdout, /检查或重建/);
    assert.doesNotMatch(chineseHelp.stdout, /Inspect or rebuild/);
    assert.match(englishHelp.stdout, /Inspect or rebuild/);
    assert.doesNotMatch(englishHelp.stdout, /检查或重建/);

    const chineseError = await invoke(["not-a-command", "--path", root, "--lang", "zh-CN"]);
    const englishError = await invoke(["not-a-command", "--path", root, "--lang", "en"]);
    assert.equal(chineseError.code, 1);
    assert.equal(englishError.code, 1);
    assert.match(chineseError.stderr, /^错误: 未知命令: not-a-command$/m);
    assert.match(englishError.stderr, /^Error: Unknown command: not-a-command$/m);

    const chineseQueryError = await invoke(["context", "--path", root, "--lang", "zh-CN"]);
    const englishQueryError = await invoke(["context", "--path", root, "--lang", "en"]);
    assert.equal(chineseQueryError.code, 1);
    assert.equal(englishQueryError.code, 1);
    assert.match(chineseQueryError.stderr, /^错误: 请提供查询主题。$/m);
    assert.match(englishQueryError.stderr, /^Error: Please provide a query topic\.$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JSON command output is byte invariant across help locales", async () => {
  const root = await tempRoot("aiwiki-cli-help-json");
  try {
    await initWorkspace(root);
    const build = await invoke(["index", "build", "--json", "--path", root, "--lang", "zh-CN"]);
    assert.equal(build.code, 0);

    const chinese = await invoke(["index", "status", "--json", "--path", root, "--lang", "zh-CN"]);
    const english = await invoke(["index", "status", "--json", "--path", root, "--lang", "en"]);
    assert.equal(chinese.code, 0);
    assert.equal(english.code, 0);
    assert.equal(chinese.stderr, "");
    assert.equal(english.stderr, "");
    assert.equal(english.stdout, chinese.stdout);
    assert.deepEqual(JSON.parse(english.stdout), JSON.parse(chinese.stdout));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
