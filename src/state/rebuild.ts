import { withRebuildLock } from "./lock.js";
import { buildRebuildProjection, type RebuildProjection } from "./projection.js";
import { compareStoredProjection, writeStoredProjection, type StoredStateStatus } from "./storage.js";

export type RebuildMode = "write" | "check" | "dry_run";

export type RebuildResult = {
  schema_version: "aiwiki.rebuild.v1";
  mode: RebuildMode;
  state: "rebuilt" | "current" | "missing" | "stale" | "invalid" | "would_rebuild";
  snapshot_id: string;
  counts: Record<string, number>;
  written_files: string[];
};

export async function rebuildWorkspaceState(rootPath: string, mode: RebuildMode): Promise<RebuildResult> {
  if (mode === "write") {
    return withRebuildLock(rootPath, async () => {
      const projection = await buildRebuildProjection(rootPath);
      const writtenFiles = await writeStoredProjection(rootPath, projection);
      return resultFor(projection, mode, "rebuilt", writtenFiles);
    });
  }

  const projection = await buildRebuildProjection(rootPath);
  if (mode === "dry_run") {
    return resultFor(projection, mode, "would_rebuild", []);
  }

  return resultFor(projection, mode, await compareStoredProjection(rootPath, projection), []);
}

function resultFor(
  projection: RebuildProjection,
  mode: RebuildMode,
  state: "rebuilt" | "would_rebuild" | StoredStateStatus,
  writtenFiles: string[]
): RebuildResult {
  return {
    schema_version: "aiwiki.rebuild.v1",
    mode,
    state,
    snapshot_id: projection.snapshotId,
    counts: {
      artifacts: projection.artifacts.data.length,
      capsules: projection.capsules.data.length,
      relationships: projection.relationships.data.length,
      lifecycle: projection.lifecycle.data.length
    },
    written_files: writtenFiles
  };
}
