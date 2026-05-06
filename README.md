# AIWiki

AIWiki 是一个 Agent-first 的本地知识库工具，用来把 Agent 已经读到的文章、网页正文或本地文本，写入一个单知识库目录，方便后续在 Obsidian 中长期审阅和沉淀。

你把文章链接或正文发给 Qclaw、Codex、Claude Code 等宿主 Agent，并加上 `aiwiki` 关键词；宿主 Agent 负责读取网页或整理正文，AIWiki CLI 负责把结构化结果写成本地文件。

完整使用说明见：[docs/USAGE.md](docs/USAGE.md)。

## 安装

发布后可直接使用：

```bash
npx aiwiki init --path "F:\knowledge_data\aiwiki" --yes
```

全局安装：

```bash
npm install -g aiwiki
aiwiki init --path "F:\knowledge_data\aiwiki" --yes
```

本地开发测试：

```bash
npm install
npm run build
npm link
aiwiki doctor --path "F:\knowledge_data\aiwiki"
```

## 范围

- 单知识库
- 单次处理一条输入
- 宿主 Agent 读取网页或正文
- CLI 只负责本地文件写入
- 生成 Source Card、素材建议、主题候选、草稿大纲、处理摘要

## Agent 边界

AIWiki CLI 不做通用网页抓取。

网页读取、附件读取、消息读取属于宿主 Agent；AIWiki 接收内容，并写入结构化本地文件。

## 命令

当前可用命令：

```bash
aiwiki init --path <path> --yes
aiwiki config show --path <path>
aiwiki doctor --path <path>
aiwiki status --path <path>
aiwiki ingest-agent --payload <file>
aiwiki ingest-agent --stdin
aiwiki ingest-file --file <file>
aiwiki ingest-url <url> --content-file <file>
```

`ingest-url` 只把 URL 元数据和已提供正文绑定起来，不会自己抓网页。

## 当前不包含

- 跨主题自动路由
- 批处理
- 定时或指定采集
- 长流程状态机
- 技术支持流程
- CLI 内置通用网页抓取

## License

License will be finalized before the first public release.
