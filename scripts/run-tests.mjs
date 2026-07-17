import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const testsDir = join(process.cwd(), "dist", "tests");
const [flag, requestedScope, ...extra] = process.argv.slice(2);
const scope = flag === undefined ? "all" : flag === "--scope" && extra.length === 0 ? requestedScope : undefined;

if (scope === undefined || !["all", "contracts"].includes(scope)) {
  console.error(`Unknown test scope: ${requestedScope ?? flag ?? ""}`);
  process.exit(2);
}

const testFiles = readdirSync(testsDir, { recursive: true })
  .filter((name) => name.endsWith(".test.js"))
  .filter((name) => scope !== "contracts" || String(name).replace(/\\/g, "/").startsWith("contracts/"))
  .sort()
  .map((name) => join(testsDir, name));

if (testFiles.length === 0) {
  console.error(`No compiled ${scope === "contracts" ? "contract " : ""}test files found in ${testsDir}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
