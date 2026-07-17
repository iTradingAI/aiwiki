import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { discoverArtifacts } from "../artifact.js";
import {
  AIWIKI_EXTENSION_API_VERSION,
  type AiwikiExtension,
  type ExtensionArtifactSnapshot,
  type ExtensionCommandDefinition,
  type ExtensionCommandResult,
  type ExtensionLintFinding,
  type JsonValue
} from "./api.js";
import {
  readExtensionManifest,
  type ResolvedExtensionManifest
} from "./manifest.js";
import { safeJoin } from "../paths.js";

const HOST_STATE_VERSION = "aiwiki.extension-host.v1";
const CORE_COMMAND_ROOTS = new Set([
  "version",
  "-v",
  "agent",
  "help",
  "-h",
  "setup",
  "prompt",
  "init",
  "config",
  "doctor",
  "status",
  "context",
  "query",
  "show",
  "next",
  "lint",
  "ingest-agent",
  "ingest-file",
  "ingest-url",
  "plugin"
]);

type ExtensionSource = "bundled" | "local";
type ExtensionRuntime = Readonly<{
  id: string;
  name: string;
  version: string;
  apiVersion: typeof AIWIKI_EXTENSION_API_VERSION;
  load(): Promise<unknown>;
}>;
type InstalledExtension = Readonly<{
  id: string;
  name: string;
  version: string;
  rootPath: string;
}>;
type ExtensionState = Readonly<{
  enabled: boolean;
  disabledReason?: string;
}>;
type InstalledFile = Readonly<{
  schema_version: typeof HOST_STATE_VERSION;
  extensions: readonly InstalledExtension[];
}>;
type EnabledFile = Readonly<{
  schema_version: typeof HOST_STATE_VERSION;
  extensions: Readonly<Record<string, ExtensionState>>;
}>;

export type ExtensionStatus = Readonly<{
  id: string;
  name: string;
  version: string;
  source: ExtensionSource;
  status: "available" | "enabled" | "disabled";
  disabledReason?: string;
}>;

export type LoadedExtension = Readonly<{
  source: ExtensionSource;
  extension: AiwikiExtension;
}>;

export type ExtensionLintFindingResult = Readonly<{
  extensionId: string;
  ruleId: string;
  finding: ExtensionLintFinding;
}>;

export class ExtensionHostError extends Error {
  constructor(message: string) {
    super("Extension host " + message);
    this.name = "ExtensionHostError";
  }
}

const bundledExtensions: readonly ExtensionRuntime[] = [
  {
    id: "aiwiki.bundled-example",
    name: "AIWiki bundled example",
    version: "0.1.0",
    apiVersion: AIWIKI_EXTENSION_API_VERSION,
    async load() {
      return (await import("./bundled/example.js")).default;
    }
  }
];

export async function addLocalExtension(workspaceRoot: string, extensionRoot: string): Promise<ExtensionStatus> {
  const manifest = await readExtensionManifest(extensionRoot);
  const installed = await readInstalled(workspaceRoot);
  if (findBundled(manifest.id) || installed.extensions.some((extension) => extension.id === manifest.id)) {
    throw new ExtensionHostError("already has an extension with id " + manifest.id + ".");
  }

  const extension: InstalledExtension = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    rootPath: manifest.rootPath
  };
  await writeInstalled(workspaceRoot, {
    schema_version: HOST_STATE_VERSION,
    extensions: [...installed.extensions, extension]
  });
  return toStatus(extension, "local", undefined);
}

export async function listExtensionStatuses(workspaceRoot: string): Promise<readonly ExtensionStatus[]> {
  const [installed, enabled] = await Promise.all([readInstalled(workspaceRoot), readEnabled(workspaceRoot)]);
  const bundled = bundledExtensions.map((extension) => toStatus(extension, "bundled", enabled.extensions[extension.id]));
  const local = installed.extensions.map((extension) => toStatus(extension, "local", enabled.extensions[extension.id]));
  return [...bundled, ...local];
}

export async function enableExtension(workspaceRoot: string, id: string): Promise<LoadedExtension> {
  const source = await findExtensionSource(workspaceRoot, id);
  try {
    const loaded = await loadSource(source);
    assertNoExtensionCommandConflict(loaded, (await loadEnabledExtensions(workspaceRoot))
      .filter((candidate) => candidate.extension.id !== id));
    await writeEnabledState(workspaceRoot, id, { enabled: true });
    await fs.mkdir(extensionStateRoot(workspaceRoot, id), { recursive: true });
    return loaded;
  } catch (error) {
    const reason = errorMessage(error);
    await persistDisabled(workspaceRoot, id, reason);
    throw new ExtensionHostError(reason);
  }
}

export async function loadEnabledExtensions(workspaceRoot: string): Promise<readonly LoadedExtension[]> {
  let installed: InstalledFile;
  let enabled: EnabledFile;
  try {
    [installed, enabled] = await Promise.all([readInstalled(workspaceRoot), readEnabled(workspaceRoot)]);
  } catch {
    return [];
  }

  const sources = [
    ...bundledExtensions,
    ...installed.extensions
  ];
  const loaded: LoadedExtension[] = [];
  for (const source of sources) {
    if (!enabled.extensions[source.id]?.enabled) {
      continue;
    }
    try {
      loaded.push(await loadSource(source));
    } catch (error) {
      await persistDisabled(workspaceRoot, source.id, errorMessage(error));
    }
  }
  return loaded;
}

export async function runEnabledExtensionCommand(
  workspaceRoot: string,
  positional: readonly string[]
): Promise<ExtensionCommandResult | undefined> {
  const matches = (await loadEnabledExtensions(workspaceRoot)).flatMap((loaded) => (loaded.extension.commands ?? [])
    .filter((command) => commandMatches(command, positional))
    .map((command) => ({ loaded, command })));
  if (!matches.length) {
    return undefined;
  }
  if (matches.length > 1) {
    throw new ExtensionHostError("found more than one enabled extension command for " + positional.join(" ") + ".");
  }

  const { loaded, command } = matches[0];
  try {
    const result = await command.run({ argv: positional.slice(command.path.length) });
    return validateCommandResult(result);
  } catch (error) {
    const reason = errorMessage(error);
    await persistDisabled(workspaceRoot, loaded.extension.id, reason);
    throw new ExtensionHostError(reason);
  }
}

export async function evaluateExtensionLintFindings(workspaceRoot: string): Promise<readonly ExtensionLintFindingResult[]> {
  const artifacts = await extensionArtifactSnapshots(workspaceRoot);
  const findings: ExtensionLintFindingResult[] = [];
  for (const loaded of await loadEnabledExtensions(workspaceRoot)) {
    for (const rule of loaded.extension.lintRules ?? []) {
      try {
        const evaluated = await rule.evaluate({ artifacts });
        if (!Array.isArray(evaluated)) {
          throw new ExtensionHostError("lint rule " + rule.id + " must return an array.");
        }
        for (const finding of evaluated) {
          findings.push({
            extensionId: loaded.extension.id,
            ruleId: rule.id,
            finding: validateLintFinding(finding)
          });
        }
      } catch (error) {
        await persistDisabled(workspaceRoot, loaded.extension.id, errorMessage(error));
        break;
      }
    }
  }
  return findings;
}

function toStatus(
  extension: Pick<ExtensionRuntime | InstalledExtension, "id" | "name" | "version">,
  source: ExtensionSource,
  state: ExtensionState | undefined
): ExtensionStatus {
  return {
    id: extension.id,
    name: extension.name,
    version: extension.version,
    source,
    status: state?.enabled ? "enabled" : state?.disabledReason ? "disabled" : "available",
    ...(state?.disabledReason ? { disabledReason: state.disabledReason } : {})
  };
}

async function findExtensionSource(workspaceRoot: string, id: string): Promise<ExtensionRuntime | InstalledExtension> {
  const bundled = findBundled(id);
  if (bundled) {
    return bundled;
  }
  const installed = await readInstalled(workspaceRoot);
  const local = installed.extensions.find((extension) => extension.id === id);
  if (!local) {
    throw new ExtensionHostError("does not have a registered extension with id " + id + ".");
  }
  return local;
}

function findBundled(id: string): ExtensionRuntime | undefined {
  return bundledExtensions.find((extension) => extension.id === id);
}

async function loadSource(source: ExtensionRuntime | InstalledExtension): Promise<LoadedExtension> {
  if (isBundled(source)) {
    return {
      source: "bundled",
      extension: validateExtension(await source.load(), source)
    };
  }

  const manifest = await readExtensionManifest(source.rootPath);
  assertInstalledManifest(source, manifest);
  const module = await import(pathToFileURL(manifest.entryPath).href);
  return {
    source: "local",
    extension: validateExtension(module.default, manifest)
  };
}

function isBundled(source: ExtensionRuntime | InstalledExtension): source is ExtensionRuntime {
  return "load" in source;
}

function assertInstalledManifest(installed: InstalledExtension, manifest: ResolvedExtensionManifest): void {
  if (
    installed.id !== manifest.id
    || installed.name !== manifest.name
    || installed.version !== manifest.version
  ) {
    throw new ExtensionHostError("manifest no longer matches the registered extension " + installed.id + ".");
  }
}

function validateExtension(value: unknown, expected: Pick<ExtensionRuntime | ResolvedExtensionManifest, "id" | "name" | "version" | "apiVersion">): AiwikiExtension {
  if (!isRecord(value)) {
    throw new ExtensionHostError("module default export must be an extension object.");
  }
  if (
    value.id !== expected.id
    || value.name !== expected.name
    || value.version !== expected.version
    || value.apiVersion !== expected.apiVersion
  ) {
    throw new ExtensionHostError("module declaration does not match the registered manifest.");
  }

  validateCommands(value.commands);
  validateLintRules(value.lintRules);
  return value as AiwikiExtension;
}

function validateCommands(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    throw new ExtensionHostError("commands must be an array.");
  }
  const paths = new Set<string>();
  for (const command of value) {
    if (!isRecord(command) || command.kind !== "command" || typeof command.id !== "string" || typeof command.summary !== "string" || typeof command.run !== "function") {
      throw new ExtensionHostError("commands must contain valid command definitions.");
    }
    if (!Array.isArray(command.path) || !command.path.length || command.path.some((part) => typeof part !== "string" || !part.trim())) {
      throw new ExtensionHostError("command path must contain one or more non-empty strings.");
    }
    const commandPath = (command.path as readonly string[]).join(" ");
    if (CORE_COMMAND_ROOTS.has((command.path as readonly string[])[0])) {
      throw new ExtensionHostError("command path uses reserved Core command root " + (command.path as readonly string[])[0] + ".");
    }
    if (paths.has(commandPath)) {
      throw new ExtensionHostError("commands contain a duplicate path " + commandPath + ".");
    }
    paths.add(commandPath);
  }
}

function assertNoExtensionCommandConflict(candidate: LoadedExtension, enabled: readonly LoadedExtension[]): void {
  const existingPaths = new Set(enabled.flatMap((loaded) => (loaded.extension.commands ?? [])
    .map((command) => command.path.join(" "))));
  for (const command of candidate.extension.commands ?? []) {
    const commandPath = command.path.join(" ");
    if (existingPaths.has(commandPath)) {
      throw new ExtensionHostError("command path conflicts with an enabled extension: " + commandPath + ".");
    }
  }
}

function commandMatches(command: ExtensionCommandDefinition, positional: readonly string[]): boolean {
  return positional.length >= command.path.length
    && command.path.every((part, index) => positional[index] === part);
}

function validateCommandResult(value: unknown): ExtensionCommandResult {
  if (!isRecord(value) || !Number.isInteger(value.exitCode)) {
    throw new ExtensionHostError("command must return an object with an integer exitCode.");
  }
  if (
    (value.stdout !== undefined && typeof value.stdout !== "string")
    || (value.stderr !== undefined && typeof value.stderr !== "string")
    || (value.json !== undefined && !isJsonValue(value.json))
  ) {
    throw new ExtensionHostError("command result has an invalid stdout, stderr, or json value.");
  }
  return value as ExtensionCommandResult;
}

function validateLintFinding(value: unknown): ExtensionLintFinding {
  if (
    !isRecord(value)
    || !["error", "warning", "info"].includes(String(value.severity))
    || typeof value.message !== "string"
    || !value.message.trim()
    || (value.vaultPath !== undefined && typeof value.vaultPath !== "string")
    || (value.category !== undefined && typeof value.category !== "string")
    || (value.suggestion !== undefined && typeof value.suggestion !== "string")
  ) {
    throw new ExtensionHostError("lint rule returned an invalid finding.");
  }
  return value as ExtensionLintFinding;
}

async function extensionArtifactSnapshots(workspaceRoot: string): Promise<readonly ExtensionArtifactSnapshot[]> {
  return (await discoverArtifacts(workspaceRoot)).map((artifact) => ({
    vaultPath: artifact.vaultPath,
    kind: artifact.kind,
    role: artifact.role,
    visibility: artifact.visibility,
    ...(artifact.title ? { title: artifact.title } : {}),
    ...(artifact.summary ? { summary: artifact.summary } : {}),
    ...(artifact.sourceUrl ? { sourceUrl: artifact.sourceUrl } : {}),
    ...(artifact.capsuleId ? { capsuleId: artifact.capsuleId } : {}),
    ...(artifact.runId ? { runId: artifact.runId } : {}),
    frontmatter: toJsonRecord(artifact.frontmatter),
    ...(artifact.bodyPreview ? { bodyPreview: artifact.bodyPreview } : {})
  }));
}

function toJsonRecord(value: Record<string, unknown>): Readonly<Record<string, JsonValue>> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }
  if (isRecord(value)) {
    return toJsonRecord(value);
  }
  return null;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }
  return isRecord(value) && Object.values(value).every((item) => isJsonValue(item));
}

function validateLintRules(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    throw new ExtensionHostError("lintRules must be an array.");
  }
  for (const rule of value) {
    if (
      !isRecord(rule)
      || rule.kind !== "lint_rule"
      || typeof rule.id !== "string"
      || !["error", "warning", "info"].includes(String(rule.defaultSeverity))
      || typeof rule.evaluate !== "function"
    ) {
      throw new ExtensionHostError("lintRules must contain valid lint rule definitions.");
    }
  }
}

async function readInstalled(workspaceRoot: string): Promise<InstalledFile> {
  const value = await readStateFile(installedPath(workspaceRoot));
  if (value === undefined) {
    return { schema_version: HOST_STATE_VERSION, extensions: [] };
  }
  if (!isRecord(value) || value.schema_version !== HOST_STATE_VERSION || !Array.isArray(value.extensions)) {
    throw new ExtensionHostError("installed registry is invalid.");
  }
  const extensions = value.extensions.map((extension) => {
    if (
      !isRecord(extension)
      || typeof extension.id !== "string"
      || typeof extension.name !== "string"
      || typeof extension.version !== "string"
      || typeof extension.rootPath !== "string"
    ) {
      throw new ExtensionHostError("installed registry has an invalid extension.");
    }
    return {
      id: extension.id,
      name: extension.name,
      version: extension.version,
      rootPath: extension.rootPath
    };
  });
  return { schema_version: HOST_STATE_VERSION, extensions };
}

async function readEnabled(workspaceRoot: string): Promise<EnabledFile> {
  const value = await readStateFile(enabledPath(workspaceRoot));
  if (value === undefined) {
    return { schema_version: HOST_STATE_VERSION, extensions: {} };
  }
  if (!isRecord(value) || value.schema_version !== HOST_STATE_VERSION || !isRecord(value.extensions)) {
    throw new ExtensionHostError("enabled registry is invalid.");
  }
  const extensions: Record<string, ExtensionState> = {};
  for (const [id, state] of Object.entries(value.extensions)) {
    if (!isRecord(state) || typeof state.enabled !== "boolean" || (state.disabledReason !== undefined && typeof state.disabledReason !== "string")) {
      throw new ExtensionHostError("enabled registry has an invalid extension state.");
    }
    extensions[id] = {
      enabled: state.enabled,
      ...(typeof state.disabledReason === "string" ? { disabledReason: state.disabledReason } : {})
    };
  }
  return { schema_version: HOST_STATE_VERSION, extensions };
}

async function writeInstalled(workspaceRoot: string, value: InstalledFile): Promise<void> {
  await writeStateFile(installedPath(workspaceRoot), value);
}

async function writeEnabledState(workspaceRoot: string, id: string, state: ExtensionState): Promise<void> {
  const enabled = await readEnabled(workspaceRoot);
  await writeStateFile(enabledPath(workspaceRoot), {
    schema_version: HOST_STATE_VERSION,
    extensions: { ...enabled.extensions, [id]: state }
  });
}

async function persistDisabled(workspaceRoot: string, id: string, reason: string): Promise<void> {
  try {
    await writeEnabledState(workspaceRoot, id, { enabled: false, disabledReason: reason });
  } catch {
    // The original extension failure is more useful than a best-effort state-write failure.
  }
}

async function readStateFile(target: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await fs.readFile(target, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    if (error instanceof SyntaxError) {
      throw new ExtensionHostError("state file has invalid JSON: " + target + ".");
    }
    throw error;
  }
}

async function writeStateFile(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), "." + path.basename(target) + "." + randomUUID() + ".tmp");
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

function installedPath(workspaceRoot: string): string {
  return path.join(extensionDirectory(workspaceRoot), "installed.json");
}

function enabledPath(workspaceRoot: string): string {
  return path.join(extensionDirectory(workspaceRoot), "enabled.json");
}

function extensionStateRoot(workspaceRoot: string, id: string): string {
  return safeJoin(workspaceRoot, ".aiwiki", "extensions", "state", id);
}

function extensionDirectory(workspaceRoot: string): string {
  return safeJoin(workspaceRoot, ".aiwiki", "extensions");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
