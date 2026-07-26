// AIWiki site-readiness probe configuration.
//
// Dependency-free (Node built-ins only). This module loads and normalizes the
// operator-editable `site-readiness.config.json`, applies safe defaults, and
// derives the expected release from the package manifest when not overridden.
//
// It NEVER mutates DNS, deploy, repository, or package metadata. It only reads.
//
// Fail-closed posture: an invalid or partial config throws rather than running
// a probe that could produce a misleading green result.

import { readFileSync } from "node:fs";
import path from "node:path";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Minimum monitoring window required by the plan: 288 consecutive 5-min probes (24h). */
export const DEFAULT_WINDOW_PROBES = 288;
/** Plan cadence: one probe every five minutes. */
export const DEFAULT_CADENCE_MS = 5 * MINUTE;
/** TLS must have strictly more than this many days remaining. */
export const TLS_MIN_REMAINING_DAYS = 30;
/** Two independent resolvers are required for DNS evidence. */
export const MIN_RESOLVERS = 2;

export const DEFAULT_CONFIG = Object.freeze({
  // Canonical targets. The new site must not be advertised as canonical until
  // the readiness gate is green; the old canonical stays active until then.
  newCanonicalHost: "aiwiki.maxking.cc",
  oldCanonicalHost: "maxking.cc",
  oldCanonicalPath: "/aiwiki",

  // Content markers the prelaunch/launch site must carry. `expectedRelease`
  // null => derived from package.json at load time so the probe tracks the
  // source/registry release without cross-lane hard-coding.
  expectedRelease: null,
  expectedInstallCommand: "npm install -g @itradingai/aiwiki",
  expectedRepository: "https://github.com/iTradingAI/aiwiki",
  expectedLocales: ["en", "zh-CN"],
  expectedLicense: "MIT",
  // A private vulnerability route must be advertised; specifics live in the
  // bilingual SECURITY policy owned by another lane.
  requireSecurityRoute: true,

  // DNS: two resolvers, expected records, documented TTL + rollback record.
  resolvers: ["1.1.1.1", "8.8.8.8"],
  dnsExpected: { a: [], aaaa: [], cname: "aiwiki.maxking.cc" },
  // Documented pre-cutover TTL (seconds) and rollback record. Null => the
  // operator has not yet captured them, so DNS evidence fails closed.
  dnsTtl: null,
  dnsRollbackRecord: null,

  // HTTP: required paths and budget.
  paths: ["/", "/install", "/docs", "/security", "/zh-CN/", "/en/"],
  latencyLimitMs: 1500,

  // Canonical stage drives the noindex rule (prelaunch => noindex required).
  stage: "prelaunch",

  // Monitoring: 288 consecutive 5-min greens, named owners, tested sink.
  monitoringCadenceMs: DEFAULT_CADENCE_MS,
  monitoringWindowProbes: DEFAULT_WINDOW_PROBES,
  owners: { deployment: "", rollback: "", alerts: "" },
  alertSink: { kind: "", ackMaxAgeMs: 7 * DAY },

  // Evidence freshness: a category older than this is "stale" => fails closed.
  evidenceMaxAgeMs: 10 * MINUTE,
  // Alert ack must be within this window to count as "tested".
  alertAckFreshnessDefaultMs: 7 * DAY
});

/**
 * Deep-merge a partial operator config over the defaults (objects merge,
 * arrays/primitives replace). Keeps the defaults frozen for callers.
 * @param {object} base
 * @param {Partial<typeof DEFAULT_CONFIG>} override
 * @returns {object}
 */
export function mergeConfig(base, override) {
  if (override === null || typeof override !== "object") return { ...base };
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      baseValue !== null &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue)
    ) {
      out[key] = mergeConfig(baseValue, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Read the package.json version so the probe's expected release marker tracks
 * the source/registry release. Pure-ish: only touches the filesystem.
 * @param {string} packageJsonPath
 * @returns {string|null}
 */
export function readPackageVersion(packageJsonPath) {
  try {
    const raw = readFileSync(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw);
    return typeof pkg?.version === "string" && pkg.version.length > 0 ? pkg.version : null;
  } catch {
    return null;
  }
}

/**
 * Validate that a merged config can support a fail-closed probe.
 * Throws on structural problems; returns the (possibly normalized) config.
 * @param {object} cfg
 * @returns {object}
 */
export function validateConfig(cfg) {
  const errors = [];
  if (!cfg.newCanonicalHost || typeof cfg.newCanonicalHost !== "string") {
    errors.push("newCanonicalHost must be a non-empty string");
  }
  if (!Array.isArray(cfg.resolvers) || cfg.resolvers.length < MIN_RESOLVERS) {
    errors.push(`resolvers must list at least ${MIN_RESOLVERS} servers`);
  }
  if (!Number.isFinite(cfg.monitoringCadenceMs) || cfg.monitoringCadenceMs <= 0) {
    errors.push("monitoringCadenceMs must be a positive number");
  }
  if (
    !Number.isFinite(cfg.monitoringWindowProbes) ||
    cfg.monitoringWindowProbes < DEFAULT_WINDOW_PROBES
  ) {
    errors.push(
      `monitoringWindowProbes must be >= ${DEFAULT_WINDOW_PROBES} (24h of 5-min probes)`
    );
  }
  if (cfg.stage !== "prelaunch" && cfg.stage !== "launch") {
    errors.push("stage must be 'prelaunch' or 'launch'");
  }
  if (!Array.isArray(cfg.paths) || cfg.paths.length === 0) {
    errors.push("paths must be a non-empty array");
  }
  if (errors.length > 0) {
    throw new Error(`Invalid site-readiness config: ${errors.join("; ")}`);
  }
  return cfg;
}

/**
 * Load operator config from JSON, merge over defaults, derive expectedRelease
 * from the manifest when unset, and validate.
 *
 * @param {object} [opts]
 * @param {string} [opts.configPath]  Absolute path to site-readiness.config.json.
 * @param {string} [opts.packageJsonPath] Absolute path to package.json.
 * @param {Partial<typeof DEFAULT_CONFIG>} [opts.env] Programmatic overrides (highest precedence).
 * @returns {object}
 */
export function loadConfig(opts = {}) {
  const { configPath, packageJsonPath, env } = opts;
  let fileOverride = {};
  if (configPath) {
    const raw = readFileSync(configPath, "utf8");
    fileOverride = JSON.parse(raw);
  }
  let merged = mergeConfig(DEFAULT_CONFIG, fileOverride);
  if (env && typeof env === "object") {
    merged = mergeConfig(merged, env);
  }
  if (!merged.expectedRelease && packageJsonPath) {
    const derived = readPackageVersion(packageJsonPath);
    if (derived) merged.expectedRelease = derived;
  }
  return validateConfig(merged);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Tiny introspection entrypoint: print the effective default config.
  console.log(JSON.stringify(DEFAULT_CONFIG, null, 2));
}

export const CONSTANTS = Object.freeze({
  MINUTE,
  HOUR,
  DAY
});
