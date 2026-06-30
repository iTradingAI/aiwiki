import { SourceCapsule, capsuleToJson, findCapsuleByArtifactPath, findCapsuleById, findCapsuleByQuery } from "./capsule.js";

export type ShowCapsuleOptions = {
  query?: string;
  id?: string;
  artifactPath?: string;
  json?: boolean;
  debug?: boolean;
  allArtifacts?: boolean;
};

export async function showCapsule(rootPath: string, options: ShowCapsuleOptions): Promise<string> {
  const capsule = await resolveCapsule(rootPath, options);
  if (!capsule) {
    throw new Error("No matching Source Capsule found.");
  }
  if (options.json) {
    return `${JSON.stringify(capsuleToJson(capsule, { debug: options.debug, allArtifacts: options.allArtifacts }), null, 2)}\n`;
  }
  return renderCapsule(capsule, options);
}

export async function resolveCapsule(rootPath: string, options: ShowCapsuleOptions): Promise<SourceCapsule | undefined> {
  if (options.id) {
    return findCapsuleById(rootPath, options.id);
  }
  if (options.artifactPath) {
    return findCapsuleByArtifactPath(rootPath, options.artifactPath);
  }
  if (options.query) {
    return findCapsuleByQuery(rootPath, options.query, { includeDebugOnly: options.debug });
  }
  throw new Error("Provide a Source Capsule query, --id, or --artifact-path <artifact.md>.");
}

export function renderCapsule(capsule: SourceCapsule, options: Pick<ShowCapsuleOptions, "debug" | "allArtifacts"> = {}): string {
  const artifacts = options.allArtifacts
    ? capsule.artifacts
    : [
      ...(capsule.primary ? [capsule.primary] : []),
      ...capsule.supportingArtifacts,
      ...(options.debug ? capsule.debugArtifacts : [])
    ];
  const lines = [
    `Source Capsule: ${capsule.title}`,
    "",
    `id: ${capsule.id}`,
    `source_url: ${capsule.sourceUrl ?? "none"}`,
    `content_fingerprint: ${capsule.contentFingerprint ?? "none"}`,
    `grouping_reason: ${capsule.groupingReason}`,
    `primary: ${capsule.primary?.vaultPath ?? "none"}`,
    "",
    "Lifecycle:",
    `- status: ${capsule.lifecycle.knowledgeStatus}`,
    `- confidence: ${capsule.lifecycle.confidenceLevel}`,
    `- staleness: ${capsule.lifecycle.staleness}`,
    `- evidence_count: ${capsule.lifecycle.evidenceCount}`,
    "",
    "OKF readiness:",
    `- ready: ${capsule.okf.ready ? "yes" : "no"}`,
    `- warnings: ${capsule.okf.warnings.length ? capsule.okf.warnings.join(", ") : "none"}`,
    "",
    "Artifacts:",
    ...(artifacts.length ? artifacts.map((artifact) => `- ${artifact.role}/${artifact.visibility}: ${artifact.vaultPath}`) : ["- none"]),
    "",
    "Warnings:",
    ...(capsule.quality.warnings.length ? capsule.quality.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "Next action:",
    `- ${nextAction(capsule)}`
  ];
  if (options.debug) {
    lines.splice(lines.length - 2, 0, "", "Debug:", `- run_ids: ${capsule.runIds.join(",") || "none"}`);
  }
  return `${lines.join("\n")}\n`;
}

function nextAction(capsule: SourceCapsule): string {
  if (!capsule.primary) return "create_or_reingest_wiki_entry";
  if (capsule.lifecycle.warnings.length) return "review_lifecycle_warnings";
  if (!capsule.okf.ready) return "review_okf_readiness";
  return "use_capsule_for_answer";
}
