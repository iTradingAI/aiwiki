import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CleanupError,
  EXPECTED_BASELINE_TASK_BRANCHES,
  GitHubApi,
  annotateAncestryDiagnostics,
  buildHistoricalEvidence,
  createReview,
  executeHistoricalEvidence,
  handlePullRequestEvent,
  probeDeleteBranchOnMerge,
  validateReview,
} from "../../scripts/github-branch-cleanup.mjs";

const NOW = Date.parse("2026-07-26T08:00:00.000Z");
const REPOSITORY = "iTradingAI/aiwiki";

const branch = (name, oid, protectedBranch = false) => ({ name, protected: protectedBranch, commit: { sha: oid } });
const pull = ({ number, name, oid, state = "closed", merged = true, repository = REPOSITORY }) => ({
  number,
  state,
  merged_at: merged ? "2026-07-26T07:59:00.000Z" : null,
  head: { ref: name, sha: oid, repo: { full_name: repository } },
  base: { ref: "dev" },
});

function baselineSnapshot() {
  const taskBranches = EXPECTED_BASELINE_TASK_BRANCHES.map((name, index) => branch(name, `oid-${index}`));
  const pulls = EXPECTED_BASELINE_TASK_BRANCHES.map((name, index) => pull({ number: index + 1, name, oid: `oid-${index}` }));
  return {
    generatedAt: new Date(NOW).toISOString(),
    repository: REPOSITORY,
    repositoryId: 123,
    defaultBranch: "main",
    deleteBranchOnMerge: false,
    preserveBranches: ["dev", "main"],
    branches: [branch("main", "main-oid", true), branch("dev", "dev-oid"), ...taskBranches],
    pulls,
    tags: [{ name: "v0.5.0", commit: { sha: "tag-oid" } }],
    rulesets: [],
    pagination: {
      branches: { pages: 1, complete: true },
      pulls: { pages: 1, complete: true },
      tags: { pages: 1, complete: true },
      rulesets: { pages: 1, complete: true },
    },
  };
}

function findExclusion(evidence, name) {
  return evidence.exclusions.find((entry) => entry.name === name);
}

test("the reviewed baseline is exactly the current 18 unique task branch names", () => {
  assert.equal(EXPECTED_BASELINE_TASK_BRANCHES.length, 18);
  assert.equal(new Set(EXPECTED_BASELINE_TASK_BRANCHES).size, 18);
  assert.ok(EXPECTED_BASELINE_TASK_BRANCHES.every((name) => /^task\/CORE-\d{4}-[a-z0-9-]+$/.test(name)));
  const evidence = buildHistoricalEvidence(baselineSnapshot());
  assert.equal(evidence.baselineMatches, true);
  assert.deepEqual(evidence.blockedReasons, []);
  assert.deepEqual(evidence.candidates.map(({ name }) => name), [...EXPECTED_BASELINE_TASK_BRANCHES].sort());
  assert.ok(evidence.candidates.every((candidate) => candidate.ancestry === "diagnostic-not-authorizing"));
  assert.equal(evidence.dryRun, true);
});

test("non-ancestral diagnostics never disqualify otherwise exact merged evidence", () => {
  const snapshot = baselineSnapshot();
  snapshot.pulls[0].ancestry = { status: "diverged", ahead_by: 0 };
  const evidence = buildHistoricalEvidence(snapshot);
  assert.ok(evidence.candidates.some((candidate) => candidate.name === EXPECTED_BASELINE_TASK_BRANCHES[0]));
});

test("live ancestry is recorded as a non-authorizing diagnostic", async () => {
  const evidence = buildHistoricalEvidence(baselineSnapshot());
  let reads = 0;
  await annotateAncestryDiagnostics({
    evidence,
    api: {
      async request(method) {
        assert.equal(method, "GET");
        reads += 1;
        return { status: "diverged", ahead_by: 0, behind_by: 2 };
      },
    },
  });
  assert.equal(reads, 18);
  assert.equal(evidence.candidates.length, 18);
  assert.ok(evidence.candidates.every((candidate) => candidate.ancestry.authorizing === false));
  assert.ok(evidence.candidates.every((candidate) => candidate.ancestry.status === "diverged"));
  assert.equal(evidence.baselineMatches, true);
});

test("main, dev, and default branches are hard excluded", () => {
  const snapshot = baselineSnapshot();
  snapshot.pulls.push(
    pull({ number: 100, name: "main", oid: "main-oid" }),
    pull({ number: 101, name: "dev", oid: "dev-oid" }),
  );
  const evidence = buildHistoricalEvidence(snapshot);
  assert.ok(findExclusion(evidence, "main").reasons.includes("default"));
  assert.ok(findExclusion(evidence, "main").reasons.includes("reserved"));
  assert.ok(findExclusion(evidence, "dev").reasons.includes("reserved"));
  assert.ok(findExclusion(evidence, "dev").reasons.includes("preserved"));
});

for (const fixture of [
  {
    name: "fork",
    expected: "fork",
    mutate(snapshot) { snapshot.pulls[0].head.repo.full_name = "somebody/fork"; },
  },
  {
    name: "open",
    expected: "open-pr",
    mutate(snapshot) { snapshot.pulls[0].state = "open"; snapshot.pulls[0].merged_at = null; },
  },
  {
    name: "unmerged",
    expected: "unmerged",
    mutate(snapshot) { snapshot.pulls[0].merged_at = null; },
  },
  {
    name: "changed OID",
    expected: "changed-oid",
    mutate(snapshot) { snapshot.branches[2].commit.sha = "advanced-oid"; },
  },
  {
    name: "protected",
    expected: "protected",
    mutate(snapshot) { snapshot.branches[2].protected = true; },
  },
  {
    name: "preserved",
    expected: "preserved",
    mutate(snapshot) { snapshot.preserveBranches.push(EXPECTED_BASELINE_TASK_BRANCHES[0]); },
  },
]) {
  test(`${fixture.name} branch evidence is excluded and forces baseline review`, () => {
    const snapshot = baselineSnapshot();
    fixture.mutate(snapshot);
    const evidence = buildHistoricalEvidence(snapshot);
    assert.ok(findExclusion(evidence, EXPECTED_BASELINE_TASK_BRANCHES[0]).reasons.includes(fixture.expected));
    assert.equal(evidence.baselineMatches, false);
    assert.ok(evidence.blockedReasons.includes("expected-candidate-set-mismatch"));
  });
}

test("an active matching branch ruleset is a hard protection exclusion", () => {
  const snapshot = baselineSnapshot();
  snapshot.rulesets.push({
    id: 77,
    name: "preserve task zero",
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: [`refs/heads/${EXPECTED_BASELINE_TASK_BRANCHES[0]}`], exclude: [] } },
  });
  const evidence = buildHistoricalEvidence(snapshot);
  assert.ok(findExclusion(evidence, EXPECTED_BASELINE_TASK_BRANCHES[0]).reasons.includes("ruleset-protected"));
});

test("delete_branch_on_merge true blocks the entire allowlist", () => {
  const snapshot = baselineSnapshot();
  snapshot.deleteBranchOnMerge = true;
  const evidence = buildHistoricalEvidence(snapshot);
  assert.equal(evidence.candidates.length, 0);
  assert.ok(evidence.blockedReasons.includes("delete-branch-on-merge-not-false"));
  assert.ok(evidence.exclusions.every((entry) => entry.reasons.includes("delete-branch-on-merge-not-false")));
});

test("incomplete pagination fails closed", () => {
  const snapshot = baselineSnapshot();
  snapshot.pagination.pulls.complete = false;
  assert.throws(() => buildHistoricalEvidence(snapshot), (error) => error instanceof CleanupError && error.code === "incomplete-pagination");
});

test("paginated API reads through a full page and never sends a mutation", async () => {
  const methods = [];
  const api = new GitHubApi({
    fetchImpl: async (url, options) => {
      methods.push(options.method);
      const page = Number(new URL(url).searchParams.get("page"));
      const data = page === 1 ? Array.from({ length: 100 }, (_, index) => index) : [100];
      return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const result = await api.paginate("/repos/iTradingAI/aiwiki/branches");
  assert.equal(result.pages, 2);
  assert.equal(result.items.length, 101);
  assert.deepEqual(new Set(methods), new Set(["GET"]));
});

test("review hash and five-minute freshness are mandatory", () => {
  const evidence = buildHistoricalEvidence(baselineSnapshot());
  const bytes = Buffer.from(JSON.stringify(evidence));
  const review = createReview({ evidenceBytes: bytes, evidence, reviewedBy: "maintainer", now: NOW + 1_000 });
  validateReview({ evidenceBytes: bytes, evidence, review, now: NOW + 2_000 });
  assert.throws(
    () => validateReview({ evidenceBytes: Buffer.from(`${bytes} `), evidence, review, now: NOW + 2_000 }),
    (error) => error.code === "review-hash-mismatch",
  );
  assert.throws(
    () => validateReview({ evidenceBytes: bytes, evidence, review, now: NOW + 301_001 }),
    (error) => error.code === "stale-evidence",
  );
});

class RecheckApi {
  constructor(evidence, { changedBranch, settingsTrue, protectedBranch } = {}) {
    this.settingsTrue = settingsTrue;
    this.changedBranch = changedBranch;
    this.protectedBranch = protectedBranch;
    this.candidates = new Map(evidence.candidates.map((candidate) => [candidate.name, candidate]));
    this.live = new Map(evidence.branchInventory.map(({ name, oid }) => [name, oid]));
    this.deletes = [];
  }

  async paginate(path) {
    if (path.includes("/rulesets")) return { items: [], pages: 1, complete: true };
    if (path.includes("/pulls?state=open")) return { items: [], pages: 1, complete: true };
    if (path.endsWith("/branches")) {
      return { items: [...this.live].map(([name, oid]) => branch(name, oid, name === "main")), pages: 1, complete: true };
    }
    if (path.endsWith("/tags")) return { items: [{ name: "v0.5.0", commit: { sha: "tag-oid" } }], pages: 1, complete: true };
    throw new Error(`Unexpected pagination: ${path}`);
  }

  async request(method, path, options = {}) {
    if (method === "GET" && path === "/repos/iTradingAI/aiwiki") {
      return { id: 123, default_branch: "main", delete_branch_on_merge: this.settingsTrue ? true : false };
    }
    if (method === "GET" && path.includes("/branches/")) {
      const name = decodeURIComponent(path.split("/branches/")[1]);
      if (!this.live.has(name)) return options.allow404 ? undefined : null;
      const oid = name === this.changedBranch ? "drifted-oid" : this.live.get(name);
      return branch(name, oid, name === this.protectedBranch);
    }
    if (method === "GET" && /\/pulls\/\d+$/.test(path)) {
      const number = Number(path.split("/").at(-1));
      const candidate = [...this.candidates.values()].find((entry) => entry.mergedPull === number);
      return pull({ number, name: candidate.name, oid: candidate.oid });
    }
    if (method === "DELETE" && path.includes("/git/refs/heads/")) {
      const name = decodeURIComponent(path.split("/git/refs/heads/")[1]);
      this.deletes.push(path);
      this.live.delete(name);
      return undefined;
    }
    throw new Error(`Unexpected request: ${method} ${path}`);
  }
}

test("historical execution is serial and stops on the first changed OID", async () => {
  const evidence = buildHistoricalEvidence(baselineSnapshot());
  const bytes = Buffer.from(JSON.stringify(evidence));
  const review = createReview({ evidenceBytes: bytes, evidence, reviewedBy: "maintainer", now: NOW + 1_000 });
  const api = new RecheckApi(evidence, { changedBranch: evidence.candidates[1].name });
  const result = await executeHistoricalEvidence({ api, evidenceBytes: bytes, evidence, review, now: () => NOW + 2_000 });
  assert.equal(result.status, "failed");
  assert.equal(result.failed.code, "oid-drift");
  assert.equal(api.deletes.length, 1);
  assert.ok(api.deletes[0].endsWith(`heads/${encodeURIComponent(evidence.candidates[0].name)}`));
});

function event({ head = EXPECTED_BASELINE_TASK_BRANCHES[0], merged = true, repository = REPOSITORY, oid = "event-oid", state = "closed" } = {}) {
  return {
    action: "closed",
    repository: { full_name: REPOSITORY, default_branch: "main" },
    pull_request: {
      number: 45,
      state,
      merged,
      merged_at: merged ? new Date(NOW - 30_000).toISOString() : null,
      merged_by: merged ? { login: "reviewer" } : null,
      head: { ref: head, sha: oid, repo: { full_name: repository } },
      base: { ref: "main" },
    },
  };
}

class EventApi {
  constructor({ oid = "event-oid", setting = false, protectedBranch = false } = {}) {
    this.oid = oid;
    this.setting = setting;
    this.protectedBranch = protectedBranch;
    this.live = true;
    this.deletes = [];
    this.calls = [];
  }

  async paginate(path) {
    this.calls.push(["GET-PAGE", path]);
    return { items: [], pages: 1, complete: true };
  }

  async request(method, path, options = {}) {
    this.calls.push([method, path]);
    if (method === "GET" && path === "/repos/iTradingAI/aiwiki") return { default_branch: "main", delete_branch_on_merge: this.setting };
    if (method === "GET" && path.includes("/branches/")) {
      if (!this.live) return options.allow404 ? undefined : null;
      return branch(EXPECTED_BASELINE_TASK_BRANCHES[0], this.oid, this.protectedBranch);
    }
    if (method === "GET" && path.endsWith("/pulls/45")) return pull({ number: 45, name: EXPECTED_BASELINE_TASK_BRANCHES[0], oid: "event-oid" });
    if (method === "DELETE") {
      this.deletes.push(path);
      this.live = false;
      return undefined;
    }
    throw new Error(`Unexpected request: ${method} ${path}`);
  }
}

test("eligible merged event deletes at most one exact URL-encoded event head", async () => {
  const api = new EventApi();
  const decision = await handlePullRequestEvent({ api, event: event(), execute: true, now: NOW });
  assert.equal(decision.status, "deleted");
  assert.equal(api.deletes.length, 1);
  assert.equal(api.deletes[0], `/repos/iTradingAI/aiwiki/git/refs/heads/${encodeURIComponent(EXPECTED_BASELINE_TASK_BRANCHES[0])}`);
});

test("merged dev to main produces zero delete calls and no API calls", async () => {
  const api = new EventApi();
  const decision = await handlePullRequestEvent({ api, event: event({ head: "dev" }), execute: true, now: NOW });
  assert.equal(decision.status, "skipped");
  assert.equal(decision.reason, "non-task");
  assert.equal(api.deletes.length, 0);
  assert.equal(api.calls.length, 0);
});

for (const fixture of [
  { name: "main", event: () => event({ head: "main" }) },
  { name: "fork", event: () => event({ repository: "someone/fork" }) },
  { name: "open", event: () => event({ state: "open" }) },
  { name: "unmerged", event: () => event({ merged: false }) },
  { name: "non-task", event: () => event({ head: "feature/not-task" }) },
  { name: "preserved", event: () => event(), preserveBranches: [EXPECTED_BASELINE_TASK_BRANCHES[0]] },
]) {
  test(`event ${fixture.name} negative makes zero delete calls`, async () => {
    const api = new EventApi();
    const decision = await handlePullRequestEvent({ api, event: fixture.event(), preserveBranches: fixture.preserveBranches, execute: true, now: NOW });
    assert.equal(decision.status, "skipped");
    assert.equal(api.deletes.length, 0);
  });
}

for (const fixture of [
  { name: "changed OID", api: () => new EventApi({ oid: "changed" }) },
  { name: "protected", api: () => new EventApi({ protectedBranch: true }) },
  { name: "settings true", api: () => new EventApi({ setting: true }) },
]) {
  test(`event ${fixture.name} recheck fails with zero delete calls`, async () => {
    const api = fixture.api();
    const decision = await handlePullRequestEvent({ api, event: event(), execute: true, now: NOW });
    assert.equal(decision.status, "failed");
    assert.equal(api.deletes.length, 0);
  });
}

test("event dry run is the default behavior and makes zero delete calls", async () => {
  const api = new EventApi();
  const decision = await handlePullRequestEvent({ api, event: event(), now: NOW });
  assert.equal(decision.status, "eligible");
  assert.equal(decision.dryRun, true);
  assert.equal(api.deletes.length, 0);
});

test("settings probe is read-only and alerts when global auto-delete is true", async () => {
  const methods = [];
  const api = {
    async request(method) {
      methods.push(method);
      return { delete_branch_on_merge: true };
    },
  };
  const result = await probeDeleteBranchOnMerge({ api, repository: REPOSITORY, now: NOW });
  assert.equal(result.status, "alert");
  assert.equal(result.mutationAttempted, false);
  assert.deepEqual(methods, ["GET"]);
});

test("workflows use trusted default-branch tooling, never PR code, and keep the probe read-only", async () => {
  const cleanup = await readFile(new URL("../../.github/workflows/branch-cleanup.yml", import.meta.url), "utf8");
  const probe = await readFile(new URL("../../.github/workflows/branch-settings-probe.yml", import.meta.url), "utf8");
  assert.match(cleanup, /pull_request:\s*\n\s*types: \[closed\]/);
  assert.match(cleanup, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(cleanup, /persist-credentials: false/);
  assert.match(cleanup, /--event-path "\$GITHUB_EVENT_PATH"[\s\S]*--execute/);
  assert.match(cleanup, /--reviewed-event "\$GITHUB_EVENT_PATH"/);
  assert.doesNotMatch(cleanup, /pull_request_target|github\.event\.pull_request\.head\.sha|github\.head_ref|npm (ci|install|run)/);
  assert.match(probe, /schedule:/);
  assert.match(probe, /permissions:\s*\n\s*contents: read/);
  assert.match(probe, /settings-probe/);
  assert.doesNotMatch(probe, /contents: write|issues: write|DELETE|PATCH|POST/);
});
