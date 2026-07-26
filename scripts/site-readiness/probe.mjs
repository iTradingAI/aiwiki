// AIWiki site-readiness live probe.
//
// Dependency-free (Node builtins only). Collects DNS/TLS/HTTP/content/canonical
// evidence and reduces it through readiness.mjs into a fail-closed verdict.
//
// Transports are injectable so the full pipeline is testable without network:
// createNodeTransports() uses node:dns, node:tls, and global fetch; tests pass
// fakes. The probe NEVER mutates DNS, deploy, repository settings, or package
// metadata. It only reads and reports.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config.mjs";
import { evaluateReadiness } from "./readiness.mjs";
import { decideCollapse } from "./collapse.mjs";
import { buildCutoverPlan, renderCutoverPlan } from "./cutover-plan.mjs";

const here = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------------------
// Default transports (real network). Each returns plain data; errors map to
// evidence the evaluator turns red/unknown. Never throws out of a collector.
// ---------------------------------------------------------------------------

/** @returns {{ dns, tls, http }} */
export function createNodeTransports() {
  const dnsTransport = {
    async resolve({ host, resolver, types }) {
      const out = { resolver, rcode: "NOERROR", a: [], aaaa: [], cname: [] };
      try {
        const mod = await import("node:dns/promises");
        const r = new mod.Resolver();
        r.setServers([resolver]);
        if (types.includes("a")) {
          try {
            out.a = await r.resolve4(host);
          } catch (e) {
            if (String(e.code) === "ENOTFOUND") out.a = [];
            else throw e;
          }
        }
        if (types.includes("aaaa")) {
          try {
            out.aaaa = await r.resolve6(host);
          } catch (e) {
            if (String(e.code) === "ENOTFOUND") out.aaaa = [];
            else throw e;
          }
        }
        if (types.includes("cname")) {
          try {
            out.cname = (await r.resolveCname(host)).map((c) => c.toLowerCase());
          } catch (e) {
            if (String(e.code) === "ENOTFOUND") out.cname = [];
            else throw e;
          }
        }
      } catch (e) {
        out.rcode = "SERVFAIL";
        out.servfail = true;
        out.error = String(e.message ?? e);
      }
      return out;
    }
  };

  const tlsTransport = {
    async probe({ host, port = 443 }) {
      const tls = await import("node:tls");
      return await new Promise((resolve) => {
        const out = { san: [], chainTrusted: false, notAfter: NaN, httpsUp: false };
        let settled = false;
        const socket = tls.connect(
          { host, port, servername: host, rejectUnauthorized: true },
          () => {
            const cert = socket.getPeerCertificate(true);
            out.httpsUp = true;
            out.chainTrusted = socket.authorized === true;
            const leaf = cert && cert.subject ? cert : cert?.issuer ? cert : null;
            if (cert?.valid_to) {
              const t = Date.parse(cert.valid_to);
              if (Number.isFinite(t)) out.notAfter = t;
            }
            const sanRaw = cert?.subjectaltname ?? "";
            out.san = String(sanRaw)
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.startsWith("DNS:"))
              .map((s) => s.slice(4).toLowerCase());
            void leaf;
            if (!settled) {
              settled = true;
              socket.end();
              resolve(out);
            }
          }
        );
        socket.setTimeout(10_000, () => {
          if (!settled) {
            settled = true;
            socket.destroy();
            resolve(out);
          }
        });
        socket.once("error", () => {
          if (!settled) {
            settled = true;
            resolve(out);
          }
        });
      });
    }
  };

  const httpTransport = {
    async get({ url }) {
      const start = Date.now();
      const out = { status: 0, finalUrl: url, https: url.startsWith("https://"), latencyMs: 0, headers: {}, body: "" };
      try {
        const res = await fetch(url, { redirect: "follow" });
        out.status = res.status;
        out.finalUrl = res.url;
        out.https = String(res.url).startsWith("https://");
        out.headers = Object.fromEntries(res.headers.entries());
        out.body = await res.text();
      } catch (e) {
        out.error = String(e.message ?? e);
      }
      out.latencyMs = Date.now() - start;
      return out;
    },
    async getNoRedirect({ url }) {
      const start = Date.now();
      const out = { status: 0, location: null, https: url.startsWith("https://"), latencyMs: 0 };
      try {
        const res = await fetch(url, { redirect: "manual" });
        out.status = res.status;
        out.location = res.headers.get("location");
      } catch (e) {
        out.error = String(e.message ?? e);
      }
      out.latencyMs = Date.now() - start;
      return out;
    }
  };

  return { dns: dnsTransport, tls: tlsTransport, http: httpTransport };
}

// ---------------------------------------------------------------------------
// Collectors: turn transport output into evaluator evidence objects.
// ---------------------------------------------------------------------------

/**
 * @param {object} a
 * @returns {boolean} true if the body references insecure (http://) subresources.
 */
export function detectMixedContent(body) {
  if (typeof body !== "string") return false;
  const insecure = /(?:src|href)\s*=\s*["']http:\/\//i;
  return insecure.test(body);
}

/** Parse canonical link hrefs and noindex presence from an HTML body. */
export function parseCanonicalAndNoindex(body) {
  const canonical = [];
  const noindex = { present: false };
  if (typeof body !== "string") return { canonical, noindex };
  const linkRe = /<link\b[^>]*>/gi;
  const metaRe = /<meta\b[^>]*>/gi;
  for (const m of body.matchAll(linkRe)) {
    const tag = m[0];
    if (/rel\s*=\s*["']canonical["']/i.test(tag)) {
      const href = tag.match(/href\s*=\s*["']([^"']+)["']/i);
      if (href) canonical.push(href[1]);
    }
  }
  for (const m of body.matchAll(metaRe)) {
    const tag = m[0];
    if (/name\s*=\s*["']robots["']/i.test(tag) && /content\s*=\s*["'][^"']*\bnoindex\b/i.test(tag)) {
      noindex.present = true;
    }
  }
  return { canonical, noindex };
}

/**
 * @param {object} args
 * @returns {Promise<object>} dns evidence
 */
export async function collectDns({ host, resolvers, expected, transports, now, ttl = null, rollbackRecord = null }) {
  const collectedAt = now;
  const types = ["a", "aaaa", "cname"];
  const out = [];
  for (const resolver of resolvers) {
    out.push(await transports.dns.resolve({ host, resolver, types }));
  }
  return { collectedAt, host, resolvers: out, ttl, rollbackRecord, expected: expected ?? {} };
}

/** @returns {Promise<object>} tls evidence */
export async function collectTls({ host, transports, now, mixedContent = false }) {
  const probed = await transports.tls.probe({ host, port: 443 });
  return {
    collectedAt: now,
    host,
    san: probed.san ?? [],
    chainTrusted: probed.chainTrusted === true,
    notAfter: Number.isFinite(probed.notAfter) ? probed.notAfter : NaN,
    httpsUp: probed.httpsUp === true,
    mixedContent: mixedContent === true
  };
}
/** @returns {Promise<{evidence: object, bodies: Record<string,string>}>} */
export async function collectHttp({ host, paths, transports, now }) {
  const pathResults = [];
  const bodies = {};
  for (const p of paths) {
    const url = `https://${host}${p}`;
    const r = await transports.http.get({ url });
    pathResults.push({ path: p, status: r.status, https: r.https, latencyMs: r.latencyMs });
    if (r.status === 200) bodies[p] = r.body;
  }
  const root = await transports.http.getNoRedirect({ url: `http://${host}/` });
  let httpRedirectsToHttps = false;
  let redirectLoop = false;
  if (root.status >= 300 && root.status < 400 && root.location) {
    httpRedirectsToHttps = String(root.location).startsWith("https://");
  } else if (root.status >= 200 && root.status < 300 && root.https) {
    // Already on https with no redirect needed.
    httpRedirectsToHttps = true;
  }
  // Crude loop heuristic: a Location pointing back to the same http origin.
  if (root.location && String(root.location).startsWith("http://")) {
    redirectLoop = true;
  }
  return {
    evidence: { collectedAt: now, host, paths: pathResults, httpRedirectsToHttps, redirectLoop },
    bodies
  };
}

/** @returns {Promise<object>} content evidence */
export async function collectContent({ host, paths, transports, now, expected, homepageBody = "" }) {
  const markers = extractMarkers(homepageBody);
  const criticalLinks = [];
  for (const p of paths) {
    const r = await transports.http.get({ url: `https://${host}${p}` });
    criticalLinks.push({ href: p, status: r.status, ok: r.status === 200 });
  }
  return {
    collectedAt: now,
    markers: {
      release: markers.release ?? null,
      installCommand: markers.installCommand ?? null,
      repository: markers.repository ?? null,
      securityRoute: markers.securityRoute ?? false,
      locales: markers.locales ?? [],
      license: markers.license ?? null
    },
    criticalLinks,
    expected
  };
}

/** Very small, dependency-free marker extractor from the homepage HTML. */
export function extractMarkers(body) {
  const out = { release: null, installCommand: null, repository: null, securityRoute: false, locales: [], license: null };
  if (typeof body !== "string") return out;
  const text = body.replace(/<[^>]+>/g, " ");
  const rel = text.match(/(?:version|release)[^0-9]*([0-9]+\.[0-9]+\.[0-9]+)/i);
  if (rel) out.release = rel[1];
  const inst = text.match(/(npm\s+install(?:\s+-g)?\s+@?[0-9a-z/_@.\-]+)/i);
  if (inst) out.installCommand = inst[1].trim();
  const repo = text.match(/(https?:\/\/github\.com\/[0-9A-Za-z._\-/]+)/i);
  if (repo) out.repository = repo[1];
  const lic = text.match(/\b(MIT|Apache-2\.0|BSD-[23]-Clause|ISC|MPL-2\.0)\b/);
  if (lic) out.license = lic[1];
  if (/security|vulnerab/i.test(text) && /private|report|disclos/i.test(text)) out.securityRoute = true;
  const locales = new Set();
  if (/\/en\/|lang="en"|>en<|\bEnglish\b/i.test(body)) locales.add("en");
  if (/\/zh-CN\/|lang="zh-CN"|>中文<|中文|简体中文/u.test(body)) locales.add("zh-CN");
  out.locales = [...locales];
  return out;
}

/** @returns {Promise<object>} canonical evidence */
export async function collectCanonical({ host, stage, paths, transports, now, activeMetadataCanonical = "" }) {
  const pages = [];
  for (const p of paths) {
    const url = `https://${host}${p}`;
    const r = await transports.http.get({ url });
    const parsed = parseCanonicalAndNoindex(r.status === 200 ? r.body : "");
    pages.push({ url, canonical: parsed.canonical, noindex: parsed.noindex.present });
  }
  return { collectedAt: now, stage, pages, activeMetadataCanonical };
}

/**
 * Run the full six-category probe against the configured host. If monitoring
 * history is supplied it is passed through; otherwise monitoring is unknown
 * (fail-closed) because a live probe cannot synthesize 288 greens.
 *
 * @param {object} args
 * @param {object} args.config
 * @param {object} [args.transports]
 * @param {number} [args.now]
 * @param {object} [args.monitoringEvidence]
 * @returns {Promise<{ evidence: object, verdict: object }>}
 */
export async function runProbe(args) {
  const cfg = args.config;
  const transports = args.transports ?? createNodeTransports();
  const now = Number.isFinite(args.now) ? args.now : Date.now();
  const host = cfg.newCanonicalHost;

  const dnsEvidence = await collectDns({
    host,
    resolvers: cfg.resolvers,
    expected: cfg.dnsExpected,
    transports,
    now,
    ttl: cfg.dnsTtl ?? null,
    rollbackRecord: cfg.dnsRollbackRecord ?? null
  });
  const http = await collectHttp({ host, paths: cfg.paths, transports, now });
  const homepageBody = http.bodies["/"] ?? "";
  const tlsEvidence = await collectTls({ host, transports, now, mixedContent: detectMixedContent(homepageBody) });
  const contentEvidence = await collectContent({
    host,
    paths: cfg.paths,
    transports,
    now,
    expected: {
      release: cfg.expectedRelease,
      installCommand: cfg.expectedInstallCommand,
      repository: cfg.expectedRepository,
      securityRoute: cfg.requireSecurityRoute,
      locales: cfg.expectedLocales,
      license: cfg.expectedLicense
    },
    homepageBody
  });
  const canonicalEvidence = await collectCanonical({
    host,
    stage: cfg.stage,
    paths: cfg.paths,
    transports,
    now,
    activeMetadataCanonical: cfg.activeMetadataCanonical ?? cfg.oldCanonicalHost
  });
  const monitoringEvidence =
    args.monitoringEvidence ??
    { collectedAt: now, history: [], cadenceMs: cfg.monitoringCadenceMs, owner: cfg.owners?.alerts ?? "", alertSink: cfg.alertSink ?? {} };

  const evidence = { dns: dnsEvidence, tls: tlsEvidence, http: http.evidence, content: contentEvidence, canonical: canonicalEvidence, monitoring: monitoringEvidence };
  const verdict = evaluateReadiness(evidence, cfg, now);
  return { evidence, verdict };
}

// ---------------------------------------------------------------------------
// CLI: probe | --print-plan | --collapse
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { mode: "probe", configPath: null, expectedRelease: null, stage: null, collapseFile: null, scopeFreeze: null, printPlan: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--print-plan") out.printPlan = true;
    else if (a === "--config") out.configPath = argv[++i];
    else if (a === "--expected-release") out.expectedRelease = argv[++i];
    else if (a === "--stage") out.stage = argv[++i];
    else if (a === "--collapse") {
      out.mode = "collapse";
      out.collapseFile = argv[++i];
    } else if (a === "--scope-freeze") out.scopeFreeze = argv[++i];
  }
  return out;
}

async function main(argv) {
  const args = parseArgs(argv);
  const root = process.cwd();
  const configPath = args.configPath ?? path.join(root, "scripts", "site-readiness", "site-readiness.config.json");
  const packageJsonPath = path.join(root, "package.json");
  const env = {};
  if (args.expectedRelease) env.expectedRelease = args.expectedRelease;
  if (args.stage) env.stage = args.stage;
  const cfg = loadConfig({ configPath, packageJsonPath, env });

  if (args.printPlan) {
    const plan = buildCutoverPlan(cfg);
    console.log(renderCutoverPlan(plan));
    return 0;
  }

  if (args.mode === "collapse") {
    if (!args.collapseFile) throw new Error("--collapse requires a readiness JSON file path");
    if (!args.scopeFreeze) throw new Error("--collapse requires --scope-freeze <epoch-ms|iso>");
    const raw = JSON.parse(readFileSync(args.collapseFile, "utf8"));
    const scopeFreezeAt = /^\d+$/.test(String(args.scopeFreeze))
      ? Number(args.scopeFreeze)
      : Date.parse(args.scopeFreeze);
    const decision = decideCollapse({
      readinessRecord: { ready: raw.ready === true, recordedAt: raw.evaluatedAt ?? raw.recordedAt, summary: raw.summary, failing: raw.failing },
      scopeFreezeAt,
      firstPublishedAt: raw.firstPublishedAt ?? null,
      priorReviews: raw.priorReviews ?? [],
      now: Date.now()
    });
    console.log(JSON.stringify(decision, null, 2));
    return 0;
  }

  const { verdict } = await runProbe({ config: cfg });
  console.log(JSON.stringify(verdict, null, 2));
  return verdict.ready ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(here)) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(`site-readiness: ${e?.message ?? e}`);
      process.exit(2);
    });
}

export const __test = { main, parseArgs };
