import type { ParsedArgs } from "../args.js";
import { CliError, writeLine } from "../output.js";

export const DEFAULT_HELP_LOCALE = "zh-CN" as const;
export type HelpLocale = "en" | typeof DEFAULT_HELP_LOCALE;
export type HelpTopic = "global" | "index";

const HELP_TEXT: Readonly<Record<HelpLocale, Readonly<Record<HelpTopic, readonly string[]>>>> = {
  en: {
    global: [
      "AIWiki",
      "",
      "Usage:",
      "  aiwiki setup",
      "  aiwiki setup --path <path> --yes",
      "  aiwiki agent sync --yes",
      "  aiwiki agent check --json",
      "  aiwiki ingest-agent --stdin",
      "  aiwiki ingest-file --file <file>",
      "  aiwiki doctor",
      "  aiwiki doctor --json",
      "  aiwiki status",
      "  aiwiki status --json",
      "  aiwiki next --json",
      "  aiwiki rebuild --path <workspace> --json",
      "  aiwiki rebuild --check --json",
      "  aiwiki rebuild --dry-run --json",
      "  aiwiki index build --path <workspace> --json",
      "  aiwiki index status --path <workspace> --json",
      "  aiwiki index rebuild --path <workspace> --json",
      "  aiwiki graph build --path <workspace> --json",
      "  aiwiki graph status --path <workspace> --json",
      "  aiwiki graph rebuild --path <workspace> --json",
      "  aiwiki health --json",
      "  aiwiki health --write --json",
      "  aiwiki repair --plan --json",
      "  aiwiki runs inspect --path <workspace> --json",
      "  aiwiki runs compact --dry-run --path <workspace> --json",
      "  aiwiki runs compact --yes --path <workspace> --json",
      "  aiwiki show <query>",
      "  aiwiki context <query>",
      "  aiwiki context <query> --view graph --graph-depth 1",
      "  aiwiki query <query>",
      "  aiwiki lint",
      "  aiwiki lint --capsules --json",
      "  aiwiki lint --strict --json",
      "  aiwiki lint --maintenance --json",
      "  aiwiki lint --fix-empty-dirs --json",
      "  aiwiki plugin list --json",
      "  aiwiki plugin inspect <id> --json",
      "  aiwiki plugin add <directory>",
      "  aiwiki plugin enable <id>",
      "  aiwiki plugin disable <id>",
      "  aiwiki plugin remove <id>",
      "  aiwiki plugin doctor --json",
      "",
      "Help language:",
      "  --lang en|zh-CN",
      "  AIWIKI_LANG=en|zh-CN"
    ],
    index: [
      "AIWiki index",
      "",
      "Inspect or rebuild removable Markdown-derived index metadata.",
      "  aiwiki index build --path <workspace> --json",
      "  aiwiki index status --path <workspace> --json",
      "  aiwiki index rebuild --path <workspace> --json",
      "",
      "status exits 1 for stale, missing, or invalid index. Context and query remain Markdown-backed when index is unavailable."
    ]
  },
  "zh-CN": {
    global: [
      "AIWiki",
      "",
      "用法:",
      "  aiwiki setup",
      "  aiwiki setup --path <path> --yes",
      "  aiwiki agent sync --yes",
      "  aiwiki agent check --json",
      "  aiwiki ingest-agent --stdin",
      "  aiwiki ingest-file --file <file>",
      "  aiwiki doctor",
      "  aiwiki doctor --json",
      "  aiwiki status",
      "  aiwiki status --json",
      "  aiwiki next --json",
      "  aiwiki rebuild --path <workspace> --json",
      "  aiwiki rebuild --check --json",
      "  aiwiki rebuild --dry-run --json",
      "  aiwiki index build --path <workspace> --json",
      "  aiwiki index status --path <workspace> --json",
      "  aiwiki index rebuild --path <workspace> --json",
      "  aiwiki graph build --path <workspace> --json",
      "  aiwiki graph status --path <workspace> --json",
      "  aiwiki graph rebuild --path <workspace> --json",
      "  aiwiki health --json",
      "  aiwiki health --write --json",
      "  aiwiki repair --plan --json",
      "  aiwiki runs inspect --path <workspace> --json",
      "  aiwiki runs compact --dry-run --path <workspace> --json",
      "  aiwiki runs compact --yes --path <workspace> --json",
      "  aiwiki show <query>",
      "  aiwiki context <query>",
      "  aiwiki context <query> --view graph --graph-depth 1",
      "  aiwiki query <query>",
      "  aiwiki lint",
      "  aiwiki lint --capsules --json",
      "  aiwiki lint --strict --json",
      "  aiwiki lint --maintenance --json",
      "  aiwiki lint --fix-empty-dirs --json",
      "  aiwiki plugin list --json",
      "  aiwiki plugin inspect <id> --json",
      "  aiwiki plugin add <directory>",
      "  aiwiki plugin enable <id>",
      "  aiwiki plugin disable <id>",
      "  aiwiki plugin remove <id>",
      "  aiwiki plugin doctor --json",
      "",
      "帮助语言:",
      "  --lang en|zh-CN",
      "  AIWIKI_LANG=en|zh-CN"
    ],
    index: [
      "AIWiki index",
      "",
      "检查或重建可移除的 Markdown 派生索引元数据。",
      "  aiwiki index build --path <workspace> --json",
      "  aiwiki index status --path <workspace> --json",
      "  aiwiki index rebuild --path <workspace> --json",
      "",
      "索引过期、缺失或无效时，status 以状态码 1 退出。索引不可用时，context 和 query 仍直接读取 Markdown。"
    ]
  }
};

export function resolveHelpLocale(args: ParsedArgs, environmentLocale = process.env.AIWIKI_LANG): HelpLocale {
  if (args.flags.has("lang")) {
    const requested = args.flags.get("lang");
    if (isHelpLocale(requested)) return requested;
    const fallback = isHelpLocale(environmentLocale) ? environmentLocale : DEFAULT_HELP_LOCALE;
    throw unsupportedLocale(fallback, requested);
  }
  if (environmentLocale === undefined) return DEFAULT_HELP_LOCALE;
  if (isHelpLocale(environmentLocale)) return environmentLocale;
  throw unsupportedLocale(DEFAULT_HELP_LOCALE, environmentLocale);
}

export function writeHelp(stream: NodeJS.WritableStream, locale: HelpLocale, topic: HelpTopic): void {
  for (const line of HELP_TEXT[locale][topic]) writeLine(stream, line);
}

export function errorLabel(locale: HelpLocale): string {
  return locale === "en" ? "Error" : "错误";
}

export function unknownCommandMessage(locale: HelpLocale, command: string | undefined): string {
  return locale === "en" ? `Unknown command: ${command ?? ""}` : `未知命令: ${command ?? ""}`;
}

export function queryRequiredMessage(locale: HelpLocale): string {
  return locale === "en" ? "Please provide a query topic." : "请提供查询主题。";
}

function isHelpLocale(value: unknown): value is HelpLocale {
  return value === "en" || value === DEFAULT_HELP_LOCALE;
}

export class HelpLocaleResolutionError extends CliError {
  constructor(readonly locale: HelpLocale, message: string) {
    super(message);
  }
}

function unsupportedLocale(locale: HelpLocale, value: unknown): HelpLocaleResolutionError {
  const rendered = typeof value === "string" && value.length > 0 ? `"${value}"` : "(missing)";
  return new HelpLocaleResolutionError(locale, locale === "en"
    ? `Unsupported help locale ${rendered}. Use --lang en or --lang zh-CN.`
    : `不支持的帮助语言 ${rendered}。请使用 --lang en 或 --lang zh-CN。`);
}
