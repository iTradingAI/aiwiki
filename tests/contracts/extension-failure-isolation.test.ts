import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addLocalExtension,
  enableExtension,
  listExtensionStatuses,
  loadEnabledExtensions
} from "../../src/extension/host.js";
import { readExtensionManifest } from "../../src/extension/manifest.js";

const validManifest = {
  schema_version: "aiwiki.extension.v1",
  id: "example.local-quality",
  name: "Local quality extension",
  version: "0.1.0",
  api_version: "aiwiki.extension.v1",
  entry: "index.mjs"
};

function createExtension(manifest: Record<string, unknown> = validManifest): { root: string; parent: string } {
  const parent = mkdtempSync(path.join(os.tmpdir(), "aiwiki-extension-manifest-"));
  const root = path.join(parent, "extension");
  mkdirSync(root);
  writeFileSync(path.join(root, "aiwiki-extension.json"), JSON.stringify(manifest, null, 2), "utf8");
  writeFileSync(path.join(root, "index.mjs"), "export default {};\n", "utf8");
  return { root, parent };
}

test("extension manifest resolves only an in-root ESM entry", async () => {
  const fixture = createExtension();
  try {
    const manifest = await readExtensionManifest(fixture.root);

    assert.equal(manifest.id, "example.local-quality");
    assert.equal(manifest.schemaVersion, "aiwiki.extension.v1");
    assert.equal(manifest.apiVersion, "aiwiki.extension.v1");
    assert.equal(manifest.rootPath, realpathSync(fixture.root));
    assert.equal(manifest.entryPath, realpathSync(path.join(fixture.root, "index.mjs")));
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("extension manifest rejects invalid API, id, and entry traversal before module loading", async () => {
  for (const manifest of [
    { ...validManifest, api_version: "aiwiki.extension.v2" },
    { ...validManifest, id: "Example Local Quality" },
    { ...validManifest, entry: "../outside.mjs" },
    { ...validManifest, entry: path.resolve("outside.mjs") }
  ]) {
    const fixture = createExtension(manifest);
    try {
      await assert.rejects(() => readExtensionManifest(fixture.root), /extension manifest/i);
    } finally {
      rmSync(fixture.parent, { recursive: true, force: true });
    }
  }
});

test("extension manifest rejects a symlinked entry outside the extension root", async () => {
  const fixture = createExtension({ ...validManifest, entry: "linked.mjs" });
  const outside = path.join(fixture.parent, "outside.mjs");
  writeFileSync(outside, "export default {};\n", "utf8");
  try {
    symlinkSync(outside, path.join(fixture.root, "linked.mjs"), "file");
    await assert.rejects(() => readExtensionManifest(fixture.root), /outside.*extension root/i);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("adding a local extension validates its manifest without importing its module", async () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), "aiwiki-extension-workspace-"));
  const fixture = createExtension();
  writeFileSync(path.join(fixture.root, "index.mjs"), 'throw new Error("must not import during add");\n', "utf8");
  try {
    await addLocalExtension(workspace, fixture.root);

    const extensions = await listExtensionStatuses(workspace);
    const local = extensions.find((extension) => extension.id === "example.local-quality");
    assert.deepEqual(
      { source: local?.source, status: local?.status, disabledReason: local?.disabledReason },
      { source: "local", status: "available", disabledReason: undefined }
    );
    assert.equal(existsSync(path.join(workspace, ".aiwiki", "extensions", "state")), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("the bundled extension catalog is visible without creating host state or auto-enabling it", async () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), "aiwiki-extension-workspace-"));
  try {
    const extensions = await listExtensionStatuses(workspace);
    const bundled = extensions.find((extension) => extension.id === "aiwiki.bundled-example");
    assert.deepEqual(
      { source: bundled?.source, status: bundled?.status },
      { source: "bundled", status: "available" }
    );
    assert.equal(existsSync(path.join(workspace, ".aiwiki", "extensions")), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("enabling a local extension loads it and creates only its host-managed state root", async () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), "aiwiki-extension-workspace-"));
  const fixture = createExtension();
  writeFileSync(path.join(fixture.root, "index.mjs"), [
    "export default {",
    '  id: "example.local-quality",',
    '  name: "Local quality extension",',
    '  version: "0.1.0",',
    '  apiVersion: "aiwiki.extension.v1"',
    "};",
    ""
  ].join("\n"), "utf8");
  try {
    await addLocalExtension(workspace, fixture.root);
    await enableExtension(workspace, "example.local-quality");

    assert.equal((await loadEnabledExtensions(workspace)).length, 1);
    assert.equal(existsSync(path.join(workspace, ".aiwiki", "extensions", "state", "example.local-quality")), true);
    assert.equal(existsSync(path.join(workspace, "example.local-quality")), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("a failed extension is persistently disabled while healthy host loading continues", async () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), "aiwiki-extension-workspace-"));
  const fixture = createExtension();
  writeFileSync(path.join(fixture.root, "index.mjs"), 'throw new Error("broken extension");\n', "utf8");
  try {
    await addLocalExtension(workspace, fixture.root);
    await assert.rejects(() => enableExtension(workspace, "example.local-quality"), /broken extension/i);

    const extensions = await listExtensionStatuses(workspace);
    const local = extensions.find((extension) => extension.id === "example.local-quality");
    assert.equal(local?.status, "disabled");
    assert.match(local?.disabledReason ?? "", /broken extension/i);
    assert.deepEqual(await loadEnabledExtensions(workspace), []);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("an extension command cannot claim a Core command root", async () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), "aiwiki-extension-workspace-"));
  const fixture = createExtension();
  writeFileSync(path.join(fixture.root, "index.mjs"), [
    "export default {",
    '  id: "example.local-quality",',
    '  name: "Local quality extension",',
    '  version: "0.1.0",',
    '  apiVersion: "aiwiki.extension.v1",',
    "  commands: [{",
    '    kind: "command",',
    '    id: "example.status",',
    '    path: ["status"],',
    '    summary: "Invalid collision",',
    "    async run() { return { exitCode: 0 }; }",
    "  }]",
    "};",
    ""
  ].join("\n"), "utf8");
  try {
    await addLocalExtension(workspace, fixture.root);
    await assert.rejects(() => enableExtension(workspace, "example.local-quality"), /reserved Core command root/i);
    const local = (await listExtensionStatuses(workspace)).find((extension) => extension.id === "example.local-quality");
    assert.equal(local?.status, "disabled");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});
