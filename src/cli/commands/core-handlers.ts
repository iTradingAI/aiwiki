import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { flagBool, flagString, type ParsedArgs } from "../../args.js";
import { buildCapsuleContext } from "../../capsule-context.js";
import { buildCapsules, capsuleMetrics } from "../../capsule.js";
import type { CapsuleLintOptions } from "../../capsule-lint.js";
import { buildContext, type ContextFilters, type ContextResult } from "../../context.js";
import { evaluateExtensionLintFindings } from "../../extension/host.js";
import { deriveFileTitle, ingestFile, ingestPayload } from "../../ingest.js";
import { attachAppliedSafeFixes, filterLintReport, lintWorkspace, mergeLintIssues, removeEmptyOptionalDirs, renderLintReport, renderLintSummary, writeLintReport, type LintIssue, type LintSeverity } from "../../lint.js";
import { CliError, type CliStreams, writeLine } from "../../output.js";
import { renderCapsuleQuery } from "../../query-view.js";
import { showCapsule } from "../../show.js";
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
} from "../../workspace.js";

import type { CommandContext } from "../command-context.js";
import type { CoreCommandHandlers } from "../command-registry.js";
import { createPluginCommandHandler } from "./plugin.js";

export function createCoreCommandHandlers(): CoreCommandHandlers {

  async function handleVersion(context: CommandContext): Promise<number> {
    const { args, streams } = context;
writeLine(streams.stdout, `aiwiki ${await packageVersion()}`);
      return 0;
  }

  async function handleAgentHelp(context: CommandContext): Promise<number> {
    const { args, streams } = context;
printAgentHelp(streams.stdout);
      return 0;
  }

  async function handleRetrievalHelp(context: CommandContext): Promise<number> {
    const { args, streams } = context;
printContextHelp(streams.stdout);
      return 0;
  }

  async function handleHelp(context: CommandContext): Promise<number> {
    const { args, streams } = context;
printHelp(streams.stdout);
      return 0;
  }

  async function handleSetup(context: CommandContext): Promise<number> {
    const { args, streams } = context;
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
      const guidanceSync = await syncAgentSkills({
        agentId: "workspace",
        workspaceRoot: result.root,
        yes: true,
        dryRun: false,
        json: false,
        streams
      });
      const workspaceGuidance = guidanceSync.results.find((item) => item.id === "workspace");
      if (workspaceGuidance) {
        writeLine(streams.stdout, `知识库根指导: action=${workspaceGuidance.action}`);
        if (workspaceGuidance.backupPath) {
          writeLine(streams.stdout, `知识库根指导备份: ${workspaceGuidance.backupPath}`);
        }
      }
      writeLine(streams.stdout, "Obsidian 入口: dashboards/AIWiki Home.md");
      writeLine(streams.stdout, "本机宿主 Agent skill: 如需同步 Codex/Claude/QClaw/OpenClaw，请运行 `aiwiki agent sync --yes`。");
      writeLine(streams.stdout, "Agent 设置完成后: 让宿主 Agent 提供正文并调用 `aiwiki ingest-agent --stdin`，或运行 `aiwiki ingest-file --file <file>`。");
      return 0;
  }

  async function handleAgentInstall(context: CommandContext): Promise<number> {
    const { args, streams } = context;
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

  async function handleAgentSync(context: CommandContext): Promise<number> {
    const { args, streams } = context;
const result = await syncAgentSkills({
        agentId: flagString(args, "agent"),
        workspaceRoot: flagString(args, "path"),
        yes: flagBool(args, "yes"),
        dryRun: flagBool(args, "dry-run"),
        json: flagBool(args, "json"),
        streams
      });
      if (flagBool(args, "json")) {
        writeLine(streams.stdout, JSON.stringify(result, null, 2));
      } else {
        printAgentSyncResult(streams.stdout, result);
      }
      return 0;
  }

  async function handleAgentCheck(context: CommandContext): Promise<number> {
    const { args, streams } = context;
await printAgentCheckDetailed(streams.stdout, await discoverAgentTargets(flagString(args, "path")), flagBool(args, "json"));
      return 0;
  }

  async function handleAgentList(context: CommandContext): Promise<number> {
    const { args, streams } = context;
printAgentList(streams.stdout, await discoverAgentTargets());
      return 0;
  }

  async function handlePromptAgent(context: CommandContext): Promise<number> {
    const { args, streams } = context;
printAgentPrompt(streams.stdout);
      return 0;
  }

  async function handleInit(context: CommandContext): Promise<number> {
    const { args, streams } = context;
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

  async function handleConfigShow(context: CommandContext): Promise<number> {
    const { args, streams } = context;
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

  async function handleDoctor(context: CommandContext): Promise<number> {
    const { args, streams } = context;
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

  async function handleStatus(context: CommandContext): Promise<number> {
    const { args, streams } = context;
const root = await resolveWorkspace(flagString(args, "path"));
      const summary = await statusSummary(root);
      writeLine(streams.stdout, `知识库路径: ${summary.root}`);
      writeLine(streams.stdout, `处理次数: ${summary.runCount}`);
      writeLine(streams.stdout, `失败次数: ${summary.failedCount}`);
      writeLine(streams.stdout, `最近处理: ${summary.lastRunId ?? "无"}`);
      await printStatusDetails(streams.stdout, root, summary.runCount);
      return 0;
  }

  async function handleContext(context: CommandContext): Promise<number> {
    const { args, streams } = context;
const root = await resolveWorkspace(flagString(args, "path"));
      const query = args.positional.slice(1).join(" ").trim();
      if (!query) {
        throw new CliError("请提供查询主题。");
      }
      if (capsuleViewRequested(args)) {
        writeLine(streams.stdout, JSON.stringify(await buildCapsuleContext(root, query, contextOptions(args)), null, 2));
        return 0;
      }
      writeLine(streams.stdout, JSON.stringify(await buildContext(root, query, contextOptions(args)), null, 2));
      return 0;
  }

  async function handleQuery(context: CommandContext): Promise<number> {
    const { args, streams } = context;
const root = await resolveWorkspace(flagString(args, "path"));
      const query = args.positional.slice(1).join(" ").trim();
      if (!query) {
        throw new CliError("请提供查询主题。");
      }
      const view = queryView(args);
      if (view === "capsule") {
        writeLine(streams.stdout, await renderCapsuleQuery(root, query, contextOptions(args)));
        return 0;
      }
      writeLine(streams.stdout, renderQuery(await buildContext(root, query, contextOptions(args))));
      return 0;
  }

  async function handleShow(context: CommandContext): Promise<number> {
    const { args, streams } = context;
const { rootPath, artifactPath } = showPathOptions(args);
      const root = await resolveWorkspace(rootPath);
      const query = args.positional.slice(1).join(" ").trim();
      writeLine(streams.stdout, await showCapsule(root, {
        query: query || undefined,
        id: flagString(args, "id"),
        artifactPath,
        json: flagBool(args, "json"),
        debug: flagBool(args, "debug"),
        allArtifacts: flagBool(args, "all-artifacts")
      }));
      return 0;
  }

  async function handleNext(context: CommandContext): Promise<number> {
    const { args, streams } = context;
const root = await resolveWorkspace(flagString(args, "path"));
      const summary = await statusSummary(root);
      const checks = await doctor(root);
      const report = summary.runCount > 0 ? await lintWorkspace(root) : undefined;
      await printNext(streams.stdout, root, summary.runCount, checks, await discoverAgentTargets(), report);
      return 0;
  }

  async function handleLint(context: CommandContext): Promise<number> {
    const { args, streams } = context;
      const root = await resolveWorkspace(flagString(args, "path"));
      const severity = parseLintSeverity(flagString(args, "severity"));
      const appliedSafeFixes = flagBool(args, "fix-empty-dirs") ? await removeEmptyOptionalDirs(root) : [];
      const coreReport = attachAppliedSafeFixes(await lintWorkspace(root, new Date().toISOString(), lintOptions(args)), appliedSafeFixes);
      const report = filterLintReport(mergeLintIssues(coreReport, await extensionLintIssues(root)), severity);
      if (flagBool(args, "json")) {
        writeLine(streams.stdout, JSON.stringify(report, null, 2));
        return 0;
      }
      const reportPath = flagBool(args, "no-write") ? undefined : await writeLintReport(root, report);
      writeLine(streams.stdout, renderLintSummary(report, reportPath));
      writeLine(streams.stdout, "");
      writeLine(streams.stdout, renderLintReport(report));
      return 0;
  }

  async function handleIngestAgent(context: CommandContext): Promise<number> {
    const { args, streams } = context;
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

  async function handleIngestFile(context: CommandContext): Promise<number> {
    const { args, streams } = context;
const root = await resolveWorkspace(flagString(args, "path"));
      const file = flagString(args, "file") ?? args.positional[1];
      if (!file) {
        throw new CliError("请提供 --file <file>。");
      }
      const result = await ingestFile(root, path.resolve(file));
      printIngestResult(streams.stdout, result);
      return 0;
  }

  async function handleIngestUrl(context: CommandContext): Promise<number> {
    const { args, streams } = context;
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
          title: deriveFileTitle(contentFile),
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

  return {
    version: handleVersion,
    agentHelp: handleAgentHelp,
    retrievalHelp: handleRetrievalHelp,
    help: handleHelp,
    plugin: createPluginCommandHandler(),
    setup: handleSetup,
    agentInstall: handleAgentInstall,
    agentSync: handleAgentSync,
    agentCheck: handleAgentCheck,
    agentList: handleAgentList,
    promptAgent: handlePromptAgent,
    init: handleInit,
    configShow: handleConfigShow,
    doctor: handleDoctor,
    status: handleStatus,
    context: handleContext,
    query: handleQuery,
    show: handleShow,
    next: handleNext,
    lint: handleLint,
    ingestAgent: handleIngestAgent,
    ingestFile: handleIngestFile,
    ingestUrl: handleIngestUrl
  };
}

function printHelp(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki");
  writeLine(stream, "");
  writeLine(stream, "用法:");
  writeLine(stream, "  aiwiki setup");
  writeLine(stream, "  aiwiki setup --path <path> --yes");
  writeLine(stream, "  aiwiki agent sync --yes");
  writeLine(stream, "  aiwiki agent check --json");
  writeLine(stream, "  aiwiki ingest-agent --stdin");
  writeLine(stream, "  aiwiki ingest-file --file <file>");
  writeLine(stream, "  aiwiki doctor");
  writeLine(stream, "  aiwiki status");
  writeLine(stream, "  aiwiki show <query>");
  writeLine(stream, "  aiwiki context <query>");
  writeLine(stream, "  aiwiki query <query>");
  writeLine(stream, "  aiwiki lint");
  writeLine(stream, "  aiwiki lint --capsules --json");
  writeLine(stream, "  aiwiki lint --strict --json");
  writeLine(stream, "  aiwiki lint --fix-empty-dirs --json");
  writeLine(stream, "  aiwiki plugin list --json");
  writeLine(stream, "  aiwiki plugin add <directory>");
  writeLine(stream, "  aiwiki plugin enable <id>");
}

function printAgentHelp(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki Agent commands");
  writeLine(stream, "");
  writeLine(stream, "Agent-first setup and upgrade:");
  writeLine(stream, "  aiwiki setup --path <workspace> --yes");
  writeLine(stream, "  aiwiki agent sync --yes");
  writeLine(stream, "  aiwiki agent sync --agent codex --yes");
  writeLine(stream, "  aiwiki agent sync --agent codex --dry-run");
  writeLine(stream, "  aiwiki agent sync --json --yes");
  writeLine(stream, "");
  writeLine(stream, "Manual workspace guidance refresh:");
  writeLine(stream, "  aiwiki agent sync --path <workspace> --yes");
  writeLine(stream, "");
  writeLine(stream, "Status:");
  writeLine(stream, "  aiwiki agent check");
  writeLine(stream, "  aiwiki agent check --path <workspace> --json");
  writeLine(stream, "  aiwiki agent check --json");
  writeLine(stream, "");
  writeLine(stream, "Compatibility:");
  writeLine(stream, "  aiwiki agent install --agent codex --yes");
  writeLine(stream, "  aiwiki agent install --agent codex --yes --force");
  writeLine(stream, "");
  writeLine(stream, "sync is idempotent: missing targets are installed, current targets are left unchanged, and different targets are backed up before overwrite.");
}

function printContextHelp(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki context/query");
  writeLine(stream, "");
  writeLine(stream, "Local Markdown/frontmatter retrieval for host Agents and humans:");
  writeLine(stream, "  aiwiki show <topic>");
  writeLine(stream, "  aiwiki show --id <capsule_id>");
  writeLine(stream, "  aiwiki show --artifact-path <artifact.md> --path <workspace>");
  writeLine(stream, "  aiwiki context <topic> --limit 10");
  writeLine(stream, "  aiwiki context <topic> --view capsule");
  writeLine(stream, "  aiwiki query <topic> --view capsule");
  writeLine(stream, "  aiwiki query <topic> --view files --type wiki_entries --status active");
  writeLine(stream, "");
  writeLine(stream, "Filters:");
  writeLine(stream, "  --type wiki_entries|source_cards|claims|topics|outlines|raw_refs");
  writeLine(stream, "  --source-role input|processing|output");
  writeLine(stream, "  --wiki-type source_knowledge|personal_knowledge");
  writeLine(stream, "  --status active|to-review|ready|draft");
  writeLine(stream, "  --limit <1-50>");
  writeLine(stream, "");
  writeLine(stream, "context JSON includes query_scope, result_quality, recommended_next_action, match_reasons, quality_signals, related_refs, and reuse_guidance.");
}

function parseLintSeverity(value: string | undefined): LintSeverity | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "error" || value === "warning" || value === "info") {
    return value;
  }
  throw new CliError("lint --severity must be error, warning, or info");
}

function lintOptions(args: ParsedArgs): CapsuleLintOptions {
  return {
    capsules: flagBool(args, "capsules"),
    lifecycle: flagBool(args, "lifecycle"),
    okf: flagBool(args, "okf"),
    strict: flagBool(args, "strict")
  };
}

async function extensionLintIssues(root: string): Promise<LintIssue[]> {
  return (await evaluateExtensionLintFindings(root)).map(({ extensionId, ruleId, finding }) => ({
    severity: finding.severity,
    ...(finding.vaultPath ? { path: finding.vaultPath } : {}),
    message: finding.message,
    ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
    category: finding.category ?? "extension:" + extensionId + ":" + ruleId
  }));
}

type AgentTarget = {
  id: string;
  name: string;
  detected: boolean;
  installable: boolean;
  kind: "skill" | "command" | "prompt" | "root_guidance";
  source?: string;
  target?: string;
  note: string;
};

type AgentInstallState = "unsupported" | "missing" | "current" | "different";

type AgentSyncAction = "installed" | "updated" | "current" | "would_install" | "would_update" | "unsupported";

type AgentSyncItem = {
  id: string;
  name: string;
  detected: boolean;
  installable: boolean;
  state: AgentInstallState;
  action: AgentSyncAction;
  target?: string;
  source?: string;
  backupPath?: string;
  changed: boolean;
  dryRun: boolean;
  note?: string;
};

type AgentSyncReport = {
  schema_version: "aiwiki.agent_sync.v1";
  generated_at: string;
  dry_run: boolean;
  results: AgentSyncItem[];
};

const AIWIKI_AGENT_GUIDANCE_START = "<!-- AIWIKI:AGENT-GUIDANCE:START -->";
const AIWIKI_AGENT_GUIDANCE_END = "<!-- AIWIKI:AGENT-GUIDANCE:END -->";

const REQUIRED_AGENT_GUIDANCE_TERMS = [
  "aiwiki setup",
  "aiwiki agent sync",
  "aiwiki agent check",
  "aiwiki lint --json",
  "aiwiki lint --fix-empty-dirs --json",
  "aiwiki ingest-file",
  "aiwiki ingest-agent",
  "aiwiki status",
  "aiwiki query",
  "aiwiki context",
  "aiwiki show",
  "--view capsule",
  "--view files",
  "aiwiki lint --capsules"
];

async function discoverAgentTargets(workspaceRoot?: string): Promise<AgentTarget[]> {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  const skillSource = path.join(packageRoot, "skill", "SKILL.md");
  const promptSource = path.join(packageRoot, "docs", "AGENT_HANDOFF.md");
  const codexHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), ".codex");
  const qclawHome = process.env.QCLAW_HOME ? path.resolve(process.env.QCLAW_HOME) : path.join(os.homedir(), ".qclaw");
  const openclawHome = process.env.OPENCLAW_HOME ? path.resolve(process.env.OPENCLAW_HOME) : path.join(os.homedir(), ".openclaw");
  const claudeHome = process.env.CLAUDE_HOME ? path.resolve(process.env.CLAUDE_HOME) : path.join(os.homedir(), ".claude");
  const opencodeHome = process.env.OPENCODE_HOME ? path.resolve(process.env.OPENCODE_HOME) : path.join(os.homedir(), ".opencode");
  const hermesHome = process.env.HERMES_HOME ? path.resolve(process.env.HERMES_HOME) : path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "hermes");
  const workspace = workspaceRoot ? path.resolve(workspaceRoot) : undefined;

  const targets: AgentTarget[] = [
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
  if (workspace) {
    targets.unshift({
      id: "workspace",
      name: "Workspace AGENTS.md",
      detected: await exists(workspace),
      installable: true,
      kind: "root_guidance",
      target: path.join(workspace, "AGENTS.md"),
      note: "安装 marker-bounded 根指导，要求宿主 Agent 在整理、检查、入库、查询、复用时优先调用 aiwiki CLI。"
    });
  }
  return targets;
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

async function printAgentCheck(stream: NodeJS.WritableStream, targets: AgentTarget[]): Promise<void> {
  writeLine(stream, "AIWiki Agent 接入检查");
  for (const target of targets) {
    const installed = target.target ? await exists(target.target) : false;
    writeLine(stream, `${target.id}: ${target.name} | detected=${target.detected ? "yes" : "no"} | installed=${installed ? "yes" : "no"} | installable=${target.installable ? "yes" : "no"}`);
    if (target.detected && target.installable && !installed) {
      writeLine(stream, `  建议: aiwiki agent install --agent ${target.id} --yes`);
    } else if (target.detected && !target.installable) {
      writeLine(stream, "  建议: aiwiki prompt agent");
    }
  }
}

async function printAgentCheckDetailed(stream: NodeJS.WritableStream, targets: AgentTarget[], json = false): Promise<void> {
  const checked = await Promise.all(targets.map(async (target) => ({
    ...target,
    state: await inspectAgentTarget(target),
    installed: target.target ? await exists(target.target) : false
  })));

  if (json) {
    writeLine(stream, JSON.stringify({
      schema_version: "aiwiki.agent_check.v1",
      generated_at: new Date().toISOString(),
      targets: checked.map((target) => ({
        id: target.id,
        name: target.name,
        detected: target.detected,
        installable: target.installable,
        installed: target.installed,
        state: target.state,
        suggested_action: suggestedAgentAction(target),
        source: target.source,
        target: target.target
      }))
    }, null, 2));
    return;
  }

  writeLine(stream, "AIWiki Agent check");
  for (const target of checked) {
    writeLine(stream, `${target.id}: ${target.name} | detected=${target.detected ? "yes" : "no"} | installed=${target.installed ? "yes" : "no"} | installable=${target.installable ? "yes" : "no"} | state=${target.state}`);
    const suggested = suggestedAgentAction(target);
    if (suggested) {
      writeLine(stream, `  suggested: ${suggested}`);
    }
  }
}

function suggestedAgentAction(target: AgentTarget & { state: AgentInstallState }): string | undefined {
  if (target.detected && target.installable && (target.state === "missing" || target.state === "different")) {
    return target.id === "workspace" ? `aiwiki agent sync --path "${path.dirname(target.target ?? ".")}" --yes` : `aiwiki agent sync --agent ${target.id} --yes`;
  }
  if (target.detected && !target.installable) {
    return "aiwiki prompt agent";
  }
  return undefined;
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

  const result = await copyInstallFileSafe(selected.source, selected.target, options.force);
  return { ...selected, ...result };
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

async function syncAgentSkills(options: { agentId?: string; workspaceRoot?: string; yes: boolean; dryRun: boolean; json: boolean; streams: CliStreams }): Promise<AgentSyncReport> {
  const targets = await discoverAgentTargets(options.workspaceRoot);
  const selected = options.agentId ? targets.find((target) => target.id === options.agentId) : undefined;
  if (!selected && options.agentId) {
    throw new CliError(`未知宿主 Agent: ${options.agentId}`);
  }
  const syncTargets = selected ? [selected] : targets.filter((target) => target.detected && target.installable);
  if (!syncTargets.length) {
    throw new CliError("No detected installable Agent targets. Run aiwiki agent list or aiwiki prompt agent.");
  }
  if (!options.yes && !options.dryRun) {
    throw new CliError("agent sync modifies Agent skill files. Re-run with --yes, or use --dry-run to preview.");
  }
  return {
    schema_version: "aiwiki.agent_sync.v1",
    generated_at: new Date().toISOString(),
    dry_run: options.dryRun,
    results: await Promise.all(syncTargets.map((target) => syncAgentTarget(target, options.dryRun)))
  };
}

async function copyInstallFile(source: string, target: string, force: boolean): Promise<{ action: AgentSyncAction; backupPath?: string }> {
  return copyInstallFileSafe(source, target, force);
  await fs.access(source);
  if (!force && (await exists(target))) {
    throw new CliError(`目标文件已存在: ${target}。如需覆盖，请加 --force。`);
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function copyInstallFileSafe(source: string, target: string, force: boolean): Promise<{ action: AgentSyncAction; backupPath?: string }> {
  await fs.access(source);
  const targetExists = await exists(target);
  if (!force && targetExists) {
    throw new CliError(`目标文件已存在: ${target}。如需覆盖，请运行 aiwiki agent sync --agent <id> --yes，或为 install 加 --force。`);
  }
  if (targetExists && await sameFileContent(source, target)) {
    return { action: "current" };
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const backupPath = targetExists ? await backupFile(target) : undefined;
  await fs.copyFile(source, target);
  return { action: targetExists ? "updated" : "installed", backupPath };
}

async function inspectAgentTarget(target: AgentTarget): Promise<AgentInstallState> {
  if (target.kind === "root_guidance") {
    return inspectWorkspaceGuidanceTarget(target);
  }
  if (!target.installable || !target.source || !target.target) {
    return "unsupported";
  }
  if (!(await exists(target.target))) {
    return "missing";
  }
  return await sameFileContent(target.source, target.target) ? "current" : "different";
}

async function syncAgentTarget(target: AgentTarget, dryRun: boolean): Promise<AgentSyncItem> {
  const state = await inspectAgentTarget(target);
  const base = {
    id: target.id,
    name: target.name,
    detected: target.detected,
    installable: target.installable,
    state,
    target: target.target,
    source: target.source,
    changed: false,
    dryRun
  };
  if (state === "unsupported" || !target.target || (!target.source && target.kind !== "root_guidance")) {
    return { ...base, action: "unsupported", note: target.note };
  }
  if (state === "current") {
    return { ...base, action: "current" };
  }
  if (dryRun) {
    return { ...base, action: state === "missing" ? "would_install" : "would_update", changed: true };
  }
  if (target.kind === "root_guidance") {
    const result = await syncWorkspaceGuidanceTarget(target);
    return { ...base, action: result.action, backupPath: result.backupPath, changed: result.action !== "current" };
  }
  const result = await copyInstallFileSafe(target.source!, target.target, true);
  return { ...base, action: result.action, backupPath: result.backupPath, changed: result.action !== "current" };
}

async function inspectWorkspaceGuidanceTarget(target: AgentTarget): Promise<AgentInstallState> {
  if (!target.target || !target.detected) {
    return "missing";
  }
  if (!(await exists(target.target))) {
    return "missing";
  }
  const content = await fs.readFile(target.target, "utf8");
  const block = extractWorkspaceGuidanceBlock(content);
  if (!block) {
    return "different";
  }
  return block.trim() === workspaceGuidanceBlock().trim() && REQUIRED_AGENT_GUIDANCE_TERMS.every((term) => block.includes(term)) ? "current" : "different";
}

async function syncWorkspaceGuidanceTarget(target: AgentTarget): Promise<{ action: AgentSyncAction; backupPath?: string }> {
  if (!target.target) {
    return { action: "unsupported" };
  }
  const targetExists = await exists(target.target);
  const existing = targetExists ? await fs.readFile(target.target, "utf8") : "";
  const next = mergeWorkspaceGuidance(existing);
  if (targetExists && existing === next) {
    return { action: "current" };
  }
  const backupPath = targetExists ? await backupFile(target.target) : undefined;
  await fs.mkdir(path.dirname(target.target), { recursive: true });
  await fs.writeFile(target.target, next, "utf8");
  return { action: targetExists ? "updated" : "installed", backupPath };
}

function extractWorkspaceGuidanceBlock(content: string): string | undefined {
  const start = content.indexOf(AIWIKI_AGENT_GUIDANCE_START);
  const end = content.indexOf(AIWIKI_AGENT_GUIDANCE_END);
  if (start === -1 || end === -1 || end < start) {
    return undefined;
  }
  return content.slice(start, end + AIWIKI_AGENT_GUIDANCE_END.length);
}

function mergeWorkspaceGuidance(existing: string): string {
  const block = workspaceGuidanceBlock();
  const start = existing.indexOf(AIWIKI_AGENT_GUIDANCE_START);
  const end = existing.indexOf(AIWIKI_AGENT_GUIDANCE_END);
  if (start !== -1 && end !== -1 && end > start) {
    return `${existing.slice(0, start)}${block}${existing.slice(end + AIWIKI_AGENT_GUIDANCE_END.length)}`;
  }
  const trimmed = existing.trimEnd();
  return `${trimmed}${trimmed ? "\n\n" : ""}${block}\n`;
}

function workspaceGuidanceBlock(): string {
  return `${AIWIKI_AGENT_GUIDANCE_START}
# AIWiki Agent Command Contract

When a user asks to install, sync, organize, inspect, ingest, query, reuse, or maintain this AIWiki workspace, call the matching AIWiki CLI command first. Interpret the command output before replying. Do not start with generic file search, grep/find scans, or ad hoc note edits unless the AIWiki command cannot answer the request.

Required command-first loop:

1. Ensure the workspace exists and refresh root guidance with \`aiwiki setup --path <workspace> --yes\`.
2. Verify root guidance with \`aiwiki agent check --path <workspace> --json\`; use \`aiwiki agent sync --path <workspace> --yes\` only for manual guidance refresh without setup.
3. When the user explicitly asks to sync, upgrade, or repair host-Agent integration, run \`aiwiki agent check --json\`, preview with \`aiwiki agent sync --dry-run\`, then run \`aiwiki agent sync --yes\` after confirmation. Report state, backup path, and restart/reload requirement.
4. Inspect structure with \`aiwiki lint --json --path <workspace>\`; inspect Source Capsule health with \`aiwiki lint --capsules --json --path <workspace>\`; apply only safe fixes with \`aiwiki lint --fix-empty-dirs --json --path <workspace>\` when allowed, then rerun \`aiwiki lint --json --path <workspace>\`.
5. Ingest local material with \`aiwiki ingest-file --file <file> --path <workspace>\` or structured Agent material with \`aiwiki ingest-agent --stdin --path <workspace>\`.
6. Check progress with \`aiwiki status --path <workspace>\`.
7. Retrieve reusable knowledge with \`aiwiki query <topic> --path <workspace>\` for human-readable output or \`aiwiki context <topic> --path <workspace>\` for Agent JSON. Before answering, read \`result_quality\` and \`recommended_next_action\`.
8. Use Source Capsule views when the user asks for one source package, provenance, lifecycle state, or OKF readiness: \`aiwiki show <topic> --path <workspace>\`, \`aiwiki query <topic> --path <workspace>\`, or \`aiwiki context <topic> --view capsule --path <workspace>\`.
9. Use \`aiwiki query <topic> --view files --path <workspace>\` only when the older file-level match list is needed.

Use fallback shell/file search only after the relevant AIWiki command has been tried or when the command is unavailable. If you fall back, say which AIWiki command was insufficient and why. For unsupported host-Agent integration, use \`aiwiki prompt agent\` rather than writing unknown host configuration.
${AIWIKI_AGENT_GUIDANCE_END}`;
}

async function sameFileContent(source: string, target: string): Promise<boolean> {
  try {
    const [sourceText, targetText] = await Promise.all([fs.readFile(source, "utf8"), fs.readFile(target, "utf8")]);
    return sourceText === targetText;
  } catch {
    return false;
  }
}

async function backupFile(target: string): Promise<string> {
  const parsed = path.parse(target);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const backupPath = path.join(parsed.dir, `${parsed.base}.bak-${stamp}`);
  await fs.copyFile(target, backupPath);
  return backupPath;
}

function printAgentSyncResult(stream: NodeJS.WritableStream, report: AgentSyncReport): void {
  writeLine(stream, "AIWiki Agent sync");
  writeLine(stream, `dry_run: ${report.dry_run ? "yes" : "no"}`);
  for (const item of report.results) {
    writeLine(stream, `${item.id}: ${item.name} | state=${item.state} | action=${item.action} | changed=${item.changed ? "yes" : "no"}`);
    if (item.target) {
      writeLine(stream, `  target: ${item.target}`);
    }
    if (item.backupPath) {
      writeLine(stream, `  backup: ${item.backupPath}`);
    }
  }
  writeLine(stream, "next: restart or reload the target Agent so it reads the synced AIWiki skill.");
}

function printAgentPrompt(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki Agent 中文提示");
  writeLine(stream, "");
  writeLine(stream, "当用户发送以下触发语时，请自动执行 AIWiki 入库流程：");
  writeLine(stream, "- 入库 <url>");
  writeLine(stream, "- 收录 <url>");
  writeLine(stream, "- 存一下 <url>");
  writeLine(stream, "- aiwiki <url>");
  writeLine(stream, "Before ingesting, querying, or reorganizing, read `_system/purpose.md` and keep material aligned with the knowledge-base goal, scope, and unsuitable-content rules.");
  writeLine(stream, "");
  writeLine(stream, "如果当前会话被用户明确设定为 AIWiki 入库助手，则用户只发送 URL 也默认触发入库。普通会话中不要把所有 URL 都自动入库。");
  writeLine(stream, "");
  writeLine(stream, "安装：当用户要求安装、初始化或修复工作区时，先运行 `aiwiki setup --path <workspace> --yes`，再运行 `aiwiki agent check --path <workspace> --json`、`aiwiki doctor --path <workspace>` 和 `aiwiki status --path <workspace>`，并解释工作区和根指导状态。");
  writeLine(stream, "流程：读取网页正文；尽量生成 analysis/wiki_entry；生成 aiwiki.agent_payload.v1；通过 stdin 调用 `aiwiki ingest-agent --stdin`；读取 CLI 输出；向用户汇报 ingested、summary、wiki_entry、wiki_entry_quality、source_card、processing_summary。");
  writeLine(stream, "回复措辞：成功时说“AIWiki 已完成入库，并生成 Wiki 条目。” 如果 wiki_entry_quality=scaffold，说明该条目只是可追溯脚手架，仍需宿主 Agent 后续补全。Dataview 是可选增强，不要替用户安装插件或修改 .obsidian。");
  writeLine(stream, "");
  writeLine(stream, "查询：当用户要求从 AIWiki 里了解某个主题时，调用 `aiwiki context <主题>`；需要来源包、生命周期或 OKF readiness 时，调用 `aiwiki context <主题> --view capsule` 或 `aiwiki show <主题>`。回答前读取 `result_quality` 和 `recommended_next_action`，说明来源、质量和已知缺口。");
  writeLine(stream, "整理：当用户要求检查或整理知识库时，先调用 `aiwiki lint --json`；深层 capsule 检查使用 `aiwiki lint --capsules --json`、`--lifecycle`、`--okf` 或 `--strict`；若只有 safe fix 且用户允许整理，再调用 `aiwiki lint --fix-empty-dirs --json`，随后重跑 `aiwiki lint --json`。");
  writeLine(stream, "升级：当用户要求同步、升级或修复宿主 Agent 接入时，先调用 `aiwiki agent check --json`，再使用 `aiwiki agent sync --dry-run` 预览；确认后运行 `aiwiki agent sync --yes`。不支持的宿主使用 `aiwiki prompt agent`，不要写入未知配置。");
  writeLine(stream, "fallback：只有对应 AIWiki 命令无法回答请求时，才使用文件搜索或临时脚本；必须说明哪个命令不足以及原因。不要把网页抓取、手工 payload 或未知宿主配置当作默认回退路径。");
  writeLine(stream, "");
  writeLine(stream, "禁止：让用户保存 payload；让用户每次输入 --path；声称 AIWiki CLI 负责网页抓取；声称 AIWiki CLI 会在没有 Agent 分析字段时自动高质量总结。");
}

async function printStatusDetails(stream: NodeJS.WritableStream, root: string, runCount: number): Promise<void> {
  const counts = await contentCounts(root);
  const summary = await statusSummary(root);
  const metrics = capsuleMetrics(await buildCapsules(root));
  const lintPath = path.join(root, "dashboards", "Lint Report.md");
  writeLine(stream, "");
  writeLine(stream, "Content stats:");
  writeLine(stream, `Wiki entries: ${counts.wikiEntries}`);
  writeLine(stream, `Source cards: ${counts.sourceCards}`);
  writeLine(stream, `Raw files: ${counts.rawFiles}`);
  writeLine(stream, `Topics: ${counts.topics}`);
  writeLine(stream, `Outlines: ${counts.outlines}`);
  writeLine(stream, `fallback_entries: ${summary.fallbackCount}`);
  writeLine(stream, `grounding_review_entries: ${summary.groundingReviewCount}`);
  writeLine(stream, `capsule_count: ${metrics.capsule_count}`);
  writeLine(stream, `capsule_with_primary_count: ${metrics.capsule_with_primary_count}`);
  writeLine(stream, `entropy_risk: ${metrics.entropy_risk}`);
  writeLine(stream, `lifecycle_risk: ${metrics.lifecycle_risk}`);
  writeLine(stream, `okf_ready_count: ${metrics.okf_ready_count}`);
  writeLine(stream, `recent_lint: ${await exists(lintPath) ? await relativeMtime(root, lintPath) : "none"}`);
  writeLine(stream, `lint_status: ${summary.lintStatus}`);
  if (summary.lastSuccessRunId) {
    writeLine(stream, `last_success: ${summary.lastSuccessRunId}`);
  }
  if (summary.lastFailureRunId) {
    writeLine(stream, `last_failure: ${summary.lastFailureRunId}`);
  }
  writeLine(stream, `system_files: ${summary.systemFiles.map((item) => `${item.path}=${item.status}`).join(", ")}`);
  writeLine(stream, "");
  writeLine(stream, "Next action:");
  writeLine(stream, recommendedNextAction(runCount, summary.lintStatus, summary.systemFiles.some((item) => item.status !== "ok")));
}

async function printNext(
  stream: NodeJS.WritableStream,
  root: string,
  runCount: number,
  checks: Awaited<ReturnType<typeof doctor>>,
  targets: AgentTarget[],
  report?: Awaited<ReturnType<typeof lintWorkspace>>
): Promise<void> {
  const missing = checks.filter((check) => check.status !== "ok");
  const installableMissing: AgentTarget[] = [];
  for (const target of targets) {
    if (target.detected && target.installable && target.target && !(await exists(target.target))) {
      installableMissing.push(target);
    }
  }
  writeLine(stream, "AIWiki 下一步建议");
  writeLine(stream, `workspace: ${root}`);
  if (missing.length) {
    writeLine(stream, "");
    writeLine(stream, "Repair workspace structure first:");
    writeLine(stream, `- aiwiki setup --path "${root}" --yes`);
    writeLine(stream, "- repair_order: structure");
    return;
  }
  const actionableIssues = report?.issues.filter((issue) => issue.severity !== "info") ?? [];
  const errorCount = actionableIssues.filter((issue) => issue.severity === "error").length;
  const warningCount = actionableIssues.filter((issue) => issue.severity === "warning").length;
  if (errorCount > 0) {
    writeLine(stream, "");
    writeLine(stream, `结构检查发现 ${errorCount} 个 error 问题。`);
    writeLine(stream, "- aiwiki lint");
    writeLine(stream, "- report: dashboards/Lint Report.md");
    writeLine(stream, "- repair_order: lint_errors");
    return;
  }
  if (warningCount > 0) {
    writeLine(stream, "");
    writeLine(stream, `结构检查发现 ${warningCount} 个 warning 问题。`);
    writeLine(stream, "- aiwiki lint");
    writeLine(stream, "- report: dashboards/Lint Report.md");
    writeLine(stream, "- repair_order: lint_warnings");
    return;
  }
  if (runCount === 0) {
    writeLine(stream, "");
    writeLine(stream, "No ingest records yet.");
    writeLine(stream, "- aiwiki agent sync --yes");
    writeLine(stream, "- Then ask the host Agent to ingest a URL.");
    writeLine(stream, "- AIWiki CLI does not fetch webpages; the host Agent supplies content.");
    writeLine(stream, "- repair_order: empty_workspace");
    return;
  }
  writeLine(stream, "");
  writeLine(stream, "Workspace is healthy enough for retrieval:");
  writeLine(stream, "- aiwiki query <topic>");
  writeLine(stream, "- aiwiki lint");
  writeLine(stream, "- repair_order: healthy_query");
  if (installableMissing.length) {
    writeLine(stream, "");
    writeLine(stream, "Optional host Agent setup:");
    for (const target of installableMissing) {
      writeLine(stream, `- aiwiki agent install --agent ${target.id} --yes`);
    }
  }
}

function recommendedNextAction(runCount: number, lintStatus: "ok" | "missing" | "needs_attention", hasMissingSystemFiles: boolean): string {
  if (hasMissingSystemFiles) {
    return "next_action: aiwiki setup --path <workspace> --yes";
  }
  if (lintStatus === "needs_attention") {
    return "next_action: aiwiki lint";
  }
  if (runCount === 0) {
  return "next_action: aiwiki agent sync --yes";
  }
  return "next_action: aiwiki query <topic>";
}

function contextOptions(args: ParsedArgs): { filters: ContextFilters; limit?: number } {
  const limit = flagString(args, "limit");
  return {
    filters: {
      type: flagString(args, "type"),
      source_role: flagString(args, "source-role"),
      wiki_type: flagString(args, "wiki-type"),
      status: flagString(args, "status")
    },
    limit: limit === undefined ? undefined : Number(limit)
  };
}

function capsuleViewRequested(args: ParsedArgs): boolean {
  const view = flagString(args, "view");
  return view === "capsule" || flagBool(args, "capsules");
}

function queryView(args: ParsedArgs): "capsule" | "files" {
  const view = flagString(args, "view");
  if (!view || view === "capsule") {
    return "capsule";
  }
  if (view === "files") {
    return "files";
  }
  throw new CliError("query --view must be capsule or files");
}

function showPathOptions(args: ParsedArgs): { rootPath?: string; artifactPath?: string } {
  const explicitArtifact = flagString(args, "artifact-path");
  if (explicitArtifact) {
    return { rootPath: flagString(args, "path"), artifactPath: explicitArtifact };
  }
  const pathFlag = flagString(args, "path");
  const hasSelector = Boolean(flagString(args, "id") || args.positional.slice(1).join(" ").trim());
  if (pathFlag && !hasSelector && looksLikeArtifactPath(pathFlag)) {
    return { rootPath: flagString(args, "workspace"), artifactPath: pathFlag };
  }
  return { rootPath: pathFlag };
}

function looksLikeArtifactPath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  return normalized.toLowerCase().endsWith(".md")
    || /^(02-raw|03-sources|04-claims|05-wiki|06-assets|07-topics|08-outputs|09-runs)\//.test(normalized);
}

function renderQuery(context: ContextResult): string {
  const lines = [`AIWiki 查询: ${context.query}`, ""];
  lines.push(
    `结果质量: matches=${context.result_quality.total_matches}, best_score=${context.result_quality.best_score}, has_wiki_entry=${context.result_quality.has_wiki_entry ? "yes" : "no"}`,
    `下一步建议: ${context.recommended_next_action}`,
    `查询范围: groups=${context.query_scope.searched_groups.join(",") || "none"}, limit=${context.query_scope.limit}, filters=${JSON.stringify(context.query_scope.filters)}`,
    ""
  );
  lines.push(
    "Reuse workflows:",
    `- writing: ${context.reuse_guidance.writing}`,
    `- research: ${context.reuse_guidance.research}`,
    `- decision: ${context.reuse_guidance.decision}`,
    `- review: ${context.reuse_guidance.review}`,
    ""
  );
  appendQueryGroup(lines, "Wiki 条目", context.matches.wiki_entries);
  appendQueryGroup(lines, "资料卡", context.matches.source_cards);
  appendQueryGroup(lines, "选题", context.matches.topics);
  appendQueryGroup(lines, "Claim 建议", context.matches.claims);
  appendQueryGroup(lines, "大纲", context.matches.outlines);
  appendQueryGroup(lines, "原文引用", context.matches.raw_refs);
  if (context.warnings.length) {
    lines.push("提示:", ...context.warnings.map((warning) => `- ${warning}`), "");
  }
  lines.push("Agent JSON:", `- aiwiki context "${context.query}"`);
  return `${lines.join("\n")}\n`;
}

function appendQueryGroup(lines: string[], label: string, items: ContextResult["matches"]["wiki_entries"]): void {
  lines.push(`${label}:`);
  if (!items.length) {
    lines.push("- 无", "");
    return;
  }
  for (const item of items.slice(0, 5)) {
    lines.push(`- ${item.title} (${item.path})`);
    lines.push(`  score=${item.score}; reasons=${item.match_reasons.join(",") || "unknown"}; quality=${item.quality_signals.join(",") || "none"}`);
    if (item.summary) {
      lines.push(`  ${item.summary}`);
    }
    if (item.related_refs.length) {
      lines.push(`  related: ${item.related_refs.slice(0, 5).join("; ")}`);
    }
    if (item.warnings.length) {
      lines.push(`  提示: ${item.warnings.join("；")}`);
    }
  }
  lines.push("");
}

async function contentCounts(root: string) {
  return {
    wikiEntries: await countMarkdownFiles(path.join(root, "05-wiki")),
    sourceCards: await countMarkdownFiles(path.join(root, "03-sources", "article-cards")),
    rawFiles: await countMarkdownFiles(path.join(root, "02-raw", "articles")),
    topics: await countMarkdownFiles(path.join(root, "07-topics", "ready")),
    outlines: await countMarkdownFiles(path.join(root, "08-outputs", "outlines"))
  };
}

async function countMarkdownFiles(dir: string): Promise<number> {
  if (!(await exists(dir))) {
    return 0;
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countMarkdownFiles(target);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      count += 1;
    }
  }
  return count;
}

async function relativeMtime(root: string, target: string): Promise<string> {
  const stats = await fs.stat(target);
  return `${path.relative(root, target).replace(/\\/g, "/")} (${stats.mtime.toISOString()})`;
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
  if (result.agentReport.keyFiles.wikiEntry) {
    writeLine(stream, `wiki_entry: ${result.agentReport.keyFiles.wikiEntry}`);
  }
  if (result.agentReport.wikiEntryGenerationMode) {
    writeLine(stream, `wiki_entry_generation_mode: ${result.agentReport.wikiEntryGenerationMode}`);
  }
  if (result.agentReport.wikiEntryQuality) {
    writeLine(stream, `wiki_entry_quality: ${result.agentReport.wikiEntryQuality}`);
  }
  writeLine(stream, `grounding_evidence_available: ${result.agentReport.grounding.evidence_available ? "yes" : "no"}`);
  writeLine(stream, `grounding_evidence_channel: ${result.agentReport.grounding.evidence_channel}`);
  writeLine(stream, `grounding_needs_review: ${result.agentReport.grounding.needs_review ? "yes" : "no"}`);
  writeLine(stream, `grounding_markers: ${result.agentReport.grounding.suspicion_markers.length ? result.agentReport.grounding.suspicion_markers.join(",") : "none"}`);
  writeLine(stream, `grounding_claims_with_quotes: ${result.agentReport.grounding.claim_quote_count}/${result.agentReport.grounding.claim_count}`);
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

async function packageVersion(): Promise<string> {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  const text = await fs.readFile(path.join(packageRoot, "package.json"), "utf8");
  const parsed = JSON.parse(text) as { version?: unknown };
  if (typeof parsed.version !== "string") {
    throw new CliError("package.json is missing version");
  }
  return parsed.version;
}
