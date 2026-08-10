import assert from "node:assert/strict";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { EventEmitter, once } from "node:events";
import path from "node:path";
import test from "node:test";
import {
  addLocalExtension,
  disableExtension,
  doctorExtensions,
  enableExtension,
  evaluateExtensionLintFindings,
  inspectExtension,
  listExtensionStatuses,
  removeExtension,
  runEnabledExtensionCommand,
  extensionStateRevisionTestHooks
} from "../src/extension/host.js";
import { parseExtensionManifest } from "../src/extension/manifest.js";
import { satisfiesApiRange } from "../src/extension/permissions.js";
import { tempRoot } from "./helpers.js";

const baseManifest = {
  schema_version: "aiwiki.extension.v1",
  id: "example.plugin",
  name: "Plugin test extension",
  version: "0.1.0",
  api_version: "aiwiki.extension.v1",
  entry: "index.mjs"
};

async function createExtension(name: string, manifest: Record<string, unknown>, entry: string): Promise<string> {
  const root = await tempRoot(name);
  await writeFile(path.join(root, "aiwiki-extension.json"), JSON.stringify(manifest, null, 2), "utf8");
  await writeFile(path.join(root, "index.mjs"), entry, "utf8");
  return root;
}

function extensionModule(id: string, name: string, extra = ""): string {
  return [
    "export default {",
    `  id: ${JSON.stringify(id)},`,
    `  name: ${JSON.stringify(name)},`,
    '  version: "0.1.0",',
    '  apiVersion: "aiwiki.extension.v1"',
    extra ? `  ,${extra}` : "",
    "};",
    ""
  ].join("\n");
}

test("extension manifest accepts legacy and compatible API declarations while rejecting incompatible declarations", () => {
  assert.doesNotThrow(() => parseExtensionManifest(baseManifest));
  assert.equal(satisfiesApiRange("^1.0.0", "1.0.0"), true);
  assert.equal(satisfiesApiRange("^2.0.0", "1.0.0"), false);
  assert.doesNotThrow(() => parseExtensionManifest({ ...baseManifest, aiwiki_api: "^1.0.0" }));
  assert.throws(
    () => parseExtensionManifest({ ...baseManifest, api_version: "aiwiki.extension.v2", aiwiki_api: "^1.0.0" }),
    /conflicts with aiwiki_api/i
  );
});

test("extension manifest validates declared capabilities and permission vocabulary", () => {
  const valid = parseExtensionManifest({
    ...baseManifest,
    capabilities: ["command", "lint_rule"],
    permissions: ["workspace:read", "workspace:write:08-outputs/drafts", "state:read", "state:write"]
  });
  assert.deepEqual(valid.capabilities, ["command", "lint_rule"]);
  assert.deepEqual(valid.permissions, ["workspace:read", "workspace:write:08-outputs/drafts", "state:read", "state:write"]);
  assert.throws(() => parseExtensionManifest({ ...baseManifest, capabilities: ["unknown"] }), /unknown capability kind/i);
  assert.throws(() => parseExtensionManifest({ ...baseManifest, permissions: ["network:read"] }), /unknown permission/i);
  assert.throws(() => parseExtensionManifest({ ...baseManifest, permissions: ["workspace:write:../outside"] }), /workspace:write/i);
});

test("inspect and doctor use local metadata without importing an entry while enable imports it", async () => {
  const workspace = await tempRoot("aiwiki-plugin-static-workspace");
  const extension = await createExtension(
    "aiwiki-plugin-static-extension",
    { ...baseManifest, id: "example.throwing-entry", name: "Throwing entry" },
    'throw new Error("entry imported only by enable");\n'
  );
  try {
    await addLocalExtension(workspace, extension);
    const inspection = await inspectExtension(workspace, "example.throwing-entry");
    assert.equal(inspection.status, "available");
    assert.equal((await doctorExtensions(workspace)).ok, true);
    await assert.rejects(() => enableExtension(workspace, "example.throwing-entry"), /entry imported only by enable/i);
    assert.equal((await inspectExtension(workspace, "example.throwing-entry")).status, "disabled");
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(extension, { recursive: true, force: true });
  }
});

test("local extension lifecycle supports enable disable recovery removal and clear unknown-id errors", async () => {
  const workspace = await tempRoot("aiwiki-plugin-lifecycle-workspace");
  const extension = await createExtension(
    "aiwiki-plugin-lifecycle-extension",
    { ...baseManifest, id: "example.lifecycle", name: "Lifecycle extension" },
    extensionModule("example.lifecycle", "Lifecycle extension")
  );
  const broken = await createExtension(
    "aiwiki-plugin-failed-extension",
    { ...baseManifest, id: "example.failed", name: "Failed extension" },
    'throw new Error("persistent load failure");\n'
  );
  try {
    await addLocalExtension(workspace, extension);
    assert.equal((await enableExtension(workspace, "example.lifecycle")).extension.id, "example.lifecycle");
    assert.equal((await disableExtension(workspace, "example.lifecycle")).status, "disabled");
    assert.equal((await disableExtension(workspace, "example.lifecycle")).disabledReason, "disabled by user");
    assert.equal((await enableExtension(workspace, "example.lifecycle")).extension.id, "example.lifecycle");

    await addLocalExtension(workspace, broken);
    await assert.rejects(() => enableExtension(workspace, "example.failed"), /persistent load failure/i);
    assert.match((await disableExtension(workspace, "example.failed")).disabledReason ?? "", /persistent load failure/i);

    await assert.rejects(() => removeExtension(workspace, "aiwiki.research-workflow"), /cannot remove bundled/i);
    assert.deepEqual(await removeExtension(workspace, "example.lifecycle"), {
      id: "example.lifecycle",
      source: "local",
      removed: true
    });
    assert.equal((await listExtensionStatuses(workspace)).some((status) => status.id === "example.lifecycle"), false);
    await access(path.join(extension, "aiwiki-extension.json"));
    await access(path.join(workspace, ".aiwiki", "extensions", "state", "example.lifecycle"));
    for (const operation of [
      () => disableExtension(workspace, "example.missing"),
      () => inspectExtension(workspace, "example.missing"),
      () => enableExtension(workspace, "example.missing"),
      () => removeExtension(workspace, "example.missing")
    ]) {
      await assert.rejects(operation, /does not have a registered extension with id example\.missing/i);
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(extension, { recursive: true, force: true });
    await rm(broken, { recursive: true, force: true });
  }
});

test("extension lifecycle state cannot survive a serialized enable and removal", async () => {
  const workspace = await tempRoot("aiwiki-plugin-lifecycle-lock-workspace");
  const extension = await createExtension(
    "aiwiki-plugin-lifecycle-lock-extension",
    { ...baseManifest, id: "example.lifecycle-lock", name: "Lifecycle lock extension" },
    [
      "const gate = globalThis.__aiwikiExtensionImportGate;",
      "gate.reached();",
      "await gate.wait;",
      "export default {",
      '  id: "example.lifecycle-lock",',
      '  name: "Lifecycle lock extension",',
      '  version: "0.1.0",',
      '  apiVersion: "aiwiki.extension.v1",',
      '  commands: [{ kind: "command", id: "example.lifecycle-lock.command", path: ["lifecycle", "lock"], summary: "Lifecycle lock", async run() { return { exitCode: 0 }; } }]',
      "};",
      ""
    ].join("\n")
  );
  const importGate = new EventEmitter();
  const importReleased = once(importGate, "release").then(() => undefined);
  const importStarted = once(importGate, "imported");
  (globalThis as Record<string, unknown>).__aiwikiExtensionImportGate = {
    wait: importReleased,
    reached: () => importGate.emit("imported")
  };
  try {
    await addLocalExtension(workspace, extension);
    const enabling = enableExtension(workspace, "example.lifecycle-lock");
    await importStarted;
    await removeExtension(workspace, "example.lifecycle-lock");
    await addLocalExtension(workspace, extension);
    importGate.emit("release");
    await assert.rejects(() => enabling, /extension lifecycle changed while enabling example\.lifecycle-lock/i);

    assert.equal((await listExtensionStatuses(workspace)).find((status) => status.id === "example.lifecycle-lock")?.status, "available");
    assert.equal(await runEnabledExtensionCommand(workspace, ["lifecycle", "lock"]), undefined);
  } finally {
    delete (globalThis as Record<string, unknown>).__aiwikiExtensionImportGate;
    await rm(workspace, { recursive: true, force: true });
    await rm(extension, { recursive: true, force: true });
  }
});

test("a concurrent disable wins over an in-flight enable", async () => {
  const workspace = await tempRoot("aiwiki-plugin-disable-race-workspace");
  const extension = await createExtension(
    "aiwiki-plugin-disable-race-extension",
    { ...baseManifest, id: "example.disable-race", name: "Disable race extension" },
    [
      "const gate = globalThis.__aiwikiExtensionDisableGate;",
      "gate.reached();",
      "await gate.wait;",
      "export default {",
      '  id: "example.disable-race",',
      '  name: "Disable race extension",',
      '  version: "0.1.0",',
      '  apiVersion: "aiwiki.extension.v1"',
      "};",
      ""
    ].join("\n")
  );
  const importGate = new EventEmitter();
  const importReleased = once(importGate, "release").then(() => undefined);
  const importStarted = once(importGate, "imported");
  (globalThis as Record<string, unknown>).__aiwikiExtensionDisableGate = {
    wait: importReleased,
    reached: () => importGate.emit("imported")
  };
  try {
    await addLocalExtension(workspace, extension);
    const enabling = enableExtension(workspace, "example.disable-race");
    await importStarted;
    await disableExtension(workspace, "example.disable-race");
    importGate.emit("release");
    await assert.rejects(() => enabling, /extension lifecycle changed while enabling example\.disable-race/i);
    assert.equal((await listExtensionStatuses(workspace)).find((status) => status.id === "example.disable-race")?.status, "disabled");
  } finally {
    delete (globalThis as Record<string, unknown>).__aiwikiExtensionDisableGate;
    await rm(workspace, { recursive: true, force: true });
    await rm(extension, { recursive: true, force: true });
  }
});

test("a failed sibling cannot re-enable a target disabled while loading", async () => {
  const workspace = await tempRoot("aiwiki-plugin-failed-sibling-target-race");
  const target = await createExtension(
    "aiwiki-plugin-failed-sibling-target",
    { ...baseManifest, id: "example.failed-sibling-target", name: "Failed sibling target" },
    [
      "const gate = globalThis.__aiwikiExtensionFailedSiblingTargetGate;",
      "gate.reached();",
      "await gate.wait;",
      "export default {",
      '  id: "example.failed-sibling-target",',
      '  name: "Failed sibling target",',
      '  version: "0.1.0",',
      '  apiVersion: "aiwiki.extension.v1"',
      "};",
      ""
    ].join("\n")
  );
  const failingSibling = await createExtension(
    "aiwiki-plugin-failed-sibling",
    { ...baseManifest, id: "example.failed-sibling", name: "Failed sibling" },
    'throw new Error("sibling load failure");\n'
  );
  const importGate = new EventEmitter();
  const importReleased = once(importGate, "release").then(() => undefined);
  const importStarted = once(importGate, "imported");
  (globalThis as Record<string, unknown>).__aiwikiExtensionFailedSiblingTargetGate = {
    wait: importReleased,
    reached: () => importGate.emit("imported")
  };
  try {
    await addLocalExtension(workspace, target);
    await addLocalExtension(workspace, failingSibling);
    await extensionStateRevisionTestHooks.update(workspace, (state) => ({
      installed: state.installed,
      enabled: { ...state.enabled, "example.failed-sibling": { enabled: true } },
      result: undefined
    }));
    const enabling = enableExtension(workspace, "example.failed-sibling-target");
    await importStarted;
    await disableExtension(workspace, "example.failed-sibling-target");
    importGate.emit("release");
    await assert.rejects(() => enabling, /extension lifecycle changed while enabling example\.failed-sibling-target/i);
    const statuses = await listExtensionStatuses(workspace);
    assert.equal(statuses.find((status) => status.id === "example.failed-sibling-target")?.status, "disabled");
    assert.equal(statuses.find((status) => status.id === "example.failed-sibling")?.status, "enabled");
  } finally {
    delete (globalThis as Record<string, unknown>).__aiwikiExtensionFailedSiblingTargetGate;
    await rm(workspace, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
    await rm(failingSibling, { recursive: true, force: true });
  }
});

test("failed sibling reconciliation retains the original target lifecycle fence", async () => {
  const workspace = await tempRoot("aiwiki-plugin-failed-sibling-retry-target-race");
  const target = await createExtension(
    "aiwiki-plugin-failed-sibling-retry-target",
    { ...baseManifest, id: "example.failed-sibling-retry-target", name: "Retry target" },
    extensionModule("example.failed-sibling-retry-target", "Retry target")
  );
  const failingSibling = await createExtension(
    "aiwiki-plugin-failed-sibling-retry",
    { ...baseManifest, id: "example.failed-sibling-retry", name: "Retry sibling" },
    [
      "const gate = globalThis.__aiwikiExtensionFailedSiblingRetryGate;",
      'const failure = new Error("sibling load failure");',
      'Object.defineProperty(failure, "message", { get() { gate.scheduleTargetDisable(); return "sibling load failure"; } });',
      "throw failure;",
      ""
    ].join("\n")
  );
  let targetDisabled: Promise<unknown> | undefined;
  let targetDisableScheduled = false;
  (globalThis as Record<string, unknown>).__aiwikiExtensionFailedSiblingRetryGate = {
    scheduleTargetDisable: () => {
      if (targetDisableScheduled) {
        return;
      }
      targetDisableScheduled = true;
      queueMicrotask(() => queueMicrotask(() => {
        targetDisabled = disableExtension(workspace, "example.failed-sibling-retry-target");
      }));
    }
  };
  try {
    await addLocalExtension(workspace, target);
    await addLocalExtension(workspace, failingSibling);
    await extensionStateRevisionTestHooks.update(workspace, (state) => ({
      installed: state.installed,
      enabled: { ...state.enabled, "example.failed-sibling-retry": { enabled: true } },
      result: undefined
    }));
    await assert.rejects(
      () => enableExtension(workspace, "example.failed-sibling-retry-target"),
      /extension lifecycle changed while enabling example\.failed-sibling-retry-target/i
    );
    await targetDisabled;
    assert.equal((await listExtensionStatuses(workspace))
      .find((status) => status.id === "example.failed-sibling-retry-target")?.status, "disabled");
  } finally {
    delete (globalThis as Record<string, unknown>).__aiwikiExtensionFailedSiblingRetryGate;
    await rm(workspace, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
    await rm(failingSibling, { recursive: true, force: true });
  }
});

test("concurrent conflicting enables leave only one extension enabled", async () => {
  const workspace = await tempRoot("aiwiki-plugin-conflict-race-workspace");
  const first = await createExtension(
    "aiwiki-plugin-conflict-race-first",
    { ...baseManifest, id: "example.conflict-race-first", name: "Conflict race first" },
    [
      "const gate = globalThis.__aiwikiExtensionConflictGate;",
      "gate.reached();",
      "await gate.wait;",
      "export default {",
      '  id: "example.conflict-race-first",',
      '  name: "Conflict race first",',
      '  version: "0.1.0",',
      '  apiVersion: "aiwiki.extension.v1",',
      '  commands: [{ kind: "command", id: "example.conflict-race-first.command", path: ["conflict", "race"], summary: "Conflict race", async run() { return { exitCode: 0 }; } }]',
      "};",
      ""
    ].join("\n")
  );
  const second = await createExtension(
    "aiwiki-plugin-conflict-race-second",
    { ...baseManifest, id: "example.conflict-race-second", name: "Conflict race second" },
    [
      "const gate = globalThis.__aiwikiExtensionConflictGate;",
      "gate.reached();",
      "await gate.wait;",
      "export default {",
      '  id: "example.conflict-race-second",',
      '  name: "Conflict race second",',
      '  version: "0.1.0",',
      '  apiVersion: "aiwiki.extension.v1",',
      '  commands: [{ kind: "command", id: "example.conflict-race-second.command", path: ["conflict", "race"], summary: "Conflict race", async run() { return { exitCode: 0 }; } }]',
      "};",
      ""
    ].join("\n")
  );
  const importGate = new EventEmitter();
  const importReleased = once(importGate, "release").then(() => undefined);
  const importsStarted = once(importGate, "both");
  let imported = 0;
  (globalThis as Record<string, unknown>).__aiwikiExtensionConflictGate = {
    wait: importReleased,
    reached: () => {
      imported += 1;
      if (imported === 2) importGate.emit("both");
    }
  };
  try {
    await addLocalExtension(workspace, first);
    await addLocalExtension(workspace, second);
    const enabling = [
      enableExtension(workspace, "example.conflict-race-first"),
      enableExtension(workspace, "example.conflict-race-second")
    ];
    await importsStarted;
    importGate.emit("release");
    const results = await Promise.allSettled(enabling);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const statuses = await listExtensionStatuses(workspace);
    assert.equal(statuses.filter((status) => status.id.startsWith("example.conflict-race") && status.status === "enabled").length, 1);
  } finally {
    delete (globalThis as Record<string, unknown>).__aiwikiExtensionConflictGate;
    await rm(workspace, { recursive: true, force: true });
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test("a failed extension state-root setup does not enable the extension", async () => {
  const workspace = await tempRoot("aiwiki-plugin-state-root-failure-workspace");
  const extension = await createExtension(
    "aiwiki-plugin-state-root-failure-extension",
    { ...baseManifest, id: "example.state-root-failure", name: "State root failure extension" },
    extensionModule("example.state-root-failure", "State root failure extension")
  );
  try {
    await addLocalExtension(workspace, extension);
    await writeFile(path.join(workspace, ".aiwiki", "extensions", "state"), "not a directory", "utf8");
    await assert.rejects(() => enableExtension(workspace, "example.state-root-failure"));
    assert.equal((await listExtensionStatuses(workspace)).find((status) => status.id === "example.state-root-failure")?.status, "available");
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(extension, { recursive: true, force: true });
  }
});

test("a stale enable load failure cannot disable a newer activation", async () => {
  const workspace = await tempRoot("aiwiki-plugin-stale-load-failure");
  const extension = await createExtension(
    "aiwiki-plugin-stale-load-failure-extension",
    { ...baseManifest, id: "example.stale-load-failure", name: "Stale load failure" },
    [
      "const gate = globalThis.__aiwikiExtensionStaleLoadGate;",
      "gate.reached();",
      "await gate.wait;",
      'throw new Error("delayed load failure");',
      ""
    ].join("\n")
  );
  const importGate = new EventEmitter();
  const importReleased = once(importGate, "release").then(() => undefined);
  const importStarted = once(importGate, "imported");
  (globalThis as Record<string, unknown>).__aiwikiExtensionStaleLoadGate = {
    wait: importReleased,
    reached: () => importGate.emit("imported")
  };
  try {
    await addLocalExtension(workspace, extension);
    const enabling = enableExtension(workspace, "example.stale-load-failure");
    await importStarted;
    await extensionStateRevisionTestHooks.update(workspace, (state) => ({
      installed: state.installed,
      enabled: {
        ...state.enabled,
        "example.stale-load-failure": { enabled: true, activationToken: "newer-activation" }
      },
      result: undefined
    }));
    importGate.emit("release");
    await assert.rejects(() => enabling, /delayed load failure/i);
    assert.equal(
      (await listExtensionStatuses(workspace)).find((status) => status.id === "example.stale-load-failure")?.status,
      "enabled"
    );
  } finally {
    delete (globalThis as Record<string, unknown>).__aiwikiExtensionStaleLoadGate;
    await rm(workspace, { recursive: true, force: true });
    await rm(extension, { recursive: true, force: true });
  }
});

test("a stale command-conflict failure cannot disable a newer activation", async () => {
  const workspace = await tempRoot("aiwiki-plugin-stale-command-conflict");
  const conflicting = await createExtension(
    "aiwiki-plugin-stale-command-conflict-existing",
    { ...baseManifest, id: "example.stale-command-existing", name: "Existing command" },
    extensionModule(
      "example.stale-command-existing",
      "Existing command",
      'commands: [{ kind: "command", id: "example.stale-command-existing.run", path: ["stale", "command"], summary: "Existing", async run() { return { exitCode: 0 }; } }]'
    )
  );
  const candidate = await createExtension(
    "aiwiki-plugin-stale-command-conflict-candidate",
    { ...baseManifest, id: "example.stale-command-candidate", name: "Candidate command" },
    [
      "const gate = globalThis.__aiwikiExtensionStaleCommandGate;",
      "gate.reached();",
      "await gate.wait;",
      "export default {",
      '  id: "example.stale-command-candidate",',
      '  name: "Candidate command",',
      '  version: "0.1.0",',
      '  apiVersion: "aiwiki.extension.v1",',
      '  commands: [{ kind: "command", id: "example.stale-command-candidate.run", path: ["stale", "command"], summary: "Candidate", async run() { return { exitCode: 0 }; } }]',
      "};",
      ""
    ].join("\n")
  );
  const importGate = new EventEmitter();
  const importReleased = once(importGate, "release").then(() => undefined);
  const importStarted = once(importGate, "imported");
  (globalThis as Record<string, unknown>).__aiwikiExtensionStaleCommandGate = {
    wait: importReleased,
    reached: () => importGate.emit("imported")
  };
  try {
    await addLocalExtension(workspace, conflicting);
    await addLocalExtension(workspace, candidate);
    await enableExtension(workspace, "example.stale-command-existing");
    const enabling = enableExtension(workspace, "example.stale-command-candidate");
    await importStarted;
    await extensionStateRevisionTestHooks.update(workspace, (state) => ({
      installed: state.installed,
      enabled: {
        ...state.enabled,
        "example.stale-command-candidate": { enabled: true, activationToken: "newer-activation" }
      },
      result: undefined
    }));
    importGate.emit("release");
    await assert.rejects(() => enabling, /command path conflicts/i);
    assert.equal(
      (await listExtensionStatuses(workspace)).find((status) => status.id === "example.stale-command-candidate")?.status,
      "enabled"
    );
  } finally {
    delete (globalThis as Record<string, unknown>).__aiwikiExtensionStaleCommandGate;
    await rm(workspace, { recursive: true, force: true });
    await rm(conflicting, { recursive: true, force: true });
    await rm(candidate, { recursive: true, force: true });
  }
});

test("concurrent revision writers retry EEXIST and publish successive immutable revisions", async () => {
  const workspace = await tempRoot("aiwiki-plugin-concurrent-revisions");
  try {
    await Promise.all([
      extensionStateRevisionTestHooks.update(workspace, (state) => ({
        installed: state.installed,
        enabled: { ...state.enabled, first: { enabled: false } },
        result: undefined
      })),
      extensionStateRevisionTestHooks.update(workspace, (state) => ({
        installed: state.installed,
        enabled: { ...state.enabled, second: { enabled: false } },
        result: undefined
      }))
    ]);
    const latest = await extensionStateRevisionTestHooks.read(workspace);
    assert.equal(latest.revision, 1);
    assert.deepEqual(Object.keys(latest.enabled).sort(), ["first", "second"]);
    await access(path.join(workspace, ".aiwiki", "extensions", "revisions", "0.json"));
    await access(path.join(workspace, ".aiwiki", "extensions", "revisions", "1.json"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("an unlinked revision temp is ignored and a following writer publishes normally", async () => {
  const workspace = await tempRoot("aiwiki-plugin-revision-temp-crash");
  const revisions = path.join(workspace, ".aiwiki", "extensions", "revisions");
  try {
    await mkdir(revisions, { recursive: true });
    await writeFile(path.join(revisions, "0.json.tmp.crash"), "{ invalid", "utf8");
    await extensionStateRevisionTestHooks.update(workspace, (state) => ({
      installed: state.installed,
      enabled: { ...state.enabled, recovered: { enabled: false } },
      result: undefined
    }));
    const latest = await extensionStateRevisionTestHooks.read(workspace);
    assert.equal(latest.revision, 0);
    assert.equal(latest.enabled.recovered?.enabled, false);
    await access(path.join(revisions, "0.json.tmp.crash"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("legacy registry reads are pure and the first mutation bootstraps immutable revisions", async () => {
  const workspace = await tempRoot("aiwiki-plugin-legacy-bootstrap");
  const extension = await createExtension(
    "aiwiki-plugin-legacy-bootstrap-extension",
    { ...baseManifest, id: "example.legacy", name: "Legacy extension" },
    extensionModule("example.legacy", "Legacy extension")
  );
  const extensions = path.join(workspace, ".aiwiki", "extensions");
  const revisions = path.join(extensions, "revisions");
  try {
    await mkdir(extensions, { recursive: true });
    await writeFile(path.join(extensions, "installed.json"), JSON.stringify({
      schema_version: "aiwiki.extension-host.v1",
      extensions: [{
        id: "example.legacy",
        name: "Legacy extension",
        version: "0.1.0",
        rootPath: extension
      }]
    }), "utf8");
    await writeFile(path.join(extensions, "enabled.json"), JSON.stringify({
      schema_version: "aiwiki.extension-host.v1",
      extensions: { "example.legacy": { enabled: true } }
    }), "utf8");
    await chmod(extensions, 0o500);
    assert.equal((await listExtensionStatuses(workspace)).find((status) => status.id === "example.legacy")?.status, "enabled");
    assert.equal((await inspectExtension(workspace, "example.legacy")).status, "enabled");
    assert.equal((await doctorExtensions(workspace)).ok, true);
    await assert.rejects(() => access(revisions), { code: "ENOENT" });

    await chmod(extensions, 0o700);
    assert.equal((await disableExtension(workspace, "example.legacy")).status, "disabled");
    const latest = await extensionStateRevisionTestHooks.read(workspace);
    assert.equal(latest.revision, 1);
    assert.equal(latest.enabled["example.legacy"]?.enabled, false);
    await access(path.join(revisions, "0.json"));
    await access(path.join(revisions, "1.json"));
  } finally {
    await chmod(extensions, 0o700).catch(() => undefined);
    await rm(workspace, { recursive: true, force: true });
    await rm(extension, { recursive: true, force: true });
  }
});

test("a legacy installed-only registry remains listable and first mutation publishes combined revisions", async () => {
  const workspace = await tempRoot("aiwiki-plugin-legacy-installed-only");
  const extension = await createExtension(
    "aiwiki-plugin-legacy-installed-only-extension",
    { ...baseManifest, id: "example.legacy-installed-only", name: "Legacy installed-only extension" },
    extensionModule("example.legacy-installed-only", "Legacy installed-only extension")
  );
  const extensions = path.join(workspace, ".aiwiki", "extensions");
  const revisions = path.join(extensions, "revisions");
  try {
    await mkdir(extensions, { recursive: true });
    await writeFile(path.join(extensions, "installed.json"), JSON.stringify({
      schema_version: "aiwiki.extension-host.v1",
      extensions: [{
        id: "example.legacy-installed-only",
        name: "Legacy installed-only extension",
        version: "0.1.0",
        rootPath: extension
      }]
    }), "utf8");
    assert.equal((await listExtensionStatuses(workspace))
      .find((status) => status.id === "example.legacy-installed-only")?.status, "available");

    await disableExtension(workspace, "example.legacy-installed-only");
    const latest = await extensionStateRevisionTestHooks.read(workspace);
    assert.equal(latest.revision, 1);
    assert.equal(latest.installed[0]?.id, "example.legacy-installed-only");
    assert.equal(latest.enabled["example.legacy-installed-only"]?.enabled, false);
    await access(path.join(revisions, "0.json"));
    await access(path.join(revisions, "1.json"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(extension, { recursive: true, force: true });
  }
});

test("a legacy enabled-only registry remains listable", async () => {
  const workspace = await tempRoot("aiwiki-plugin-legacy-enabled-only");
  const extensions = path.join(workspace, ".aiwiki", "extensions");
  try {
    await mkdir(extensions, { recursive: true });
    await writeFile(path.join(extensions, "enabled.json"), JSON.stringify({
      schema_version: "aiwiki.extension-host.v1",
      extensions: { "aiwiki.research-workflow": { enabled: true } }
    }), "utf8");
    assert.equal((await listExtensionStatuses(workspace))
      .find((status) => status.id === "aiwiki.research-workflow")?.status, "enabled");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("readers select the highest published revision and ignore revision temps", async () => {
  const workspace = await tempRoot("aiwiki-plugin-latest-revision");
  try {
    await extensionStateRevisionTestHooks.update(workspace, (state) => ({
      installed: state.installed,
      enabled: { ...state.enabled, first: { enabled: false } },
      result: undefined
    }));
    await extensionStateRevisionTestHooks.update(workspace, (state) => ({
      installed: state.installed,
      enabled: { ...state.enabled, second: { enabled: true } },
      result: undefined
    }));
    const revisions = path.join(workspace, ".aiwiki", "extensions", "revisions");
    await writeFile(path.join(revisions, "99.json.tmp.crash"), JSON.stringify({ revision: 99 }), "utf8");
    const latest = await extensionStateRevisionTestHooks.read(workspace);
    assert.equal(latest.revision, 1);
    assert.equal(latest.enabled.second?.enabled, true);
    assert.equal(latest.enabled.first?.enabled, false);
    assert.match(await readFile(path.join(revisions, "1.json"), "utf8"), /"revision": 1/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("the bundled Research Workflow Pack runs its command and contributes a lint finding", async () => {
  const workspace = await tempRoot("aiwiki-plugin-research-workflow");
  try {
    await mkdir(path.join(workspace, "05-wiki", "source-knowledge"), { recursive: true });
    await writeFile(path.join(workspace, "05-wiki", "source-knowledge", "research.md"), "# Research fixture\n", "utf8");
    const listed = await listExtensionStatuses(workspace);
    assert.equal(listed.find((status) => status.id === "aiwiki.research-workflow")?.status, "available");
    await enableExtension(workspace, "aiwiki.research-workflow");
    const command = await runEnabledExtensionCommand(workspace, ["research-workflow", "inspect"]);
    assert.equal(command?.exitCode, 0);
    assert.match(command?.stdout ?? "", /Research Workflow Pack/i);
    const findings = await evaluateExtensionLintFindings(workspace);
    assert.equal(findings.some((finding) => finding.extensionId === "aiwiki.research-workflow"
      && finding.finding.category === "research_workflow"), true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("the checked-in local quality extension remains addable enableable and runnable", async () => {
  const workspace = await tempRoot("aiwiki-plugin-local-quality");
  try {
    await addLocalExtension(workspace, path.join(process.cwd(), "examples", "extensions", "local-quality-extension"));
    await enableExtension(workspace, "example.local-quality");
    const command = await runEnabledExtensionCommand(workspace, ["example", "quality"]);
    assert.equal(command?.exitCode, 0);
    assert.match(command?.stdout ?? "", /Local quality extension is enabled/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
