# AIWiki 功能精简与开发重排方案

日期：2026-06-07
对象：AIWiki 基础版
状态：已同步到每日自动化队列

## 1. 结论

AIWiki 基础版下一步不应该继续横向扩功能，而应该先把公开命令、默认目录、入库产物、lint 修复和 Agent 协作方式收敛稳定。

当前推荐方向：

- 保留基础版作为 Agent-first 本地知识上下文后端。
- 人类可见命令保持少而清晰。
- 面向 Agent 的自动处理通过 `--json`、issues、actions、safe-fix 信号完成。
- 老用户的空目录清理并入 `aiwiki lint`，不新增 `aiwiki cleanup dirs`。
- Pro 功能等待基础版目录、lint、doctor 契约稳定后再继续。

已经同步到队列：

- `AIWIKI-006`：合并执行命令面、目录契约、入库降噪、lint safe-fix、Agent 自动整理。
- `AIWIKI-007`：在 `AIWIKI-006` 之后做样例、文档一致性、全链路回归和发布验证。
- `PRO-008`：阻塞等待 `AIWIKI-006` 完成或用户明确豁免。

## 2. 基础版产品边界

AIWiki 基础版的目标是：

> 把宿主 Agent 已经读取、理解和判断过的资料，稳定落成可追踪、可查询、可复用的本地 Markdown 知识资产。

基础版应该坚持：

- 用户命令仍然是 `aiwiki`。
- 单知识库。
- 不内置网页抓取。
- 不内置 LLM 总结。
- 不做向量数据库。
- 不做 RSS、定时采集、批量 URL 队列。
- 不做多知识库管理。
- 不做重型 review / retain / FSRS。
- 不做企业 RBAC。
- 不因为“看起来像插件”就单独做插件包装。

基础版真正要做好的事情：

- 接收 Agent payload。
- 生成 Markdown 知识资产。
- 维护 source card、wiki entry、run summary、processing summary。
- 查询本地上下文。
- 检查结构、证据边界和安全修复项。
- 同步宿主 Agent skill。

## 3. 当前必须调整的三件事

### 3.1 命令面收敛

主路径保留：

```bash
aiwiki setup
aiwiki agent sync
aiwiki agent check
aiwiki ingest-agent
aiwiki ingest-file
aiwiki context
aiwiki query
aiwiki lint
aiwiki status
aiwiki doctor
```

这些命令覆盖安装、Agent 对接、入库、查询、检查和诊断，边界清楚，不会暗示 AIWiki 具备网页抓取、多知识库、复习系统或 Pro 自动化能力。

从主 help 和快速开始中降级，但保留兼容：

```bash
aiwiki agent install
aiwiki init
aiwiki ingest-url
aiwiki config show
aiwiki prompt agent
aiwiki ingest-agent --payload
aiwiki next
```

处理原则：

- 不立即删除，避免老脚本断裂。
- 从 README、USAGE、skill 主路径移出。
- 放到 legacy / advanced 区域。
- `agent install` 推荐改用 `agent sync`。
- `init` 推荐改用 `setup`。
- `ingest-url` 明确说明不是网页抓取器，只是兼容入口。
- `next` 暂时从主路径降级；如果不能重做成 Agent-readable 加工建议，就并入 `status` 或 `lint`。

明确不要新增：

```bash
aiwiki cleanup dirs
aiwiki review
aiwiki retain
aiwiki kb add
aiwiki kb list
aiwiki kb default
```

原因：

- `cleanup dirs` 应该由 `lint --fix-empty-dirs` 承接。
- `review` / `retain` 会把基础版推向复习和审核系统。
- `kb *` 属于 Pro，不属于基础版。

### 3.2 默认目录契约收敛

用户已经抓取 60 多篇文章后，仍有大量目录为空，说明这些目录不是基础流程必需品。

新工作区默认只创建核心目录：

```text
02-raw/articles
03-sources/article-cards
05-wiki/source-knowledge
09-runs
dashboards
_system
_system/schemas
```

增强目录按需创建：

```text
04-claims/_suggestions
06-assets/_suggestions
07-topics/ready
08-outputs/outlines
_system/templates
_system/logs
```

处理原则：

- `setup` 只创建核心目录。
- `ingest` 只有在 payload 内容或 `request.outputs` 明确需要时，才创建增强目录。
- `doctor` 不把缺少增强目录当成错误。
- `lint` / `context` 对缺少增强目录保持安静。
- 老工作区已有增强目录时保留兼容。

### 3.3 老用户空目录清理

不新增独立命令。

推荐路径：

```bash
aiwiki lint --json
aiwiki lint --fix-empty-dirs --json
aiwiki lint --json
```

安全规则：

- `aiwiki lint` 默认只报告，不删除。
- 只有显式传入 `--fix-empty-dirs` 才允许删除。
- 只删除已知的空增强目录。
- 可删除空的已知增强父目录。
- 永远不删除核心目录。
- 永远不删除未知目录。
- 永远不删除非空目录。
- 永远不删除文件。
- JSON 输出必须列出 `would_remove`、`removed`、`kept_non_empty`、`skipped_core`、`skipped_unknown`。
- JSON 输出必须给 Agent 一个稳定的 `only_safe_fixes` 信号。

Agent 自动整理流程：

1. 运行 `aiwiki lint --json`。
2. 只在 `only_safe_fixes=true` 且用户允许整理时运行 `aiwiki lint --fix-empty-dirs --json`。
3. 再次运行 `aiwiki lint --json` 复查。
4. 向用户报告删除了哪些空目录、保留了哪些非空目录、还有哪些问题需要人工判断。

## 4. 值得做、不值得做、应放到 Pro 的功能

### 4.1 基础版值得做

| 功能 | 判断 | 推荐原因 |
| --- | --- | --- |
| `setup` | 保留并收敛 | 新用户需要唯一初始化入口，替代 `init` 的公开心智。 |
| `agent sync/check` | 保留 | AIWiki 是 Agent-first，skill 对接是闭环的一部分。 |
| `ingest-agent` | 强保留 | 核心写入入口，边界清楚：Agent 理解，AIWiki 落盘。 |
| `ingest-file` | 保留 | 本地文件入库合理，不破坏“不抓网页”的边界。 |
| `context/query` | 保留并继续增强 | 这是 AIWiki 从文件保存升级为上下文调度的核心。 |
| `lint` | 保留并增强 | 信任来自可追踪、可检查，而不是 AI 口吻。 |
| `status/doctor` | 保留 | 安装、远程验证、排障都需要。 |
| `lint --fix-empty-dirs --json` | 值得做 | 解决老用户空目录问题，同时不增加新顶层命令。 |
| 默认目录降噪 | 必须做 | 否则 demo、文档和 Pro dashboard 都会固化旧噪声。 |

### 4.2 基础版不值得继续强化

| 功能 | 当前处理 | 理由 |
| --- | --- | --- |
| `ingest-url` | 兼容保留，主路径降级 | 名称误导用户以为 CLI 会抓网页。 |
| `agent install` | 兼容保留，推荐 `agent sync` | 与 `sync` 重复，安全性和幂等性弱。 |
| `init` | 兼容保留，推荐 `setup` | 普通用户不需要两个初始化入口。 |
| 当前 `next` | 降级或合并 | 如果只是命令导航，独立价值不足。 |
| 默认生成 claims/assets/topics/outlines | 改成按需 | 简单入库时这些文件经常只是噪声。 |
| Dataview dashboard 强化 | 不作为核心 | AIWiki 不是 Obsidian 插件，普通 Markdown 用户也要能用。 |
| review queue 主流程 | 不做主线 | 会把产品推向审核/复习系统，增加使用负担。 |

### 4.3 应放到 Pro

| 功能 | 放到 Pro 的原因 |
| --- | --- |
| 多知识库 `kb add/list/default` | 涉及 registry、默认 KB、跨 KB 查询和迁移策略。 |
| queue / collect / schedule | 涉及自动化运行时、失败恢复、重试和调度。 |
| RSS、批量 URL、定时采集 | 属于采集系统，不是基础版知识落盘。 |
| scoring / routing / validation | 涉及质量门槛、队列状态和高级运营流程。 |
| dashboard bundle | 依赖稳定的 lint/doctor/目录语义，应在 Pro 中做。 |
| doctor bundle | 涉及诊断包、脱敏、运行状态和支持流程。 |
| 向量检索 | 应等待结构化索引、证据门和 lint scale 稳定。 |
| 企业 RBAC / 团队协作 | 明显超出基础版范围。 |
| MCP / 插件分发 | 只有在提供真实 MCP 工具增量时才值得做。 |

## 5. 入库产物调整

默认始终生成核心资产：

- Raw
- Source Card
- Wiki Entry
- Run Summary
- Processing Summary

按需生成增强资产：

- Claims
- Assets
- Topics
- Outlines

触发条件：

- payload 明确提供对应内容。
- `request.outputs` 明确请求对应产物。

验收：

- minimal payload 不再生成空洞增强目录和建议文件。
- enriched payload 仍能生成增强资产。
- processing summary 说明未生成增强资产是正常情况，而不是失败。

## 6. 每日自动化重排

当前基础版队列：

```text
AIWIKI-001..005 done
AIWIKI-006 pending：命令面、目录契约、入库产物和 Agent 自动整理
AIWIKI-007 pending：样例、文档一致性、全链路回归和发布验证
```

当前 Pro 队列：

```text
PRO-001..007 done
PRO-008 blocked：等待 AIWIKI-006 完成或用户明确豁免
```

新的执行顺序：

| 顺序 | 任务 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | `AIWIKI-006` | pending / P0 | 合并执行命令面收敛、目录契约、入库降噪、lint safe-fix、Agent 自动整理。 |
| 2 | `AIWIKI-007` | pending / P1 | 等 `AIWIKI-006` 后再做 demo、sample、showcase、文档一致性和全链路回归。 |
| 3 | `PRO-008` | blocked / P1 | 等基础版 lint/doctor/目录契约稳定后再做 dashboard / doctor bundle。 |
| 4 | `AIWIKI-NEXT-001` | optional / P2 | 只有确认 `next` 还有独立价值时才做，否则并入 `status` 或 `lint`。 |

原本拆出来的 `AIWIKI-SCOPE-001`、`AIWIKI-SCOPE-002`、`AIWIKI-DIRS-001`、`AIWIKI-INGEST-001` 不再作为独立每日队列任务创建，已经合并进 `AIWIKI-006`。

原因：

- 这些改动互相依赖，分开做会让 demo、文档和测试反复返工。
- 命令面、目录契约和入库产物必须一起稳定，才能判断 `lint` safe-fix 如何给 Agent 使用。
- 用户要求不能影响原有正常使用，所以一次合并任务必须同时覆盖兼容命令、老用户空目录、安全修复和回归测试。

每日自动化选择规则：

- 先读 `Plan/aiwiki-automation-tasks.json`。
- 优先执行依赖已满足的 P0 收敛任务。
- demo、showcase、sample vault、dashboard、bundle 类任务必须等待核心 CLI 契约稳定。
- Pro 任务如果声明 `base_contract_dependency`，必须等待对应基础版任务 done 或用户明确豁免。
- 每次更新 JSON 队列时，同步更新人类看板。

## 7. 当前任务对应开发方案

### AIWIKI-006：收敛命令面、目录契约、入库产物和 Agent 自动整理

范围：

- `src/app.ts`
- `src/workspace.ts`
- `src/ingest.ts`
- `src/lint.ts`
- `src/context.ts`
- `tests/cli.test.ts`
- `tests/workspace.test.ts`
- `tests/ingest.test.ts`
- `README.md`
- `docs/USAGE.md`
- `docs/FAQ.md`
- `docs/AGENT_HANDOFF.md`
- `skill/SKILL.md`

验收：

- 主 help 和 quick-start 只展示核心路径。
- legacy / advanced 命令继续可用，但不再占据主路径。
- 新工作区只默认创建核心目录。
- 增强目录按需创建。
- `doctor` 不因缺少增强目录报错。
- `lint --json` 报告空增强目录 safe-fix。
- `lint --fix-empty-dirs --json` 只删除安全范围内的空增强目录。
- Agent handoff 和 skill 明确自动整理流程。
- minimal ingest 不再默认生成空洞增强产物。
- 旧命令和旧非空增强目录不被破坏。

验证：

```bash
npm test
npm run release:check
npm pack --dry-run
```

远程烟测：

```bash
aiwiki setup --path <tmp-vault> --yes
aiwiki doctor --path <tmp-vault>
aiwiki ingest-agent --payload <minimal-fixture> --path <tmp-vault>
aiwiki lint --json --path <tmp-vault>
aiwiki lint --fix-empty-dirs --json --path <tmp-vault>
aiwiki context <topic> --path <tmp-vault>
aiwiki query <topic> --path <tmp-vault>
```

### AIWIKI-007：样例、文档一致性、全链路回归和发布验证

依赖：

- `AIWIKI-006` done。

范围：

- `examples/demo-run`
- `examples/obsidian-vault-sample`
- `docs/AGENT_COMPATIBILITY.md`
- `docs/SHOWCASE.md`
- `docs/README.md`
- `docs/USAGE.md`
- `docs/AGENT_HANDOFF.md`
- `docs/FAQ.md`
- `docs/ROADMAP.md`
- `docs/RELEASE.md`
- `README.md`
- `package.json`
- tests / fixtures

验收：

- demo 和 sample vault 反映新的命令面和目录契约。
- 示例优先展示 Raw、Source Card、Wiki Entry、Run Summary、Processing Summary。
- optional claims/assets/topics/outlines 只在有意义时出现。
- 文档不暗示抓取、Obsidian 依赖、review 工作流或 Pro 自动化。
- README、USAGE、AGENT_HANDOFF、FAQ、SHOWCASE、ROADMAP、RELEASE、skill 对同一命令面和边界保持一致。
- 不新增功能，除非是修复 `AIWIKI-006` 引入的回归。
- 发布检查和远程烟测通过，或因 npm OTP 阻塞时记录为 release follow-up。

### PRO-008：dashboard / doctor bundle

当前状态：

- `blocked`

恢复条件：

- `AIWIKI-006` done 且基础版 lint/doctor/目录契约已验证。
- 或用户明确豁免该依赖。

原因：

- Pro dashboard / doctor bundle 会引用基础版目录、lint、doctor 语义。
- 如果基础版还没完成目录降噪和 safe-fix，Pro 会把旧噪声固化进高级功能。

## 8. 风险控制

### 8.1 老用户脚本依赖 legacy 命令

控制：

- 第一阶段不删除命令。
- 先从文档和主 help 降级。
- 后续如需 deprecate，至少经过一个 minor 版本。

### 8.2 目录减少被理解成工作区损坏

控制：

- `doctor` 只检查核心目录。
- `setup` 说明增强目录按需创建。
- `lint` 和 `context` 把缺少增强目录视为正常。
- 文档说明老工作区保留旧目录是兼容状态，不需要强制清理。

### 8.3 老用户清理误删内容

控制：

- 默认只报告。
- 只有显式 `--fix-empty-dirs` 才删除。
- 只删已知空增强目录。
- 不删核心、未知、非空目录和文件。
- 输出必须有删除清单和保留清单。

### 8.4 默认产物减少被理解成功能倒退

控制：

- processing summary 解释增强资产未生成的原因。
- `request.outputs` 继续允许显式请求。
- enriched payload 继续保留增强产物生成能力。

### 8.5 `next` 价值不足

控制：

- 先降级，不删除。
- 后续只有在能复用 lint/status 生成真正加工建议时才重做。
- 否则并入 `status` 或 `lint`。

## 9. 不进入基础版排期的任务

以下不进入 `Project/aiwiki` 基础版排期：

- KB registry。
- `kb add/list/default`。
- queue run。
- collect / schedule / score / route / validate。
- RSS / 定时采集 / 批量 URL。
- 内置浏览器抓取。
- 内置 LLM 总结。
- 向量数据库。
- FSRS / Anki。
- 企业 RBAC。
- dashboard bundle。
- doctor bundle。
- 没有真实工具增量的插件包装。

如有需要，进入 AIWiki Pro 或独立集成项目。

## 10. 最终建议

AIWiki 基础版应该做小而硬：

- 稳定接收 Agent payload。
- 稳定生成 Markdown 知识资产。
- 稳定查询上下文。
- 稳定检查结构和证据边界。
- 稳定同步宿主 Agent skill。

这次开发不再新增一串独立任务，而是把强相关的命令、目录、入库、lint 和 Agent 自动整理合并到 `AIWIKI-006`。这样能减少返工，也更符合“不影响原有正常使用”的要求。
