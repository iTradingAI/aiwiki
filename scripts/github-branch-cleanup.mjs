#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const MAX_EVIDENCE_AGE_MS = 5 * 60 * 1000;
export const RESERVED_BRANCHES = Object.freeze(["main", "dev"]);
export const EXPECTED_BASELINE_TASK_BRANCHES = Object.freeze([
  "task/CORE-0400-doc-skill-matching",
  "task/CORE-0401-command-registry",
  "task/CORE-0402-public-api",
  "task/CORE-0403-schema-versioning",
  "task/CORE-0404-extension-api-v01",
  "task/CORE-0405-extension-host-isolation",
  "task/CORE-0406-contract-test-matrix",
  "task/CORE-0407-agent-skill-matching",
  "task/CORE-0408-core-04-release",
  "task/CORE-0408-publish-gate-fix",
  "task/CORE-0501-rebuildable-state",
  "task/CORE-0502-structured-index",
  "task/CORE-0503-typed-relationship-graph",
  "task/CORE-0504-graph-aware-context-v2",
  "task/CORE-0505-knowledge-maintenance",
  "task/CORE-0506-knowledge-health-release",
  "task/CORE-0506-main-sync",
  "task/CORE-0506-post-release-main-sync",
]);

export class CleanupError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "CleanupError";
    this.code = code;
    this.details = details;
  }
}

const iso = (value) => new Date(value).toISOString();
const same = (left, right) => String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase();
const sortedUnique = (values) => [...new Set(values)].sort();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function parseRepository(value) {
  const [owner, repo, extra] = String(value ?? "").split("/");
  if (!owner || !repo || extra) {
    throw new CleanupError("invalid-repository", "Repository must be provided as owner/name");
  }
  return { owner, repo, fullName: `${owner}/${repo}` };
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      result._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (key === "execute") {
      result.execute = true;
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new CleanupError("invalid-arguments", `Missing value for --${key}`);
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function normalizePreserveBranches(values = []) {
  return sortedUnique([
    ...RESERVED_BRANCHES,
    ...values.flatMap((value) => String(value).split(",")),
  ].map((value) => value.trim()).filter(Boolean));
}

function globMatches(pattern, value) {
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "\u0000")
    .replaceAll("*", "[^/]*")
    .replaceAll("?", "[^/]")
    .replaceAll("\u0000", ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function conditionMatchesBranch(condition, branch, defaultBranch) {
  if (!condition) return false;
  const ref = `refs/heads/${branch}`;
  const expand = (pattern) => pattern === "~DEFAULT_BRANCH" ? `refs/heads/${defaultBranch}` : pattern;
  const excludes = (condition.exclude ?? []).map(expand);
  if (excludes.some((pattern) => globMatches(pattern, ref) || globMatches(pattern, branch))) return false;
  const includes = (condition.include ?? []).map(expand);
  return includes.length === 0 || includes.some((pattern) => globMatches(pattern, ref) || globMatches(pattern, branch));
}

export function matchingRulesets(rulesets, branch, defaultBranch) {
  return rulesets
    .filter((ruleset) => ruleset.target === "branch" && ruleset.enforcement !== "disabled")
    .filter((ruleset) => conditionMatchesBranch(ruleset.conditions?.ref_name, branch, defaultBranch))
    .map((ruleset) => ({ id: ruleset.id, name: ruleset.name, enforcement: ruleset.enforcement }));
}

export class GitHubApi {
  constructor({ token, fetchImpl = globalThis.fetch, apiUrl = "https://api.github.com" } = {}) {
    if (typeof fetchImpl !== "function") throw new CleanupError("missing-fetch", "A fetch implementation is required");
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.apiUrl = apiUrl.replace(/\/$/, "");
  }

  async request(method, path, { allow404 = false } = {}) {
    const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "aiwiki-branch-governance",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
    });
    if (allow404 && response.status === 404) return undefined;
    if (!response.ok) {
      const body = await response.text();
      throw new CleanupError("github-api-error", `${method} ${path} returned ${response.status}`, { status: response.status, body });
    }
    if (response.status === 204) return undefined;
    return response.json();
  }

  async paginate(path) {
    const separator = path.includes("?") ? "&" : "?";
    const items = [];
    let pages = 0;
    for (let page = 1; page <= 1000; page += 1) {
      const batch = await this.request("GET", `${path}${separator}per_page=100&page=${page}`);
      if (!Array.isArray(batch)) {
        throw new CleanupError("incomplete-pagination", `Expected an array while paginating ${path}`);
      }
      pages += 1;
      items.push(...batch);
      if (batch.length < 100) return { items, pages, complete: true };
    }
    throw new CleanupError("incomplete-pagination", `Pagination limit exceeded for ${path}`);
  }
}

async function loadRulesets(api, root) {
  const listed = await api.paginate(`${root}/rulesets?includes_parents=true`);
  const hydrated = [];
  for (const item of listed.items) {
    if (item.conditions?.ref_name && item.target) {
      hydrated.push(item);
      continue;
    }
    hydrated.push(await api.request("GET", `${root}/rulesets/${item.id}?includes_parents=true`));
  }
  return { items: hydrated, pages: listed.pages, complete: listed.complete };
}

export async function collectRepositorySnapshot({ api, repository, preserveBranches = [], now = Date.now() }) {
  const repo = parseRepository(repository);
  const root = `/repos/${repo.owner}/${repo.repo}`;
  const settings = await api.request("GET", root);
  const branches = await api.paginate(`${root}/branches`);
  const pulls = await api.paginate(`${root}/pulls?state=all&sort=updated&direction=desc`);
  const tags = await api.paginate(`${root}/tags`);
  const rulesets = await loadRulesets(api, root);
  return {
    schemaVersion: 1,
    kind: "aiwiki.branch-cleanup.snapshot",
    generatedAt: iso(now),
    repository: repo.fullName,
    repositoryId: settings.id,
    defaultBranch: settings.default_branch,
    deleteBranchOnMerge: settings.delete_branch_on_merge,
    preserveBranches: normalizePreserveBranches(preserveBranches),
    branches: branches.items,
    pulls: pulls.items,
    tags: tags.items,
    rulesets: rulesets.items,
    pagination: {
      branches: { pages: branches.pages, complete: branches.complete },
      pulls: { pages: pulls.pages, complete: pulls.complete },
      tags: { pages: tags.pages, complete: tags.complete },
      rulesets: { pages: rulesets.pages, complete: rulesets.complete },
    },
  };
}

function pullRepositoryFullName(pull) {
  return pull?.head?.repo?.full_name;
}

function branchReasons(snapshot, branch) {
  const reasons = [];
  const name = branch.name;
  const repoPulls = snapshot.pulls.filter((pull) => pull?.head?.ref === name && same(pullRepositoryFullName(pull), snapshot.repository));
  const forkPulls = snapshot.pulls.filter((pull) => pull?.head?.ref === name && pullRepositoryFullName(pull) && !same(pullRepositoryFullName(pull), snapshot.repository));
  const openPulls = repoPulls.filter((pull) => pull.state === "open");
  const mergedPulls = repoPulls.filter((pull) => pull.state === "closed" && pull.merged_at);
  const matchingMergedPulls = mergedPulls.filter((pull) => pull.head?.sha === branch.commit?.sha);
  const unmergedPulls = repoPulls.filter((pull) => pull.state === "closed" && !pull.merged_at);
  const rulesets = matchingRulesets(snapshot.rulesets, name, snapshot.defaultBranch);

  if (snapshot.deleteBranchOnMerge !== false) reasons.push("delete-branch-on-merge-not-false");
  if (!name.startsWith("task/")) reasons.push("non-task");
  if (RESERVED_BRANCHES.includes(name)) reasons.push("reserved");
  if (name === snapshot.defaultBranch) reasons.push("default");
  if (snapshot.preserveBranches.includes(name)) reasons.push("preserved");
  if (branch.protected) reasons.push("protected");
  if (rulesets.length > 0) reasons.push("ruleset-protected");
  if (openPulls.length > 0) reasons.push("open-pr");
  if (matchingMergedPulls.length === 0) {
    if (mergedPulls.length > 0) reasons.push("changed-oid");
    else if (forkPulls.length > 0) reasons.push("fork");
    else if (unmergedPulls.length > 0) reasons.push("unmerged");
    else reasons.push("no-merged-pr");
  }

  return { reasons: sortedUnique(reasons), matchingMergedPulls, rulesets };
}

export function buildHistoricalEvidence(snapshot, { expectedBranches = EXPECTED_BASELINE_TASK_BRANCHES } = {}) {
  const paginationComplete = Object.values(snapshot.pagination ?? {}).every((entry) => entry?.complete === true);
  if (!paginationComplete) {
    throw new CleanupError("incomplete-pagination", "All branch cleanup evidence must have complete pagination");
  }

  const candidates = [];
  const exclusions = [];
  for (const branch of snapshot.branches) {
    const evaluation = branchReasons(snapshot, branch);
    if (evaluation.reasons.length === 0) {
      const pull = [...evaluation.matchingMergedPulls].sort((left, right) => String(right.merged_at).localeCompare(String(left.merged_at)))[0];
      candidates.push({
        name: branch.name,
        oid: branch.commit.sha,
        mergedPull: pull.number,
        mergedAt: pull.merged_at,
        base: pull.base?.ref,
        rulesets: evaluation.rulesets,
        ancestry: "diagnostic-not-authorizing",
      });
    } else {
      exclusions.push({ name: branch.name, oid: branch.commit?.sha, reasons: evaluation.reasons });
    }
  }
  candidates.sort((left, right) => left.name.localeCompare(right.name));
  exclusions.sort((left, right) => left.name.localeCompare(right.name));

  const expected = [...expectedBranches].sort();
  const actual = candidates.map((candidate) => candidate.name);
  const baselineMatches = expected.length === actual.length && expected.every((name, index) => name === actual[index]);
  const blockedReasons = [];
  if (snapshot.deleteBranchOnMerge !== false) blockedReasons.push("delete-branch-on-merge-not-false");
  if (!baselineMatches) blockedReasons.push("expected-candidate-set-mismatch");

  const protectedObjects = snapshot.branches
    .filter((branch) => RESERVED_BRANCHES.includes(branch.name) || branch.name === snapshot.defaultBranch || snapshot.preserveBranches.includes(branch.name) || branch.protected)
    .map((branch) => ({ name: branch.name, oid: branch.commit.sha }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    schemaVersion: 1,
    kind: "aiwiki.branch-cleanup.historical-dry-run",
    generatedAt: snapshot.generatedAt,
    repository: snapshot.repository,
    repositoryId: snapshot.repositoryId,
    defaultBranch: snapshot.defaultBranch,
    deleteBranchOnMerge: snapshot.deleteBranchOnMerge,
    preserveBranches: snapshot.preserveBranches,
    pagination: snapshot.pagination,
    dryRun: true,
    expectedCandidates: expected,
    baselineMatches,
    blockedReasons,
    candidates,
    exclusions,
    protectedObjects,
    branchInventory: snapshot.branches.map((branch) => ({ name: branch.name, oid: branch.commit.sha })).sort((left, right) => left.name.localeCompare(right.name)),
    tagInventory: snapshot.tags.map((tag) => ({ name: tag.name, oid: tag.commit.sha })).sort((left, right) => left.name.localeCompare(right.name)),
    review: { status: "pending", note: "This dry run is not deletion authorization." },
  };
}
export async function annotateAncestryDiagnostics({ api, evidence }) {
  const repo = parseRepository(evidence.repository);
  const root = `/repos/${repo.owner}/${repo.repo}`;
  for (const candidate of evidence.candidates) {
    if (!candidate.base) {
      candidate.ancestry = { authorizing: false, status: "unavailable", reason: "missing-base-ref" };
      continue;
    }
    try {
      const comparison = await api.request(
        "GET",
        `${root}/compare/${encodeURIComponent(candidate.base)}...${encodeURIComponent(candidate.oid)}`,
      );
      candidate.ancestry = {
        authorizing: false,
        status: comparison.status ?? "unknown",
        aheadBy: comparison.ahead_by,
        behindBy: comparison.behind_by,
      };
    } catch (error) {
      candidate.ancestry = {
        authorizing: false,
        status: "unavailable",
        reason: error.code ?? "diagnostic-error",
      };
    }
  }
  return evidence;
}


function assertExecutableEvidence(evidence) {
  if (evidence?.kind !== "aiwiki.branch-cleanup.historical-dry-run" || evidence.schemaVersion !== 1 || evidence.dryRun !== true) {
    throw new CleanupError("invalid-evidence", "Execution requires historical dry-run evidence schema version 1");
  }
  if (!Array.isArray(evidence.candidates) || !Array.isArray(evidence.expectedCandidates) || !Array.isArray(evidence.blockedReasons)) {
    throw new CleanupError("invalid-evidence", "Evidence candidate and decision arrays are required");
  }
  const expected = [...EXPECTED_BASELINE_TASK_BRANCHES].sort();
  const declaredExpected = [...evidence.expectedCandidates].sort();
  const candidateNames = evidence.candidates.map(({ name }) => name);
  const exactBaseline = declaredExpected.length === expected.length
    && declaredExpected.every((name, index) => name === expected[index])
    && candidateNames.length === expected.length
    && candidateNames.every((name, index) => name === expected[index])
    && new Set(candidateNames).size === expected.length;
  if (!exactBaseline || evidence.baselineMatches !== true) {
    throw new CleanupError("baseline-mismatch", "Evidence does not contain the exact reviewed 18-name baseline");
  }
  if (evidence.deleteBranchOnMerge !== false || evidence.blockedReasons.length > 0) {
    throw new CleanupError("blocked-evidence", "Evidence contains a blocking governance condition");
  }
  if (!Object.values(evidence.pagination ?? {}).every((entry) => entry?.complete === true)) {
    throw new CleanupError("incomplete-pagination", "Execution evidence has incomplete pagination");
  }
  const preserved = new Set(normalizePreserveBranches(evidence.preserveBranches));
  const protectedNames = new Set((evidence.protectedObjects ?? []).map(({ name }) => name));
  const inventory = new Map((evidence.branchInventory ?? []).map(({ name, oid }) => [name, oid]));
  for (const candidate of evidence.candidates) {
    if (!candidate.name.startsWith("task/") || RESERVED_BRANCHES.includes(candidate.name) || candidate.name === evidence.defaultBranch || preserved.has(candidate.name) || protectedNames.has(candidate.name)) {
      throw new CleanupError("invalid-candidate", `Candidate ${candidate.name} violates a hard exclusion`);
    }
    if (!candidate.oid || inventory.get(candidate.name) !== candidate.oid || !Number.isInteger(candidate.mergedPull)) {
      throw new CleanupError("invalid-candidate", `Candidate ${candidate.name} is not bound to inventory and merged-PR evidence`);
    }
  }
}

export function createReview({ evidenceBytes, evidence, reviewedBy, now = Date.now() }) {
  assertFreshEvidence(evidence, now);
  assertExecutableEvidence(evidence);
  if (!reviewedBy?.trim()) throw new CleanupError("missing-reviewer", "A named reviewer is required");
  return {
    schemaVersion: 1,
    kind: "aiwiki.branch-cleanup.review",
    repository: evidence.repository,
    evidenceSha256: sha256(evidenceBytes),
    reviewedAt: iso(now),
    reviewedBy: reviewedBy.trim(),
    approvedCandidates: evidence.candidates.map(({ name, oid }) => ({ name, oid })),
  };
}

function assertFreshEvidence(evidence, now = Date.now()) {
  const generatedAt = Date.parse(evidence.generatedAt);
  if (!Number.isFinite(generatedAt) || generatedAt > now + 30_000 || now - generatedAt > MAX_EVIDENCE_AGE_MS) {
    throw new CleanupError("stale-evidence", "Evidence must be valid and no older than five minutes");
  }
}

export function validateReview({ evidenceBytes, evidence, review, now = Date.now() }) {
  assertFreshEvidence(evidence, now);
  assertExecutableEvidence(evidence);
  const reviewedAt = Date.parse(review.reviewedAt);
  if (!Number.isFinite(reviewedAt) || reviewedAt < Date.parse(evidence.generatedAt) || reviewedAt > now + 30_000 || now - reviewedAt > MAX_EVIDENCE_AGE_MS) {
    throw new CleanupError("stale-review", "Review must follow evidence generation and be no older than five minutes");
  }
  if (review.evidenceSha256 !== sha256(evidenceBytes)) throw new CleanupError("review-hash-mismatch", "Review does not bind the supplied evidence bytes");
  if (!same(review.repository, evidence.repository)) throw new CleanupError("review-repository-mismatch", "Review repository does not match evidence");
  const approved = JSON.stringify(review.approvedCandidates);
  const candidates = JSON.stringify(evidence.candidates.map(({ name, oid }) => ({ name, oid })));
  if (approved !== candidates) throw new CleanupError("review-candidates-mismatch", "Review candidate names/OIDs do not exactly match evidence");
  if (!review.reviewedBy?.trim()) throw new CleanupError("missing-reviewer", "Review has no named reviewer");
  if (evidence.deleteBranchOnMerge !== false) {
    throw new CleanupError("blocked-evidence", "Evidence is not eligible for execution");
  }
}

async function currentRulesets(api, root) {
  return (await loadRulesets(api, root)).items;
}

export async function recheckCandidate({ api, repository, candidate, preserveBranches = [] }) {
  const repo = parseRepository(repository);
  const root = `/repos/${repo.owner}/${repo.repo}`;
  const settings = await api.request("GET", root);
  if (settings.delete_branch_on_merge !== false) throw new CleanupError("settings-drift", "delete_branch_on_merge is no longer false");
  if (RESERVED_BRANCHES.includes(candidate.name) || candidate.name === settings.default_branch || !candidate.name.startsWith("task/")) {
    throw new CleanupError("reserved-ref", `Ref ${candidate.name} is not a deletable task branch`);
  }
  if (normalizePreserveBranches(preserveBranches).includes(candidate.name)) throw new CleanupError("preserved-ref", `Ref ${candidate.name} is preserved`);

  const branch = await api.request("GET", `${root}/branches/${encodeURIComponent(candidate.name)}`, { allow404: true });
  if (!branch) throw new CleanupError("missing-ref", `Ref ${candidate.name} no longer exists`);
  if (branch.commit?.sha !== candidate.oid) throw new CleanupError("oid-drift", `Ref ${candidate.name} changed OID`);
  if (branch.protected) throw new CleanupError("protected-ref", `Ref ${candidate.name} is protected`);

  const rulesets = await currentRulesets(api, root);
  if (matchingRulesets(rulesets, candidate.name, settings.default_branch).length > 0) {
    throw new CleanupError("ruleset-drift", `Ref ${candidate.name} now matches an active ruleset`);
  }

  const head = encodeURIComponent(`${repo.owner}:${candidate.name}`);
  const openPulls = await api.paginate(`${root}/pulls?state=open&head=${head}`);
  if (openPulls.items.some((pull) => pull.head?.ref === candidate.name && same(pullRepositoryFullName(pull), repo.fullName))) {
    throw new CleanupError("open-pr-drift", `Ref ${candidate.name} has an open pull request`);
  }

  const pull = await api.request("GET", `${root}/pulls/${candidate.mergedPull}`);
  if (pull.state !== "closed" || !pull.merged_at || !same(pullRepositoryFullName(pull), repo.fullName) || pull.head?.ref !== candidate.name || pull.head?.sha !== candidate.oid) {
    throw new CleanupError("merged-pr-drift", `Merged PR evidence for ${candidate.name} changed`);
  }
  return { branch, pull, settings, rulesets };
}

async function postCheck({ api, evidence }) {
  const repo = parseRepository(evidence.repository);
  const root = `/repos/${repo.owner}/${repo.repo}`;
  const branches = await api.paginate(`${root}/branches`);
  const tags = await api.paginate(`${root}/tags`);
  const liveBranches = new Map(branches.items.map((branch) => [branch.name, branch.commit.sha]));
  const liveTags = new Map(tags.items.map((tag) => [tag.name, tag.commit.sha]));
  const candidateNames = new Set(evidence.candidates.map((candidate) => candidate.name));
  for (const candidate of evidence.candidates) {
    if (liveBranches.has(candidate.name)) throw new CleanupError("postcheck-delete-missing", `Deleted ref ${candidate.name} is still present`);
  }
  for (const branch of evidence.branchInventory) {
    if (!candidateNames.has(branch.name) && liveBranches.get(branch.name) !== branch.oid) {
      throw new CleanupError("postcheck-branch-drift", `Non-candidate ref ${branch.name} changed or disappeared`);
    }
  }
  for (const tag of evidence.tagInventory) {
    if (liveTags.get(tag.name) !== tag.oid) throw new CleanupError("postcheck-tag-drift", `Tag ${tag.name} changed or disappeared`);
  }
  return { branchesChecked: evidence.branchInventory.length, tagsChecked: evidence.tagInventory.length };
}

export async function executeHistoricalEvidence({ api, evidenceBytes, evidence, review, now = () => Date.now() }) {
  validateReview({ evidenceBytes, evidence, review, now: now() });
  const result = {
    schemaVersion: 1,
    kind: "aiwiki.branch-cleanup.execution",
    repository: evidence.repository,
    startedAt: iso(now()),
    status: "running",
    deleted: [],
    failed: undefined,
  };
  for (const candidate of evidence.candidates) {
    try {
      validateReview({ evidenceBytes, evidence, review, now: now() });
      await recheckCandidate({ api, repository: evidence.repository, candidate, preserveBranches: evidence.preserveBranches });
      const repo = parseRepository(evidence.repository);
      await api.request("DELETE", `/repos/${repo.owner}/${repo.repo}/git/refs/heads/${encodeURIComponent(candidate.name)}`);
      result.deleted.push({ name: candidate.name, oid: candidate.oid, deletedAt: iso(now()) });
    } catch (error) {
      result.status = "failed";
      result.failed = { name: candidate.name, code: error.code ?? "unexpected-error", message: error.message };
      return result;
    }
  }
  try {
    result.postCheck = await postCheck({ api, evidence });
    result.status = "completed";
    result.completedAt = iso(now());
  } catch (error) {
    result.status = "failed";
    result.failed = { name: undefined, code: error.code ?? "unexpected-error", message: error.message };
  }
  return result;
}

function eventSkip(event, preserveBranches, now) {
  const pull = event.pull_request;
  const repo = event.repository;
  if (event.action !== "closed") return "not-closed-event";
  if (pull?.state !== "closed") return "open";
  if (!pull?.merged || !pull.merged_at) return "unmerged";
  if (!same(pullRepositoryFullName(pull), repo?.full_name)) return "fork";
  if (!pull.head?.ref?.startsWith("task/")) return "non-task";
  if (RESERVED_BRANCHES.includes(pull.head.ref) || pull.head.ref === repo.default_branch) return "reserved";
  if (normalizePreserveBranches(preserveBranches).includes(pull.head.ref)) return "preserved";
  const reviewedAt = Date.parse(pull.merged_at);
  if (!pull.merged_by?.login || !Number.isFinite(reviewedAt) || reviewedAt > now + 30_000 || now - reviewedAt > MAX_EVIDENCE_AGE_MS) return "stale-or-missing-merge-review";
  return undefined;
}

export async function handlePullRequestEvent({ api, event, preserveBranches = [], execute = false, now = Date.now() }) {
  const skipped = eventSkip(event, preserveBranches, now);
  const base = {
    schemaVersion: 1,
    kind: "aiwiki.branch-cleanup.event-decision",
    generatedAt: iso(now),
    repository: event.repository?.full_name,
    pullRequest: event.pull_request?.number,
    head: event.pull_request?.head?.ref,
    oid: event.pull_request?.head?.sha,
    dryRun: !execute,
    deleted: false,
  };
  if (skipped) return { ...base, status: "skipped", reason: skipped };

  const candidate = {
    name: event.pull_request.head.ref,
    oid: event.pull_request.head.sha,
    mergedPull: event.pull_request.number,
    mergedAt: event.pull_request.merged_at,
    base: event.pull_request.base?.ref,
  };
  try {
    await recheckCandidate({ api, repository: event.repository.full_name, candidate, preserveBranches });
    if (!execute) return { ...base, status: "eligible", reason: "dry-run-only" };
    const repo = parseRepository(event.repository.full_name);
    await api.request("DELETE", `/repos/${repo.owner}/${repo.repo}/git/refs/heads/${encodeURIComponent(candidate.name)}`);
    const live = await api.request("GET", `/repos/${repo.owner}/${repo.repo}/branches/${encodeURIComponent(candidate.name)}`, { allow404: true });
    if (live) throw new CleanupError("postcheck-delete-missing", `Deleted ref ${candidate.name} is still present`);
    return {
      ...base,
      status: "deleted",
      deleted: true,
      reviewedEvidence: { source: "github-merged-event", reviewedAt: event.pull_request.merged_at, reviewedBy: event.pull_request.merged_by.login },
    };
  } catch (error) {
    return { ...base, status: "failed", reason: error.code ?? "unexpected-error", message: error.message };
  }
}

export async function probeDeleteBranchOnMerge({ api, repository, now = Date.now() }) {
  const repo = parseRepository(repository);
  const settings = await api.request("GET", `/repos/${repo.owner}/${repo.repo}`);
  return {
    schemaVersion: 1,
    kind: "aiwiki.branch-governance.settings-probe",
    generatedAt: iso(now),
    repository: repo.fullName,
    expectedDeleteBranchOnMerge: false,
    actualDeleteBranchOnMerge: settings.delete_branch_on_merge,
    status: settings.delete_branch_on_merge === false ? "ok" : "alert",
    mutationAttempted: false,
  };
}

function humanTable(evidence) {
  const lines = ["BRANCH\tOID\tMERGED PR\tDECISION"];
  for (const candidate of evidence.candidates) lines.push(`${candidate.name}\t${candidate.oid}\t#${candidate.mergedPull}\tDRY RUN`);
  lines.push(`Candidates: ${evidence.candidates.length}; baseline: ${evidence.baselineMatches ? "MATCH" : "MISMATCH"}; mutations: 0`);
  return lines.join("\n");
}

async function emitJson(value, output) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (output) await writeFile(output, body, "utf8");
  else process.stdout.write(body);
}

async function cli(argv) {
  const args = parseArgs(argv);
  const command = args._[0];
  const api = new GitHubApi({ token: process.env.GH_TOKEN });
  const repository = args.repo ?? process.env.GITHUB_REPOSITORY;
  const preserveBranches = normalizePreserveBranches([args.preserve ?? process.env.BRANCH_CLEANUP_PRESERVE ?? ""]);

  if (command === "historical") {
    if (args.execute) {
      if (!args.evidence || !args.review) throw new CleanupError("missing-reviewed-evidence", "--execute requires --evidence and --review");
      const evidenceBytes = await readFile(args.evidence);
      const evidence = JSON.parse(evidenceBytes.toString("utf8"));
      const review = JSON.parse(await readFile(args.review, "utf8"));
      const result = await executeHistoricalEvidence({ api, evidenceBytes, evidence, review });
      await emitJson(result, args.output);
      if (result.status !== "completed") process.exitCode = 1;
      return;
    }
    const snapshot = await collectRepositorySnapshot({ api, repository, preserveBranches });
    const evidence = await annotateAncestryDiagnostics({ api, evidence: buildHistoricalEvidence(snapshot) });
    await emitJson(evidence, args.output);
    process.stderr.write(`${humanTable(evidence)}\n`);
    if (!evidence.baselineMatches || evidence.blockedReasons.length > 0) process.exitCode = 2;
    return;
  }

  if (command === "review") {
    if (!args.evidence || !args.output || !args["reviewed-by"]) throw new CleanupError("invalid-arguments", "review requires --evidence, --output, and --reviewed-by");
    const evidenceBytes = await readFile(args.evidence);
    const evidence = JSON.parse(evidenceBytes.toString("utf8"));
    await emitJson(createReview({ evidenceBytes, evidence, reviewedBy: args["reviewed-by"] }), args.output);
    return;
  }

  if (command === "event") {
    const eventPath = args["event-path"] ?? process.env.GITHUB_EVENT_PATH;
    if (!eventPath) throw new CleanupError("missing-event", "event requires --event-path or GITHUB_EVENT_PATH");
    const eventBytes = await readFile(eventPath);
    if (args.execute) {
      if (!args["reviewed-event"]) throw new CleanupError("missing-reviewed-evidence", "--execute requires --reviewed-event");
      const reviewedEventBytes = await readFile(args["reviewed-event"]);
      if (sha256(reviewedEventBytes) !== sha256(eventBytes)) {
        throw new CleanupError("review-hash-mismatch", "Reviewed event evidence does not match the event being executed");
      }
    }
    const event = JSON.parse(eventBytes.toString("utf8"));
    const decision = await handlePullRequestEvent({ api, event, preserveBranches, execute: args.execute === true });
    await emitJson(decision, args.output);
    if (decision.status === "failed") process.exitCode = 1;
    return;
  }

  if (command === "settings-probe") {
    const result = await probeDeleteBranchOnMerge({ api, repository });
    await emitJson(result, args.output);
    if (result.status !== "ok") process.exitCode = 1;
    return;
  }

  throw new CleanupError("usage", "Usage: github-branch-cleanup.mjs historical|review|event|settings-probe [options]");
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  cli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "failed", code: error.code ?? "unexpected-error", message: error.message })}\n`);
    process.exitCode = 1;
  });
}
