# AIWiki 路线图

AIWiki 基础版只有一个公开产品定位：给 AI 助手使用的本地 Markdown 知识库。

路线图会保持基础 CLI 聚焦。高级自动化、爬取、多知识库、向量检索和团队控制，不应混入基础版承诺，除非后续单独规划。

## 当前重点

### 1. 首次使用成功

- 更清楚的 AI 助手安装提示词
- 更安全的 `agent sync` 和知识库根指导
- 更清楚的 `agent check` 诊断
- 从 setup 到第一次入库、第一次查询的完整路径

### 2. 本地知识复用

- Source Capsule 作为默认低噪音的人类查询视图
- `aiwiki context --view capsule` 作为 Agent 对象级复用入口
- 更清楚的 Wiki Entry 质量信号
- 更好解释 query/context 的结果
- 更多写作、研究、决策、回顾场景案例
- 更明确区分外部资料和用户个人输出

### 3. 知识库健康

- 给人和 AI 助手都能读懂的 lint 输出
- 显式开启的 capsule、lifecycle 和 OKF-ready lint 检查
- 只在窄范围、可逆时提供自动安全修复
- 更好的 status 和 doctor 引导
- 新知识库减少空洞可选产物

### 4. 公开试用资产

- 5-10 分钟能完成的小任务
- 与当前 CLI 行为一致的样例知识库
- 微信群反馈模板
- 区分用户痛点和功能蔓延的队列规则
- 通过 [运营反馈闭环](OPERATING_FEEDBACK_LOOP.zh-CN.md) 做每周反馈分类和月度路线图复盘

## 不进入基础版队列

基础版 AIWiki 当前不规划：

- 网页爬虫
- 微信公众号读取
- 浏览器插件
- 向量检索
- RAG-over-wiki
- OKF 导入导出
- 多知识库
- RBAC
- RSS 或定时采集
- 默认人工审核流程
- 自动安装 Dataview 或 Obsidian 插件

这些能力可以进入服务层、集成项目或 Pro 相邻项目，但不应模糊基础版 README 的承诺。

## 运营原则

AIWiki 应该在关键地方保持稳定朴素：

```text
助手负责阅读
AIWiki 负责写入
Source Capsule 组织每个来源
Markdown 保持本地
上下文以后还能复用
```

产品进步的重点，是让第一次入库、第一次查询和第一次维护更可靠。

## 反馈治理

公开反馈先分类，再进入开发判断。基础版队列使用 keep、defer、Pro、reject 和 no-change，避免把每条群反馈都直接变成新功能。

反馈少时，AIWiki 应该发布更清楚的试用任务和案例，而不是增加遥测或扩大基础版边界。
