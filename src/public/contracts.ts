export const AIWIKI_PUBLIC_API_VERSION = "aiwiki.public.v1" as const;

export type AiwikiCliStreams = Readonly<{
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}>;

export type AiwikiCli = Readonly<{
  apiVersion: typeof AIWIKI_PUBLIC_API_VERSION;
  run(argv: readonly string[], streams?: AiwikiCliStreams): Promise<number>;
}>;

export type { AiwikiArtifact } from "../artifact.js";
export type { SourceCapsule } from "../capsule.js";
export type { CapsuleContextResult } from "../capsule-context.js";
export type { ContextFilters, ContextResult } from "../context.js";
export type { IngestResult } from "../ingest.js";
export type { KnowledgeLifecycle } from "../lifecycle.js";
export type { LintReport } from "../lint.js";
