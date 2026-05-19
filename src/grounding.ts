import { NormalizedPayload } from "./payload.js";

export type GroundingReport = {
  evidence_available: boolean;
  evidence_channel: "host_supplied" | "none";
  claim_count: number;
  claim_quote_count: number;
  unsupported_claim_count: number;
  coverage_suspected_incomplete: boolean;
  needs_review: boolean;
  suspicion_markers: string[];
};

export function buildGroundingReport(payload: NormalizedPayload): GroundingReport {
  const claims = payload.analysis?.claims ?? [];
  const reusableKnowledge = payload.analysis?.reusable_knowledge ?? [];
  const content = payload.source.content ?? "";
  let evidenceQuoteCount = 0;
  let unsupportedClaimCount = 0;
  const markers = new Set<string>();

  for (const claim of claims) {
    const quote = claim.source_quote?.trim();
    if (quote && content.includes(quote)) {
      evidenceQuoteCount += 1;
      continue;
    }
    unsupportedClaimCount += 1;
    markers.add(quote ? "source_quote_not_found" : "unsupported_claims");
  }
  for (const item of reusableKnowledge) {
    const quote = item.source_quote?.trim();
    if (quote && content.includes(quote)) {
      evidenceQuoteCount += 1;
    } else if (quote) {
      markers.add("source_quote_not_found");
    }
  }

  const coverageSuspectedIncomplete = hasSparseAnalysisForLongContent(payload);
  if (coverageSuspectedIncomplete) {
    markers.add("coverage_suspected_incomplete");
  }

  return {
    evidence_available: evidenceQuoteCount > 0,
    evidence_channel: evidenceQuoteCount > 0 ? "host_supplied" : "none",
    claim_count: claims.length,
    claim_quote_count: claims.filter((claim) => claim.source_quote?.trim() && content.includes(claim.source_quote.trim())).length,
    unsupported_claim_count: unsupportedClaimCount,
    coverage_suspected_incomplete: coverageSuspectedIncomplete,
    needs_review: markers.size > 0,
    suspicion_markers: [...markers]
  };
}

export function groundingWarnings(report: GroundingReport): string[] {
  const warnings: string[] = [];
  if (report.unsupported_claim_count > 0) {
    warnings.push(`grounding: ${report.unsupported_claim_count} claim(s) lack a source_quote found in raw content.`);
  }
  if (report.coverage_suspected_incomplete) {
    warnings.push("grounding: coverage_suspected_incomplete is heuristic and needs review.");
  }
  return warnings;
}

export function groundingFrontmatterLines(grounding: GroundingReport): string[] {
  return [
    `grounding_evidence_available: ${grounding.evidence_available ? "true" : "false"}`,
    `grounding_evidence_channel: "${grounding.evidence_channel}"`,
    `grounding_needs_review: ${grounding.needs_review ? "true" : "false"}`,
    `grounding_markers: ${yamlStringArray(grounding.suspicion_markers)}`,
    `grounding_claim_count: "${grounding.claim_count}"`,
    `grounding_claim_quote_count: "${grounding.claim_quote_count}"`,
    `grounding_unsupported_claim_count: "${grounding.unsupported_claim_count}"`,
    `coverage_suspected_incomplete: ${grounding.coverage_suspected_incomplete ? "true" : "false"}`
  ];
}

function hasSparseAnalysisForLongContent(payload: NormalizedPayload): boolean {
  if (!payload.analysis) {
    return false;
  }
  const contentLength = (payload.source.content ?? "").replace(/\s+/g, "").length;
  if (contentLength < 500) {
    return false;
  }
  const extractedSignals =
    payload.analysis.key_points.length +
    payload.analysis.reusable_knowledge.length +
    payload.analysis.related_concepts.length +
    payload.analysis.use_cases.length +
    payload.analysis.topic_candidates.length;
  return extractedSignals < 3;
}

function yamlStringArray(values: string[]): string {
  return `[${values.map((value) => `"${escapeYaml(value)}"`).join(", ")}]`;
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
