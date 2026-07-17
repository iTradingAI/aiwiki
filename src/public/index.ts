import { resolveRoot } from "../workspace.js";
import { AIWIKI_PUBLIC_API_VERSION, type AiwikiCli, type AiwikiCliStreams } from "./contracts.js";

export { discoverArtifacts, readArtifact } from "../artifact.js";
export { buildCapsules } from "../capsule.js";
export { buildCapsuleContext } from "../capsule-context.js";
export { buildContext } from "../context.js";
export { ingestFile, ingestPayload } from "../ingest.js";
export { lintWorkspace } from "../lint.js";
export { AIWIKI_PUBLIC_API_VERSION } from "./contracts.js";
export type {
  AiwikiArtifact,
  AiwikiCli,
  AiwikiCliStreams,
  CapsuleContextResult,
  ContextFilters,
  ContextResult,
  IngestResult,
  KnowledgeLifecycle,
  LintReport,
  SourceCapsule
} from "./contracts.js";

export function createAiwikiCli(): AiwikiCli {
  return Object.freeze({
    apiVersion: AIWIKI_PUBLIC_API_VERSION,
    async run(argv: readonly string[], streams?: AiwikiCliStreams): Promise<number> {
      const { runCli } = await import("../app.js");
      return runCli([...argv], streams);
    }
  });
}

export function resolveWorkspace(rootPath: string): string {
  return resolveRoot(rootPath);
}
