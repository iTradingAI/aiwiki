import { defineExtension } from "../api.js";

const statusResult = {
  extension: "aiwiki.research-workflow",
  capabilities: ["command", "lint_rule"],
  permissions: ["workspace:read"]
} as const;

export default defineExtension({
  id: "aiwiki.research-workflow",
  name: "AIWiki Research Workflow",
  version: "0.1.0",
  apiVersion: "aiwiki.extension.v1",
  commands: [
    {
      kind: "command",
      id: "aiwiki.research-workflow.inspect",
      path: ["research-workflow", "inspect"],
      summary: "Inspect the bundled Research Workflow Pack.",
      async run() {
        return {
          exitCode: 0,
          stdout: "Research Workflow Pack is available for source-backed research checks.",
          json: statusResult
        };
      }
    },
    {
      kind: "command",
      id: "aiwiki.research-workflow.status",
      path: ["research-workflow", "status"],
      summary: "Show bundled Research Workflow Pack status.",
      async run() {
        return {
          exitCode: 0,
          stdout: "Research Workflow Pack is enabled.",
          json: statusResult
        };
      }
    }
  ],
  lintRules: [
    {
      kind: "lint_rule",
      id: "aiwiki.research-workflow.missing-source-url",
      defaultSeverity: "warning",
      async evaluate({ artifacts }) {
        return artifacts
          .filter((artifact) => !artifact.sourceUrl)
          .map((artifact) => ({
            severity: "warning" as const,
            category: "research_workflow",
            message: "Research artifact is missing source_url.",
            suggestion: "Add source_url before relying on this artifact.",
            ...(artifact.vaultPath ? { vaultPath: artifact.vaultPath } : {})
          }));
      }
    }
  ]
});
