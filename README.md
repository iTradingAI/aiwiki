# AIWiki

AIWiki 是一个 Agent-first 的本地知识库工具。用户把文章链接或正文发给 Qclaw、Codex、Claude Code 等宿主 Agent，并加上 `aiwiki` 关键词；宿主 Agent 负责读取网页，AIWiki CLI 负责写入本地知识库文件，后续可在 Obsidian 中审阅和沉淀。

完整使用说明见：[docs/USAGE.md](docs/USAGE.md)。

## 最短使用路径

一次性设置默认知识库：

```bash
npx aiwiki setup --path "F:\knowledge_data\aiwiki" --yes
```

之后对 Agent 说：

```text
aiwiki 处理这篇文章：https://example.com/article
```

Agent 读取网页后，通过 `aiwiki ingest-agent --stdin` 把内容交给 CLI。用户不需要手动保存 payload，也不需要每次输入 `--path`。

## 本地开发测试

```bash
npm install
npm run build
npm link
aiwiki setup --path "F:\knowledge_data\aiwiki-test" --yes
aiwiki doctor
```

## 当前范围

- 单知识库
- 单次处理一条输入
- 宿主 Agent 读取网页或正文
- CLI 只负责本地文件写入
- 生成 Source Card、素材建议、主题候选、草稿大纲、处理摘要

## Agent 边界

AIWiki CLI 不做通用网页抓取。网页读取、附件读取、消息读取属于宿主 Agent；AIWiki 接收内容，并写入结构化本地文件。

## 常用命令

```bash
aiwiki setup --path <path> --yes
aiwiki doctor
aiwiki status
aiwiki ingest-agent --stdin
aiwiki ingest-file --file <file>
```

高级/调试命令：

```bash
aiwiki init --path <path> --yes --set-default
aiwiki config show
aiwiki ingest-agent --payload <file>
aiwiki ingest-url <url> --content-file <file>
```

## 当前不包含

- 跨主题自动路由
- 批处理
- 定时或指定采集
- 长流程状态机
- 技术支持流程
- CLI 内置通用网页抓取

## License

License will be finalized before the first public release.
