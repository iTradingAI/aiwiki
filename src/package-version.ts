import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function readPackageVersion(): string {
  const parsed = JSON.parse(readFileSync(path.join(packageRoot(), "package.json"), "utf8")) as { version?: unknown };
  if (typeof parsed.version !== "string") throw new Error("package.json is missing version");
  return parsed.version;
}

export const PACKAGE_VERSION = readPackageVersion();
