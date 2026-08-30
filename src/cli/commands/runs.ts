import { promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { flagBool, flagString } from "../../args.js";
import { MAX_PAYLOAD_SIZE } from "../../ingest-limits.js";
import { CliError, writeLine } from "../../output.js";
import { createManifestFromLegacy, planCompact, readCanonicalContentFingerprint, readRunManifest, scanRuns, verifyByteEquality, type CompactPlan, type ManifestV2, type RunRecord } from "../../runs.js";
import { resolveWorkspace } from "../../workspace.js";

import type { CommandContext } from "../command-context.js";

type CompactResult = CompactPlan & {
  dry_run: boolean;
  executed_actions: number;
  warnings: string[];
  derived_state_changed: boolean;
  recommended_next_action: string;
};

export async function handleRunsCommand(context: CommandContext): Promise<number> {
  const { args, streams, subcommand: action } = context;
  if (flagBool(args, "help") || !action) {
    printRunsHelp(streams.stdout);
    return 0;
  }
  const root = await resolveWorkspace(flagString(args, "path"));
  if (action === "inspect") {
    const report = await inspectRuns(root);
    if (flagBool(args, "json")) writeLine(streams.stdout, JSON.stringify(report, null, 2));
    else writeInspectReport(streams.stdout, report);
    return 0;
  }
  if (action === "compact") {
    if (flagBool(args, "yes") && flagBool(args, "dry-run")) throw new CliError("runs compact accepts either --yes or --dry-run, not both.");
    const result = await compactRuns(root, flagBool(args, "yes"));
    if (flagBool(args, "json")) writeLine(streams.stdout, JSON.stringify(result, null, 2));
    else writeCompactResult(streams.stdout, result);
    return 0;
  }
  throw new CliError("runs supports inspect or compact.");
}

export type RunsInspectReport = {
  runs: RunRecord[];
  health_runs: number;
  total_bytes: number;
  largest_file: { path: string; bytes: number } | null;
  oversized_files: Array<{ path: string; bytes: number }>;
  legacy_duplicate_artifacts: number;
  compactable_runs: string[];
  recommended_next_action: string;
  compact_plan: CompactPlan;
};

export async function inspectRuns(root: string): Promise<RunsInspectReport> {
  const records = await scanRuns(root);
  const storage = await inspectRunStorage(records);
  const plan = planCompact(records);
  return {
    runs: records,
    health_runs: records.filter((record) => record.classification === "health").length,
    total_bytes: storage.totalBytes,
    largest_file: storage.largestFile,
    oversized_files: storage.oversizedFiles,
    legacy_duplicate_artifacts: records.reduce((count, record) => count + record.legacyDuplicates.length, 0),
    compactable_runs: plan.compactableRuns,
    recommended_next_action: plan.recommended_next_action,
    compact_plan: plan
  };
}

export async function compactRuns(root: string, execute: boolean): Promise<CompactResult> {
  const records = await scanRuns(root);
  const plan = planCompact(records);
  const warnings: string[] = [];
  let executedActions = 0;
  let safeRecords = 0;

  for (const record of records) {
    if (record.compactAction !== "safe_delete") continue;
    const verified = await verifyDuplicates(record, warnings);
    if (!verified) continue;
    let manifest: ManifestV2;
    try {
      manifest = await createManifestFromLegacy(record);
    } catch (error) {
      warnings.push(`${record.runId}: ${(error as Error).message}`);
      continue;
    }
    if (!await verifyPayloadRetention(record, manifest, warnings)) continue;
    safeRecords += 1;
    if (!execute) continue;

    if (!record.hasManifestJson) {
      const temporaryPath = path.join(record.dirPath, "manifest.json.tmp");
      const manifestPath = path.join(record.dirPath, "manifest.json");
      if (await pathExists(temporaryPath)) {
        let temporaryManifest: ManifestV2;
        try {
          temporaryManifest = await readRunManifest(temporaryPath);
        } catch {
          warnings.push(`${record.runId}: manual_review_required (invalid_manifest_tmp)`);
          continue;
        }
        if (!isDeepStrictEqual(temporaryManifest, manifest)) {
          warnings.push(`${record.runId}: manual_review_required (manifest_tmp_mismatch)`);
          continue;
        }
        await fs.rename(temporaryPath, manifestPath);
      } else {
        await fs.writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
        await readRunManifest(temporaryPath);
        await fs.rename(temporaryPath, manifestPath);
      }
      executedActions += 1;
    }
    for (const duplicate of record.legacyDuplicates) {
      await fs.rm(duplicate.runPath);
      executedActions += 1;
    }
    if (record.hasPayloadJson) {
      await fs.rm(path.join(record.dirPath, "payload.json"));
      executedActions += 1;
    }
  }

  const finalPlan = !execute ? plan : planCompact(await scanRuns(root));
  const changed = safeRecords > 0 && (execute ? executedActions > 0 : true);
  return {
    ...finalPlan,
    dry_run: !execute,
    executed_actions: executedActions,
    warnings,
    derived_state_changed: changed,
    recommended_next_action: changed
      ? "Derived state changed; run aiwiki index status, aiwiki graph status, and aiwiki rebuild --check."
      : finalPlan.recommended_next_action
  };
}

async function verifyDuplicates(record: RunRecord, warnings: string[]): Promise<boolean> {
  for (const duplicate of record.legacyDuplicates) {
    if (!duplicate.canonicalPath) {
      warnings.push(`${record.runId}: manual_review_required (missing_explicit_canonical_reference)`);
      return false;
    }
    if (!await verifyByteEquality(duplicate.runPath, duplicate.canonicalPath)) {
      warnings.push(`${record.runId}: manual_review_required (fingerprint_mismatch)`);
      return false;
    }
  }
  return true;
}

async function verifyPayloadRetention(record: RunRecord, manifest: ManifestV2, warnings: string[]): Promise<boolean> {
  if (!record.hasPayloadJson || manifest.source.content_fingerprint.length === 0) return true;
  const rawDuplicate = record.legacyDuplicates.find((duplicate) => duplicate.artifactType === "raw");
  if (!rawDuplicate?.canonicalPath) {
    warnings.push(`${record.runId}: manual_review_required (missing_verified_canonical_raw)`);
    return false;
  }
  const canonicalFingerprint = await readCanonicalContentFingerprint(rawDuplicate.canonicalPath);
  if (canonicalFingerprint !== manifest.source.content_fingerprint) {
    warnings.push(`${record.runId}: manual_review_required (payload_content_fingerprint_mismatch)`);
    return false;
  }
  return true;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function inspectRunStorage(records: readonly RunRecord[]): Promise<{ totalBytes: number; largestFile: { path: string; bytes: number } | null; oversizedFiles: Array<{ path: string; bytes: number }> }> {
  let totalBytes = 0;
  let largestFile: { path: string; bytes: number } | null = null;
  const oversizedFiles: Array<{ path: string; bytes: number }> = [];
  for (const record of records) {
    const entries = await fs.readdir(record.dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(record.dirPath, entry.name);
      const bytes = (await fs.stat(filePath)).size;
      totalBytes += bytes;
      if (!largestFile || bytes > largestFile.bytes) largestFile = { path: filePath, bytes };
      if (bytes > MAX_PAYLOAD_SIZE) oversizedFiles.push({ path: filePath, bytes });
    }
  }
  return { totalBytes, largestFile, oversizedFiles };
}

function writeInspectReport(stream: NodeJS.WritableStream, report: RunsInspectReport): void {
  writeLine(stream, "AIWiki runs inspect");
  writeLine(stream, `runs: ${report.runs.length}, health: ${report.health_runs}, bytes: ${report.total_bytes}`);
  writeLine(stream, `compactable: ${report.compactable_runs.length}, legacy duplicates: ${report.legacy_duplicate_artifacts}`);
  writeLine(stream, `next: ${report.recommended_next_action}`);
}

function writeCompactResult(stream: NodeJS.WritableStream, result: CompactResult): void {
  writeLine(stream, `AIWiki runs compact (dry_run=${result.dry_run})`);
  writeLine(stream, `actions: ${result.executed_actions}; compactable: ${result.compactableRuns.length}; manual review: ${result.manualReviewRuns.length}`);
  for (const warning of result.warnings) writeLine(stream, `warning: ${warning}`);
  writeLine(stream, `next: ${result.recommended_next_action}`);
}

function printRunsHelp(stream: NodeJS.WritableStream): void {
  writeLine(stream, "AIWiki runs");
  writeLine(stream, "  aiwiki runs inspect --path <workspace> --json");
  writeLine(stream, "  aiwiki runs compact --dry-run --path <workspace> --json");
  writeLine(stream, "  aiwiki runs compact --yes --path <workspace> --json");
}
