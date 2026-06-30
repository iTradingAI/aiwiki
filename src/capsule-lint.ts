import { buildCapsules } from "./capsule.js";
import type { LintIssue } from "./lint.js";

export type CapsuleLintOptions = {
  capsules?: boolean;
  lifecycle?: boolean;
  okf?: boolean;
  strict?: boolean;
};

export async function capsuleLintIssues(rootPath: string, options: CapsuleLintOptions): Promise<LintIssue[]> {
  if (!options.capsules && !options.lifecycle && !options.okf && !options.strict) {
    return [];
  }
  const capsules = await buildCapsules(rootPath);
  const issues: LintIssue[] = [];
  for (const capsule of capsules) {
    if (options.capsules || options.strict) {
      if (!capsule.primary) {
        issues.push({
          severity: options.strict ? "error" : "warning",
          category: "capsule_missing_primary",
          action: "reingest",
          message: `Source Capsule has no primary Wiki Entry: ${capsule.id}`,
          suggestion: "Reingest the source or create a matching Wiki Entry."
        });
      }
      const primaryCount = capsule.artifacts.filter((artifact) => artifact.visibility === "primary" || artifact.role === "primary").length;
      if (primaryCount > 1) {
        issues.push({
          severity: options.strict ? "error" : "warning",
          category: "capsule_duplicate_primary",
          message: `Source Capsule has multiple primary artifacts: ${capsule.id}`,
          suggestion: "Keep one primary Wiki Entry and demote or archive the other primary artifacts."
        });
      }
      if (capsule.artifacts.every((artifact) => artifact.visibility === "debug")) {
        issues.push({
          severity: options.strict ? "warning" : "info",
          category: "capsule_debug_only",
          message: `Source Capsule only has debug artifacts: ${capsule.id}`,
          suggestion: "Check the run summary and reingest if the source should become reusable knowledge."
        });
      }
      if (!capsule.artifacts.some((artifact) => artifact.kind === "source_card" || artifact.kind === "raw_article")) {
        issues.push({
          severity: options.strict ? "warning" : "info",
          category: "capsule_missing_evidence",
          path: capsule.primary?.vaultPath,
          message: `Source Capsule is missing source evidence artifacts: ${capsule.id}`,
          suggestion: "Ensure the capsule has a Source Card or raw source file."
        });
      }
    }

    if (options.lifecycle || options.strict) {
      for (const warning of capsule.lifecycle.warnings) {
        issues.push({
          severity: options.strict ? "warning" : "info",
          category: "lifecycle",
          path: capsule.primary?.vaultPath,
          message: `Lifecycle warning for ${capsule.id}: ${warning}`,
          suggestion: "Review lifecycle frontmatter and update status, confidence, evidence, or relationship fields."
        });
      }
    }

    if (options.okf || options.strict) {
      for (const warning of capsule.okf.warnings) {
        issues.push({
          severity: options.strict && warning !== "okf_missing_resource" ? "warning" : "info",
          category: "okf_readiness",
          path: capsule.primary?.vaultPath,
          message: `OKF readiness warning for ${capsule.id}: ${warning}`,
          suggestion: "Add title, description, resource, timestamp, and source evidence when available."
        });
      }
    }
  }
  return issues;
}
