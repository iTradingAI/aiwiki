import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { flagBool, flagString, parseArgs } from "./args.js";
import { ingestFile, ingestPayload } from "./ingest.js";
import { CliError, CliStreams, writeLine } from "./output.js";
import {
  confirmInit,
  directorySummary,
  doctor,
  exists,
  initWorkspace,
  promptForSetup,
  promptForInitPath,
  readConfig,
  resolveWorkspace,
  setDefaultWorkspace,
  statusSummary
} from "./workspace.js";

export const VERSION = "0.2.6";

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
      writeLine(streams.stdout, `AIWiki 已初始化: ${result.root}`);
      writeLine(streams.stdout, `配置: ${result.createdConfig ? "已创建" : "已保留"}`);
      writeLine(streams.stdout, `新建目录数: ${result.createdDirs.length}`);
      writeLine(streams.stdout, `新建数据库文件数: ${result.seededFiles.filter((file) => file.created).length}`);
      writeLine(streams.stdout, `默认知识库: ${defaultConfig.defaultPath}`);
      writeLine(streams.stdout, `用户配置: ${defaultConfig.configPath}`);
      writeLine(streams.stdout, "Obsidian 入口: dashboards/AIWiki Home.md");
      writeLine(streams.stdout, "下一步: 运行 `aiwiki agent install`，把 AIWiki 安装到宿主 Agent。");
      writeLine(streams.stdout, "Agent 设置完成后: 向 Agent 发送 `入库 <url>`");
      return 0;
    }

    if (command === "agent" && subcommand === "install") {
      const result = await installAgentSkill({
        agentId: flagString(args, "agent"),
        yes: flagBool(args, "yes"),
        force: flagBool(args, "force"),
        streams
      });
      if (result) {
        writeLine(streams.stdout, `已安装: ${result.name}`);
        writeLine(streams.stdout, `目标路径: ${result.target}`);
        writeLine(streams.stdout, `下一步: 重启或重新加载 ${result.name}，然后发送 \`入库 <url>\`。`);
      }
      return 0;
    }

    if (command === "agent" && (subcommand === "list" || !subcommand)) {
      printAgentList(streams.stdout, await discoverAgentTargets());
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
      writeLine(streams.stdout, `AIWiki 已初始化: ${result.root}`);
      writeLine(streams.stdout, `配置: ${result.createdConfig ? "已创建" : "已保留"}`);
      writeLine(streams.stdout, `新建目录数: ${result.createdDirs.length}`);
      writeLine(streams.stdout, `新建数据库文件数: ${result.seededFiles.filter((file) => file.created).length}`);
      writeLine(streams.stdout, "Obsidian 入口: dashboards/AIWiki Home.md");
      if (flagBool(args, "set-default")) {
        const defaultConfig = await setDefaultWorkspace(result.root);
        writeLine(streams.stdout, `默认知识库: ${defaultConfig.defaultPath}`);
        writeLine(streams.stdout, `用户配置: ${defaultConfig.configPath}`);
      }
      return 0;
    }

    if (command === "config" && subcommand === "show") {
      const root = await resolveWorkspace(flagString(args, "path"));
      const config = await readConfig(root);
      const summary = await directorySummary(root);
      writeLine(streams.stdout, `知识库路径: ${root}`);
      writeLine(streams.stdout, `产品: ${config.product}`);
      writeLine(streams.stdout, `配置版本: ${config.schemaVersion}`);
      writeLine(streams.stdout, `创建时间: ${config.createdAt}`);
      writeLine(streams.stdout, `目录状态: ${summary.present} 个正常，${summary.missing.length} 个缺失`);
      if (summary.missing.length) {
        writeLine(streams.stdout, `缺失目录: ${summary.missing.join(", ")}`);
      }
      return 0;
    }

    if (command === "doctor") {
      const root = await resolveWorkspace(flagString(args, "path"));
      const checks = await doctor(root);
      let failed = false;
      for (const check of checks) {
        writeLine(streams.stdout, `${doctorStatusText(check.status)}: ${check.name}`);
        if (check.status !== "ok") {
          failed = true;
        }
      }
      if (failed) {
        writeLine(streams.stdout, `修复命令: aiwiki setup --path "${root}" --yes`);
        return 1;
      }
      return 0;
    }

    if (command === "status") {
      const root = await resolveWorkspace(flagString(args, "path"));
      const summary = await statusSummary(root);
      writeLine(streams.stdout, `知识库路径: ${summary.root}`);
      writeLine(streams.stdout, `处理次数: ${summary.runCount}`);
      writeLine(streams.stdout, `失败次数: ${summary.failedCount}`);
      writeLine(streams.stdout, `最近处理: ${summary.lastRunId ?? "无"}`);
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
      writeLine(streams.stderr, `错误: ${error.message}`);
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeLine(streams.stderr, `错误: ${message}`);
    return 1;
  }
}

function printHelp(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki");
  writeLine(stream, "");
  writeLine(stream, "用法:");
  writeLine(stream, "  aiwiki setup");
  writeLine(stream, "  aiwiki setup --path <path> --yes");
  writeLine(stream, "  aiwiki agent list");
  writeLine(stream, "  aiwiki agent install");
  writeLine(stream, "  aiwiki agent install --agent codex --yes");
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

type AgentTarget = {
  id: string;
  name: string;
  detected: boolean;
  installable: boolean;
  kind: "skill" | "command" | "prompt";
  source?: string;
  target?: string;
  note: string;
};

async function discoverAgentTargets(): Promise<AgentTarget[]> {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const skillSource = path.join(packageRoot, "skill", "SKILL.md");
  const promptSource = path.join(packageRoot, "docs", "AGENT_HANDOFF.md");
  const codexHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), ".codex");
  const qclawHome = process.env.QCLAW_HOME ? path.resolve(process.env.QCLAW_HOME) : path.join(os.homedir(), ".qclaw");
  const openclawHome = process.env.OPENCLAW_HOME ? path.resolve(process.env.OPENCLAW_HOME) : path.join(os.homedir(), ".openclaw");
  const claudeHome = process.env.CLAUDE_HOME ? path.resolve(process.env.CLAUDE_HOME) : path.join(os.homedir(), ".claude");
  const opencodeHome = process.env.OPENCODE_HOME ? path.resolve(process.env.OPENCODE_HOME) : path.join(os.homedir(), ".opencode");
  const hermesHome = process.env.HERMES_HOME ? path.resolve(process.env.HERMES_HOME) : path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "hermes");

  return [
    {
      id: "codex",
      name: "Codex",
      detected: await exists(codexHome),
      installable: true,
      kind: "skill",
      source: skillSource,
      target: path.join(codexHome, "skills", "aiwiki", "SKILL.md"),
      note: "安装到 Codex 用户 skills 目录。"
    },
    {
      id: "qclaw",
      name: "QClaw",
      detected: await exists(qclawHome),
      installable: true,
      kind: "skill",
      source: skillSource,
      target: path.join(qclawHome, "skills", "aiwiki", "SKILL.md"),
      note: "安装到本机 QClaw skills 目录。"
    },
    {
      id: "openclaw",
      name: "OpenClaw",
      detected: await exists(openclawHome),
      installable: true,
      kind: "skill",
      source: skillSource,
      target: path.join(openclawHome, "workspace", "skills", "aiwiki", "SKILL.md"),
      note: "安装到 OpenClaw workspace skills 目录。"
    },
    {
      id: "claude",
      name: "Claude Code",
      detected: await exists(claudeHome),
      installable: true,
      kind: "command",
      source: promptSource,
      target: path.join(claudeHome, "commands", "aiwiki.md"),
      note: "安装为 Claude Code slash-command 提示文件。"
    },
    {
      id: "opencode",
      name: "opencode",
      detected: await exists(opencodeHome),
      installable: false,
      kind: "prompt",
      note: "已检测到，但暂未确认稳定的用户提示目录。请先使用 aiwiki prompt agent。"
    },
    {
      id: "hermes",
      name: "Hermes",
      detected: await exists(hermesHome),
      installable: false,
      kind: "prompt",
      note: "已检测到，但暂未确认稳定的 skill 目录。请先使用 aiwiki prompt agent。"
    }
  ];
}

function printAgentList(stream: NodeJS.WritableStream, targets: AgentTarget[]): void {
  writeLine(stream, "AIWiki 宿主 Agent 目标");
  for (const target of targets) {
    writeLine(stream, `${target.id}: ${target.name} | 已检测=${target.detected ? "是" : "否"} | 可安装=${target.installable ? "是" : "否"} | ${target.note}`);
    if (target.target) {
      writeLine(stream, `  目标路径: ${target.target}`);
    }
  }
}

async function installAgentSkill(options: { agentId?: string; yes: boolean; force: boolean; streams: CliStreams }) {
  const targets = await discoverAgentTargets();
  const installable = targets.filter((target) => target.detected && target.installable);
  let selected = options.agentId ? targets.find((target) => target.id === options.agentId) : undefined;

  if (!selected && options.agentId) {
      throw new CliError(`未知宿主 Agent: ${options.agentId}`);
  }

  if (!selected) {
    if (installable.length === 0) {
      printAgentList(options.streams.stdout, targets);
      throw new CliError("未检测到可自动安装的宿主 Agent。请运行 aiwiki prompt agent，并手动粘贴对接协议。");
    }

    printAgentList(options.streams.stdout, targets);
    const answer = await askQuestion(options.streams, "请输入要安装的目标 id 或序号: ");
    const trimmed = answer.trim();
    const byNumber = /^\d+$/.test(trimmed) ? installable[Number(trimmed) - 1] : undefined;
    selected = byNumber ?? targets.find((target) => target.id === trimmed);
  }

  if (!selected) {
    writeLine(options.streams.stdout, "已取消。");
    return undefined;
  }

  if (!selected.installable) {
    throw new CliError(`已检测到 ${selected.name}，但暂未配置自动安装。请运行 aiwiki prompt agent。`);
  }
  if (!selected.source || !selected.target) {
    throw new CliError(`${selected.name} 没有可用安装目标。`);
  }

  if (!options.yes) {
    writeLine(options.streams.stdout, `将 AIWiki 安装到 ${selected.name}:`);
    writeLine(options.streams.stdout, `  来源: ${selected.source}`);
    writeLine(options.streams.stdout, `  目标路径: ${selected.target}`);
    const answer = await askQuestion(options.streams, "确认安装？输入 y 继续: ");
    if (answer.trim().toLowerCase() !== "y") {
      writeLine(options.streams.stdout, "已取消。");
      return undefined;
    }
  }

  await copyInstallFile(selected.source, selected.target, options.force);
  return selected;
}

async function askQuestion(streams: CliStreams, question: string) {
  if (!process.stdin.isTTY) {
    throw new CliError("交互式 Agent 安装需要终端环境。脚本中请使用 --agent <id> --yes。");
  }
  const rl = createInterface({ input: process.stdin, output: streams.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function copyInstallFile(source: string, target: string, force: boolean) {
  await fs.access(source);
  if (!force && (await exists(target))) {
    throw new CliError(`目标文件已存在: ${target}。如需覆盖，请加 --force。`);
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

function printAgentPrompt(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki Agent 中文提示");
  writeLine(stream, "");
  writeLine(stream, "当用户发送以下触发语时，请自动执行 AIWiki 入库流程：");
  writeLine(stream, "- 入库 <url>");
  writeLine(stream, "- 收录 <url>");
  writeLine(stream, "- 存一下 <url>");
  writeLine(stream, "- aiwiki <url>");
  writeLine(stream, "");
  writeLine(stream, "如果当前会话被用户明确设定为 AIWiki 入库助手，则用户只发送 URL 也默认触发入库。普通会话中不要把所有 URL 都自动入库。");
  writeLine(stream, "");
  writeLine(stream, "流程：读取网页正文；生成 aiwiki.agent_payload.v1；通过 stdin 调用 `aiwiki ingest-agent --stdin`；读取 CLI 输出；只向用户汇报 ingested、recorded、fit_score、fit_level、summary、run_dir、processing_summary、source_card、dashboard、review_queue。");
  writeLine(stream, "回复措辞：成功时说“已加入 Obsidian 审阅队列”，并给出资料卡、处理记录、Obsidian 入口和待审队列。Dataview 是可选增强，不要替用户安装插件或修改 .obsidian。");
  writeLine(stream, "");
  writeLine(stream, "禁止：让用户保存 payload；让用户每次输入 --path；声称 AIWiki CLI 负责网页抓取。");
}

function doctorStatusText(status: "ok" | "missing" | "permission error") {
  if (status === "ok") {
    return "正常";
  }
  if (status === "missing") {
    return "缺失";
  }
  return "权限错误";
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
  writeLine(stream, `dashboard: ${result.agentReport.keyFiles.dashboard}`);
  writeLine(stream, `review_queue: ${result.agentReport.keyFiles.reviewQueue}`);
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
