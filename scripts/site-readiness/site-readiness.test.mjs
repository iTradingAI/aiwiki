// Focused tests for the AIWiki site-readiness evidence tooling.
//
// Run with: node --test scripts/site-readiness/site-readiness.test.mjs
//
// Covers the test-spec acceptance cases:
//   UT8 — site readiness aggregation (red/unknown/stale, TLS 30 vs 31, 287 vs 288,
//         prelaunch noindex, duplicate/mixed canonical)
//   UT9 — collapse state machine (timing, review invalidation)
// Plus cutover-plan authority guards and config merge/validate behavior.
//
// All pure: no network. The probe pipeline is exercised through injected fakes.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  evaluateDns,
  evaluateTls,
  evaluateHttp,
  evaluateContent,
  evaluateCanonical,
  evaluateMonitoring,
  evaluateReadiness,
  aggregateReadiness,
  trailingGreenCount,
  cadenceOk,
  optsFromConfig,
  CATEGORIES
} from "./readiness.mjs";
import { decideCollapse, authorizeMerge } from "./collapse.mjs";
import { buildCutoverPlan, validateCutoverAuthority, renderCutoverPlan } from "./cutover-plan.mjs";
import {
  mergeConfig,
  validateConfig,
  loadConfig,
  DEFAULT_CONFIG,
  DEFAULT_WINDOW_PROBES,
  TLS_MIN_REMAINING_DAYS
} from "./config.mjs";
import { runProbe, parseCanonicalAndNoindex, detectMixedContent, extractMarkers } from "./probe.mjs";

const NOW = 1_700_000_000_000; // fixed deterministic clock
const DAY = 86_400_000;
const CADENCE = 5 * 60_000;

// ---- shared fixtures -------------------------------------------------------

const baseConfig = {
  ...DEFAULT_CONFIG,
  expectedRelease: "0.5.0",
  expectedInstallCommand: "npm install -g @itradingai/aiwiki",
  expectedRepository: "https://github.com/iTradingAI/aiwiki",
  expectedLocales: ["en", "zh-CN"],
  expectedLicense: "MIT",
  requireSecurityRoute: true,
  paths: ["/", "/install", "/docs"],
  dnsExpected: { a: ["1.2.3.4"], aaaa: [], cname: "aiwiki.maxking.cc" },
  dnsTtl: 300,
  dnsRollbackRecord: "old CNAME captured",
  latencyLimitMs: 1500,
  newCanonicalHost: "aiwiki.maxking.cc",
  oldCanonicalHost: "maxking.cc",
  stage: "prelaunch",
  monitoringCadenceMs: CADENCE,
  monitoringWindowProbes: DEFAULT_WINDOW_PROBES,
  owners: { deployment: "owner-d", rollback: "owner-r", alerts: "owner-a" },
  alertSink: { kind: "webhook", ackMaxAgeMs: 7 * DAY },
  evidenceMaxAgeMs: 10 * 60_000
};

function greenDns(now = NOW) {
  return {
    collectedAt: now,
    host: "aiwiki.maxking.cc",
    resolvers: [
      { resolver: "1.1.1.1", rcode: "NOERROR", a: ["1.2.3.4"], aaaa: [], cname: [] },
      { resolver: "8.8.8.8", rcode: "NOERROR", a: ["1.2.3.4"], aaaa: [], cname: [] }
    ],
    ttl: 300,
    rollbackRecord: "old CNAME captured",
    expected: { a: ["1.2.3.4"], aaaa: [], cname: "aiwiki.maxking.cc" }
  };
}
function greenTls(now = NOW, daysLeft = 60) {
  return {
    collectedAt: now,
    host: "aiwiki.maxking.cc",
    san: ["aiwiki.maxking.cc"],
    chainTrusted: true,
    notAfter: now + daysLeft * DAY,
    httpsUp: true,
    mixedContent: false
  };
}
function greenHttp(now = NOW) {
  return {
    collectedAt: now,
    host: "aiwiki.maxking.cc",
    paths: [
      { path: "/", status: 200, https: true, latencyMs: 200 },
      { path: "/install", status: 200, https: true, latencyMs: 200 },
      { path: "/docs", status: 200, https: true, latencyMs: 200 }
    ],
    httpRedirectsToHttps: true,
    redirectLoop: false
  };
}
function greenContent(now = NOW) {
  return {
    collectedAt: now,
    markers: {
      release: "0.5.0",
      installCommand: "npm install -g @itradingai/aiwiki",
      repository: "https://github.com/iTradingAI/aiwiki",
      securityRoute: true,
      locales: ["en", "zh-CN"],
      license: "MIT"
    },
    criticalLinks: [
      { href: "/", status: 200, ok: true },
      { href: "/install", status: 200, ok: true }
    ]
  };
}
function greenCanonical(now = NOW) {
  return {
    collectedAt: now,
    stage: "prelaunch",
    pages: [
      { url: "https://aiwiki.maxking.cc/", canonical: ["https://aiwiki.maxking.cc/"], noindex: true },
      { url: "https://aiwiki.maxking.cc/docs", canonical: ["https://aiwiki.maxking.cc/docs"], noindex: true }
    ],
    activeMetadataCanonical: "maxking.cc"
  };
}
function makeGreenRun(n, cadence = CADENCE, startTs = NOW - (n - 1) * cadence) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ timestamp: startTs + i * cadence, status: "green" });
  return out;
}
function greenMonitoring(now = NOW) {
  return {
    collectedAt: now,
    history: makeGreenRun(DEFAULT_WINDOW_PROBES),
    cadenceMs: CADENCE,
    owner: "owner-a",
    alertSink: { kind: "webhook", lastAck: { at: now - 60_000, acknowledged: true } }
  };
}
function greenBundle(now = NOW) {
  return {
    dns: greenDns(now),
    tls: greenTls(now),
    http: greenHttp(now),
    content: greenContent(now),
    canonical: greenCanonical(now),
    monitoring: greenMonitoring(now)
  };
}

// ===========================================================================
// UT8 — Site readiness aggregation
// ===========================================================================

test("green six-category bundle is ready and summary lists no failures", () => {
  const v = evaluateReadiness(greenBundle(), baseConfig, NOW);
  assert.equal(v.ready, true);
  assert.equal(v.categories.length, 6);
  assert.equal(v.failing.length, 0);
  assert.equal(v.unknown.length, 0);
  assert.equal(v.stale.length, 0);
  assert.match(v.summary, /ready: all six categories green/);
});

test("missing category evidence is unknown and blocks readiness", () => {
  const bundle = greenBundle();
  delete bundle.dns;
  const v = evaluateReadiness(bundle, baseConfig, NOW);
  assert.equal(v.ready, false);
  assert.deepEqual(v.unknown.map((c) => c.category), ["dns"]);
});

test("red DNS (SERVFAIL on one resolver) blocks readiness", () => {
  const bundle = greenBundle();
  bundle.dns.resolvers[0].servfail = true;
  const v = evaluateReadiness(bundle, baseConfig, NOW);
  assert.equal(v.ready, false);
  const dns = v.categories.find((c) => c.category === "dns");
  assert.equal(dns.status, "red");
  assert.ok(dns.reasons.some((r) => /SERVFAIL/.test(r)));
});

test("stale evidence (collectedAt older than maxAgeMs) downgrades green to stale", () => {
  const bundle = greenBundle(NOW - 20 * 60_000); // 20 min old, maxAge 10 min
  const v = evaluateReadiness(bundle, baseConfig, NOW);
  assert.equal(v.ready, false);
  assert.ok(v.categories.every((c) => c.status === "stale"));
  assert.equal(v.stale.length, 6);
});

test("unknown evidence (missing collectedAt) is unknown", () => {
  const bundle = greenBundle();
  bundle.tls.collectedAt = undefined;
  const v = evaluateReadiness(bundle, baseConfig, NOW);
  assert.equal(v.ready, false);
  const tls = v.categories.find((c) => c.category === "tls");
  assert.equal(tls.status, "unknown");
});

test("TLS: exactly 30 days remaining FAILS (need strictly more than 30)", () => {
  const e = greenTls(NOW, 30);
  const r = evaluateTls(e, { now: NOW, minRemainingDays: TLS_MIN_REMAINING_DAYS, maxAgeMs: baseConfig.evidenceMaxAgeMs });
  assert.equal(r.status, "red");
  assert.ok(r.reasons.some((msg) => /expiry/.test(msg)));
});

test("TLS: 31 days remaining PASSES", () => {
  const e = greenTls(NOW, 31);
  const r = evaluateTls(e, { now: NOW, minRemainingDays: TLS_MIN_REMAINING_DAYS, maxAgeMs: baseConfig.evidenceMaxAgeMs });
  assert.equal(r.status, "green");
  assert.ok(r.detail.remainingDays > 30);
});

test("TLS boundary: a value just over 30 days PASSES (strict > comparison)", () => {
  const e = greenTls(NOW, 30);
  e.notAfter = NOW + Math.ceil(30.01 * DAY);
  const r = evaluateTls(e, { now: NOW, minRemainingDays: TLS_MIN_REMAINING_DAYS, maxAgeMs: baseConfig.evidenceMaxAgeMs });
  assert.equal(r.status, "green");
});

test("monitoring: 287 consecutive greens FAILS (need 288)", () => {
  const e = greenMonitoring();
  e.history = makeGreenRun(287);
  const r = evaluateMonitoring(e, {
    now: NOW,
    windowProbes: DEFAULT_WINDOW_PROBES,
    ackFreshnessMs: 7 * DAY,
    maxAgeMs: baseConfig.evidenceMaxAgeMs
  });
  assert.equal(r.status, "red");
  assert.ok(r.reasons.some((msg) => /287 consecutive/.test(msg)));
  assert.equal(r.detail.trailingGreen, 287);
});

test("monitoring: 288 consecutive greens with tested sink PASSES", () => {
  const e = greenMonitoring();
  e.history = makeGreenRun(288);
  const r = evaluateMonitoring(e, {
    now: NOW,
    windowProbes: DEFAULT_WINDOW_PROBES,
    ackFreshnessMs: 7 * DAY,
    maxAgeMs: baseConfig.evidenceMaxAgeMs
  });
  assert.equal(r.status, "green");
  assert.equal(r.detail.trailingGreen, 288);
});

test("monitoring: 288 greens but a stale gap inside the run fails (cadence break)", () => {
  const e = greenMonitoring();
  const run = makeGreenRun(288);
  run[100].timestamp = run[99].timestamp + CADENCE * 10; // big gap
  e.history = run;
  const r = evaluateMonitoring(e, {
    now: NOW,
    windowProbes: DEFAULT_WINDOW_PROBES,
    ackFreshnessMs: 7 * DAY,
    maxAgeMs: baseConfig.evidenceMaxAgeMs
  });
  assert.equal(r.status, "red");
  assert.ok(r.reasons.some((m) => /cadence break/.test(m)));
});

test("monitoring: missing owner fails even with 288 greens", () => {
  const e = greenMonitoring();
  e.history = makeGreenRun(288);
  e.owner = "";
  const r = evaluateMonitoring(e, {
    now: NOW,
    windowProbes: DEFAULT_WINDOW_PROBES,
    ackFreshnessMs: 7 * DAY,
    maxAgeMs: baseConfig.evidenceMaxAgeMs
  });
  assert.equal(r.status, "red");
  assert.ok(r.reasons.some((m) => /owner/.test(m)));
});

test("monitoring: untested alert sink (no ack) fails", () => {
  const e = greenMonitoring();
  e.history = makeGreenRun(288);
  e.alertSink.lastAck = null;
  const r = evaluateMonitoring(e, {
    now: NOW,
    windowProbes: DEFAULT_WINDOW_PROBES,
    ackFreshnessMs: 7 * DAY,
    maxAgeMs: baseConfig.evidenceMaxAgeMs
  });
  assert.equal(r.status, "red");
  assert.ok(r.reasons.some((m) => /acknowledgement/.test(m)));
});

test("prelaunch: missing noindex fails canonical category", () => {
  const e = greenCanonical();
  e.pages[0].noindex = false;
  const r = evaluateCanonical(e, { now: NOW, newCanonicalHost: "aiwiki.maxking.cc", oldCanonicalHost: "maxking.cc", maxAgeMs: baseConfig.evidenceMaxAgeMs });
  assert.equal(r.status, "red");
  assert.ok(r.reasons.some((m) => /noindex missing/.test(m)));
});

test("launch: lingering noindex fails canonical category", () => {
  const e = greenCanonical();
  e.stage = "launch";
  e.activeMetadataCanonical = "aiwiki.maxking.cc";
  const r = evaluateCanonical(e, { now: NOW, newCanonicalHost: "aiwiki.maxking.cc", oldCanonicalHost: "maxking.cc", maxAgeMs: baseConfig.evidenceMaxAgeMs });
  assert.equal(r.status, "red");
  assert.ok(r.reasons.some((m) => /noindex still present/.test(m)));
});

test("duplicate canonical on a page fails", () => {
  const e = greenCanonical();
  e.pages[0].canonical.push("https://aiwiki.maxking.cc/alt");
  const r = evaluateCanonical(e, { now: NOW, newCanonicalHost: "aiwiki.maxking.cc", oldCanonicalHost: "maxking.cc", maxAgeMs: baseConfig.evidenceMaxAgeMs });
  assert.equal(r.status, "red");
  assert.ok(r.reasons.some((m) => /duplicate canonicals/.test(m)));
});

test("mixed canonical across pages (old vs new hosts) fails", () => {
  const e = greenCanonical();
  e.pages[0].canonical = ["https://maxking.cc/aiwiki"];
  const r = evaluateCanonical(e, { now: NOW, newCanonicalHost: "aiwiki.maxking.cc", oldCanonicalHost: "maxking.cc", maxAgeMs: baseConfig.evidenceMaxAgeMs });
  assert.equal(r.status, "red");
  assert.ok(r.reasons.some((m) => /not self|switched early|canonical host/.test(m)));
});

test("prelaunch active metadata switched early to new host fails", () => {
  const e = greenCanonical();
  e.activeMetadataCanonical = "aiwiki.maxking.cc";
  const r = evaluateCanonical(e, { now: NOW, newCanonicalHost: "aiwiki.maxking.cc", oldCanonicalHost: "maxking.cc", maxAgeMs: baseConfig.evidenceMaxAgeMs });
  assert.equal(r.status, "red");
  assert.ok(r.reasons.some((m) => /switched early/.test(m)));
});

test("content: wrong release marker fails", () => {
  const e = greenContent();
  e.markers.release = "0.3.0";
  const opts = optsFromConfig(baseConfig, NOW);
  const r = evaluateContent(e, opts);
  assert.equal(r.status, "red");
  assert.ok(r.reasons.some((m) => /release marker/.test(m)));
});

test("http: required path missing fails; redirect loop fails", () => {
  const opts = { now: NOW, latencyLimitMs: baseConfig.latencyLimitMs, requiredPaths: ["/", "/install", "/docs", "/missing"], maxAgeMs: baseConfig.evidenceMaxAgeMs };
  const e = greenHttp();
  const r = evaluateHttp(e, opts);
  assert.equal(r.status, "red");
  assert.ok(r.reasons.some((m) => /\/missing not probed/.test(m)));

  const loop = greenHttp();
  loop.redirectLoop = true;
  const r2 = evaluateHttp(loop, { now: NOW, latencyLimitMs: baseConfig.latencyLimitMs, requiredPaths: baseConfig.paths, maxAgeMs: baseConfig.evidenceMaxAgeMs });
  assert.equal(r2.status, "red");
});

test("aggregateReadiness: any non-green category makes overall false (one red among six green)", () => {
  const bundle = greenBundle();
  bundle.tls.notAfter = NOW + 5 * DAY; // red: expiry <= 30 days
  const results = {
    dns: evaluateDns(bundle.dns, { now: NOW, maxAgeMs: baseConfig.evidenceMaxAgeMs, minResolvers: 2 }),
    tls: evaluateTls(bundle.tls, { now: NOW, minRemainingDays: TLS_MIN_REMAINING_DAYS, maxAgeMs: baseConfig.evidenceMaxAgeMs }),
    http: evaluateHttp(bundle.http, { now: NOW, latencyLimitMs: baseConfig.latencyLimitMs, requiredPaths: baseConfig.paths, maxAgeMs: baseConfig.evidenceMaxAgeMs }),
    content: evaluateContent(bundle.content, optsFromConfig(baseConfig, NOW)),
    canonical: evaluateCanonical(bundle.canonical, { now: NOW, newCanonicalHost: baseConfig.newCanonicalHost, oldCanonicalHost: baseConfig.oldCanonicalHost, maxAgeMs: baseConfig.evidenceMaxAgeMs }),
    monitoring: evaluateMonitoring(bundle.monitoring, { now: NOW, windowProbes: DEFAULT_WINDOW_PROBES, ackFreshnessMs: 7 * DAY, maxAgeMs: baseConfig.evidenceMaxAgeMs })
  };
  const agg = aggregateReadiness(results);
  assert.equal(agg.ready, false);
  assert.equal(agg.failing.length, 1);
  assert.equal(agg.failing[0].category, "tls");
});

test("trailingGreenCount stops at first non-green from the end", () => {
  assert.equal(trailingGreenCount([{ status: "red" }, { status: "green" }, { status: "green" }]), 2);
  assert.equal(trailingGreenCount([{ status: "green" }, { status: "green" }]), 2);
  assert.equal(trailingGreenCount([{ status: "green" }, { status: "red" }]), 0);
});

test("cadenceOk rejects a gap outside the window", () => {
  const ok = cadenceOk(makeGreenRun(5, CADENCE), CADENCE);
  assert.equal(ok.ok, true);
  const bad = makeGreenRun(5, CADENCE);
  bad[3].timestamp = bad[2].timestamp + CADENCE * 3;
  assert.equal(cadenceOk(bad, CADENCE).ok, false);
});

// ===========================================================================
// UT9 — Collapse state machine
// ===========================================================================

test("collapse: green readiness AT scope freeze selects one combined release", () => {
  const decision = decideCollapse({
    readinessRecord: { ready: true, recordedAt: NOW },
    scopeFreezeAt: NOW,
    priorReviews: [{ id: "r1", kind: "technical-review", reviewedAt: NOW - 1000 }],
    now: NOW
  });
  assert.equal(decision.collapse, true);
  assert.equal(decision.requiresFreshTechnicalReview, true);
  assert.equal(decision.mergeAuthorized, false); // merge needs fresh work first
  assert.deepEqual(decision.invalidatedReviews.map((r) => r.id), ["r1"]);
  assert.ok(decision.requiredFreshWork.includes("fresh-technical-review"));
});

test("collapse: green readiness BEFORE scope freeze also collapses", () => {
  const decision = decideCollapse({
    readinessRecord: { ready: true, recordedAt: NOW - 1000 },
    scopeFreezeAt: NOW,
    now: NOW
  });
  assert.equal(decision.collapse, true);
});

test("collapse: red/incomplete readiness never collapses (two-release path)", () => {
  const decision = decideCollapse({
    readinessRecord: { ready: false, recordedAt: NOW, failing: [{ category: "tls", status: "red" }] },
    scopeFreezeAt: NOW,
    now: NOW
  });
  assert.equal(decision.collapse, false);
  assert.match(decision.reason, /readiness not green/);
});

test("collapse: late readiness (after scope freeze) does not collapse", () => {
  const decision = decideCollapse({
    readinessRecord: { ready: true, recordedAt: NOW + 1 },
    scopeFreezeAt: NOW,
    now: NOW + 2
  });
  assert.equal(decision.collapse, false);
  assert.match(decision.reason, /after scope freeze/);
});

test("collapse: unknown recordedAt never collapses", () => {
  const decision = decideCollapse({
    readinessRecord: { ready: true, recordedAt: undefined },
    scopeFreezeAt: NOW,
    now: NOW
  });
  assert.equal(decision.collapse, false);
  assert.match(decision.reason, /recordedAt unknown/);
});

test("collapse: first package already published cannot relabel to one release", () => {
  const decision = decideCollapse({
    readinessRecord: { ready: true, recordedAt: NOW - 1 },
    scopeFreezeAt: NOW,
    firstPublishedAt: NOW - 1,
    now: NOW
  });
  assert.equal(decision.collapse, false);
  assert.match(decision.reason, /cannot be relabeled/);
});

test("authorizeMerge: requires fresh review at/after fold AND readiness", () => {
  const decision = decideCollapse({
    readinessRecord: { ready: true, recordedAt: NOW - 2000 },
    scopeFreezeAt: NOW,
    priorReviews: [{ id: "old", kind: "technical-review", reviewedAt: NOW - 5000 }],
    now: NOW
  });
  // fresh review BEFORE the fold -> not authorized
  const preFold = authorizeMerge(decision, {
    foldedAt: NOW,
    readinessRecordedAt: NOW - 2000,
    freshReviews: [{ id: "f1", kind: "fresh-technical-review", reviewedAt: NOW - 1000 }]
  });
  assert.equal(preFold.mergeAuthorized, false);
  assert.equal(preFold.stale.length, 1);

  // fresh review AFTER the fold and after readiness -> authorized when all kinds present
  const ok = authorizeMerge(decision, {
    foldedAt: NOW,
    readinessRecordedAt: NOW - 2000,
    freshReviews: decision.requiredFreshWork.map((kind, i) => ({ id: `f${i}`, kind, reviewedAt: NOW + 1 }))
  });
  assert.equal(ok.mergeAuthorized, true);
  assert.equal(ok.missing.length, 0);
});

test("authorizeMerge: missing one required fresh-work kind blocks merge", () => {
  const decision = decideCollapse({
    readinessRecord: { ready: true, recordedAt: NOW - 2000 },
    scopeFreezeAt: NOW,
    now: NOW
  });
  const partial = authorizeMerge(decision, {
    foldedAt: NOW,
    readinessRecordedAt: NOW - 2000,
    freshReviews: [{ id: "f1", kind: "fresh-ci", reviewedAt: NOW + 1 }]
  });
  assert.equal(partial.mergeAuthorized, false);
  assert.ok(partial.missing.includes("fresh-technical-review"));
});

test("collapse: partial/forecast readiness (ready true but no recordedAt) cannot collapse", () => {
  // forecasted readiness has no real timestamp
  const decision = decideCollapse({
    readinessRecord: { ready: true, recordedAt: NaN },
    scopeFreezeAt: NOW,
    now: NOW
  });
  assert.equal(decision.collapse, false);
});

// ===========================================================================
// Cutover plan + authority validation
// ===========================================================================

test("cutover plan has guards, prelaunch/cutover/rollback phases, and every mutating step names authority", () => {
  const plan = buildCutoverPlan(baseConfig);
  assert.ok(plan.guards.length >= 4);
  assert.ok(plan.prelaunch.length >= 2);
  assert.ok(plan.cutover.length >= 3);
  assert.ok(plan.rollback.length >= 4);
  for (const step of [...plan.prelaunch, ...plan.cutover, ...plan.rollback]) {
    assert.ok(step.authority, `${step.id} needs authority`);
    assert.ok(step.verifyWith, `${step.id} needs verifyWith`);
  }
  // every cutover step that mutates is reversible (rollback exists)
  const mutating = plan.cutover.filter((s) => s.mutates.length > 0);
  assert.ok(mutating.every((s) => s.reversible === true));
});

test("validateCutoverAuthority fails when an owner is missing", () => {
  const plan = buildCutoverPlan(baseConfig);
  const ok = validateCutoverAuthority(plan, { deployment: "d", rollback: "r", alerts: "a" });
  assert.equal(ok.ok, true);
  const bad = validateCutoverAuthority(plan, { deployment: "", rollback: "r", alerts: "a" });
  assert.equal(bad.ok, false);
  assert.ok(bad.missing.length >= 1);
});

test("renderCutoverPlan emits a readable checklist with guards and phases", () => {
  const plan = buildCutoverPlan(baseConfig);
  const text = renderCutoverPlan(plan);
  assert.match(text, /# AIWiki canonical cutover/);
  assert.match(text, /## Guards/);
  assert.match(text, /## prelaunch/);
  assert.match(text, /## cutover/);
  assert.match(text, /## rollback/);
  assert.match(text, /noindex/);
  assert.match(text, /301\/308/);
});

// ===========================================================================
// Config merge / validate
// ===========================================================================

test("mergeConfig deep-merges objects, replaces arrays/primitives", () => {
  const merged = mergeConfig(DEFAULT_CONFIG, {
    owners: { alerts: "alice" },
    paths: ["/", "/x"],
    stage: "launch"
  });
  assert.equal(merged.owners.alerts, "alice");
  assert.equal(merged.owners.deployment, DEFAULT_CONFIG.owners.deployment); // preserved
  assert.deepEqual(merged.paths, ["/", "/x"]); // replaced
  assert.equal(merged.stage, "launch");
});

test("validateConfig rejects insufficient resolvers and tiny monitoring window", () => {
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, resolvers: ["1.1.1.1"] }),
    /resolvers must list at least 2/
  );
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, monitoringWindowProbes: 100 }),
    /monitoringWindowProbes/
  );
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, stage: "beta" }),
    /stage must be/
  );
});

test("loadConfig derives expectedRelease from package.json when unset", () => {
  const cfg = loadConfig({
    configPath: fileURLToPath(new URL("./site-readiness.config.json", import.meta.url)),
    packageJsonPath: fileURLToPath(new URL("../../package.json", import.meta.url))
  });
  assert.ok(typeof cfg.expectedRelease === "string" && /^\d+\.\d+\.\d+$/.test(cfg.expectedRelease));
});

// ===========================================================================
// Probe pipeline with injected fake transports (no network)
// ===========================================================================

function fakeTransports({ tlsDaysLeft = 60, httpStatus = 200, noindex = true, body = "" }) {
  const canonicalHtml = noindex
    ? '<link rel="canonical" href="https://aiwiki.maxking.cc/"/><meta name="robots" content="noindex"/>'
    : '<link rel="canonical" href="https://aiwiki.maxking.cc/"/>';
  const homepage =
    body ||
    `version 0.5.0 npm install -g @itradingai/aiwiki https://github.com/iTradingAI/aiwiki MIT private security report /en/ 中文`;
  return {
    dns: {
      async resolve({ resolver }) {
        return { resolver, rcode: "NOERROR", a: ["1.2.3.4"], aaaa: [], cname: [] };
      }
    },
    tls: {
      async probe() {
        return { san: ["aiwiki.maxking.cc"], chainTrusted: true, notAfter: Date.now() + tlsDaysLeft * DAY, httpsUp: true };
      }
    },
    http: {
      async get({ url }) {
        const isHome = url.endsWith("/");
        return {
          status: httpStatus,
          finalUrl: url,
          https: true,
          latencyMs: 100,
          headers: {},
          body: isHome ? homepage + canonicalHtml : canonicalHtml
        };
      },
      async getNoRedirect({ url }) {
        return { status: 301, location: "https://aiwiki.maxking.cc/", https: false, latencyMs: 50 };
      }
    }
  };
}

test("runProbe fails closed when monitoring evidence is absent (live probe cannot synthesize 288 greens)", async () => {
  const cfg = { ...baseConfig };
  const { verdict } = await runProbe({
    config: cfg,
    now: NOW,
    transports: fakeTransports({}),
    monitoringEvidence: { collectedAt: NOW, history: [], cadenceMs: CADENCE, owner: "owner-a", alertSink: { kind: "webhook", lastAck: { at: NOW - 60_000, acknowledged: true } } }
  });
  assert.equal(verdict.ready, false);
  const mon = verdict.categories.find((c) => c.category === "monitoring");
  assert.equal(mon.status, "red");
});

test("runProbe is green end-to-end when all categories (including supplied monitoring) are healthy", async () => {
  const cfg = { ...baseConfig };
  const { verdict } = await runProbe({
    config: cfg,
    now: NOW,
    transports: fakeTransports({}),
    monitoringEvidence: greenMonitoring(NOW)
  });
  assert.equal(verdict.ready, true, verdict.summary);
});

test("runProbe turns red when a path returns non-200", async () => {
  const cfg = { ...baseConfig };
  const { verdict } = await runProbe({
    config: cfg,
    now: NOW,
    transports: fakeTransports({ httpStatus: 500 }),
    monitoringEvidence: greenMonitoring(NOW)
  });
  assert.equal(verdict.ready, false);
});

// helpers tested directly
test("parseCanonicalAndNoindex detects canonical and noindex", () => {
  const { canonical, noindex } = parseCanonicalAndNoindex(
    '<link rel="canonical" href="https://aiwiki.maxking.cc/"/><meta name="robots" content="noindex,nofollow"/>'
  );
  assert.deepEqual(canonical, ["https://aiwiki.maxking.cc/"]);
  assert.equal(noindex.present, true);
});
test("detectMixedContent flags http:// subresources", () => {
  assert.equal(detectMixedContent('<img src="http://evil/x.png">'), true);
  assert.equal(detectMixedContent('<img src="https://ok/x.png">'), false);
});
test("extractMarkers pulls release/install/repo/license/locales/security", () => {
  const m = extractMarkers("version 0.5.0 npm install -g @itradingai/aiwiki https://github.com/iTradingAI/aiwiki MIT private security report /en/ 中文");
  assert.equal(m.release, "0.5.0");
  assert.equal(m.installCommand, "npm install -g @itradingai/aiwiki");
  assert.equal(m.repository, "https://github.com/iTradingAI/aiwiki");
  assert.equal(m.license, "MIT");
  assert.ok(m.locales.includes("en") && m.locales.includes("zh-CN"));
  assert.equal(m.securityRoute, true);
});

test("site readiness workflow passes dispatch inputs through env without checkout credentials", () => {
  const workflow = readFileSync(".github/workflows/site-readiness.yml", "utf8");
  assert.ok(workflow.includes("persist-credentials: false"));
  assert.ok(workflow.includes("EXPECTED_RELEASE: ${{ inputs.expected-release }}"));
  assert.ok(workflow.includes("SITE_STAGE: ${{ inputs.stage }}"));
  assert.ok(workflow.includes('args+=(--expected-release "$EXPECTED_RELEASE")'));
  assert.ok(workflow.includes('node scripts/site-readiness/probe.mjs "${args[@]}"'));
  assert.ok(!workflow.includes("--expected-release ${{ inputs."));
});
