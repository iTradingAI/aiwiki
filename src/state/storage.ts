import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

import { safeJoin } from "../paths.js";
import { schemaId } from "../schema.js";
import type { RebuildProjection, StateEnvelope } from "./projection.js";

export type StoredStateStatus = "missing" | "current" | "stale" | "invalid";

type StateFileKey = "artifacts" | "capsules" | "lifecycle" | "relationships";

type StateFile = Readonly<{
  key: StateFileKey;
  name: string;
  schemaVersion: string;
}>;

const STATE_FILES: readonly StateFile[] = [
  { key: "artifacts", name: "artifacts.json", schemaVersion: schemaId("stateArtifacts") },
  { key: "capsules", name: "capsules.json", schemaVersion: schemaId("stateCapsules") },
  { key: "lifecycle", name: "lifecycle.json", schemaVersion: schemaId("stateLifecycle") },
  { key: "relationships", name: "relationships.json", schemaVersion: schemaId("stateRelationships") }
];

export async function readStoredProjection(rootPath: string): Promise<RebuildProjection | undefined> {
  const values = await Promise.all(STATE_FILES.map((file) => readStateFile(stateFilePath(rootPath, file), file.schemaVersion)));
  if (values.some((value) => value === undefined)) {
    return undefined;
  }

  const [artifacts, capsules, lifecycle, relationships] = values as [StateEnvelope<unknown[]>, StateEnvelope<unknown[]>, StateEnvelope<unknown[]>, StateEnvelope<unknown[]>];
  const snapshotId = sharedSnapshotId(values as StateEnvelope<unknown[]>[]);
  if (!snapshotId) {
    throw new StateStorageError("state snapshots do not share one snapshot_id.");
  }

  return {
    snapshotId,
    artifacts: artifacts as RebuildProjection["artifacts"],
    capsules: capsules as RebuildProjection["capsules"],
    relationships: relationships as RebuildProjection["relationships"],
    lifecycle: lifecycle as RebuildProjection["lifecycle"]
  };
}

export async function compareStoredProjection(rootPath: string, expected: RebuildProjection): Promise<StoredStateStatus> {
  let stored: RebuildProjection | undefined;
  try {
    stored = await readStoredProjection(rootPath);
  } catch (error) {
    if (error instanceof StateStorageError) {
      return "invalid";
    }
    throw error;
  }

  if (!stored) {
    return "missing";
  }
  if (stored.snapshotId !== expected.snapshotId) {
    return "stale";
  }
  return sameSemanticProjection(stored, expected) ? "current" : "invalid";
}

export async function writeStoredProjection(rootPath: string, projection: RebuildProjection): Promise<string[]> {
  const stateDir = stateDirectory(rootPath);
  await fs.mkdir(stateDir, { recursive: true });
  const values: Record<StateFileKey, StateEnvelope<unknown[]>> = {
    artifacts: projection.artifacts,
    capsules: projection.capsules,
    lifecycle: projection.lifecycle,
    relationships: projection.relationships
  };

  for (const file of STATE_FILES) {
    const target = stateFilePath(rootPath, file);
    await writeStateFile(target, values[file.key]);
  }
  return STATE_FILES.map((file) => `.aiwiki/state/${file.name}`);
}

export class StateStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateStorageError";
  }
}

async function readStateFile(target: string, schemaVersion: string): Promise<StateEnvelope<unknown[]> | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(target, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    if (error instanceof SyntaxError) {
      throw new StateStorageError(`state file has invalid JSON: ${target}`);
    }
    throw error;
  }
  return validateEnvelope(parsed, target, schemaVersion);
}

function validateEnvelope(value: unknown, target: string, schemaVersion: string): StateEnvelope<unknown[]> {
  if (!isRecord(value)
    || value.schema_version !== schemaVersion
    || typeof value.snapshot_id !== "string"
    || !value.snapshot_id
    || typeof value.generated_at !== "string"
    || value.root !== "."
    || !isNumericRecord(value.summary)
    || !Array.isArray(value.data)) {
    throw new StateStorageError(`state file has an invalid envelope: ${target}`);
  }
  return value as StateEnvelope<unknown[]>;
}

async function writeStateFile(target: string, value: unknown): Promise<void> {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(temporary, "wx");
    await handle.writeFile(JSON.stringify(value, null, 2) + "\n", "utf8");
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, target);
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

function sharedSnapshotId(values: readonly StateEnvelope<unknown[]>[]): string | undefined {
  const ids = new Set(values.map((value) => value.snapshot_id));
  return ids.size === 1 ? values[0]?.snapshot_id : undefined;
}

function sameSemanticProjection(left: RebuildProjection, right: RebuildProjection): boolean {
  return JSON.stringify(toSemanticValue(left)) === JSON.stringify(toSemanticValue(right));
}

function toSemanticValue(projection: RebuildProjection): unknown {
  return {
    artifacts: projection.artifacts.data.map(({ modified_at: _modifiedAt, ...artifact }) => artifact),
    capsules: projection.capsules.data,
    lifecycle: projection.lifecycle.data,
    relationships: projection.relationships.data
  };
}

function stateDirectory(rootPath: string): string {
  return safeJoin(rootPath, ".aiwiki", "state");
}

function stateFilePath(rootPath: string, file: StateFile): string {
  return safeJoin(rootPath, ".aiwiki", "state", file.name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNumericRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item));
}
