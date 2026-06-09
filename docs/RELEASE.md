# AIWiki 发布检查

发布前先确认本地工作区只包含本次发布需要的改动：

```bash
git status --short --branch
npm run release:check
```

`release:check` 会执行测试、构建、`npm pack --dry-run`、CLI 版本一致性检查，以及一次临时知识库入库检查。

## 版本号

版本号以 `package.json` 为唯一来源。CLI 的 `aiwiki --version` 会运行时读取 `package.json`，不要在源码里另写一份版本常量。

升级版本：

```bash
npm version patch --no-git-tag-version
```

## npm 发布

发布前必须先让同一个本地 tarball 在测试服务器通过 smoke test。顺序是：本地验证、版本号、提交、本地 `npm pack`、测试服务器安装 tarball 并跑 CLI smoke，然后才能 `git push` 和 `npm publish`。

AIWiki 使用 npm Trusted Publishing。npm 发布应由 GitHub Actions 的 `.github/workflows/publish.yml` 完成，不依赖本机 `npm login`、OTP 或长期 `NPM_TOKEN`。

远程测试和 GitHub push 都通过后，触发发布 workflow：

```bash
gh workflow run publish.yml --repo iTradingAI/aiwiki
gh run watch --repo iTradingAI/aiwiki
```

如需查看最近一次发布任务：

```bash
gh run list --workflow publish.yml --repo iTradingAI/aiwiki --limit 5
```

发布后验证：

```bash
npm view @itradingai/aiwiki version
npm view @itradingai/aiwiki versions --json
```

如果 workflow 提示 Trusted Publishing / OIDC 权限问题，检查 npm 包设置里的 Trusted Publisher 是否指向 `iTradingAI/aiwiki` 和 workflow 文件名 `publish.yml`，并确认 workflow 顶层包含 `permissions: id-token: write`。

## 包体积

npm 包只应包含 CLI 运行和用户文档所需文件。README 中的图片使用 GitHub raw 链接展示，`docs/assets/` 不进入 npm 包。

如果 `npm pack --dry-run` 输出里出现 `docs/assets/`，说明包内容配置回退了，需要先修复 `package.json.files`。
