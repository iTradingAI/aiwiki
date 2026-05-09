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

发布前确认 npm 登录账号：

```bash
npm whoami
```

正式发布：

```bash
npm publish --access public
```

如果账号开启了 publish 2FA，普通 token 可能只能 `whoami`，但发布时仍会要求 OTP。此时有两种方式：

```bash
npm publish --access public --otp <OTP>
```

或使用 npm Automation token 写入用户级 `.npmrc`：

```bash
npm config set //registry.npmjs.org/:_authToken "<NPM_AUTOMATION_TOKEN>"
```

发布后验证：

```bash
npm view @itradingai/aiwiki version
npm view @itradingai/aiwiki versions --json
```

## 包体积

npm 包只应包含 CLI 运行和用户文档所需文件。README 中的图片使用 GitHub raw 链接展示，`docs/assets/` 不进入 npm 包。

如果 `npm pack --dry-run` 输出里出现 `docs/assets/`，说明包内容配置回退了，需要先修复 `package.json.files`。
