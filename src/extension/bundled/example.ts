import { defineExtension } from "../api.js";

export default defineExtension({
  id: "aiwiki.bundled-example",
  name: "AIWiki bundled example",
  version: "0.1.0",
  apiVersion: "aiwiki.extension.v1",
  commands: [
    {
      kind: "command",
      id: "aiwiki.bundled-example.status",
      path: ["example", "bundled"],
      summary: "Print bundled extension status.",
      async run() {
        return {
          exitCode: 0,
          stdout: "AIWiki bundled example is enabled."
        };
      }
    }
  ],
  lintRules: [
    {
      kind: "lint_rule",
      id: "aiwiki.bundled-example.empty-vault",
      defaultSeverity: "info",
      async evaluate({ artifacts }) {
        return artifacts.length
          ? []
          : [{
              severity: "info",
              category: "bundled_example",
              message: "Bundled example found no artifacts.",
              suggestion: "Add content or disable the bundled example extension."
            }];
      }
    }
  ]
});
