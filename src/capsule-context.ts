import { buildCapsules, capsuleToJson, searchCapsules } from "./capsule.js";
import type { ContextFilters } from "./context.js";
import { schemaId } from "./schema.js";

export type CapsuleContextOptions = {
  filters?: ContextFilters;
  limit?: number;
  includeDebugOnly?: boolean;
};

export type CapsuleContextResult = {
  schema_version: "aiwiki.context.capsule.v1";
  query: string;
  generated_at: string;
  query_scope: {
    filters: ContextFilters;
    limit: number;
    view: "capsule";
  };
  result_quality: {
    total_capsules: number;
    has_primary: boolean;
    okf_ready_count: number;
    warnings: string[];
  };
  capsules: ReturnType<typeof capsuleToJson>[];
  missing_context: string[];
  recommended_next_action: string;
};

export async function buildCapsuleContext(
  rootPath: string,
  query: string,
  options: CapsuleContextOptions = {},
  now = new Date().toISOString()
): Promise<CapsuleContextResult> {
  const limit = normalizeLimit(options.limit);
  const capsules = searchCapsules(await buildCapsules(rootPath, now), query, {
    includeDebugOnly: options.includeDebugOnly,
    filters: options.filters,
    limit
  });
  const warnings = Array.from(new Set(capsules.flatMap((capsule) => capsule.quality.warnings)));
  const missingContext = missingContextFor(capsules);
  return {
    schema_version: schemaId("capsuleContext"),
    query,
    generated_at: now,
    query_scope: {
      filters: normalizeFilters(options.filters),
      limit,
      view: "capsule"
    },
    result_quality: {
      total_capsules: capsules.length,
      has_primary: capsules.some((capsule) => Boolean(capsule.primary)),
      okf_ready_count: capsules.filter((capsule) => capsule.okf.ready).length,
      warnings
    },
    capsules: capsules.map((capsule) => capsuleToJson(capsule)),
    missing_context: missingContext,
    recommended_next_action: recommendedNextAction(capsules, missingContext)
  };
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 10;
  return Math.max(1, Math.min(50, Math.floor(value ?? 10)));
}

function normalizeFilters(filters: ContextFilters | undefined): ContextFilters {
  return Object.fromEntries(
    Object.entries(filters ?? {})
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([key, value]) => [key, String(value).trim()])
  ) as ContextFilters;
}

function missingContextFor(capsules: Awaited<ReturnType<typeof buildCapsules>>): string[] {
  const missing = new Set<string>();
  if (!capsules.length) {
    missing.add("matching_capsule");
  }
  if (capsules.some((capsule) => !capsule.primary)) {
    missing.add("primary_wiki_entry");
  }
  if (capsules.some((capsule) => !capsule.okf.ready)) {
    missing.add("okf_ready_evidence");
  }
  return Array.from(missing);
}

function recommendedNextAction(capsules: Awaited<ReturnType<typeof buildCapsules>>, missing: string[]): string {
  if (!capsules.length) return "broaden_query_or_ingest_source";
  if (missing.includes("primary_wiki_entry")) return "create_or_reingest_wiki_entry";
  if (missing.includes("okf_ready_evidence")) return "review_okf_readiness";
  if (capsules.some((capsule) => capsule.lifecycle.warnings.length)) return "review_lifecycle_warnings";
  return "use_capsules_for_answer";
}
