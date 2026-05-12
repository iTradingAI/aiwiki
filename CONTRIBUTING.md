# Contributing to AIWiki

谢谢你愿意帮 AIWiki 变好。

这个仓库比较在意三件事：

- 文档说人话
- 命令可复现
- 不破坏已有 CLI 行为

## 先准备什么

本地开发前，先确认：

- Node.js `>=20`
- `npm install`
- `npm run build`
- `npm test`

## 提 issue 前最好给什么

如果你来报 bug，最好把这些信息一起带上：

- 操作系统
- Node.js 版本
- AIWiki 版本
- 宿主 Agent
- 复现步骤
- 实际输出
- 期望输出

如果能贴 `aiwiki doctor` 和 `aiwiki status` 的输出就更好了。

## 提 PR 时注意什么

- 尽量小步改
- 不要顺手改一堆无关内容
- 不要破坏已有 CLI 输出
- 新功能尽量补最小测试

## 本地验证

```bash
npm run build
npm test
aiwiki doctor
aiwiki status
```

如果你改的是文档，就至少确认链接、命令和文件名都还对。
