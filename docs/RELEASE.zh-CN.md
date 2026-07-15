# AIWiki 发布指南

本文定义 AIWiki 维护者的交付与发布门禁。

## 分支与 PR 门禁

- `main` 是对外公开且受保护的分支。禁止直接推送、强制推送和删除分支。
- `dev` 是 Core 集成分支。普通 Core 开发从 `dev` 开始；需要隔离时，使用 `task/<id>-<slug>` 分支。
- 普通 Core 任务只有在分支 CI 与该任务的远端 tarball smoke 测试通过后，才可通过 PR 合并到 `dev`。
- 只有命名的 Core 发布门槛任务可以创建 `dev` -> `main` PR：`CORE-0408`（`0.4.0`）、`CORE-0506`（`0.5.0`）、`CORE-0601`（`0.6.0`）、`CORE-0700`（`0.7.0`）和 `CORE-1000`（`1.0.0`）。
- 控制面任务 `CORE-0000` 是一次性例外：它通过 `dev` -> `main` PR 建立本基线，但不得创建版本、标签或 npm 发布。
- 每个 `main` PR 都必须通过 `.github/workflows/ci.yml` 中唯一命名的 `CI / verify`、解决全部讨论，并获得一位审批者批准。CI 同时运行于源分支和拟合并结果。

## 本地检查

从干净且确认过的工作区开始：

```bash
git status --short --branch
npm test
npm run release:check
```

当包内容、文档、示例或 skill 有变化时，检查：

```bash
npm pack --dry-run
```

npm 包只应包含 CLI 运行文件、用户文档、示例和需要打包的 skill 文件。

对于 0.3.0 Source Capsule 发布，dry-run 还必须确认：

- `dist/src` 包含 capsule 运行模块。
- 公共文档和 `skill/` 协议文件包含 Source Capsule 指引。
- 内部规划文件默认不进入包，除非后续发布决策明确变更。
- `.omx`、`.npm-cache`、临时 smoke 目录和私有规划产物不在包内。

## 版本与标签

`package.json` 是版本来源，`aiwiki --version` 在运行时读取它。

普通 Core 任务不得提升版本。仅在命名发布门槛任务准备 `dev` -> `main` PR 时，更新到计划中的里程碑版本：

```bash
npm version minor --no-git-tag-version
```

发布门槛 PR 合并到 `main` 后，必须从该精确的 `main` 提交创建并推送对应标签：

```bash
git switch main
git pull --ff-only origin main
git tag -a v<version> -m "AIWiki <version>"
git push origin v<version>
```

在 `main` PR 合并前，禁止打标签、发布或对外宣布版本。

## 交付前远端测试

普通任务 PR 之前，以及发布门槛 PR 之前，必须构建精确的本地 tarball，并在远端测试服务器上安装和测试。

标准顺序：

```text
本地验证
  -> 推送 dev 或 task 分支
  -> 分支 CI / verify
  -> npm pack
  -> 在远端测试服务器安装精确 tarball
  -> 运行任务对应的 CLI smoke
  -> 任务 PR -> dev
  -> dev CI / verify
  -> 发布门槛 PR dev -> main
  -> 拟合并结果的 CI / verify 与人工审批
  -> 合并 main
  -> 打标签
  -> 发布 workflow
  -> npm registry 验证
  -> 发布后远端 sanity
```

远端 smoke 失败时，不得创建或合并对应 PR。应在本地修复、重新构建、重新打包并重新执行远端测试。

0.3.0 smoke 应从同一个已打包 tarball 覆盖新增和兼容命令面：

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

- 默认 `context` 保持 `schema_version: "aiwiki.context.v1"`。
- capsule context 返回 `schema_version: "aiwiki.context.capsule.v1"`。
- 默认 `query` 为 capsule 导向视图。
- `query --view files` 必须继续可用。
- capsule lint 模式可运行，但旧知识库缺少 capsule 元数据不应成为默认 lint 噪声。

## 发布

AIWiki 使用 npm Trusted Publishing。工作流默认只执行验证：

```bash
gh workflow run publish.yml --repo iTradingAI/aiwiki --ref dev -f mode=dry-run
gh run watch --repo iTradingAI/aiwiki
```

工作流会拒绝在 `main` 以外使用 `mode=publish`。真正发布前还会校验 `v<package-version>` 指向工作流选择的精确 `main` 提交，因此发布门槛 PR 必须先合并并创建标签：

```bash
gh workflow run publish.yml --repo iTradingAI/aiwiki --ref main -f mode=publish
gh run watch --repo iTradingAI/aiwiki
```

发布成功后验证 registry：

```bash
npm view @itradingai/aiwiki version
npm view @itradingai/aiwiki versions --json
```

Trusted Publishing 失败时，检查 npm Trusted Publisher 配置、仓库名、workflow 文件名和 `id-token: write` 权限。

`id-token: write` 只授予 `Publish @itradingai/aiwiki` job。`Publish / verify` 干跑 job 只有仓库只读权限，无法获得 npm Trusted Publishing 凭据。

## README 图片

README 使用 GitHub raw 图片链接，以便 GitHub 与 npm 渲染图片，同时避免将 `docs/assets/` 打进 npm 包。

若 `npm pack --dry-run` 出现意外资源或私有规划文件，应先修复 `package.json.files` 再发布。
