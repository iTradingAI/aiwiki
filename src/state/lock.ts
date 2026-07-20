import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";

import { safeJoin } from "../paths.js";

export class RebuildLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RebuildLockError";
  }
}

export class IndexLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexLockError";
  }
}

export async function withRebuildLock<T>(rootPath: string, action: () => Promise<T>): Promise<T> {
  const lockPath = safeJoin(rootPath, ".aiwiki", "locks", "rebuild.lock");
  await fs.mkdir(safeJoin(rootPath, ".aiwiki", "locks"), { recursive: true });

  let handle: FileHandle;
  try {
    handle = await fs.open(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new RebuildLockError("rebuild lock already exists.");
    }
    throw error;
  }

  const content = JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), command: "aiwiki rebuild" }, null, 2) + "\n";
  try {
    await handle.writeFile(content, "utf8");
    await handle.close();
    return await action();
  } finally {
    await handle.close().catch(() => undefined);
    // Retain an unrecognized lock rather than deleting a path no longer owned by this call.
    if (await lockMatches(lockPath, content)) {
      await fs.rm(lockPath, { force: true }).catch(() => undefined);
    }
  }
}

export async function withIndexLock<T>(rootPath: string, action: () => Promise<T>): Promise<T> {
  const lockPath = safeJoin(rootPath, ".aiwiki", "locks", "index.lock");
  await fs.mkdir(safeJoin(rootPath, ".aiwiki", "locks"), { recursive: true });

  let handle: FileHandle;
  try {
    handle = await fs.open(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new IndexLockError("index lock already exists.");
    }
    throw error;
  }

  const content = JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), command: "aiwiki index" }, null, 2) + "\n";
  try {
    await handle.writeFile(content, "utf8");
    await handle.close();
    return await action();
  } finally {
    await handle.close().catch(() => undefined);
    if (await lockMatches(lockPath, content)) {
      await fs.rm(lockPath, { force: true }).catch(() => undefined);
    }
  }
}

async function lockMatches(lockPath: string, content: string): Promise<boolean> {
  try {
    return (await fs.readFile(lockPath, "utf8")) === content;
  } catch {
    return false;
  }
}
