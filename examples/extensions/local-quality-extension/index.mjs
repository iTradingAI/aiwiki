export default {
  id: "example.local-quality",
  name: "Local quality extension",
  version: "0.1.0",
  apiVersion: "aiwiki.extension.v1",
  commands: [
    {
      kind: "command",
      id: "example.local-quality.command",
      path: ["example", "quality"],
      summary: "Print local extension status.",
      async run() {
        return {
          exitCode: 0,
          stdout: "Local quality extension is enabled."
        };
      }
    }
  ],
  lintRules: [
    {
      kind: "lint_rule",
      id: "example.local-quality.empty-vault",
      defaultSeverity: "info",
      async evaluate({ artifacts }) {
        return artifacts.length
          ? []
          : [{
              severity: "info",
              category: "local_quality",
              message: "Local quality extension found no artifacts.",
              suggestion: "Add content or disable this example extension."
            }];
      }
    }
  ]
};
