# AIWiki 发布指南

本文定义 AIWiki 维护者的交付与发布门禁。

## 分支与 PR 门禁

- `main` 是对外公开且受保护的分支。禁止直接推送、强制推送和删除分支。
- `dev` 是 Core 集成分支。普通 Core 开发从 `dev` 开始；需要隔离时，使用 `task/<id>-<slug>` 分支。
- 普通 Core 任务只有在分支 CI 与该任务的远端 tarball smoke 测试通过后，才可通过 PR 合并到 `dev`。
- 只有命名的 Core 发布门槛任务可以创建 `dev` -> `main` PR：`CORE-0408`（`0.4.0`）、`CORE-0506`（`0.5.0`）、`CORE-0601`（`0.6.0`）、`CORE-0700`（`0.7.0`）和 `CORE-1000`（`1.0.0`）。
- 控制面任务 `CORE-0000` 是一次性例外：它通过 `dev` -> `main` PR 建立本基线，但不得创建版本、标签或 npm 发布。
- 每个 `main` PR 都必须通过 `.github/workflows/ci.yml` 中唯一命名的 `CI / verify`、解决全部讨论，并留下完成的 Codex 技术审查记录。CI 同时运行于源分支和拟合并结果；仓库维护者只在这些门禁满足后合并。

## 技术审核智能体

在合并 Core PR 前，必须在只读 worktree 中对精确 PR head 运行专用 AIWiki PR 审核智能体。所有阻塞发现解决后，必须使用仓库维护者身份执行 `gh pr review --comment` 记录其结论。其报告必须覆盖 CI、分支保护、发布 OIDC 权限、发布标签以及中英文文档一致性。

本地智能体的结论仅构成技术审核证据；它不得编辑、推送、合并或发布。其 `COMMENT` review 以维护者身份记录，而非 GitHub `APPROVED` review。本仓库刻意采用“PR、CI、已解决会话、技术审查”后由维护者合并的模型，不要求每个发布 PR 使用第二个 GitHub 身份。

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

## Public API 包合同

Core 集成支持 `@itradingai/aiwiki`、`@itradingai/aiwiki/contracts` 和 `@itradingai/aiwiki/extension-api` 三个入口。`AIWIKI_PUBLIC_API_VERSION` 保持 `aiwiki.public.v1`，`AIWIKI_EXTENSION_API_VERSION` 为 `aiwiki.extension.v1`。`@itradingai/aiwiki/src/**` 与 `@itradingai/aiwiki/dist/src/**` 等内部路径不得出现在 export map 中。

当 exports 条目、公开类型或公开 API 版本变化时，任务必须同步更新精确 tarball 消费者合同测试与中英文公开文档。创建 PR 前，精确 tarball smoke 必须证明：

- 已安装包中的根入口、`/contracts` 和 `/extension-api` ESM 导入可用；
- 公开 `.d.ts` 已生成，且外部 TypeScript 消费者可以编译；
- 内部深层导入以 `ERR_PACKAGE_PATH_NOT_EXPORTED` 失败；以及
- CLI bin 和 `createAiwikiCli().run()` 保持要求的命令行为。

普通 Core 任务仍不得提升包版本、创建 tag 或发布 npm 包。CORE-0404 已定义并验证公开 Extension API 路径；它不增加 Extension Host、plugin CLI 或自动 Skill 匹配。

## Schema Compatibility Gate

CORE-0403 保持 `aiwiki.context.v1` 与 `aiwiki.context.capsule.v1` 稳定，将历史工作区 `schema_version: 1` 读取为 `aiwiki.workspace.v1`，并且只提供内部只读迁移预检。任务必须证明旧配置和未知新增 frontmatter 没有被回写，未来主版本会落入人工复核结果。

打包 tarball 必须包含 `docs/schema/`。CORE-0403 没有新增 Schema CLI；CORE-0404 新增仅声明的 Extension API，CORE-0407 负责后续 Skill 匹配行为。

## 合同测试矩阵

使用 `npm run test:contracts` 执行可复用的 Core 合同测试套件。它只运行 `tests/contracts/` 下的已编译测试；`npm test` 仍运行完整仓库测试。矩阵锁定以下稳定边界：

- `public-api.test.ts`：已安装包的公开导入、声明文件和被禁止的深层导入。
- `cli-compatibility.test.ts`：已安装包的 CLI 版本、Core 命令、context schema 版本，以及仅显式的 plugin 管理。
- `extension-api.test.ts`：仅声明的 extension 作者 API 及其包边界。
- `schema-compatibility.test.ts`：历史 schema 可读性、只读迁移预检、未来主版本人工复核和稳定的 context schema。
- `extension-failure-isolation.test.ts`：manifest 边界、显式启用、命令所有权和失败 extension 隔离。

extension 和未来 Pro 集成只能依赖上述已文档化的公开包入口与显式 Core CLI 命令面。该矩阵不新增 Pro 行为、自动 Skill 匹配或 extension 自动发现。真实的可重建性合同需要后续的可重建状态模型，已延期至 `CORE-0501`；在此之前不得声称已有该覆盖。

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
  -> 拟合并结果的 CI / verify 与已完成技术审查
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
