// AIWiki atomic canonical cutover / rollback plan.
//
// This is a MACHINE-READABLE CHECKLIST, not an executor. It NEVER mutates DNS,
// deploy, repository settings, or package metadata on its own. Each mutating
// step names the human authority required and the readiness gate that must
// re-pass afterward. Operators run the steps; this module only emits and
// validates the plan so the sequence is auditable and the guards are explicit.

/**
 * Build the ordered prelaunch / cutover / rollback plan for a stage.
 *
 * @param {object} cfg  site-readiness config
 * @returns {{
 *   guards: string[],
 *   prelaunch: Step[],
 *   cutover: Step[],
 *   rollback: Step[]
 * }}
 */
export function buildCutoverPlan(cfg) {
  const newHost = cfg.newCanonicalHost;
  const oldHost = cfg.oldCanonicalHost;
  const oldPath = cfg.oldCanonicalPath ?? "/aiwiki";
  const oldCanonical = `https://${oldHost}${oldPath}`;
  const newCanonical = `https://${newHost}/`;

  const guards = [
    `Canonical stays on ${oldCanonical} until ALL six readiness categories are green.`,
    "Never mutate DNS, deploy, or repository settings from this tooling; operators with named authority perform mutations.",
    "Prelaunch site MUST be served with noindex and MUST NOT be linked from any active package/npm/About/README metadata.",
    "Cutover is atomic: remove noindex, deploy launch content, switch active metadata, and enable the old-path redirect in one controlled window.",
    "Old path must redirect 301/308 preserving path/query where supported; archived historical URLs remain factual and bannered.",
    "Rollback re-runs the SAME six readiness probes to confirm the old canonical is healthy again."
  ];

  /** @type {Step[]} */
  const prelaunch = [
    {
      id: "P1",
      phase: "prelaunch",
      action: `Deploy prelaunch content on ${newCanonical} with current release, install command, repository, docs/locales, private security route, license, and contact/status.`,
      authority: "deployment-owner",
      mutates: ["deploy:new-site"],
      reversible: true,
      verifyWith: "readiness-gate"
    },
    {
      id: "P2",
      phase: "prelaunch",
      action: "Serve every page with exactly one self-canonical and noindex.",
      authority: "deployment-owner",
      mutates: ["deploy:new-site-headers"],
      reversible: true,
      verifyWith: "canonical-category"
    },
    {
      id: "P3",
      phase: "prelaunch",
      action: `Keep package.json.homepage, GitHub About, and active README/docs metadata on ${oldCanonical}.`,
      authority: "package-owner",
      mutates: [],
      reversible: true,
      verifyWith: "canonical-category"
    },
    {
      id: "P4",
      phase: "prelaunch",
      action: "Run the six-category readiness probe and retain 288 consecutive green probes, named owners, and a tested alert sink.",
      authority: "alert-owner",
      mutates: [],
      reversible: true,
      verifyWith: "readiness-gate"
    }
  ];

  /** @type {Step[]} */
  const cutover = [
    {
      id: "C1",
      phase: "cutover",
      action: "In one controlled window: remove noindex and deploy launch content on the new site.",
      authority: "deployment-owner",
      mutates: ["deploy:new-site", "deploy:new-site-headers"],
      reversible: true,
      verifyWith: "canonical-category"
    },
    {
      id: "C2",
      phase: "cutover",
      action: `Switch package.json.homepage, GitHub About, and active README/docs/site metadata to ${newCanonical}.`,
      authority: "package-owner",
      mutates: ["package.json:homepage", "github-about", "readme-metadata"],
      reversible: true,
      verifyWith: "content-category"
    },
    {
      id: "C3",
      phase: "cutover",
      action: `Configure ${oldCanonical} as 301/308 redirect to ${newCanonical}, preserving path/query where supported.`,
      authority: "deployment-owner",
      mutates: ["deploy:old-path-redirect"],
      reversible: true,
      verifyWith: "http-category"
    },
    {
      id: "C4",
      phase: "cutover",
      action: "Re-run ALL six readiness gates; confirm no active non-archive surface advertises the old URL as canonical.",
      authority: "alert-owner",
      mutates: [],
      reversible: true,
      verifyWith: "readiness-gate"
    }
  ];

  /** @type {Step[]} */
  const rollback = [
    {
      id: "R1",
      phase: "rollback",
      action: "Restore the previous deploy and DNS/canonical records to the old canonical.",
      authority: "rollback-owner",
      mutates: ["deploy:new-site", "dns"],
      reversible: true,
      verifyWith: "dns-category"
    },
    {
      id: "R2",
      phase: "rollback",
      action: "Reverse the old-path redirect and reinstate the old canonical as active.",
      authority: "rollback-owner",
      mutates: ["deploy:old-path-redirect"],
      reversible: true,
      verifyWith: "http-category"
    },
    {
      id: "R3",
      phase: "rollback",
      action: "Restore the new-site noindex so it is not indexed while non-canonical.",
      authority: "deployment-owner",
      mutates: ["deploy:new-site-headers"],
      reversible: true,
      verifyWith: "canonical-category"
    },
    {
      id: "R4",
      phase: "rollback",
      action: `Restore package.json.homepage, GitHub About, and active README/docs metadata to ${oldCanonical}.`,
      authority: "package-owner",
      mutates: ["package.json:homepage", "github-about", "readme-metadata"],
      reversible: true,
      verifyWith: "content-category"
    },
    {
      id: "R5",
      phase: "rollback",
      action: "Re-run the SAME six readiness probes against the old canonical; confirm green before declaring rollback complete.",
      authority: "alert-owner",
      mutates: [],
      reversible: true,
      verifyWith: "readiness-gate"
    },
    {
      id: "R6",
      phase: "rollback",
      action: "If a published package advertised the new canonical, ship a corrective forward patch; never unpublish or retarget a tag.",
      authority: "package-owner",
      mutates: ["npm:forward-patch"],
      reversible: false,
      verifyWith: "release-gate"
    }
  ];

  return { guards, prelaunch, cutover, rollback };
}

/**
 * Validate that every mutating step names a non-empty human authority that
 * exists in the config's owners. Fails closed (throws) if authority is missing.
 *
 * @param {object} plan   output of buildCutoverPlan
 * @param {object} owners { deployment, rollback, alerts, package? }
 * @returns {{ ok: boolean, missing: { stepId: string, authority: string }[] }}
 */
export function validateCutoverAuthority(plan, owners) {
  const resolved = {
    "deployment-owner": owners?.deployment ?? "",
    "rollback-owner": owners?.rollback ?? "",
    "alert-owner": owners?.alerts ?? "",
    "package-owner": owners?.package ?? owners?.deployment ?? ""
  };
  const missing = [];
  const allSteps = [...plan.prelaunch, ...plan.cutover, ...plan.rollback];
  for (const step of allSteps) {
    const named = resolved[step.authority];
    if (!named || String(named).trim().length === 0) {
      missing.push({ stepId: step.id, authority: step.authority });
    }
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Render the plan as a human-readable checklist string (for runbooks / job
 * summaries). Read-only: emits text only.
 * @param {object} plan
 * @returns {string}
 */
export function renderCutoverPlan(plan) {
  const lines = [];
  lines.push("# AIWiki canonical cutover / rollback checklist");
  lines.push("");
  lines.push("## Guards");
  for (const g of plan.guards) lines.push(`- ${g}`);
  for (const phase of ["prelaunch", "cutover", "rollback"]) {
    lines.push("");
    lines.push(`## ${phase}`);
    for (const step of plan[phase]) {
      lines.push(
        `- [${step.id}] ${step.action} (authority: ${step.authority}; mutates: ${
          step.mutates.length ? step.mutates.join(", ") : "none"
        }; verify: ${step.verifyWith})`
      );
    }
  }
  return lines.join("\n");
}
