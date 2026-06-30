# AIWiki 发布说明

这份文档给维护者使用。

AIWiki 发布必须证明：本地通过、测试服务器通过、GitHub 推送通过、npm 发布后也通过。

## 本地检查

先确认工作区只包含本次发布需要的改动：

```bash
git status --short --branch
npm test
npm run release:check
```

如果包内容、文档、示例或 skill 有变化，检查：

```bash
npm pack --dry-run
```

npm 包只应包含 CLI 运行文件、用户文档、示例和 packaged skill。

对 0.3.0 Source Capsule 发布，dry-run 还必须确认：

- `dist/src` 包含 capsule 运行模块。
- public docs 和 `skill/` 协议文件已经包含 Source Capsule 说明。
- 内部 0.3.0 规划文件默认不打进包，除非后续明确改变发布决策。
- `.omx`、`.npm-cache`、临时 smoke 目录和私有规划产物不在包里。

## 版本

`package.json` 是版本来源。`aiwiki --version` 运行时读取它。

默认 patch bump：

```bash
npm version patch --no-git-tag-version
```

## 发布前远端测试

推 GitHub 或发布 npm 之前，必须把同一个本地 tarball 放到测试服务器安装并跑 smoke。

标准顺序：

```text
本地验证
  -> 版本号
  -> 本地提交
  -> npm pack
  -> 测试服务器安装本地 tarball
  -> 跑任务对应 CLI smoke
  -> GitHub push
  -> GitHub Actions 发布 workflow
  -> npm registry 验证
  -> 发布后远端 sanity
```

如果远端 smoke 失败，不推 GitHub，不发布 npm。先本地修复，重新构建、打包、远端验证。

0.3.0 smoke 必须用同一个 packed tarball 覆盖新增和兼容命令面：

```bash
aiwiki show "<主题>" --path <workspace>
aiwiki show "<主题>" --json --path <workspace>
aiwiki query "<主题>" --path <workspace>
aiwiki query "<主题>" --view files --path <workspace>
aiwiki context "<主题>" --path <workspace>
aiwiki context "<主题>" --view capsule --path <workspace>
aiwiki lint --capsules --path <workspace>
aiwiki lint --lifecycle --path <workspace>
aiwiki lint --okf --path <workspace>
aiwiki status --path <workspace>
```

稳定契约：

- 默认 `context` 仍然是 `schema_version: "aiwiki.context.v1"`。
- capsule context 返回 `schema_version: "aiwiki.context.capsule.v1"`。
- 默认 `query` 是 capsule 视图。
- `query --view files` 仍然可用。
- capsule lint 模式可以运行，但旧知识库缺少 capsule 元数据不应变成默认 lint 噪音。

## 发布

AIWiki 使用 npm Trusted Publishing。发布应通过 GitHub Actions 完成：

```bash
gh workflow run publish.yml --repo iTradingAI/aiwiki
gh run watch --repo iTradingAI/aiwiki
```

查看最近发布任务：

```bash
gh run list --workflow publish.yml --repo iTradingAI/aiwiki --limit 5
```

验证 npm：

```bash
npm view @itradingai/aiwiki version
npm view @itradingai/aiwiki versions --json
```

如果 Trusted Publishing 失败，检查 npm Trusted Publisher、仓库名、workflow 文件名和 `id-token: write` 权限。

## README 图片

README 使用 GitHub raw 图片链接，让 GitHub 和 npm 都能显示图片，同时避免把 `docs/assets/` 打进 npm 包。

如果 `npm pack --dry-run` 出现意外资产或内部规划文件，先修复 `package.json.files`。
