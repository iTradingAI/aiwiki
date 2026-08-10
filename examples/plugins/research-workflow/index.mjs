const statusResult = {
  extension: "example.research-workflow",
  capabilities: ["command", "lint_rule"],
  permissions: ["workspace:read"]
};

export default {
  id: "example.research-workflow",
  name: "AIWiki Research Workflow example",
  version: "1.0.0",
  apiVersion: "aiwiki.extension.v1",
  commands: [
    {
      kind: "command",
      id: "example.research-workflow.inspect",
      path: ["research-workflow", "inspect"],
      summary: "Inspect the Research Workflow Pack example.",
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
      id: "example.research-workflow.status",
      path: ["research-workflow", "status"],
      summary: "Show Research Workflow Pack example status.",
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
      id: "example.research-workflow.missing-source-url",
      defaultSeverity: "warning",
      async evaluate({ artifacts }) {
        return artifacts
          .filter((artifact) => !artifact.sourceUrl)
          .map((artifact) => ({
            severity: "warning",
            category: "research_workflow",
            message: "Research artifact is missing source_url.",
            suggestion: "Add source_url before relying on this artifact.",
            ...(artifact.vaultPath ? { vaultPath: artifact.vaultPath } : {})
          }));
      }
    }
  ]
};
