export const AIWIKI_EXTENSION_API_VERSION = "aiwiki.extension.v1" as const;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | Readonly<{ [key: string]: JsonValue }>
  | readonly JsonValue[];

export type ExtensionArtifactKind =
  | "wiki_entry"
  | "raw_article"
  | "source_card"
  | "claim_suggestions"
  | "asset_suggestions"
  | "topic_candidates"
  | "draft_outline"
  | "processing_summary"
  | "unknown";

export type ExtensionArtifactRole =
  | "primary"
  | "raw_source"
  | "source_card"
  | "claim_suggestions"
  | "asset_suggestions"
  | "topic_suggestions"
  | "outline"
  | "run_log"
  | "unknown";

export type ExtensionArtifactVisibility = "primary" | "supporting" | "debug";

export type ExtensionArtifactSnapshot = Readonly<{
  vaultPath: string;
  kind: ExtensionArtifactKind;
  role: ExtensionArtifactRole;
  visibility: ExtensionArtifactVisibility;
  title?: string;
  summary?: string;
  sourceUrl?: string;
  capsuleId?: string;
  runId?: string;
  frontmatter?: Readonly<Record<string, JsonValue>>;
  bodyPreview?: string;
}>;

export type ExtensionCommandResult = Readonly<{
  exitCode: number;
  stdout?: string;
  stderr?: string;
  json?: JsonValue;
}>;

export type ExtensionCommandDefinition = Readonly<{
  kind: "command";
  id: string;
  path: readonly [string, ...string[]];
  summary: string;
  help?: readonly Readonly<{
    usage: string;
    visibility?: "public" | "hidden";
  }>[];
  run(input: Readonly<{ argv: readonly string[] }>): Promise<ExtensionCommandResult>;
}>;

export type ExtensionLintFinding = Readonly<{
  severity: "error" | "warning" | "info";
  message: string;
  vaultPath?: string;
  category?: string;
  suggestion?: string;
}>;

export type ExtensionLintRule = Readonly<{
  kind: "lint_rule";
  id: string;
  defaultSeverity: ExtensionLintFinding["severity"];
  evaluate(input: Readonly<{ artifacts: readonly ExtensionArtifactSnapshot[] }>): Promise<readonly ExtensionLintFinding[]>;
}>;

export type ExtensionContextItem = Readonly<{
  id: string;
  title: string;
  content: string;
  sourcePaths: readonly string[];
}>;

export type ExtensionContextFragment = Readonly<{
  namespace: string;
  items: readonly ExtensionContextItem[];
}>;

export type ExtensionContextProvider = Readonly<{
  kind: "context_provider";
  id: string;
  namespace: string;
  provide(input: Readonly<{
    query: string;
    limit?: number;
    filters?: Readonly<Record<string, string>>;
    artifacts: readonly ExtensionArtifactSnapshot[];
  }>): Promise<ExtensionContextFragment>;
}>;

export type ExtensionArtifactDraft = Readonly<{
  suggestedPath: string;
  content: string;
  frontmatter?: Readonly<Record<string, JsonValue>>;
}>;

export type ExtensionArtifactGenerator = Readonly<{
  kind: "artifact_generator";
  id: string;
  generates: readonly ExtensionArtifactKind[];
  generate(input: Readonly<{
    request: string;
    artifacts: readonly ExtensionArtifactSnapshot[];
  }>): Promise<readonly ExtensionArtifactDraft[]>;
}>;

export type AiwikiExtension = Readonly<{
  id: string;
  name: string;
  version: string;
  apiVersion: typeof AIWIKI_EXTENSION_API_VERSION;
  commands?: readonly ExtensionCommandDefinition[];
  lintRules?: readonly ExtensionLintRule[];
  contextProviders?: readonly ExtensionContextProvider[];
  artifactGenerators?: readonly ExtensionArtifactGenerator[];
}>;

export function defineExtension(extension: AiwikiExtension): AiwikiExtension {
  return extension;
}
