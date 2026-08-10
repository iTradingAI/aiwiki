export type ExtensionPermissionToken =
  | "workspace:read"
  | `workspace:write:${string}`
  | "state:read"
  | "state:write";

export type ExtensionCapability =
  | "command"
  | "lint_rule"
  | "context_provider"
  | "artifact_generator";

const extensionCapabilities: Readonly<Record<ExtensionCapability, true>> = {
  command: true,
  lint_rule: true,
  context_provider: true,
  artifact_generator: true,
};

const workspaceWritePrefix = "workspace:write:";

type ParsedVersion = Readonly<{
  major: number;
  minor: number;
  patch: number;
}>;

export function isExtensionCapability(value: unknown): value is ExtensionCapability {
  return typeof value === "string" && Object.hasOwn(extensionCapabilities, value);
}

export function validatePermissionToken(
  raw: unknown,
): { ok: true; token: ExtensionPermissionToken } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "malformed permission token: it must be a string." };
  }

  if (raw === "workspace:read" || raw === "state:read" || raw === "state:write") {
    return { ok: true, token: raw };
  }

  if (!raw.startsWith(workspaceWritePrefix)) {
    return { ok: false, error: `unknown permission token ${JSON.stringify(raw)}.` };
  }

  const root = raw.slice(workspaceWritePrefix.length);
  if (!isSafeWorkspaceWriteRoot(root)) {
    return {
      ok: false,
      error: `malformed permission token ${JSON.stringify(raw)}: workspace write roots must be non-empty, relative, slash-separated paths without traversal.`,
    };
  }

  return { ok: true, token: raw as ExtensionPermissionToken };
}

/**
 * Tests a deliberately small API-range grammar: exact versions, caret ranges,
 * tilde ranges, and whitespace-separated comparator bounds over x.y.z.
 */
export function satisfiesApiRange(range: string, implemented: string): boolean {
  const actual = parseVersion(implemented);
  if (actual === undefined || typeof range !== "string") {
    return false;
  }

  const expression = range.trim();
  if (expression === "") {
    return false;
  }

  const exact = parseVersion(expression);
  if (exact !== undefined) {
    return compareVersions(actual, exact) === 0;
  }

  const shorthand = /^(\^|~)(.+)$/.exec(expression);
  if (shorthand !== null) {
    const requested = parseVersion(shorthand[2]);
    if (requested === undefined) {
      return false;
    }

    const upper = shorthand[1] === "^"
      ? caretUpperBound(requested)
      : { major: requested.major, minor: requested.minor + 1, patch: 0 };
    return compareVersions(actual, requested) >= 0 && compareVersions(actual, upper) < 0;
  }

  const comparators = expression.split(/\s+/);
  if (comparators.some((comparator) => !/^(?:>=|<=|>|<|=)\d+\.\d+\.\d+$/.test(comparator))) {
    return false;
  }

  return comparators.every((comparator) => {
    const match = /^(>=|<=|>|<|=)(.+)$/.exec(comparator);
    if (match === null) {
      return false;
    }

    const requested = parseVersion(match[2]);
    if (requested === undefined) {
      return false;
    }

    const comparison = compareVersions(actual, requested);
    switch (match[1]) {
      case ">=":
        return comparison >= 0;
      case "<=":
        return comparison <= 0;
      case ">":
        return comparison > 0;
      case "<":
        return comparison < 0;
      case "=":
        return comparison === 0;
      default:
        return false;
    }
  });
}

/**
 * Returns advisory declaration warnings. These declarations do not grant
 * runtime authority.
 */
export function checkCapabilityPermissionConsistency(
  capabilities: readonly ExtensionCapability[],
  permissions: readonly ExtensionPermissionToken[],
): string[] {
  const warnings: string[] = [];
  const capabilitySet = new Set(capabilities);
  const hasWorkspaceWrite = permissions.some((permission) => permission.startsWith(workspaceWritePrefix));

  if (hasWorkspaceWrite && !capabilitySet.has("artifact_generator")) {
    warnings.push("workspace:write is declared without artifact_generator capability.");
  }
  if (capabilitySet.has("artifact_generator") && !hasWorkspaceWrite) {
    warnings.push("artifact_generator capability is declared without a workspace:write permission.");
  }
  if (capabilitySet.has("context_provider")) {
    warnings.push("context_provider is declaration-only and is not invoked by the current host.");
  }
  if (capabilitySet.has("artifact_generator")) {
    warnings.push("artifact_generator is declaration-only and is not invoked by the current host.");
  }

  return warnings;
}

function isSafeWorkspaceWriteRoot(root: string): boolean {
  if (root === "" || root.startsWith("/") || root.includes("\\") || /^[A-Za-z]:/.test(root)) {
    return false;
  }

  return root.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function parseVersion(value: string): ParsedVersion | undefined {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (match === null) {
    return undefined;
  }

  const [major, minor, patch] = match.slice(1).map(Number);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) {
    return undefined;
  }

  return { major, minor, patch };
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  if (left.major !== right.major) {
    return left.major < right.major ? -1 : 1;
  }
  if (left.minor !== right.minor) {
    return left.minor < right.minor ? -1 : 1;
  }
  if (left.patch !== right.patch) {
    return left.patch < right.patch ? -1 : 1;
  }
  return 0;
}

function caretUpperBound(version: ParsedVersion): ParsedVersion {
  if (version.major > 0) {
    return { major: version.major + 1, minor: 0, patch: 0 };
  }
  if (version.minor > 0) {
    return { major: 0, minor: version.minor + 1, patch: 0 };
  }
  return { major: 0, minor: 0, patch: version.patch + 1 };
}
