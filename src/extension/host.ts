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
import {
  checkCapabilityPermissionConsistency,
  isExtensionCapability,
  validatePermissionToken,
  type ExtensionCapability,
  type ExtensionPermissionToken
} from "./permissions.js";
import { safeJoin } from "../paths.js";

const HOST_STATE_VERSION = "aiwiki.extension-host.v1";
const EXTENSION_STATE_WRITE_RETRIES = 10;
const extensionStateLocks = new Map<string, Promise<void>>();
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
  "rebuild",
  "index",
  "graph",
  "health",
  "repair",
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

export type ExtensionSource = "bundled" | "local";

export type StaticExtensionDescriptor = Readonly<{
  id: string;
  name: string;
  version: string;
  apiVersion: typeof AIWIKI_EXTENSION_API_VERSION;
  aiwikiApi?: string;
  entry: string;
  capabilities?: readonly ExtensionCapability[];
  permissions?: readonly ExtensionPermissionToken[];
  source: ExtensionSource;
}>;

type ExtensionRuntime = StaticExtensionDescriptor & Readonly<{
  load(): Promise<unknown>;
}>;
type InstalledExtension = Readonly<{
  id: string;
  name: string;
  version: string;
  rootPath: string;
  registrationToken?: string;
}>;
type EnabledExtensionLoadSnapshot = Readonly<{
  loaded: readonly LoadedExtension[];
  failures: readonly Readonly<{
    source: ExtensionRuntime | InstalledExtension;
    state: ExtensionState;
    reason: string;
  }>[];
}>;
type ExtensionState = Readonly<{
  enabled: boolean;
  disabledReason?: string;
  activationToken?: string;
}>;
type InstalledFile = Readonly<{
  schema_version: typeof HOST_STATE_VERSION;
  extensions: readonly InstalledExtension[];
}>;
type EnabledFile = Readonly<{
  schema_version: typeof HOST_STATE_VERSION;
  extensions: Readonly<Record<string, ExtensionState>>;
}>;

type ExtensionRevision = Readonly<{
  schema_version: typeof HOST_STATE_VERSION;
  revision: number;
  installed: readonly InstalledExtension[];
  enabled: Readonly<Record<string, ExtensionState>>;
}>;

export type ExtensionStatus = Readonly<{
  id: string;
  name: string;
  version: string;
  source: ExtensionSource;
  status: "available" | "enabled" | "disabled";
  disabledReason?: string;
}>;

export type ExtensionInspection = Readonly<{
  descriptor: StaticExtensionDescriptor;
  status: ExtensionStatus["status"];
  disabledReason?: string;
  warnings: readonly string[];
  notes: readonly string[];
}>;

export type ExtensionDoctorEntry = Readonly<{
  id: string;
  source: ExtensionSource;
  status: ExtensionStatus["status"];
  descriptor?: StaticExtensionDescriptor;
  errors: readonly string[];
  warnings: readonly string[];
}>;

export type ExtensionDoctorReport = Readonly<{
  ok: boolean;
  extensions: readonly ExtensionDoctorEntry[];
}>;

export type ExtensionRemovalResult = Readonly<{
  id: string;
  source: "local";
  removed: true;
}>;

export type LoadedExtension = Readonly<{
  source: ExtensionSource;
  extension: AiwikiExtension;
  warnings: readonly string[];
  registrationToken?: string;
  activationToken?: string;
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
    entry: "./bundled/example.js",
    capabilities: ["command", "lint_rule"],
    permissions: ["workspace:read"],
    source: "bundled",
    async load() {
      return (await import("./bundled/example.js")).default;
    }
  },
  {
    id: "aiwiki.research-workflow",
    name: "AIWiki Research Workflow",
    version: "0.1.0",
    apiVersion: AIWIKI_EXTENSION_API_VERSION,
    entry: "./bundled/research-workflow.js",
    capabilities: ["command", "lint_rule"],
    permissions: ["workspace:read"],
    source: "bundled",
    async load() {
      return (await import("./bundled/research-workflow.js")).default;
    }
  }
];

export async function addLocalExtension(workspaceRoot: string, extensionRoot: string): Promise<ExtensionStatus> {
  const manifest = await readExtensionManifest(extensionRoot);
  return withExtensionStateLock(workspaceRoot, async () => {
    const extension: InstalledExtension = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      rootPath: manifest.rootPath,
      registrationToken: randomUUID()
    };
    return updateExtensionState(workspaceRoot, (state) => {
      if (findBundled(manifest.id) || state.installed.some((candidate) => candidate.id === manifest.id)) {
        throw new ExtensionHostError("already has an extension with id " + manifest.id + ".");
      }
      const { [manifest.id]: _, ...enabled } = state.enabled;
      return {
        installed: [...state.installed, extension],
        enabled,
        result: toStatus(extension, undefined)
      };
    });
  });
}

export async function listExtensionStatuses(workspaceRoot: string): Promise<readonly ExtensionStatus[]> {
  const state = await readExtensionState(workspaceRoot);
  const bundled = bundledExtensions.map((extension) => toStatus(extension, state.enabled[extension.id]));
  const local = state.installed.map((extension) => toStatus(extension, state.enabled[extension.id]));
  return [...bundled, ...local];
}

export async function disableExtension(workspaceRoot: string, id: string): Promise<ExtensionStatus> {
  return withExtensionStateLock(workspaceRoot, async () => updateExtensionState(workspaceRoot, (state) => {
    const source = findBundled(id) ?? state.installed.find((extension) => extension.id === id);
    if (!source) {
      throw new ExtensionHostError("does not have a registered extension with id " + id + ".");
    }
    const current = state.enabled[id];
    const nextState: ExtensionState = { enabled: false, disabledReason: current?.disabledReason ?? "disabled by user" };
    return {
      installed: state.installed,
      enabled: { ...state.enabled, [id]: nextState },
      result: toStatus(source, nextState)
    };
  }));
}

export async function removeExtension(workspaceRoot: string, id: string): Promise<ExtensionRemovalResult> {
  if (findBundled(id)) {
    throw new ExtensionHostError("cannot remove bundled extension " + id + ".");
  }
  return withExtensionStateLock(workspaceRoot, async () => updateExtensionState(workspaceRoot, (state) => {
    if (!state.installed.some((extension) => extension.id === id)) {
      throw new ExtensionHostError("does not have a registered extension with id " + id + ".");
    }
    const { [id]: _, ...enabled } = state.enabled;
    return {
      installed: state.installed.filter((extension) => extension.id !== id),
      enabled,
      result: { id, source: "local", removed: true }
    };
  }));
}

export async function inspectExtension(workspaceRoot: string, id: string): Promise<ExtensionInspection> {
  const state = await readExtensionState(workspaceRoot);
  const source = findBundled(id) ?? state.installed.find((extension) => extension.id === id);
  if (!source) {
    throw new ExtensionHostError("does not have a registered extension with id " + id + ".");
  }
  const descriptor = await descriptorForSource(source);
  const status = toStatus(descriptor, state.enabled[id]);
  const notes = descriptor.source === "local" && status.status === "disabled"
    ? ["runtime check deferred to enable"]
    : [];
  return {
    descriptor,
    status: status.status,
    ...(status.disabledReason === undefined ? {} : { disabledReason: status.disabledReason }),
    warnings: declarationWarnings(descriptor),
    notes
  };
}

export async function doctorExtensions(workspaceRoot: string): Promise<ExtensionDoctorReport> {
  const state = await readExtensionState(workspaceRoot);
  const bundled = bundledExtensions.map((extension) => doctorEntry(extension, state.enabled[extension.id]));
  const local = await Promise.all(state.installed.map(async (extension) => {
    const status = toStatus(extension, state.enabled[extension.id]);
    try {
      const descriptor = await descriptorForInstalled(extension);
      return doctorEntry(descriptor, state.enabled[extension.id]);
    } catch (error) {
      return {
        id: extension.id,
        source: "local" as const,
        status: status.status,
        errors: [errorMessage(error)],
        warnings: status.status === "disabled" ? ["runtime check deferred to enable"] : []
      };
    }
  }));
  const extensions = [...bundled, ...local];
  return {
    ok: extensions.every((extension) => extension.errors.length === 0),
    extensions
  };
}

export async function enableExtension(workspaceRoot: string, id: string): Promise<LoadedExtension> {
  const target = await withExtensionStateLock(workspaceRoot, async () => {
    const revision = await readExtensionState(workspaceRoot);
    const source = findBundled(id) ?? revision.installed.find((extension) => extension.id === id);
    if (!source) {
      throw new ExtensionHostError("does not have a registered extension with id " + id + ".");
    }
    return { source, state: revision.enabled[id], revision };
  });
  let revision = target.revision;

  while (true) {
    let loaded: LoadedExtension;
    let conflicts: EnabledExtensionLoadSnapshot;
    try {
      const descriptor = await descriptorForSource(target.source);
      assertDescriptorDeclarations(descriptor);
      loaded = await loadSource(target.source);
      conflicts = await loadEnabledExtensionSnapshot(
        { schema_version: HOST_STATE_VERSION, extensions: revision.installed },
        { schema_version: HOST_STATE_VERSION, extensions: revision.enabled }
      );
    } catch (error) {
      const reason = errorMessage(error);
      await withExtensionStateLock(workspaceRoot, async () => {
        await persistDisabledForEnableSnapshot(workspaceRoot, id, target.source, target.state, reason);
      }).catch(() => undefined);
      throw new ExtensionHostError(reason);
    }
    if (conflicts.failures.length) {
      const reconciliation = await withExtensionStateLock(workspaceRoot, async () => {
        try {
          await updateExtensionState(workspaceRoot, (state) => {
            if (!extensionLifecycleSnapshotMatches(state, id, target.source, target.state)) {
              throw new ExtensionEnableTargetSnapshotChangedError();
            }
            const enabled = { ...state.enabled };
            for (const failure of conflicts.failures) {
              if (!extensionLifecycleSnapshotMatches(state, failure.source.id, failure.source, failure.state)) {
                throw new ExtensionLifecycleSnapshotChangedError();
              }
              enabled[failure.source.id] = { enabled: false, disabledReason: failure.reason };
            }
            return { installed: state.installed, enabled, result: undefined };
          });
        } catch (error) {
          if (error instanceof ExtensionEnableTargetSnapshotChangedError) {
            return "target-changed" as const;
          }
          if (error instanceof ExtensionLifecycleSnapshotChangedError) {
            return "retry" as const;
          }
          throw error;
        }
        return "retry" as const;
      });
      if (reconciliation === "target-changed") {
        throw new ExtensionHostError("extension lifecycle changed while enabling " + id + "; retry.");
      }
      revision = await withExtensionStateLock(workspaceRoot, async () => {
        const current = await readExtensionState(workspaceRoot);
        if (!extensionLifecycleSnapshotMatches(current, id, target.source, target.state)) {
          throw new ExtensionHostError("extension lifecycle changed while enabling " + id + "; retry.");
        }
        return current;
      });
      continue;
    }
    try {
      assertNoExtensionCommandConflict(loaded, conflicts.loaded.filter((candidate) => candidate.extension.id !== id));
    } catch (error) {
      const reason = errorMessage(error);
      await withExtensionStateLock(workspaceRoot, async () => {
        await persistDisabledForEnableSnapshot(workspaceRoot, id, target.source, target.state, reason);
      }).catch(() => undefined);
      throw new ExtensionHostError(reason);
    }

    const committed = await withExtensionStateLock(workspaceRoot, async () => {
      const current = await readExtensionState(workspaceRoot);
      if (!extensionLifecycleSnapshotMatches(current, id, target.source, target.state)) {
        throw new ExtensionHostError("extension lifecycle changed while enabling " + id + "; retry.");
      }
      if (current.revision !== revision.revision) {
        return false;
      }
      await fs.mkdir(extensionStateRoot(workspaceRoot, id), { recursive: true });
      try {
        await updateExtensionState(workspaceRoot, (state) => {
          if (!extensionLifecycleSnapshotMatches(state, id, target.source, target.state)) {
            throw new ExtensionEnableTargetSnapshotChangedError();
          }
          if (state.revision !== current.revision) {
            throw new ExtensionLifecycleSnapshotChangedError();
          }
          return {
            installed: state.installed,
            enabled: { ...state.enabled, [id]: { enabled: true, activationToken: randomUUID() } },
            result: undefined
          };
        });
      } catch (error) {
        if (error instanceof ExtensionEnableTargetSnapshotChangedError) {
          throw new ExtensionHostError("extension lifecycle changed while enabling " + id + "; retry.");
        }
        if (error instanceof ExtensionLifecycleSnapshotChangedError) {
          return false;
        }
        throw error;
      }
      return true;
    });
    if (committed) {
      return loaded;
    }
    revision = await withExtensionStateLock(workspaceRoot, async () => {
      const current = await readExtensionState(workspaceRoot);
      if (!extensionLifecycleSnapshotMatches(current, id, target.source, target.state)) {
        throw new ExtensionHostError("extension lifecycle changed while enabling " + id + "; retry.");
      }
      return current;
    });
  }
}

export async function loadEnabledExtensions(workspaceRoot: string): Promise<readonly LoadedExtension[]> {
  let state: ExtensionRevision;
  try {
    state = await readExtensionState(workspaceRoot);
  } catch {
    return [];
  }

  const loaded: LoadedExtension[] = [];
  for (const source of [...bundledExtensions, ...state.installed]) {
    const extensionState = state.enabled[source.id];
    if (!extensionState?.enabled) {
      continue;
    }
    try {
      const extension = await loadSource(source);
      loaded.push({
        ...extension,
        ...(extensionState.activationToken === undefined ? {} : { activationToken: extensionState.activationToken })
      });
    } catch (error) {
      await persistDisabledForSource(workspaceRoot, source, extensionState, errorMessage(error));
    }
  }
  return loaded;
}

async function loadEnabledExtensionSnapshot(
  installed: InstalledFile,
  enabled: EnabledFile
): Promise<EnabledExtensionLoadSnapshot> {
  const loaded: LoadedExtension[] = [];
  const failures: Array<{
    source: ExtensionRuntime | InstalledExtension;
    state: ExtensionState;
    reason: string;
  }> = [];
  for (const source of [...bundledExtensions, ...installed.extensions]) {
    const state = enabled.extensions[source.id];
    if (!state?.enabled) {
      continue;
    }
    try {
      loaded.push(await loadSource(source));
    } catch (error) {
      failures.push({ source, state, reason: errorMessage(error) });
    }
  }
  return { loaded, failures };
}

export async function runEnabledExtensionCommand(
  workspaceRoot: string,
  positional: readonly string[],
  argv: readonly string[] = positional
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
    const result = await command.run({ argv: argv.slice(command.path.length) });
    return validateCommandResult(result);
  } catch (error) {
    const reason = errorMessage(error);
    await persistDisabledForLoadedExtension(workspaceRoot, loaded, reason);
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
        await persistDisabledForLoadedExtension(workspaceRoot, loaded, errorMessage(error));
        break;
      }
    }
  }
  return findings;
}

function toStatus(
  extension: Pick<StaticExtensionDescriptor | InstalledExtension, "id" | "name" | "version">,
  state: ExtensionState | undefined
): ExtensionStatus {
  return {
    id: extension.id,
    name: extension.name,
    version: extension.version,
    source: "source" in extension && extension.source === "bundled" ? "bundled" : "local",
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

function descriptorFromManifest(manifest: ResolvedExtensionManifest): StaticExtensionDescriptor {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    apiVersion: manifest.apiVersion,
    entry: manifest.entry,
    source: "local",
    ...(manifest.aiwikiApi === undefined ? {} : { aiwikiApi: manifest.aiwikiApi }),
    ...(manifest.capabilities === undefined ? {} : { capabilities: manifest.capabilities }),
    ...(manifest.permissions === undefined ? {} : { permissions: manifest.permissions })
  };
}

async function descriptorForInstalled(installed: InstalledExtension): Promise<StaticExtensionDescriptor> {
  const manifest = await readExtensionManifest(installed.rootPath);
  assertInstalledManifest(installed, manifest);
  return descriptorFromManifest(manifest);
}

async function descriptorForSource(source: ExtensionRuntime | InstalledExtension): Promise<StaticExtensionDescriptor> {
  return isBundled(source) ? source : descriptorForInstalled(source);
}

function assertDescriptorDeclarations(descriptor: StaticExtensionDescriptor): void {
  for (const capability of descriptor.capabilities ?? []) {
    if (!isExtensionCapability(capability)) {
      throw new ExtensionHostError("declares an unknown capability " + JSON.stringify(capability) + ".");
    }
  }
  for (const permission of descriptor.permissions ?? []) {
    const validation = validatePermissionToken(permission);
    if (!validation.ok) {
      throw new ExtensionHostError("declares " + validation.error + ".");
    }
  }
}

function declarationWarnings(descriptor: StaticExtensionDescriptor): string[] {
  return checkCapabilityPermissionConsistency(descriptor.capabilities ?? [], descriptor.permissions ?? []);
}

function doctorEntry(descriptor: StaticExtensionDescriptor, state: ExtensionState | undefined): ExtensionDoctorEntry {
  const errors: string[] = [];
  try {
    assertDescriptorDeclarations(descriptor);
  } catch (error) {
    errors.push(errorMessage(error));
  }
  return {
    id: descriptor.id,
    source: descriptor.source,
    status: toStatus(descriptor, state).status,
    descriptor,
    errors,
    warnings: [
      ...declarationWarnings(descriptor),
      ...(descriptor.source === "local" ? ["runtime validation deferred to enable"] : [])
    ]
  };
}

function runtimeCapabilityWarnings(
  descriptor: StaticExtensionDescriptor,
  extension: AiwikiExtension
): string[] {
  const runtimeCapabilities: ExtensionCapability[] = [];
  if (extension.commands !== undefined) {
    runtimeCapabilities.push("command");
  }
  if (extension.lintRules !== undefined) {
    runtimeCapabilities.push("lint_rule");
  }
  if (extension.contextProviders !== undefined) {
    runtimeCapabilities.push("context_provider");
  }
  if (extension.artifactGenerators !== undefined) {
    runtimeCapabilities.push("artifact_generator");
  }

  const declared = new Set(descriptor.capabilities ?? []);
  const runtime = new Set(runtimeCapabilities);
  const warnings: string[] = [];
  for (const capability of declared) {
    if (!runtime.has(capability)) {
      warnings.push("manifest declares " + capability + " but the module does not expose it.");
    }
  }
  for (const capability of runtime) {
    if (!declared.has(capability)) {
      warnings.push("module exposes " + capability + " without a manifest capability declaration.");
    }
  }
  return warnings;
}

async function loadSource(source: ExtensionRuntime | InstalledExtension): Promise<LoadedExtension> {
  if (isBundled(source)) {
    assertDescriptorDeclarations(source);
    const extension = validateExtension(await source.load(), source);
    return {
      source: "bundled",
      extension,
      warnings: runtimeCapabilityWarnings(source, extension)
    };
  }

  const manifest = await readExtensionManifest(source.rootPath);
  assertInstalledManifest(source, manifest);
  const descriptor = descriptorFromManifest(manifest);
  assertDescriptorDeclarations(descriptor);
  const module = await import(pathToFileURL(manifest.entryPath).href);
  const extension = validateExtension(module.default, manifest);
  return {
    source: "local",
    extension,
    warnings: runtimeCapabilityWarnings(descriptor, extension),
    ...(source.registrationToken === undefined ? {} : { registrationToken: source.registrationToken })
  };
}

function sameExtensionSource(
  first: ExtensionRuntime | InstalledExtension,
  second: ExtensionRuntime | InstalledExtension
): boolean {
  if (isBundled(first) || isBundled(second)) {
    return first === second;
  }
  return first.id === second.id
    && first.name === second.name
    && first.version === second.version
    && first.rootPath === second.rootPath
    && first.registrationToken === second.registrationToken;
}

function extensionLifecycleSnapshotMatches(
  revision: ExtensionRevision,
  id: string,
  source: ExtensionRuntime | InstalledExtension,
  state: ExtensionState | undefined
): boolean {
  const current = findBundled(id) ?? revision.installed.find((candidate) => candidate.id === id);
  return current !== undefined
    && sameExtensionSource(source, current)
    && sameExtensionState(state, revision.enabled[id]);
}

function sameExtensionState(
  first: ExtensionState | undefined,
  second: ExtensionState | undefined
): boolean {
  return first?.enabled === second?.enabled
    && first?.disabledReason === second?.disabledReason
    && first?.activationToken === second?.activationToken;
}

class ExtensionLifecycleSnapshotChangedError extends Error {}
class ExtensionEnableTargetSnapshotChangedError extends ExtensionLifecycleSnapshotChangedError {}

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
  const existingPaths = enabled.flatMap((loaded) => loaded.extension.commands ?? []);
  for (const command of candidate.extension.commands ?? []) {
    if (existingPaths.some((existing) => commandPathsOverlap(command.path, existing.path))) {
      throw new ExtensionHostError("command path conflicts with an enabled extension: " + command.path.join(" ") + ".");
    }
  }
}

function commandPathsOverlap(first: readonly string[], second: readonly string[]): boolean {
  return commandPathStartsWith(first, second) || commandPathStartsWith(second, first);
}

function commandPathStartsWith(value: readonly string[], prefix: readonly string[]): boolean {
  return value.length >= prefix.length && prefix.every((part, index) => value[index] === part);
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
  const state = await readExtensionState(workspaceRoot);
  return { schema_version: HOST_STATE_VERSION, extensions: state.installed };
}

async function readEnabled(workspaceRoot: string): Promise<EnabledFile> {
  const state = await readExtensionState(workspaceRoot);
  return { schema_version: HOST_STATE_VERSION, extensions: state.enabled };
}

async function writeEnabledState(workspaceRoot: string, id: string, extensionState: ExtensionState): Promise<void> {
  await updateExtensionState(workspaceRoot, (state) => ({
    installed: state.installed,
    enabled: { ...state.enabled, [id]: extensionState },
    result: undefined
  }));
}

async function readExtensionState(workspaceRoot: string): Promise<ExtensionRevision> {
  return (await readExtensionStateWithPublication(workspaceRoot)).state;
}

async function readExtensionStateWithPublication(workspaceRoot: string): Promise<Readonly<{
  state: ExtensionRevision;
  published: boolean;
}>> {
  const directory = revisionDirectory(workspaceRoot);
  let entries: readonly string[];
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    return { state: await readLegacyExtensionState(workspaceRoot), published: false };
  }

  let latest = -1;
  for (const entry of entries) {
    const match = /^(\d+)\.json$/.exec(entry);
    if (!match) {
      continue;
    }
    const revision = Number(match[1]);
    if (Number.isSafeInteger(revision) && revision >= 0 && revision > latest) {
      latest = revision;
    }
  }
  if (latest < 0) {
    return { state: await readLegacyExtensionState(workspaceRoot), published: false };
  }
  const value = await readStateFile(path.join(directory, String(latest) + ".json"));
  if (value === undefined) {
    throw new ExtensionHostError("published extension revision disappeared.");
  }
  return { state: validateExtensionRevision(value, latest), published: true };
}

async function readLegacyExtensionState(workspaceRoot: string): Promise<ExtensionRevision> {
  const [installedValue, enabledValue] = await Promise.all([
    readStateFile(installedPath(workspaceRoot)),
    readStateFile(enabledPath(workspaceRoot))
  ]);
  if (installedValue === undefined && enabledValue === undefined) {
    return emptyExtensionRevision();
  }
  return {
    schema_version: HOST_STATE_VERSION,
    revision: 0,
    installed: installedValue === undefined ? [] : validateInstalledFile(installedValue).extensions,
    enabled: enabledValue === undefined ? {} : validateEnabledFile(enabledValue).extensions
  };
}

function emptyExtensionRevision(): ExtensionRevision {
  return { schema_version: HOST_STATE_VERSION, revision: -1, installed: [], enabled: {} };
}

function validateExtensionRevision(value: unknown, expectedRevision: number): ExtensionRevision {
  if (
    !isRecord(value)
    || value.schema_version !== HOST_STATE_VERSION
    || value.revision !== expectedRevision
    || !Number.isSafeInteger(value.revision)
    || value.revision < 0
  ) {
    throw new ExtensionHostError("extension revision is invalid.");
  }
  const installed = validateInstalledFile({
    schema_version: value.schema_version,
    extensions: value.installed
  }).extensions;
  const enabled = validateEnabledFile({
    schema_version: value.schema_version,
    extensions: value.enabled
  }).extensions;
  return { schema_version: HOST_STATE_VERSION, revision: value.revision, installed, enabled };
}

function validateInstalledFile(value: unknown): InstalledFile {
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
      || (extension.registrationToken !== undefined && typeof extension.registrationToken !== "string")
    ) {
      throw new ExtensionHostError("installed registry has an invalid extension.");
    }
    return {
      id: extension.id,
      name: extension.name,
      version: extension.version,
      rootPath: extension.rootPath,
      ...(typeof extension.registrationToken === "string" ? { registrationToken: extension.registrationToken } : {})
    };
  });
  return { schema_version: HOST_STATE_VERSION, extensions };
}

function validateEnabledFile(value: unknown): EnabledFile {
  if (!isRecord(value) || value.schema_version !== HOST_STATE_VERSION || !isRecord(value.extensions)) {
    throw new ExtensionHostError("enabled registry is invalid.");
  }
  const extensions: Record<string, ExtensionState> = {};
  for (const [id, extensionState] of Object.entries(value.extensions)) {
    if (
      !isRecord(extensionState)
      || typeof extensionState.enabled !== "boolean"
      || (extensionState.disabledReason !== undefined && typeof extensionState.disabledReason !== "string")
      || (extensionState.activationToken !== undefined && typeof extensionState.activationToken !== "string")
    ) {
      throw new ExtensionHostError("enabled registry has an invalid extension state.");
    }
    extensions[id] = {
      enabled: extensionState.enabled,
      ...(typeof extensionState.disabledReason === "string" ? { disabledReason: extensionState.disabledReason } : {}),
      ...(typeof extensionState.activationToken === "string" ? { activationToken: extensionState.activationToken } : {})
    };
  }
  return { schema_version: HOST_STATE_VERSION, extensions };
}

async function updateExtensionState<T>(
  workspaceRoot: string,
  change: (state: ExtensionRevision) => Readonly<{
    installed: readonly InstalledExtension[];
    enabled: Readonly<Record<string, ExtensionState>>;
    result: T;
  }>
): Promise<T> {
  for (let attempt = 0; attempt < EXTENSION_STATE_WRITE_RETRIES; attempt += 1) {
    const current = await readExtensionStateWithPublication(workspaceRoot);
    if (current.state.revision >= 0 && !current.published) {
      if (!await publishExtensionRevision(workspaceRoot, current.state)) {
        continue;
      }
    }
    const state = current.state;
    const next = change(state);
    if (await publishNextExtensionRevision(workspaceRoot, state, next.installed, next.enabled)) {
      return next.result;
    }
  }
  throw new ExtensionHostError("state changed too frequently; retry.");
}

async function publishNextExtensionRevision(
  workspaceRoot: string,
  state: ExtensionRevision,
  installed: readonly InstalledExtension[],
  enabled: Readonly<Record<string, ExtensionState>>
): Promise<boolean> {
  return publishExtensionRevision(workspaceRoot, {
    schema_version: HOST_STATE_VERSION,
    revision: state.revision + 1,
    installed,
    enabled
  });
}

async function publishExtensionRevision(workspaceRoot: string, revision: ExtensionRevision): Promise<boolean> {
  validateExtensionRevision(revision, revision.revision);
  const directory = revisionDirectory(workspaceRoot);
  const target = path.join(directory, String(revision.revision) + ".json");
  const temporary = target + ".tmp." + randomUUID();
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(temporary, JSON.stringify(revision, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    try {
      await fs.link(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return false;
      }
      throw error;
    }
    return true;
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function withExtensionStateLock<T>(workspaceRoot: string, action: () => Promise<T>): Promise<T> {
  const key = path.resolve(workspaceRoot);
  const previous = extensionStateLocks.get(key);
  let release: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous === undefined ? current : previous.then(() => current);
  extensionStateLocks.set(key, tail);
  try {
    await previous;
    return await action();
  } finally {
    release!();
    if (extensionStateLocks.get(key) === tail) {
      extensionStateLocks.delete(key);
    }
  }
}

export const extensionStateRevisionTestHooks = {
  read: readExtensionState,
  update: updateExtensionState
};

async function persistDisabled(workspaceRoot: string, id: string, reason: string): Promise<void> {
  try {
    await writeEnabledState(workspaceRoot, id, { enabled: false, disabledReason: reason });
  } catch {
    // The original extension failure is more useful than a best-effort state-write failure.
  }
}

async function persistDisabledForEnableSnapshot(
  workspaceRoot: string,
  id: string,
  source: ExtensionRuntime | InstalledExtension,
  snapshotState: ExtensionState | undefined,
  reason: string
): Promise<void> {
  try {
    await updateExtensionState(workspaceRoot, (state) => {
      if (!extensionLifecycleSnapshotMatches(state, id, source, snapshotState)) {
        throw new ExtensionLifecycleSnapshotChangedError();
      }
      return {
        installed: state.installed,
        enabled: { ...state.enabled, [id]: { enabled: false, disabledReason: reason } },
        result: undefined
      };
    });
  } catch (error) {
    if (!(error instanceof ExtensionLifecycleSnapshotChangedError)) {
      throw error;
    }
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


async function persistDisabledForSource(
  workspaceRoot: string,
  source: ExtensionRuntime | InstalledExtension,
  state: ExtensionState,
  reason: string
): Promise<void> {
  await withExtensionStateLock(workspaceRoot, async () => {
    const currentState = await readExtensionState(workspaceRoot);
    const current = findBundled(source.id) ?? currentState.installed.find((extension) => extension.id === source.id);
    if (
      current
      && sameExtensionSource(source, current)
      && currentState.enabled[source.id]?.enabled
      && currentState.enabled[source.id]?.activationToken === state.activationToken
    ) {
      await persistDisabled(workspaceRoot, source.id, reason);
    }
  }).catch(() => undefined);
}

async function persistDisabledForLoadedExtension(
  workspaceRoot: string,
  loaded: LoadedExtension,
  reason: string
): Promise<void> {
  await withExtensionStateLock(workspaceRoot, async () => {
    const state = await readExtensionState(workspaceRoot);
    const current = findBundled(loaded.extension.id)
      ?? state.installed.find((extension) => extension.id === loaded.extension.id);
    if (
      current
      && state.enabled[loaded.extension.id]?.enabled
      && state.enabled[loaded.extension.id]?.activationToken === loaded.activationToken
      && (loaded.source === "bundled"
        ? isBundled(current)
        : !isBundled(current) && current.registrationToken === loaded.registrationToken)
    ) {
      await persistDisabled(workspaceRoot, loaded.extension.id, reason);
    }
  }).catch(() => undefined);
}

function installedPath(workspaceRoot: string): string {
  return path.join(extensionDirectory(workspaceRoot), "installed.json");
}

function enabledPath(workspaceRoot: string): string {
  return path.join(extensionDirectory(workspaceRoot), "enabled.json");
}

function revisionDirectory(workspaceRoot: string): string {
  return path.join(extensionDirectory(workspaceRoot), "revisions");
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
