# 阶段 16：Expert Package——把 Agent 能力封装成可创建、可验证、可分发的专家

> 前置知识：阶段 3、5～9、12～14
> 里程碑：能设计一个版本化专家包，并安全绑定到现有 Agent Runtime

## 为什么在 Runtime 之后学习专家包

Expert Package 不是新的 Agent Kernel，也不是更大的系统提示词。它是位于 Runtime 之上的可编辑、可安装、可版本化定义：

~~~
Expert Package
├── 身份和适用场景
├── 人格与沟通方式
├── 操作规程
├── 方法论与参考材料
├── Skill 依赖
├── Tool / Connector 能力声明
├── Memory Policy
├── Automation Template
└── Evaluation Suite
          ↓ 编译与校验
Resolved Expert Definition
          ↓ 绑定
现有 AgentKernel / PolicyEngine / MemoryStore / Scheduler
~~~

课程前面先建立 Runtime，是为了避免以下错误：

- 用 AGENTS.md 代替状态机；
- 用 TOOLS.md 授予真实权限；
- 用 MEMORY.md 代替多用户 Memory Store；
- 用 HEARTBEAT.md 代替 Scheduler；
- 用人格 Prompt 代替学习者模型；
- 用专家名称掩盖缺少评测和失败恢复。

## 与 QClaw / OpenClaw 的关系

OpenClaw 使用 Workspace Bootstrap 文件组织 Agent 的身份、操作规程、工具约定、用户信息、记忆和心跳。QClaw 在此基础上增加专家创建、保护、审核、分发和运营。

本教程吸收三点：

1. 专家是面向用户的一等产品，Skill 和 Connector 是内部组件；
2. 身份、方法论和执行能力分层保存；
3. 专家需要完整的创建、验证、发布、反馈和升级生命周期。

本教程不照搬三点：

1. 用户记忆不进入可发布专家包；
2. Markdown 不能成为权限和调度的事实来源；
3. 安全、状态和副作用仍由 Runtime 实施。

参考：

- [QClaw 专家开放生态白皮书](https://qclaw.qq.com/open-platform/docs#ch-05)
- [OpenClaw Agent Runtime](https://docs.openclaw.ai/agent)
- [OpenClaw Skills](https://docs.openclaw.ai/skills)
- [OpenClaw Agent Workspace](https://docs.openclaw.ai/agent-workspace)
- [OpenClaw Heartbeat](https://docs.openclaw.ai/gateway/heartbeat)

## 本阶段目录

| 章节 | 核心问题 | 交付 |
|---|---|---|
| [01 专家产品模型](01-expert-product-model.md) | Expert、Agent、Skill 有什么不同 | 四层对象模型 |
| [02 专家包规范](02-package-spec.md) | 一个专家包应包含什么 | Manifest 与目录规范 |
| [03 身份、人格与操作规程](03-identity-persona-operations.md) | IDENTITY、SOUL、AGENTS 如何分工 | 上下文加载策略 |
| [04 方法论、Skills 与能力](04-references-skills-capabilities.md) | 判断力和执行力怎样组合 | 依赖解析流程 |
| [05 用户状态与记忆边界](05-state-memory-boundaries.md) | 什么能发布，什么必须隔离 | Expert/Runtime 数据边界 |
| [06 自动化模板](06-automation-templates.md) | 主动专家如何安全调度 | Automation → Trigger 编译 |
| [07 安全与信任](07-security-trust.md) | 第三方专家如何安装和运行 | Trust Envelope |
| [08 评测、版本和发布](08-evaluation-version-publishing.md) | 如何持续运营而不破坏用户任务 | 发布流水线 |
| [09 学习导师实例](09-learning-coach-walkthrough.md) | 完整学习专家如何落地 | 可检查示例包 |

示例目录位于 [example/learning-coach](example/learning-coach/expert.yaml)。

## 核心设计原则

### 专家定义不可变

已经发布的 expertId + version 对应一份不可变定义。更新产生新版本，不覆盖旧版本。正在执行的 Run 继续绑定启动时的版本。

### 用户状态外置

专家包只包含 Schema、策略和默认值。用户的 Thread、Memory、LearnerProfile、KnowledgeState、审批和 Artifact 进入 Runtime Store。

### 声明不等于授权

requiredTools 表示专家需要什么能力；最终可见和可执行工具由 Tool Registry、用户连接状态和 Policy Engine 共同决定。

### 配置需要编译

Runtime 不应在每一轮临时解释整个专家目录。安装或更新时先完成 Schema、依赖、安全和预算校验，生成 ResolvedExpertDefinition。

### 每个专家自带评测

专家包需要声明触发、轨迹、输出和安全评测。只有“介绍文案 + Prompt”不能构成可发布专家。

## 学习完成标准

- 能区分 ExpertDefinition、ExpertInstallation 和 UserRuntimeState；
- 能解释每个文件的职责和安全边界；
- 能把 Automation Template 编译为 Scheduler Trigger；
- 能验证 Skill、Tool 和 Connector 依赖；
- 能说明升级中的 Thread 与 Run 如何固定版本；
- 能为学习专家编写至少一个正常和一个安全评测。
