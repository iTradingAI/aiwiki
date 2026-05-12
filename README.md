![AIWiki 宣传图](https://raw.githubusercontent.com/iTradingAI/aiwiki/refs/heads/main/docs/assets/aiwiki-hero.png)

# AIWiki

AIWiki 是一个开源的 Agent-first AI 知识库 CLI。你把文章链接、网页正文或本地文本交给宿主 Agent，宿主 Agent 负责读取内容，AIWiki 负责把结果稳定写进本地知识库，并生成适合 Obsidian 审阅的资料卡、主题、大纲和处理记录。

对外只有一个 AIWiki，公开页面不做软件分层。商业服务放在部署、陪跑和团队集成里，不放在软件版本层。

## 它解决什么

- 收藏了很多链接，但最后都散在聊天记录里
- 想用 AI 总结内容，却很难继续写作或复用
- 想做选题、资料卡和大纲，但每次都得重新整理
- 想让 Agent 帮忙收资料，但缺一个稳定的本地入库出口

## 它会生成什么

- 原文记录
- Source Card 资料卡
- Claim 建议
- 创意素材
- 选题候选
- 草稿大纲
- 处理摘要
- Obsidian 审阅入口

## 30 秒上手

```bash
npx @itradingai/aiwiki@latest setup
aiwiki agent list
aiwiki agent install
aiwiki prompt agent
```

然后把 `入库 <url>` 发给宿主 Agent。

## 直接发给 AI 帮你安装

如果你希望让 Codex、Claude Code、QClaw、OpenClaw 等 AI 直接帮你完成安装和配置，可以把下面这段话原样发给它，记得改成你自己的知识库路径：

```text
请帮我安装并配置 AIWiki。
安装命令：npm install -g @itradingai/aiwiki@latest
我的知识库路径：F:\knowledges

要求：
1. 先检查本机 Node.js 是否满足 >=20。
2. 如果还没安装 AIWiki，就安装最新版 `@itradingai/aiwiki`。
3. 执行 `aiwiki setup --path "我的知识库路径" --yes`，帮我完成知识库初始化。
4. 执行 `aiwiki agent list` 检查当前环境支持哪些宿主 Agent。
5. 优先为当前 AI/Agent 安装 AIWiki 对接；如果能自动安装，就执行 `aiwiki agent install` 或对应的 `--agent` 命令。
6. 如果当前 Agent 不支持自动安装，就执行 `aiwiki prompt agent`，然后把生成的对接协议整理好，告诉我应该粘贴到哪里。
7. 完成后，再执行 `aiwiki doctor` 和 `aiwiki status`，确认安装和配置是否正常。
8. 最后告诉我：
   - 实际执行了哪些命令
   - 知识库路径是什么
   - Agent 对接是否完成
   - 如果还差手动步骤，明确告诉我下一步怎么做
```

## 让宿主 Agent 学会 AIWiki

初始化知识库后，先扫一遍本机支持的宿主 Agent：

```bash
aiwiki agent list
```

再启动安装向导：

```bash
aiwiki agent install
```

也可以直接指定目标：

```bash
aiwiki agent install --agent codex --yes
aiwiki agent install --agent qclaw --yes
aiwiki agent install --agent openclaw --yes
aiwiki agent install --agent claude --yes
```

如果当前宿主 Agent 暂不支持自动安装，可以输出通用对接协议：

```bash
aiwiki prompt agent
```

把输出内容安装成宿主 Agent 的 skill，或者粘贴到宿主 Agent 的项目说明里。

## 日常入库

完成 setup 和 Agent 安装后，对宿主 Agent 发送：

```text
入库 https://mp.weixin.qq.com/s/5i9UJdBOhCB2a1EVp0lVXQ
```

宿主 Agent 读取网页后，通过 `aiwiki ingest-agent --stdin` 把结构化内容交给 AIWiki CLI。用户不需要手动保存 payload，也不需要每次输入 `--path`。

典型流程：

```text
用户发送链接 -> 宿主 Agent 读取内容 -> Agent 调用 AIWiki -> AIWiki 写入本地知识库 -> Obsidian 审阅和沉淀
```

## 设计边界

AIWiki 不是通用网页抓取器。网页读取主要交给宿主 Agent，AIWiki 专注于把 Agent 已经读到的内容写成稳定、可追踪、可复用的本地知识资产。

AIWiki 生成的 Markdown 和 frontmatter 默认面向 Obsidian + Dataview 审阅；如果你不装 Dataview，普通 Markdown、Properties、Backlinks、Search 和 Graph View 也能用。

当前范围：

- 只写入当前配置的知识库
- 单次处理一条输入
- 宿主 Agent 读取网页、附件或正文
- CLI 写入本地文件和 Obsidian 友好的结构
- 生成资料卡、素材建议、主题候选、草稿大纲、处理摘要

当前不包含：

- CLI 内置通用网页抓取
- 跨主题自动路由
- 批处理
- 定时或指定采集
- 长流程状态机
- 技术支持流程

## 示例展示

想先看一次完整跑完会生成什么，可以看：

- [docs/SHOWCASE.md](docs/SHOWCASE.md)

## 文档

- [docs/USAGE.md](docs/USAGE.md)
- [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md)
- [docs/OBSIDIAN_DATAVIEW_PLAN.md](docs/OBSIDIAN_DATAVIEW_PLAN.md)
- [docs/FAQ.md](docs/FAQ.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [docs/RELEASE.md](docs/RELEASE.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [docs/architecture.svg](docs/architecture.svg)

## 参与与反馈

如果你想提 bug、提需求，或者反馈宿主 Agent 对接问题，直接看：

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [.github/ISSUE_TEMPLATE/bug_report.md](.github/ISSUE_TEMPLATE/bug_report.md)
- [.github/ISSUE_TEMPLATE/feature_request.md](.github/ISSUE_TEMPLATE/feature_request.md)
- [.github/ISSUE_TEMPLATE/agent_integration.md](.github/ISSUE_TEMPLATE/agent_integration.md)

## 联系与交流

项目专题介绍：[maxking.cc](https://maxking.cc/aiwiki)

<table>
  <tr>
    <td align="center" width="50%">
      <img src="https://raw.githubusercontent.com/iTradingAI/aiwiki/refs/heads/main/docs/assets/join-group.png" alt="扫码进群交流" width="360">
      <br>
      <strong>扫码进群</strong>
    </td>
    <td align="center" width="50%">
      <img src="https://raw.githubusercontent.com/iTradingAI/aiwiki/refs/heads/main/docs/assets/wechat-official-account.png" alt="扫码关注公众号" width="360">
      <br>
      <strong>关注公众号</strong>
    </td>
  </tr>
</table>

## 本地开发

```bash
npm install
npm run build
npm link
aiwiki setup --path "F:\knowledge_data\aiwiki-test" --yes
aiwiki prompt agent
aiwiki doctor
```

## 最新动态

- `2026-05-12`：公开前口径收口，统一 README、npm 元数据和公开文档入口。
- `2026-05-09`：完成 npm 公开发布准备，补齐发布前的 README 与交付信息，并让 CLI 版本号与 `package.json` / 发布包保持一致，便于安装、排查与版本确认。
- `2026-05-08`：完成中文化体验收口，包括默认生成中文 prompt、中文状态输出、中文目标描述，以及 README 和使用文档的中文本地化。
- `2026-05-08`：强化 Obsidian 工作流，把 Review Queue、Claims Review 等审阅队列提升为一等入口，方便在知识库里持续审阅和回看入库内容。
- `2026-05-07`：新增 Codex skill 安装能力，并补上 Agent 协议安装引导，让宿主 Agent 在正式入库前更容易完成对接。
- `2026-05-07`：持续打磨初始化体验，修复 setup 提示问题，避免静默套用默认值，并把首次使用流程改成交互式引导。

## License

MIT. See [LICENSE](LICENSE).
