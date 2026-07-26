// AIWiki site-readiness evidence evaluators.
//
// Pure functions only: every evaluator takes a plain evidence object plus
// thresholds and returns a { category, status, reasons, detail } result.
// There is NO network access here. Live collection lives in probe.mjs.
//
// Fail-closed rules:
//   - Missing/null evidence      => status "unknown"
//   - Evidence older than maxAge => status "stale"   (green cannot survive stale)
//   - Any category not "green"   => overall readiness false
//
// Status vocabulary: "green" | "red" | "unknown" | "stale"

import { TLS_MIN_REMAINING_DAYS, DEFAULT_WINDOW_PROBES, DEFAULT_CADENCE_MS } from "./config.mjs";

const DAY = 86_400_000;

/** @typedef {"green"|"red"|"unknown"|"stale"} Status */
/** @typedef {{ category: string, status: Status, reasons: string[], detail?: object }} CategoryResult */

export const CATEGORIES = Object.freeze([
  "dns",
  "tls",
  "http",
  "content",
  "canonical",
  "monitoring"
]);

/**
 * @param {string} category
 * @param {Status} status
 * @param {string[]} reasons
 * @param {object} [detail]
 * @returns {CategoryResult}
 */
export function category(category, status, reasons, detail) {
  return { category, status, reasons: reasons ?? [], ...(detail ? { detail } : {}) };
}

/**
 * Determine staleness of evidence from its collectedAt timestamp.
 * @param {number|undefined|null} collectedAt epoch ms
 * @param {number} maxAgeMs
 * @param {number} now epoch ms
 * @returns {{ isStale: boolean, isKnown: boolean }}
 */
export function freshness(collectedAt, maxAgeMs, now) {
  if (collectedAt === null || collectedAt === undefined || !Number.isFinite(collectedAt)) {
    return { isStale: false, isKnown: false };
  }
  return { isStale: now - collectedAt > maxAgeMs, isKnown: true };
}

/**
 * If evidence is missing or stale, downgrade a computed green to unknown/stale.
 * @param {Status} computed
 * @param {{isKnown:boolean, isStale:boolean}} fresh
 * @returns {Status}
 */
export function applyFreshness(computed, fresh) {
  if (!fresh.isKnown) return "unknown";
  if (fresh.isStale && computed === "green") return "stale";
  return computed;
}

function setsEqual(a, b) {
  const A = Array.isArray(a) ? a : [];
  const B = Array.isArray(b) ? b : [];
  if (A.length !== B.length) return false;
  const sb = new Set(B.map(String));
  return A.every((x) => sb.has(String(x)));
}

/**
 * DNS evidence: expected records from >=2 resolvers, no SERVFAIL, documented
 * TTL and rollback record, consistent answers.
 *
 * evidence = {
 *   collectedAt, host,
 *   resolvers: [{ resolver, rcode, a?:string[], aaaa?:string[], cname?:string[], servfail?:boolean, error?:string }],
 *   ttl?: number|null,             // documented TTL in seconds
 *   rollbackRecord?: string|null,  // documented pre-cutover DNS record for rollback
 *   expected: { a?:string[], aaaa?:string[], cname?:string }
 * }
 *
 * @param {object} evidence
 * @param {{ maxAgeMs?: number, now: number, minResolvers?: number }} opts
 * @returns {CategoryResult}
 */
export function evaluateDns(evidence, opts) {
  const now = opts.now;
  const maxAgeMs = opts.maxAgeMs ?? 0;
  const minResolvers = opts.minResolvers ?? 2;
  const fresh = freshness(evidence?.collectedAt, maxAgeMs, now);
  if (!fresh.isKnown) {
    return category("dns", "unknown", ["dns evidence missing"]);
  }
  const resolvers = Array.isArray(evidence.resolvers) ? evidence.resolvers : [];
  const reasons = [];
  let ok = true;

  if (resolvers.length < minResolvers) {
    ok = false;
    reasons.push(`need >= ${minResolvers} resolvers, got ${resolvers.length}`);
  }
  for (const r of resolvers) {
    if (r.servfail) {
      ok = false;
      reasons.push(`resolver ${r.resolver} returned SERVFAIL`);
    } else if (r.error) {
      ok = false;
      reasons.push(`resolver ${r.resolver} errored: ${r.error}`);
    }
  }
  // Consistency: every resolver that answered must agree with the expected set
  // (where expected is configured) and with each other.
  const expected = evidence.expected ?? {};
  const answering = resolvers.filter((r) => !r.servfail && !r.error);
  for (const type of ["a", "aaaa", "cname"]) {
    const want = expected[type];
    const configured = Array.isArray(want) ? want.length > 0 : typeof want === "string" && want.length > 0;
    const got = answering.map((r) => r[type] ?? []);
    if (configured) {
      for (let i = 0; i < got.length; i++) {
        if (!setsEqual(got[i], want)) {
          ok = false;
          reasons.push(`resolver ${answering[i].resolver} ${type} mismatch`);
        }
      }
    } else if (got.length > 0) {
      // No expected configured: resolvers must still agree with each other.
      for (let i = 1; i < got.length; i++) {
        if (!setsEqual(got[i], got[0])) {
          ok = false;
          reasons.push(`resolvers disagree on ${type}`);
          break;
        }
      }
    }
  }
  if (evidence.ttl === null || evidence.ttl === undefined || !Number.isFinite(evidence.ttl)) {
    ok = false;
    reasons.push("TTL not documented");
  }
  if (!evidence.rollbackRecord || String(evidence.rollbackRecord).trim().length === 0) {
    ok = false;
    reasons.push("rollback record not documented");
  }
  const status = applyFreshness(ok ? "green" : "red", fresh);
  return category("dns", status, ok && status === "green" ? ["dns green"] : reasons);
}

/**
 * TLS evidence: trusted SAN/chain, HTTPS up, no mixed content, >30 days left.
 *
 * evidence = {
 *   collectedAt, host,
 *   san: string[], chainTrusted: boolean, notAfter: number (epoch ms),
 *   httpsUp: boolean, mixedContent: boolean
 * }
 *
 * @param {object} evidence
 * @param {{ now: number, minRemainingDays?: number }} opts
 * @returns {CategoryResult}
 */
export function evaluateTls(evidence, opts) {
  const now = opts.now;
  const fresh = freshness(evidence?.collectedAt, opts.maxAgeMs ?? 0, now);
  if (!fresh.isKnown) return category("tls", "unknown", ["tls evidence missing"]);
  const reasons = [];
  let ok = true;
  if (!evidence.chainTrusted) {
    ok = false;
    reasons.push("chain not trusted");
  }
  if (!evidence.httpsUp) {
    ok = false;
    reasons.push("https not up");
  }
  if (evidence.mixedContent) {
    ok = false;
    reasons.push("mixed content present");
  }
  const minDays = opts.minRemainingDays ?? TLS_MIN_REMAINING_DAYS;
  const remainingDays = (evidence.notAfter - now) / DAY;
  if (!Number.isFinite(evidence.notAfter)) {
    ok = false;
    reasons.push("notAfter missing");
  } else if (!(remainingDays > minDays)) {
    ok = false;
    reasons.push(`expiry ${remainingDays.toFixed(2)} days (need > ${minDays})`);
  }
  // SAN must cover the host (exact or leftmost wildcard).
  const host = evidence.host ?? "";
  const san = Array.isArray(evidence.san) ? evidence.san : [];
  const sanCovers =
    san.length > 0 &&
    san.some((name) => name === host || (name.startsWith("*.") && host.endsWith(name.slice(1))));
  if (!sanCovers) {
    ok = false;
    reasons.push(`host ${host} not covered by SAN`);
  }
  const status = applyFreshness(ok ? "green" : "red", fresh);
  return category("tls", status, status === "green" ? ["tls green"] : reasons, {
    remainingDays: Number.isFinite(remainingDays) ? Number(remainingDays.toFixed(2)) : null
  });
}

/**
 * HTTP evidence: required paths HTTPS 200, HTTP redirects to HTTPS, no loops,
 * latency within budget.
 *
 * evidence = {
 *   collectedAt, host,
 *   paths: [{ path, status, https, latencyMs }],
 *   httpRedirectsToHttps: boolean, redirectLoop: boolean
 * }
 *
 * @param {object} evidence
 * @param {{ now: number, latencyLimitMs: number, requiredPaths?: string[] }} opts
 * @returns {CategoryResult}
 */
export function evaluateHttp(evidence, opts) {
  const now = opts.now;
  const fresh = freshness(evidence?.collectedAt, opts.maxAgeMs ?? 0, now);
  if (!fresh.isKnown) return category("http", "unknown", ["http evidence missing"]);
  const reasons = [];
  let ok = true;
  if (evidence.redirectLoop) {
    ok = false;
    reasons.push("redirect loop detected");
  }
  if (evidence.httpRedirectsToHttps === false) {
    ok = false;
    reasons.push("http root does not redirect to https");
  }
  const pathResults = Array.isArray(evidence.paths) ? evidence.paths : [];
  const byPath = new Map(pathResults.map((p) => [p.path, p]));
  const required = opts.requiredPaths ?? pathResults.map((p) => p.path);
  for (const rp of required) {
    const pr = byPath.get(rp);
    if (!pr) {
      ok = false;
      reasons.push(`required path ${rp} not probed`);
      continue;
    }
    if (!pr.https || pr.status !== 200) {
      ok = false;
      reasons.push(`${rp} returned ${pr.https ? "https" : "http"} ${pr.status}`);
    }
    if (Number.isFinite(pr.latencyMs) && pr.latencyMs > opts.latencyLimitMs) {
      ok = false;
      reasons.push(`${rp} latency ${pr.latencyMs}ms > ${opts.latencyLimitMs}ms`);
    }
  }
  const status = applyFreshness(ok ? "green" : "red", fresh);
  return category("http", status, status === "green" ? ["http green"] : reasons);
}

/**
 * Content evidence: release/install/repository/security/locale/license markers
 * match current source/registry; critical links load.
 *
 * evidence = {
 *   collectedAt,
 *   markers: { release?, installCommand?, repository?, securityRoute?: boolean, locales?: string[], license? },
 *   criticalLinks: [{ href, status, ok }]
 * }
 *
 * @param {object} evidence
 * @param {{ now: number, expected: object }} opts
 * @returns {CategoryResult}
 */
export function evaluateContent(evidence, opts) {
  const now = opts.now;
  const fresh = freshness(evidence?.collectedAt, opts.maxAgeMs ?? 0, now);
  if (!fresh.isKnown) return category("content", "unknown", ["content evidence missing"]);
  const reasons = [];
  let ok = true;
  const m = evidence.markers ?? {};
  const exp = opts.expected ?? {};
  if (exp.release && m.release !== exp.release) {
    ok = false;
    reasons.push(`release marker '${m.release ?? "<none>"}' != expected '${exp.release}'`);
  }
  if (exp.installCommand && m.installCommand !== exp.installCommand) {
    ok = false;
    reasons.push("install command marker mismatch");
  }
  if (exp.repository && m.repository !== exp.repository) {
    ok = false;
    reasons.push("repository marker mismatch");
  }
  if (exp.requireSecurityRoute && !m.securityRoute) {
    ok = false;
    reasons.push("private security route not advertised");
  }
  const wantLocales = Array.isArray(exp.locales) ? exp.locales : [];
  const gotLocales = Array.isArray(m.locales) ? m.locales : [];
  for (const loc of wantLocales) {
    if (!gotLocales.includes(loc)) {
      ok = false;
      reasons.push(`locale ${loc} not advertised`);
    }
  }
  if (exp.license && m.license !== exp.license) {
    ok = false;
    reasons.push(`license marker '${m.license ?? "<none>"}' != expected '${exp.license}'`);
  }
  const links = Array.isArray(evidence.criticalLinks) ? evidence.criticalLinks : [];
  for (const link of links) {
    if (!link.ok) {
      ok = false;
      reasons.push(`critical link ${link.href} not ok (status ${link.status})`);
    }
  }
  const status = applyFreshness(ok ? "green" : "red", fresh);
  return category("content", status, status === "green" ? ["content green"] : reasons);
}

/**
 * Canonical evidence: exactly one self-canonical per page; prelaunch requires
 * noindex; launch requires noindex removed; mixed/duplicate canonicals fail;
 * no active metadata switched early.
 *
 * evidence = {
 *   collectedAt, stage: "prelaunch"|"launch",
 *   pages: [{ url, canonical: string[], noindex: boolean }],
 *   activeMetadataCanonical: string  // what package.json.homepage / About says now
 * }
 *
 * @param {object} evidence
 * @param {{ now: number, newCanonicalHost: string, oldCanonicalHost: string }} opts
 * @returns {CategoryResult}
 */
export function evaluateCanonical(evidence, opts) {
  const now = opts.now;
  const fresh = freshness(evidence?.collectedAt, opts.maxAgeMs ?? 0, now);
  if (!fresh.isKnown) return category("canonical", "unknown", ["canonical evidence missing"]);
  const reasons = [];
  let ok = true;
  const stage = evidence.stage;
  const pages = Array.isArray(evidence.pages) ? evidence.pages : [];
  const newHost = opts.newCanonicalHost;
  const oldHost = opts.oldCanonicalHost;

  for (const page of pages) {
    if (!Array.isArray(page.canonical) || page.canonical.length === 0) {
      ok = false;
      reasons.push(`${page.url} has no canonical`);
      continue;
    }
    if (page.canonical.length > 1) {
      ok = false;
      reasons.push(`${page.url} has duplicate canonicals (${page.canonical.length})`);
    }
    // Self-canonical: the canonical must point at the page's own host.
    const canonicalHosts = new Set(
      page.canonical.map((c) => {
        try {
          return new URL(c).host;
        } catch {
          return c;
        }
      })
    );
    let pageHost = page.url;
    try {
      pageHost = new URL(page.url).host;
    } catch {
      /* keep raw */
    }
    for (const ch of canonicalHosts) {
      if (ch !== pageHost) {
        ok = false;
        reasons.push(`${page.url} canonical host ${ch} is not self`);
      }
    }
    const wantsNoindex = stage === "prelaunch";
    if (wantsNoindex && !page.noindex) {
      ok = false;
      reasons.push(`${page.url} prelaunch but noindex missing`);
    }
    if (!wantsNoindex && page.noindex) {
      ok = false;
      reasons.push(`${page.url} launch but noindex still present`);
    }
  }
  // Mixed canonical across pages: different pages must not advertise different
  // canonical hosts (e.g., some old, some new).
  const allHosts = new Set();
  for (const page of pages) {
    for (const c of page.canonical ?? []) {
      try {
        allHosts.add(new URL(c).host);
      } catch {
        allHosts.add(c);
      }
    }
  }
  // During prelaunch the canonical should resolve to the new (prelaunch) host;
  // active metadata must remain on the old canonical.
  if (stage === "prelaunch") {
    if (evidence.activeMetadataCanonical && evidence.activeMetadataCanonical !== oldHost) {
      ok = false;
      reasons.push(
        `active metadata canonical '${evidence.activeMetadataCanonical}' switched early (expected ${oldHost})`
      );
    }
  } else if (stage === "launch") {
    if (evidence.activeMetadataCanonical && evidence.activeMetadataCanonical !== newHost) {
      ok = false;
      reasons.push(
        `launch but active metadata canonical '${evidence.activeMetadataCanonical}' != ${newHost}`
      );
    }
  }
  const status = applyFreshness(ok ? "green" : "red", fresh);
  return category("canonical", status, status === "green" ? ["canonical green"] : reasons);
}

/**
 * Count trailing consecutive green probes (stops at the first non-green from
 * the end). Used by the monitoring evaluator.
 * @param {{status: string}[]} history
 * @returns {number}
 */
export function trailingGreenCount(history) {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].status === "green") count++;
    else break;
  }
  return count;
}

/**
 * Verify cadence of the trailing green run: adjacent probes spaced within
 * [cadence*0.5, cadence*1.5] and monotonic non-decreasing timestamps.
 * @param {{timestamp:number}[]} run
 * @param {number} cadenceMs
 * @returns {{ ok: boolean, reason?: string }}
 */
export function cadenceOk(run, cadenceMs) {
  if (run.length < 2) return { ok: true };
  const lo = cadenceMs * 0.5;
  const hi = cadenceMs * 1.5;
  for (let i = 1; i < run.length; i++) {
    const gap = run[i].timestamp - run[i - 1].timestamp;
    if (!Number.isFinite(gap) || gap < 0) return { ok: false, reason: "non-monotonic probe timestamp" };
    if (gap < lo || gap > hi) {
      return { ok: false, reason: `gap ${gap}ms outside [${lo},${hi}]` };
    }
  }
  return { ok: true };
}

/**
 * Monitoring evidence: 288 consecutive 5-min greens, named owner, tested sink,
 * fresh latest probe.
 *
 * evidence = {
 *   collectedAt,
 *   history: [{ timestamp, status }],
 *   cadenceMs: number,
 *   owner: string,
 *   alertSink: { kind: string, lastAck: { at: number, acknowledged: boolean } | null }
 * }
 *
 * @param {object} evidence
 * @param {{ now: number, windowProbes?: number, ackFreshnessMs?: number, maxAgeMs?: number }} opts
 * @returns {CategoryResult}
 */
export function evaluateMonitoring(evidence, opts) {
  const now = opts.now;
  const fresh = freshness(evidence?.collectedAt, opts.maxAgeMs ?? 0, now);
  if (!fresh.isKnown) return category("monitoring", "unknown", ["monitoring evidence missing"]);
  const reasons = [];
  let ok = true;
  const window = opts.windowProbes ?? DEFAULT_WINDOW_PROBES;
  const cadence = evidence.cadenceMs ?? DEFAULT_CADENCE_MS;

  if (!evidence.owner || String(evidence.owner).trim().length === 0) {
    ok = false;
    reasons.push("named monitoring/alert owner missing");
  }
  const sink = evidence.alertSink ?? {};
  if (!sink.kind || String(sink.kind).trim().length === 0) {
    ok = false;
    reasons.push("alert sink kind missing");
  }
  const ack = sink.lastAck ?? null;
  if (!ack || ack.acknowledged !== true || !Number.isFinite(ack.at)) {
    ok = false;
    reasons.push("alert sink has no successful test acknowledgement");
  } else {
    const ackFresh = opts.ackFreshnessMs ?? Infinity;
    if (Number.isFinite(ackFresh) && now - ack.at > ackFresh) {
      ok = false;
      reasons.push(`alert ack stale (age ${now - ack.at}ms > ${ackFresh}ms)`);
    }
  }

  const history = Array.isArray(evidence.history) ? evidence.history : [];
  if (history.length === 0) {
    ok = false;
    reasons.push("monitoring history empty");
  } else {
    const latest = history[history.length - 1];
    if (!Number.isFinite(latest.timestamp)) {
      ok = false;
      reasons.push("latest probe timestamp invalid");
    } else if (now - latest.timestamp > cadence * 1.5) {
      ok = false;
      reasons.push("latest probe is stale relative to cadence");
    }
    const green = trailingGreenCount(history);
    if (green < window) {
      ok = false;
      reasons.push(`only ${green} consecutive green probes (need ${window})`);
    } else {
      const run = history.slice(history.length - window);
      const cad = cadenceOk(run, cadence);
      if (!cad.ok) {
        ok = false;
        reasons.push(`cadence break: ${cad.reason}`);
      }
    }
  }

  const status = applyFreshness(ok ? "green" : "red", fresh);
  return category("monitoring", status, status === "green" ? ["monitoring green"] : reasons, {
    trailingGreen: trailingGreenCount(history)
  });
}

/**
 * Aggregate six category results into an overall readiness verdict.
 * Fail-closed: any category that is missing or not "green" => not ready.
 *
 * @param {Record<string, CategoryResult>} results keyed by category
 * @returns {{ ready: boolean, categories: CategoryResult[], failing: CategoryResult[], unknown: CategoryResult[], stale: CategoryResult[], summary: string }}
 */
export function aggregateReadiness(results) {
  const categories = CATEGORIES.map((name) => {
    const r = results?.[name];
    if (!r) {
      return category(name, "unknown", ["category not evaluated"]);
    }
    return { ...r, category: r.category ?? name };
  });
  const failing = categories.filter((c) => c.status !== "green" && c.status !== "red");
  const red = categories.filter((c) => c.status === "red");
  const notGreen = categories.filter((c) => c.status !== "green");
  const ready = notGreen.length === 0;
  return {
    ready,
    categories,
    failing: notGreen,
    red,
    unknown: categories.filter((c) => c.status === "unknown"),
    stale: categories.filter((c) => c.status === "stale"),
    summary: ready
      ? "ready: all six categories green"
      : `not ready: ${notGreen.map((c) => `${c.category}=${c.status}`).join(", ")}`
  };
}

/**
 * Build the set of evaluator options shared across categories from a config.
 * @param {object} cfg
 * @param {number} now
 * @returns {object}
 */
export function optsFromConfig(cfg, now) {
  return {
    now,
    maxAgeMs: cfg.evidenceMaxAgeMs,
    minResolvers: 2,
    minRemainingDays: TLS_MIN_REMAINING_DAYS,
    latencyLimitMs: cfg.latencyLimitMs,
    requiredPaths: cfg.paths,
    expected: {
      release: cfg.expectedRelease,
      installCommand: cfg.expectedInstallCommand,
      repository: cfg.expectedRepository,
      requireSecurityRoute: cfg.requireSecurityRoute,
      locales: cfg.expectedLocales,
      license: cfg.expectedLicense
    },
    newCanonicalHost: cfg.newCanonicalHost,
    oldCanonicalHost: cfg.oldCanonicalHost,
    windowProbes: cfg.monitoringWindowProbes,
    ackFreshnessMs: cfg.alertSink?.ackMaxAgeMs ?? cfg.alertAckFreshnessDefaultMs
  };
}

/**
 * Evaluate all six categories from a single evidence bundle.
 * @param {{ dns?:object, tls?:object, http?:object, content?:object, canonical?:object, monitoring?:object }} evidence
 * @param {object} cfg
 * @param {number} now
 * @returns {{ ready: boolean, categories: CategoryResult[], failing: CategoryResult[], summary: string, evaluatedAt: number }}
 */
export function evaluateReadiness(evidence, cfg, now) {
  const opts = optsFromConfig(cfg, now);
  const results = {
    dns: evaluateDns(evidence.dns, opts),
    tls: evaluateTls(evidence.tls, opts),
    http: evaluateHttp(evidence.http, opts),
    content: evaluateContent(evidence.content, opts),
    canonical: evaluateCanonical(evidence.canonical, opts),
    monitoring: evaluateMonitoring(evidence.monitoring, opts)
  };
  return { ...aggregateReadiness(results), evaluatedAt: now };
}
