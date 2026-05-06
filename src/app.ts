import { promises as fs } from "node:fs";
import path from "node:path";

import { flagBool, flagString, parseArgs } from "./args.js";
import { ingestFile, ingestPayload } from "./ingest.js";
import { CliError, CliStreams, writeLine } from "./output.js";
import {
  confirmInit,
  directorySummary,
  doctor,
  initWorkspace,
  promptForInitPath,
  readConfig,
  resolveWorkspace,
  statusSummary
} from "./workspace.js";

export const VERSION = "0.1.0";

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
        writeLine(streams.stdout, `repair: aiwiki init --path "${root}" --yes`);
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
      writeLine(streams.stdout, `run_id: ${result.runId}`);
      writeLine(streams.stdout, `run_dir: ${result.runDir}`);
      writeLine(streams.stdout, `files: ${result.generatedFiles.length}`);
      return 0;
    }

    if (command === "ingest-file") {
      const root = await resolveWorkspace(flagString(args, "path"));
      const file = flagString(args, "file") ?? args.positional[1];
      if (!file) {
        throw new CliError("请提供 --file <file>。");
      }
      const result = await ingestFile(root, path.resolve(file));
      writeLine(streams.stdout, `run_id: ${result.runId}`);
      writeLine(streams.stdout, `run_dir: ${result.runDir}`);
      writeLine(streams.stdout, `files: ${result.generatedFiles.length}`);
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
      writeLine(streams.stdout, `run_id: ${result.runId}`);
      writeLine(streams.stdout, `run_dir: ${result.runDir}`);
      writeLine(streams.stdout, `files: ${result.generatedFiles.length}`);
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
  writeLine(stream, "  aiwiki init --path <path> --yes");
  writeLine(stream, "  aiwiki config show --path <path>");
  writeLine(stream, "  aiwiki doctor --path <path>");
  writeLine(stream, "  aiwiki status --path <path>");
  writeLine(stream, "  aiwiki ingest-agent --payload <file> --path <path>");
  writeLine(stream, "  aiwiki ingest-agent --stdin --path <path>");
  writeLine(stream, "  aiwiki ingest-file --file <file> --path <path>");
  writeLine(stream, "  aiwiki ingest-url <url> --content-file <file> --path <path>");
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
