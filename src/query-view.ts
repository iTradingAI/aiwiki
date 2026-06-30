import { buildCapsules, searchCapsules } from "./capsule.js";
import type { ContextFilters } from "./context.js";

export type CapsuleQueryOptions = {
  filters?: ContextFilters;
  limit?: number;
  includeDebugOnly?: boolean;
};

export async function renderCapsuleQuery(rootPath: string, query: string, options: CapsuleQueryOptions = {}): Promise<string> {
  const capsules = searchCapsules(await buildCapsules(rootPath), query, options);
  const lines = [
    `AIWiki 查询: ${query}`,
    "",
    `Source Capsules: ${capsules.length}`,
    `view: capsule`,
    ""
  ];
  if (!capsules.length) {
    lines.push("未找到匹配的 Source Capsule。", "", `Agent JSON: aiwiki context "${query}" --view capsule`);
    return `${lines.join("\n")}\n`;
  }
  for (const capsule of capsules) {
    lines.push(`- ${capsule.title} (${capsule.id})`);
    lines.push(`  primary=${capsule.primary?.vaultPath ?? "none"}; artifacts=${capsule.artifacts.length}; okf_ready=${capsule.okf.ready ? "yes" : "no"}; lifecycle=${capsule.lifecycle.knowledgeStatus}`);
    if (capsule.sourceUrl) {
      lines.push(`  source=${capsule.sourceUrl}`);
    }
    if (capsule.quality.warnings.length) {
      lines.push(`  warnings=${capsule.quality.warnings.slice(0, 5).join(",")}`);
    }
  }
  lines.push("", `Open one: aiwiki show "${query}"`, `Agent JSON: aiwiki context "${query}" --view capsule`);
  return `${lines.join("\n")}\n`;
}
