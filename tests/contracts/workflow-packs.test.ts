import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

type Workflow = {
  name: string;
  english: string;
  chinese: string;
  reuseKey: "writing" | "research" | "decision" | "review";
  scenario: string;
  query: string;
};

type ContextMatch = { path: string };
type ContextResponse = {
  schema_version: string;
  result_quality: { total_matches: number };
  matches: Record<string, ContextMatch[]>;
};

type CommandResult = Readonly<{ status: number | null; stdout: string; stderr: string }>;

const workflows: readonly Workflow[] = [
  {
    name: "writing",
    english: "WRITING.md",
    chinese: "WRITING.zh-CN.md",
    reuseKey: "writing",
    scenario: "topic-planning.md",
    query: "What topic directions are already captured for public trial content?"
  },
  {
    name: "research",
    english: "RESEARCH.md",
    chinese: "RESEARCH.zh-CN.md",
    reuseKey: "research",
    scenario: "article-research.md",
    query: "What does AIWiki remember about preserving source evidence?"
  },
  {
    name: "decision",
    english: "DECISION.md",
    chinese: "DECISION.zh-CN.md",
    reuseKey: "decision",
    scenario: "project-decision.md",
    query: "Why did the project choose a local Markdown knowledge base first?"
  },
  {
    name: "review",
    english: "REVIEW.md",
    chinese: "REVIEW.zh-CN.md",
    reuseKey: "review",
    scenario: "review-retrospective.md",
    query: "What did the first public trial verify, what gaps remain, and what should be reviewed next?"
  }
];

const coreCommands = ["aiwiki setup", "aiwiki ingest-file", "aiwiki context", "aiwiki query", "aiwiki lint --json"];

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function assertWorkflowSections(text: string, language: "en" | "zh", workflow: Workflow): void {
  const sections = language === "en"
    ? [
        /when\s+to\s+use/i,
        /(ordered\s+workflow|workflow\s+steps)/i,
        /expected\s+outputs/i,
        /failure\s+modes/i,
        /safe\s+fallback/i,
        /AIWiki\s+was\s+actually\s+used/i,
        /boundaries/i
      ]
    : [
        /适用场景/,
        /(有序步骤|工作流步骤)/,
        /预期输出/,
        /失败模式/,
        /安全回退/,
        /确实使用了\s*AIWiki/,
        /边界/
      ];
  for (const section of sections) assert.match(text, section, `${workflow.name} ${language} workflow lacks ${section}`);
  for (const command of coreCommands) assert.ok(text.includes(command), `${workflow.name} ${language} workflow lacks ${command}`);
  assert.match(text, /aiwiki\.context\.v1/);
  assert.match(text, new RegExp(`reuse_guidance\\.${workflow.reuseKey}`));
  assert.match(text, /02-raw\/articles\/<slug>\.md/);
  assert.match(text, /03-sources\/article-cards\/<slug>\.md/);
  assert.match(text, /05-wiki\/source-knowledge\/<slug>\.md/);
  assert.match(text, /09-runs\/<run-id>\/processing-summary\.md/);
  assert.match(text, language === "en" ? /paid-only features/i : /付费专属功能/);
  assert.doesNotMatch(text, /CORE-[0-9]+/);
}

function runCli(args: string[], cwd: string): CommandResult {
  const result = spawnSync(process.execPath, [path.join(process.cwd(), "dist", "src", "cli.js"), ...args], {
    cwd,
    encoding: "utf8"
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function requireSuccess(command: string, result: CommandResult): string {
  assert.equal(result.status, 0, `${command} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result.stdout;
}


test("workflow packs cover the documented workflow contract in both locales", () => {
  for (const workflow of workflows) {
    const english = read(path.join("docs", "workflows", workflow.english));
    const chinese = read(path.join("docs", "workflows", workflow.chinese));
    assertWorkflowSections(english, "en", workflow);
    assertWorkflowSections(chinese, "zh", workflow);
    assert.match(english, new RegExp(`\\(${workflow.chinese.replace(".", "\\.")}\\)`));
    assert.match(chinese, new RegExp(`\\(${workflow.english.replace(".", "\\.")}\\)`));
    assert.match(english, new RegExp(workflow.scenario.replace(".", "\\.")));
    assert.match(chinese, new RegExp(workflow.scenario.replace(".", "\\.")));
  }
});

test("Skill routes explicit workflow reuse requests through the workflow router", () => {
  const skill = read("skill/SKILL.md");
  const router = read("skill/QUERY_PROTOCOL.md");
  assert.match(skill, /writing\s*\/\s*写作.*research\s*\/\s*研究.*decisions?\s*\/\s*决策.*review\s*\/\s*审查.*retrospective\s*\/\s*复盘/is);
  assert.match(skill, /\[Workflow Router\]\(QUERY_PROTOCOL\.md#workflow-router\)/);
  assert.match(router, /start with the shared retrieval path/i);
  assert.match(router, /reuse_guidance\.review/);
  const workflowLinks = [...router.matchAll(/\]\((workflows\/[^)#]+\.md)\)/g)].map((match) => match[1]);
  assert.equal(workflowLinks.length, workflows.length);
  for (const workflow of workflows) {
    const link = `workflows/${workflow.english}`;
    assert.ok(workflowLinks.includes(link), `Skill router lacks ${link}`);
    assert.ok(existsSync(path.join(process.cwd(), "skill", link)), `Skill workflow link does not resolve: ${link}`);
  }
  assert.match(router, /retrospective is not a separate type/i);
});

test("public workflow scenarios complete the documented local CLI loop", () => {
  for (const workflow of workflows) {
    const root = mkdtempSync(path.join(os.tmpdir(), `aiwiki-workflow-${workflow.name}-`));
    const workspace = path.join(root, "workspace");
    const input = path.join(root, workflow.scenario);
    const slug = path.basename(workflow.scenario, ".md");
    try {
      copyFileSync(path.join(process.cwd(), "examples", "public-trial-scenarios", "input", workflow.scenario), input);
      requireSuccess("setup", runCli(["setup", "--path", workspace, "--yes"], root));
      requireSuccess("ingest-file", runCli(["ingest-file", "--file", input, "--path", workspace], root));
      const query = requireSuccess("query", runCli(["query", workflow.query, "--view", "files", "--path", workspace], root));
      const contextOutput = requireSuccess("context", runCli(["context", workflow.query, "--json", "--path", workspace], root));
      const lintOutput = requireSuccess("lint", runCli(["lint", "--json", "--path", workspace], root));

      assert.ok(existsSync(path.join(workspace, "02-raw", "articles", `${slug}.md`)));
      assert.ok(existsSync(path.join(workspace, "03-sources", "article-cards", `${slug}.md`)));
      assert.ok(existsSync(path.join(workspace, "05-wiki", "source-knowledge", `${slug}.md`)));
      const runsDirectory = path.join(workspace, "09-runs");
      assert.ok(readdirSync(runsDirectory).some((run) => existsSync(path.join(runsDirectory, run, "processing-summary.md"))));

      assert.match(query, new RegExp(slug, "i"));
      const context = JSON.parse(contextOutput) as ContextResponse;
      assert.equal(context.schema_version, "aiwiki.context.v1");
      assert.ok(context.result_quality.total_matches > 0);
      assert.ok(
        Object.values(context.matches).flat().some((match) => match.path.endsWith(`${slug}.md`)),
        `${workflow.name} context did not retrieve its scenario artifact`
      );
      assert.doesNotThrow(() => JSON.parse(lintOutput));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
