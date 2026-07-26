// AIWiki one-release collapse state machine.
//
// Models the plan's Option-B-with-collapse decision: a green six-category
// readiness record at or before scope freeze may fold the canonical cutover
// into the trust release (one combined release). Folding expands scope and
// therefore invalidates every prior technical review and requires fresh CI,
// exact-artifact smoke, six-category site gates, and a fresh technical review
// before merge authorization.
//
// Hard rules (fail-closed):
//   - Once the first package is published, the path cannot be relabeled as a
//     single combined release. Forecasts/partial readiness never collapse.
//   - Red, unknown, stale, or late readiness never collapses.
//   - Missing recordedAt (unknown evidence) never collapses.

/** @typedef {{ id: string, kind: string, reviewedAt: number }} Review */

/**
 * @param {object} input
 * @param {{ ready: boolean, recordedAt?: number, summary?: string, failing?: {category:string,status:string}[] }} input.readinessRecord
 * @param {number} input.scopeFreezeAt       epoch ms; readiness at/before this may collapse
 * @param {number} [input.firstPublishedAt]   epoch ms if a package was already published
 * @param {Review[]} [input.priorReviews]     technical reviews recorded before this decision
 * @param {number} input.now                  epoch ms of the decision
 * @returns {{
 *   collapse: boolean,
 *   reason: string,
 *   invalidatedReviews?: Review[],
 *   requiredFreshWork?: string[],
 *   mergeAuthorized: boolean,
 *   requiresFreshTechnicalReview: boolean
 * }}
 */
export function decideCollapse(input) {
  const { readinessRecord, scopeFreezeAt, now } = input;
  const firstPublishedAt = input.firstPublishedAt ?? null;
  const priorReviews = Array.isArray(input.priorReviews) ? input.priorReviews : [];

  // 1) Already published: cannot retroactively relabel as one release.
  if (firstPublishedAt !== null && Number.isFinite(firstPublishedAt)) {
    return {
      collapse: false,
      reason: "first package already published; path cannot be relabeled to one release",
      mergeAuthorized: false,
      requiresFreshTechnicalReview: false
    };
  }

  // 2) Readiness must be fully green.
  if (!readinessRecord || readinessRecord.ready !== true) {
    const failing = (readinessRecord?.failing ?? []).map((f) => `${f.category}=${f.status}`).join(", ");
    return {
      collapse: false,
      reason: `readiness not green${failing ? ` (${failing})` : ""}; proceed with old-canonical trust patch`,
      mergeAuthorized: false,
      requiresFreshTechnicalReview: false
    };
  }

  // 3) Readiness timestamp must be known.
  if (!Number.isFinite(readinessRecord.recordedAt)) {
    return {
      collapse: false,
      reason: "readiness recordedAt unknown; cannot prove timing relative to scope freeze",
      mergeAuthorized: false,
      requiresFreshTechnicalReview: false
    };
  }

  // 4) Timing: readiness at or before scope freeze may collapse.
  if (readinessRecord.recordedAt > scopeFreezeAt) {
    return {
      collapse: false,
      reason: `readiness recorded after scope freeze (${readinessRecord.recordedAt} > ${scopeFreezeAt}); two-release path`,
      mergeAuthorized: false,
      requiresFreshTechnicalReview: false
    };
  }

  // 5) Collapse is authorized. Folding expands scope: invalidate every prior
  //    review and require fresh CI + smoke + site gates + technical review
  //    before merge authorization.
  const invalidatedReviews = priorReviews.slice();
  const requiredFreshWork = [
    "fresh-ci",
    "exact-artifact-smoke",
    "six-category-site-gates",
    "fresh-technical-review"
  ];
  return {
    collapse: true,
    reason: `green readiness at/before scope freeze; fold cutover into one combined release`,
    invalidatedReviews,
    requiredFreshWork,
    mergeAuthorized: false,
    requiresFreshTechnicalReview: true
  };
}

/**
 * Decide whether merge is authorized given a collapse decision and any reviews
 * recorded AFTER the fold. Merge authorization requires that every item in
 * requiredFreshWork has a matching fresh review whose reviewedAt is at/after
 * the fold timestamp and at/after the readiness record.
 *
 * @param {object} collapseResult  output of decideCollapse
 * @param {object} args
 * @param {Review[]} [args.freshReviews]  reviews recorded after the fold
 * @param {number} args.foldedAt          epoch ms when the collapse decision was taken
 * @param {number} [args.readinessRecordedAt] epoch ms the green readiness was recorded
 * @returns {{ mergeAuthorized: boolean, missing: string[], stale: Review[] }}
 */
export function authorizeMerge(collapseResult, args) {
  if (!collapseResult?.collapse) {
    return { mergeAuthorized: false, missing: collapseResult?.requiredFreshWork ?? [], stale: [] };
  }
  const required = collapseResult.requiredFreshWork ?? [];
  const foldedAt = args.foldedAt;
  const readinessAt = args.readinessRecordedAt ?? null;
  const freshReviews = Array.isArray(args.freshReviews) ? args.freshReviews : [];
  const stale = [];
  const satisfied = new Set();
  for (const review of freshReviews) {
    const afterFold = Number.isFinite(review.reviewedAt) && review.reviewedAt >= foldedAt;
    const afterReadiness =
      readinessAt === null ||
      (Number.isFinite(review.reviewedAt) && review.reviewedAt >= readinessAt);
    if (!afterFold || !afterReadiness) {
      stale.push(review);
      continue;
    }
    if (required.includes(review.kind)) satisfied.add(review.kind);
  }
  const missing = required.filter((k) => !satisfied.has(k));
  return { mergeAuthorized: missing.length === 0 && stale.length === 0, missing, stale };
}
