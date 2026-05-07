import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { flagBool, flagString, parseArgs } from "./args.js";
import { ingestFile, ingestPayload } from "./ingest.js";
import { CliError, CliStreams, writeLine } from "./output.js";
import {
  confirmInit,
  directorySummary,
  doctor,
  initWorkspace,
  promptForSetup,
  promptForInitPath,
  readConfig,
  resolveWorkspace,
  setDefaultWorkspace,
  statusSummary
} from "./workspace.js";

export const VERSION = "0.1.3";

export async function runCli(argv: string[], streams: CliStreams = { stdout: process.stdout, stderr: process.stderr }) {
  try {
    const args = parseArgs(argv);
    const [command, subcommand] = args.positional;

    if (args.flags.has("version") || command === "version" || command === "-v") {
      writeLine(streams.stdout, `aiwiki ${VERSION}`);
      return 0;
    }
    if (args.flags.has("help") || !command || command === "help" || command === "-h") {
      printHelp(streams.stdout);
      return 0;
    }

    if (command === "setup") {
      const setup = await promptForSetup({ rootPath: flagString(args, "path"), yes: flagBool(args, "yes") });
      if (!setup.confirmed) {
        writeLine(streams.stdout, "已取消。");
        return 0;
      }
      const result = await initWorkspace(setup.rootPath);
      const defaultConfig = await setDefaultWorkspace(result.root);
      writeLine(streams.stdout, `AIWiki initialized: ${result.root}`);
      writeLine(streams.stdout, `config: ${result.createdConfig ? "created" : "kept"}`);
      writeLine(streams.stdout, `directories created: ${result.createdDirs.length}`);
      writeLine(streams.stdout, `default_path: ${defaultConfig.defaultPath}`);
      writeLine(streams.stdout, `user_config: ${defaultConfig.configPath}`);
      writeLine(streams.stdout, "next: run `aiwiki skill install` for Codex, or `aiwiki prompt agent` for other host Agents.");
      writeLine(streams.stdout, "after Agent setup: send `入库 <url>` to your Agent");
      return 0;
    }

    if (command === "skill" && subcommand === "install") {
      const result = await installCodexSkill(flagBool(args, "force"));
      writeLine(streams.stdout, `skill: aiwiki`);
      writeLine(streams.stdout, `target: ${result.target}`);
      writeLine(streams.stdout, `status: ${result.updated ? "updated" : "installed"}`);
      writeLine(streams.stdout, "next: restart or reload your Agent, then send `入库 <url>`.");
      return 0;
    }

    if (command === "prompt" && (subcommand === "agent" || !subcommand)) {
      printAgentPrompt(streams.stdout);
      return 0;
    }

    if (command === "init") {
      let rootPath = flagString(args, "path");
      if (!rootPath) {
        rootPath = await promptForInitPath();
      }
      if (!flagBool(args, "yes")) {
        const confirmed = await confirmInit(rootPath);
        if (!confirmed) {
          writeLine(streams.stdout, "已取消。");
          return 0;
        }
      }
      const result = await initWorkspace(rootPath);
      writeLine(streams.stdout, `AIWiki initialized: ${result.root}`);
      writeLine(streams.stdout, `config: ${result.createdConfig ? "created" : "kept"}`);
      writeLine(streams.stdout, `directories created: ${result.createdDirs.length}`);
      if (flagBool(args, "set-default")) {
        const defaultConfig = await setDefaultWorkspace(result.root);
        writeLine(streams.stdout, `default_path: ${defaultConfig.defaultPath}`);
        writeLine(streams.stdout, `user_config: ${defaultConfig.configPath}`);
      }
      return 0;
    }

    if (command === "config" && subcommand === "show") {
      const root = await resolveWorkspace(flagString(args, "path"));
      const config = await readConfig(root);
      const summary = await directorySummary(root);
      writeLine(streams.stdout, `path: ${root}`);
      writeLine(streams.stdout, `product: ${config.product}`);
      writeLine(streams.stdout, `schema_version: ${config.schemaVersion}`);
      writeLine(streams.stdout, `created_at: ${config.createdAt}`);
      writeLine(streams.stdout, `directories: ${summary.present} ok, ${summary.missing.length} missing`);
      if (summary.missing.length) {
        writeLine(streams.stdout, `missing: ${summary.missing.join(", ")}`);
      }
      return 0;
    }

    if (command === "doctor") {
      const root = await resolveWorkspace(flagString(args, "path"));
      const checks = await doctor(root);
      let failed = false;
      for (const check of checks) {
        writeLine(streams.stdout, `${check.status}: ${check.name}`);
        if (check.status !== "ok") {
          failed = true;
        }
      }
      if (failed) {
        writeLine(streams.stdout, `repair: aiwiki setup --path "${root}" --yes`);
        return 1;
      }
      return 0;
    }

    if (command === "status") {
      const root = await resolveWorkspace(flagString(args, "path"));
      const summary = await statusSummary(root);
      writeLine(streams.stdout, `path: ${summary.root}`);
      writeLine(streams.stdout, `run_count: ${summary.runCount}`);
      writeLine(streams.stdout, `failed_count: ${summary.failedCount}`);
      writeLine(streams.stdout, `last_run: ${summary.lastRunId ?? "none"}`);
      return 0;
    }

    if (command === "ingest-agent") {
      const root = await resolveWorkspace(flagString(args, "path"));
      const payloadPath = flagString(args, "payload");
      const useStdin = flagBool(args, "stdin");
      if (!payloadPath && !useStdin) {
        throw new CliError("请提供 --payload <file> 或 --stdin。");
      }
      const rawText = payloadPath ? await fs.readFile(payloadPath, "utf8") : await readStdin();
      const payload = parseJson(rawText);
      const result = await ingestPayload(root, payload);
      printIngestResult(streams.stdout, result);
      return 0;
    }

    if (command === "ingest-file") {
      const root = await resolveWorkspace(flagString(args, "path"));
      const file = flagString(args, "file") ?? args.positional[1];
      if (!file) {
        throw new CliError("请提供 --file <file>。");
      }
      const result = await ingestFile(root, path.resolve(file));
      printIngestResult(streams.stdout, result);
      return 0;
    }

    if (command === "ingest-url") {
      const contentFile = flagString(args, "content-file");
      if (!contentFile) {
        throw new CliError("AIWiki CLI 不抓取网页。请提供 --content-file <file>，让宿主 Agent 或用户先提供正文。");
      }
      const url = args.positional[1];
      if (!url) {
        throw new CliError("请提供 URL。");
      }
      const root = await resolveWorkspace(flagString(args, "path"));
      const content = await fs.readFile(contentFile, "utf8");
      const result = await ingestPayload(root, {
        schema_version: "aiwiki.agent_payload.v1",
        source: {
          kind: "url",
          url,
          title: path.basename(contentFile),
          content_format: "markdown",
          content,
          fetcher: "content-file",
          fetch_status: "ok",
          captured_at: new Date().toISOString()
        },
        request: {
          mode: "ingest",
          outputs: ["source_card", "creative_assets", "topics", "draft_outline", "processing_summary"],
          language: "zh-CN"
        }
      });
      printIngestResult(streams.stdout, result);
      return 0;
    }

    throw new CliError(`未知命令: ${command}`);
  } catch (error) {
    if (error instanceof CliError) {
      writeLine(streams.stderr, `error: ${error.message}`);
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeLine(streams.stderr, `error: ${message}`);
    return 1;
  }
}

function printHelp(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki");
  writeLine(stream, "");
  writeLine(stream, "Usage:");
  writeLine(stream, "  aiwiki setup");
  writeLine(stream, "  aiwiki setup --path <path> --yes");
  writeLine(stream, "  aiwiki skill install");
  writeLine(stream, "  aiwiki prompt agent");
  writeLine(stream, "  aiwiki doctor");
  writeLine(stream, "  aiwiki status");
  writeLine(stream, "  aiwiki ingest-agent --stdin");
  writeLine(stream, "  aiwiki ingest-file --file <file>");
  writeLine(stream, "  aiwiki init --path <path> --yes --set-default");
  writeLine(stream, "  aiwiki config show");
  writeLine(stream, "  aiwiki ingest-agent --payload <file>");
  writeLine(stream, "  aiwiki ingest-url <url> --content-file <file>");
}

async function installCodexSkill(force: boolean) {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const source = path.join(packageRoot, "skill", "SKILL.md");
  const codexHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), ".codex");
  const targetDir = path.join(codexHome, "skills", "aiwiki");
  const target = path.join(targetDir, "SKILL.md");

  try {
    await fs.access(source);
  } catch {
    throw new CliError(`AIWiki skill source not found: ${source}`);
  }

  let existed = false;
  try {
    await fs.access(target);
    existed = true;
  } catch {
    existed = false;
  }

  if (existed && !force) {
    throw new CliError(`AIWiki skill already exists: ${target}. Use --force to overwrite.`);
  }

  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(source, target);
  return { target, updated: existed };
}

function printAgentPrompt(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki Agent Prompt");
  writeLine(stream, "");
  writeLine(stream, "当用户发送以下触发语时，请自动执行 AIWiki 入库流程：");
  writeLine(stream, "- 入库 <url>");
  writeLine(stream, "- 收录 <url>");
  writeLine(stream, "- 存一下 <url>");
  writeLine(stream, "- aiwiki <url>");
  writeLine(stream, "");
  writeLine(stream, "如果当前会话被用户明确设定为 AIWiki 入库助手，则用户只发送 URL 也默认触发入库。普通会话中不要把所有 URL 都自动入库。");
  writeLine(stream, "");
  writeLine(stream, "流程：读取网页正文；生成 aiwiki.agent_payload.v1；通过 stdin 调用 `aiwiki ingest-agent --stdin`；读取 CLI 输出；只向用户汇报 ingested、recorded、fit_score、fit_level、summary、run_dir、processing_summary。");
  writeLine(stream, "");
  writeLine(stream, "禁止：让用户保存 payload；让用户每次输入 --path；声称 AIWiki CLI 负责网页抓取。");
}

function printIngestResult(stream: NodeJS.WritableStream, result: Awaited<ReturnType<typeof ingestPayload>>): void {
  writeLine(stream, `ingested: ${result.agentReport.ingested ? "yes" : "no"}`);
  writeLine(stream, `recorded: ${result.agentReport.recorded ? "yes" : "no"}`);
  writeLine(stream, `fetch_status: ${result.agentReport.fetchStatus}`);
  writeLine(stream, `fit_score: ${result.agentReport.fitScore}`);
  writeLine(stream, `fit_level: ${result.agentReport.fitLevel}`);
  writeLine(stream, `source_title: ${result.agentReport.sourceTitle}`);
  if (result.agentReport.sourceUrl) {
    writeLine(stream, `source_url: ${result.agentReport.sourceUrl}`);
  }
  writeLine(stream, `summary: ${result.agentReport.summary}`);
  writeLine(stream, `run_id: ${result.runId}`);
  writeLine(stream, `run_dir: ${result.runDir}`);
  writeLine(stream, `files: ${result.generatedFiles.length}`);
  writeLine(stream, `processing_summary: ${result.agentReport.keyFiles.processingSummary}`);
  if (result.agentReport.keyFiles.sourceCard) {
    writeLine(stream, `source_card: ${result.agentReport.keyFiles.sourceCard}`);
  }
  if (result.agentReport.keyFiles.draftOutline) {
    writeLine(stream, `draft_outline: ${result.agentReport.keyFiles.draftOutline}`);
  }
  writeLine(stream, `warnings: ${result.warnings.length}`);
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new CliError("payload must be valid JSON");
  }
}
