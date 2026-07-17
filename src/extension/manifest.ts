import { promises as fs } from "node:fs";
import path from "node:path";
import { AIWIKI_EXTENSION_API_VERSION } from "./api.js";

export const EXTENSION_MANIFEST_FILE = "aiwiki-extension.json";

export type ExtensionManifest = Readonly<{
  schemaVersion: typeof AIWIKI_EXTENSION_API_VERSION;
  id: string;
  name: string;
  version: string;
  apiVersion: typeof AIWIKI_EXTENSION_API_VERSION;
  entry: string;
}>;

export type ResolvedExtensionManifest = ExtensionManifest & Readonly<{
  rootPath: string;
  manifestPath: string;
  entryPath: string;
}>;

export class ExtensionManifestError extends Error {
  constructor(message: string) {
    super(`Extension manifest ${message}`);
    this.name = "ExtensionManifestError";
  }
}

export async function readExtensionManifest(extensionRoot: string): Promise<ResolvedExtensionManifest> {
  const rootPath = await resolveExtensionRoot(extensionRoot);
  const manifestPath = path.join(rootPath, EXTENSION_MANIFEST_FILE);
  const manifest = parseExtensionManifest(await readManifestJson(manifestPath));
  const entryPath = await resolveEntryPath(rootPath, manifest.entry);
  return { ...manifest, rootPath, manifestPath, entryPath };
}

export function parseExtensionManifest(value: unknown): ExtensionManifest {
  if (!isRecord(value)) {
    throw new ExtensionManifestError("must be a JSON object.");
  }

  const schemaVersion = requiredString(value, "schema_version");
  const id = requiredString(value, "id");
  const name = requiredString(value, "name");
  const version = requiredString(value, "version");
  const apiVersion = requiredString(value, "api_version");
  const entry = requiredString(value, "entry");

  if (schemaVersion !== AIWIKI_EXTENSION_API_VERSION) {
    throw new ExtensionManifestError(`schema_version must be "${AIWIKI_EXTENSION_API_VERSION}".`);
  }
  if (apiVersion !== AIWIKI_EXTENSION_API_VERSION) {
    throw new ExtensionManifestError(`api_version must be "${AIWIKI_EXTENSION_API_VERSION}".`);
  }
  if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(id)) {
    throw new ExtensionManifestError("id must be a lowercase dotted, dashed, or underscored identifier.");
  }
  if (!isSafeEntry(entry)) {
    throw new ExtensionManifestError("entry must be an in-root relative .js or .mjs path.");
  }

  return { schemaVersion, id, name, version, apiVersion, entry };
}

async function resolveExtensionRoot(extensionRoot: string): Promise<string> {
  try {
    const rootPath = await fs.realpath(extensionRoot);
    if (!(await fs.stat(rootPath)).isDirectory()) {
      throw new ExtensionManifestError("root must be a directory.");
    }
    return rootPath;
  } catch (error) {
    if (error instanceof ExtensionManifestError) {
      throw error;
    }
    throw new ExtensionManifestError(`root is not readable: ${extensionRoot}.`);
  }
}

async function readManifestJson(manifestPath: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ExtensionManifestError(`contains invalid JSON: ${manifestPath}.`);
    }
    throw new ExtensionManifestError(`is not readable: ${manifestPath}.`);
  }
}

async function resolveEntryPath(rootPath: string, entry: string): Promise<string> {
  const candidate = path.resolve(rootPath, ...entry.split("/"));
  let entryPath: string;
  try {
    entryPath = await fs.realpath(candidate);
  } catch {
    throw new ExtensionManifestError(`entry is not readable: ${entry}.`);
  }
  if (!isWithinRoot(rootPath, entryPath)) {
    throw new ExtensionManifestError(`entry resolves outside extension root: ${entry}.`);
  }
  if (!(await fs.stat(entryPath)).isFile()) {
    throw new ExtensionManifestError(`entry is not a file: ${entry}.`);
  }
  return entryPath;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new ExtensionManifestError(`field "${field}" must be a non-empty string.`);
  }
  return candidate;
}

function isSafeEntry(entry: string): boolean {
  if (
    path.isAbsolute(entry)
    || path.win32.isAbsolute(entry)
    || entry.includes("\\")
    || !/\.(?:m?js)$/i.test(entry)
  ) {
    return false;
  }
  return entry.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

function isWithinRoot(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
