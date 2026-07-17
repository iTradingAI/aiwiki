# AIWiki 中文文档

## Core Intent Matrix

自然语言请求先匹配到 AIWiki 命令，再解释输出；只有命令无法回答时才允许 fallback。完整合同见 [Agent 接入说明](AGENT_HANDOFF.zh-CN.md#core-intent-matrix)。

AIWiki 是给 AI 助手使用的本地 Markdown 知识库。

主 README 面向 GitHub / npm 的英文入口；中文用户可以从这里进入完整说明。

## 从这里开始

- [中文 README](../README.zh-CN.md)
- [English README](../README.md)
- [使用指南](USAGE.zh-CN.md)
- [常见问题](FAQ.zh-CN.md)
- [Agent 接入说明](AGENT_HANDOFF.zh-CN.md)
- [案例展示](SHOWCASE.zh-CN.md)
- [运营反馈闭环](OPERATING_FEEDBACK_LOOP.zh-CN.md)
- [路线图](ROADMAP.zh-CN.md)
- [发布说明](RELEASE.zh-CN.md)

## 示例

- [`../examples/demo-run/`](../examples/demo-run/)：记录输入、命令和 CLI 输出。
- [`../examples/obsidian-vault-sample/`](../examples/obsidian-vault-sample/)：已经生成好的样例知识库。

## 核心流程

```text
AI 助手读取资料
  -> AIWiki 写入本地 Markdown 知识文件
  -> AIWiki 把同一来源组织成 Source Capsule
  -> 助手用 aiwiki context 取回上下文
  -> aiwiki lint 检查结构和一致性
```

在 0.3.0 中，`aiwiki query` 默认显示 Source Capsule。Agent 集成可以继续使用稳定的 `aiwiki.context.v1`，需要 capsule JSON 时显式调用 `aiwiki context "<主题>" --view capsule`。

## Schema Compatibility

[Schema Compatibility 目录](schema/README.zh-CN.md)记录 v1 数据合同、`schema_version: 1` 的工作区兼容别名，以及未来主版本只能人工复核的规则。CORE-0403 不改变 Skill 匹配；CORE-0407 负责后续匹配合同。

## 公开集成 API

Core 集成只能使用以下 ESM 包入口：

```ts
import { AIWIKI_PUBLIC_API_VERSION, createAiwikiCli, type AiwikiArtifact } from "@itradingai/aiwiki";
import type { ContextResult } from "@itradingai/aiwiki/contracts";

const cli = createAiwikiCli();
console.log(AIWIKI_PUBLIC_API_VERSION); // aiwiki.public.v1
void cli;
void (undefined as AiwikiArtifact | ContextResult | undefined);
```

`@itradingai/aiwiki` 导出稳定的 Core Facade；`@itradingai/aiwiki/contracts` 导出用于兼容性检查的版本标记和公开类型。禁止导入 `@itradingai/aiwiki/src/**`、`@itradingai/aiwiki/dist/src/**` 或其他未列出的深层路径；这些路径属于内部实现，package export map 会刻意拒绝它们。

## 重要边界

AIWiki 不抓网页、不调用 LLM、不自动安装 Obsidian 插件、不做向量检索、不管理多个知识库。宿主 AI 助手负责读取和理解资料；AIWiki 负责写入、链接、查询和检查本地 Markdown 知识库。

公开试用反馈先按 [运营反馈闭环](OPERATING_FEEDBACK_LOOP.zh-CN.md) 分类，再判断是否进入开发队列，避免把群反馈直接变成功能蔓延。
