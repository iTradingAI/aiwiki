import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { safeJoin } from "../paths.js";
import { assertPayloadWithinLimit, MAX_PAYLOAD_SIZE } from "../ingest-limits.js";

export { MAX_PAYLOAD_SIZE };

const MANAGED_DIRECTORIES = [
  "01-purpose",
  "02-raw/articles",
  "02-raw/sources",
  "03-sources/article-cards",
  "04-claims/_suggestions",
  "05-wiki/source-knowledge",
  "06-assets/_suggestions",
  "07-topics/ready",
  "08-outputs/outlines",
  "09-runs",
  "dashboards",
  "_system/templates",
  "_system/schemas",
  "_system/logs",
  ".aiwiki"
] as const;

export function validatePayloadSize(payload: unknown): void {
  assertPayloadWithinLimit(payload);
}

export async function confineWorkspaceRoot(rootPath: string): Promise<string> {
  const root = await fs.realpath(rootPath);
  for (const managedDirectory of MANAGED_DIRECTORIES) {
    await confineManagedDirectory(root, managedDirectory);
  }
  return root;
}

export async function confinePath(rootPath: string, inputPath: string): Promise<string> {
  const root = await fs.realpath(rootPath);
  const target = await fs.realpath(path.resolve(root, inputPath));
  const relative = path.relative(root, target);
  if (relative !== "" && (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) {
    throw new Error("artifact path escapes the workspace");
  }
  return target;
}

async function confineManagedDirectory(root: string, relativeDirectory: string): Promise<void> {
  let candidate = path.join(root, relativeDirectory);
  while (candidate !== root) {
    try {
      assertWithinWorkspace(root, await fs.realpath(candidate), `managed directory escapes the workspace: ${relativeDirectory}`);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      candidate = path.dirname(candidate);
    }
  }
}

function assertWithinWorkspace(root: string, target: string, message: string): void {
  const relative = path.relative(root, target);
  if (relative !== "" && (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) {
    throw new Error(message);
  }
}

/**
 * Serializes workspace mutations across processes using an exclusive filesystem lock.
 * The lock file is created atomically via `fs.open(path, "wx")` so that two
 * separately spawned MCP server processes targeting the same physical workspace
 * cannot race the check-then-`wx` ingest target selection.
 */
export async function serializeWorkspaceMutation<T>(rootPath: string, fn: () => Promise<T>): Promise<T> {
  const root = await fs.realpath(rootPath);
  const lockPath = safeJoin(root, ".aiwiki", "locks", "mcp-ingest.lock");
  await fs.mkdir(safeJoin(root, ".aiwiki", "locks"), { recursive: true });

  let handle: FileHandle;
  const retryDelayMs = 50;
  const maxRetryMs = 30_000;
  let elapsed = 0;
  while (true) {
    try {
      handle = await fs.open(lockPath, "wx");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (elapsed >= maxRetryMs) {
        throw new Error("workspace is busy: another ingest is in progress (timed out waiting for lock)");
      }
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
      elapsed += retryDelayMs;
    }
  }

  const content = JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), command: "aiwiki-mcp ingest" }, null, 2) + "\n";
  try {
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }

  try {
    return await fn();
  } finally {
    try {
      await fs.unlink(lockPath);
    } catch {
      // Best-effort cleanup.
    }
  }
}
