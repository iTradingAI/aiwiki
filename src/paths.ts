import path from "node:path";

export function safeJoin(root: string, ...parts: string[]): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...parts);
  const relative = path.relative(resolvedRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside workspace: ${target}`);
  }
  return target;
}

export function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function relativePath(root: string, target: string): string {
  return toPosixPath(path.relative(root, target));
}

export function slugify(value: string | undefined): string {
  const source = value?.trim() || "item";
  const normalized = source
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
  const slug = normalized
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[-\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}

export function appendRunIdBeforeExt(fileName: string, runId: string): string {
  const ext = path.extname(fileName);
  const base = fileName.slice(0, fileName.length - ext.length);
  return `${base}-${runId}${ext}`;
}
