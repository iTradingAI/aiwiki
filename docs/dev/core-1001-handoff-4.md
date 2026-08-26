# CORE-1001 Task 4 Handoff Checklist
- Task ID: CORE-1001-4
- Completed Files: [tests/contracts/cli-compatibility.test.ts]
- Test Coverage: {"node --test tests/contracts/cli-compatibility.test.ts": ["init --path/--yes/--set-default 成功+EEXIST 失败", "next text/JSON 成功+缺 workspace 失败", "agent install 隔离 CODEX_HOME 既有目标失败+--force 成功", "ingest-url --content-file 成功（URL 仅元数据/不抓取断言）+缺 content/缺 URL 失败"]}
- Pending Integrations: [CORE-1001-5 汇总确认；Linux 远程门禁使用本清单边界]
- Handoff Notes:

| Command | Success boundary | Failure boundary |
|---|---|---|
| `init --path <vault> --yes --set-default` | exits `0`; creates the workspace; prints initialization output; writes the isolated `AIWIKI_HOME/config.json` with `defaultPath` equal to the resolved vault path | with `--path` pointing to an existing regular file, exits nonzero and reports Node's `EEXIST` directory-creation error |
| `ingest-url <unreachable-local-url> --content-file <local.md> --path <vault>` | exits `0`; reports `fetch_status: ok`; its run payload has `source.url` equal to the supplied URL, local `source.content`, `fetcher: "content-file"`, and `fetch_status: "ok"`. The unreachable URL demonstrates that CLI does not fetch it. | without `--content-file`, exits nonzero and reports `不抓取网页` plus `--content-file`; with a content file but no URL, exits nonzero and reports `请提供 URL` |
| `agent install --agent codex --yes --force` | with an isolated `CODEX_HOME` containing an existing `skills/aiwiki/SKILL.md`, exits `0`, reports Codex installed, and replaces the target with the bundled skill | the same existing target without `--force` exits nonzero and reports `目标文件已存在` |
| `next --path <vault>` and `next --json --path <vault>` | exit `0`; the initialized, un-ingested vault reports the first-ingest guidance and JSON keeps schema `aiwiki.next.v1` with `would_write: false` | `next --path <missing-workspace>` exits nonzero and reports `未找到配置文件` |

- Sign-off: @Worker-1001-4 2026-08-26
