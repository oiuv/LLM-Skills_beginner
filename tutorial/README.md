# 从零开发完整 Agent

这是一条面向零基础开发者的 Agent 工程课程主线。课程不从某个框架或协议开始，而是从最小模型调用出发，逐步构建具备理解、规划、记忆、执行、调度和治理能力的指导学习 Agent。

旧的 PART1～PART7 继续保留，作为 MCP、Skills、Agent 模式和生产部署的专题资料；本目录是新的推荐学习入口。

## 学完能做什么

完成课程后，你将能够实现一个指导学习 Agent，它可以：

- 接收文本、语音、图片和屏幕上下文，并归一化为统一输入；
- 根据用户目标、学习状态和环境上下文理解意图；
- 将开放目标拆成计划、任务和可验证步骤；
- 使用 Tool Calling 调用本地工具或外部服务；
- 通过 MCP 发现和调用标准化能力；
- 加载 Skill，按照稳定工作流完成复杂任务；
- 管理会话短期记忆、用户长期记忆和学习者模型；
- 保存 Thread、Task、Run 和 Checkpoint，在多端恢复任务；
- 响应定时器、Webhook 和业务事件，持续执行后台任务；
- 在必要时组织多个专业 Agent 协作；
- 生成学习计划、笔记、测验和报告等可交付物；
- 对工具权限、危险操作、成本、质量和学习效果进行治理。

## 正确的 Agent 心智模型

Agent 不是“更长的系统提示词”，也不是“会调用函数的聊天机器人”。完整 Agent 是一个由模型参与决策、由运行时维持状态、通过工具改变外部世界的软件系统。

~~~
输入与感知
   ↓
上下文与意图理解
   ↓
Agent Kernel：目标、规划、策略、循环
   ↓
Skill：怎样完成一类任务
   ↓
Tool Call：提出结构化动作
   ↓
MCP / Connector / Local Tool：连接实际能力
   ↓
执行结果、记忆更新和可交付物

控制面：Thread / Task / Scheduler / Checkpoint / Permission
治理面：Tracing / Evaluation / Safety / Cost
~~~

| 概念 | 解决的问题 | 是否等于 Agent |
|---|---|---|
| Model | 生成、理解和推理 | 否，是决策组件 |
| Tool Calling | 模型如何提出结构化动作 | 否，是动作桥梁 |
| Tool | 一个原子能力如何执行 | 否，是能力单元 |
| MCP | 如何标准化发现、连接和调用能力 | 否，是协议层 |
| Connector | 如何连接具体账号、应用和数据 | 否，是集成层 |
| Skill | 某类任务应该怎样完成 | 否，是流程知识 |
| Memory | 系统如何跨步骤和跨会话保留状态 | 否，是状态层 |
| Scheduler | 系统何时启动或恢复任务 | 否，是控制面 |
| Agent | 将以上组件组合成面向目标的闭环 | 是 |

## 课程路线

课程按依赖关系组织。不要一开始就学习多智能体，也不要在理解 Tool Calling 之前直接套用 Agent 框架。

| 阶段 | 目录 | 核心问题 | 里程碑 |
|---|---|---|---|
| 0 | [课程总览](00-course-overview/README.md) | Agent 到底是什么 | 能画出完整系统图 |
| 1 | [LLM 应用基础](01-llm-foundations/README.md) | 应用如何可靠使用模型 | 完成结构化模型调用 |
| 2 | [Tool Calling](02-tool-calling/README.md) | 模型如何使用外部能力 | 跑通工具调用循环 |
| 3 | [Agent Kernel](03-agent-kernel/README.md) | 怎样从调用变成自主循环 | 实现最小 Agent Kernel |
| 4 | [规划与工作流](04-planning-workflow/README.md) | 怎样完成多步目标 | 支持计划、重规划和停止条件 |
| 5 | [Tools、MCP 与 Connectors](05-tools-mcp-connectors/README.md) | 怎样扩展和连接能力 | 接入本地 Tool 与 MCP Server |
| 6 | [Skills](06-skills/README.md) | 怎样复用稳定任务流程 | 实现 Skill 发现和运行 |
| 7 | [Memory 与 Thread](07-memory-thread/README.md) | 怎样记住并续接任务 | 持久化 Thread 与学习状态 |
| 8 | [执行运行时](08-execution-runtime/README.md) | 怎样安全可靠地执行动作 | 支持审批、重试、取消和交付物 |
| 9 | [调度与持久任务](09-scheduling/README.md) | 怎样让任务持续运行 | 支持定时、事件和断点恢复 |
| 10 | [多模态输入](10-multimodal/README.md) | 怎样理解语音、图片和屏幕 | 构建统一 Observation |
| 11 | [多智能体](11-multi-agent/README.md) | 何时需要多个 Agent | 完成一次可控委派 |
| 12 | [指导学习 Agent](12-learning-agent/README.md) | 怎样从通用 Agent 变成学习导师 | 建立学习者模型与教学闭环 |
| 13 | [安全与评测](13-safety-evaluation/README.md) | 怎样证明系统安全有效 | 建立评测集、Trace 和权限策略 |
| 14 | [生产化](14-production/README.md) | 怎样部署和运营 Agent | 完成生产架构设计 |
| 15 | [毕业项目](15-capstone/README.md) | 怎样组合所有能力 | 交付完整学习 Agent |

## 五个递进里程碑

### M1：能调用工具的单 Agent

范围：阶段 0～3。输入文本，模型选择计算器或知识点查询 Tool，运行时执行后把结果交还模型。

验收：

- 模型不直接执行代码；
- Tool 参数经过 Schema 校验；
- Agent Loop 有最大步数和明确停止条件；
- 每一步都记录为事件。

### M2：能稳定完成多步任务的 Agent

范围：阶段 4～8。加入计划、Skills、MCP、记忆、审批和可交付物，完成“诊断薄弱知识点并生成练习报告”等任务。

验收：

- 计划可以修改，而不是生成后盲目执行；
- Tool、MCP 和 Skill 边界清晰；
- Thread 可以关闭后重新载入；
- 危险或高成本工具经过策略判断；
- 最终结果以 Artifact 保存。

### M3：能持续工作的 Agent Runtime

范围：阶段 9。引入 Scheduler、Event、Task Queue 和 Checkpoint，实现定时复习与事件驱动任务。

验收：

- 调度器不依赖 LLM Tool Call 才能唤醒任务；
- Job 可以重试、取消和恢复；
- 相同事件不会重复产生副作用；
- 长任务能够报告进度。

### M4：多模态、跨端的学习 Agent

范围：阶段 10、12。加入语音、图片和屏幕输入，以及学习者模型、知识状态和间隔复习。

验收：

- 所有输入归一化为统一 Observation；
- 输入来源、权限和时间信息不会丢失；
- 教学策略根据学习状态变化；
- 换设备后可以续接同一个 Thread。

### M5：可评估、可运营的生产系统

范围：阶段 11、13～15。按收益选择性加入多智能体，并补齐评测、追踪、权限、成本和部署。

验收：

- 能回放一次 Agent Run；
- 能分别评估工具选择、任务成功率和学习效果；
- 有权限、数据保留和遗忘机制；
- 多智能体收益大于额外成本和复杂度。

## 示例工程

课程统一示例位于 examples/learning-agent-runtime。它在同一组稳定接口上逐步添加能力：

~~~
ModelProvider
AgentKernel
ToolRegistry
SkillRegistry
MemoryStore
ThreadStore
TaskStore
Scheduler
ArtifactStore
PolicyEngine
TraceStore
~~~

默认测试使用确定性的 ScriptedModel，不需要 API Key 也能验证 Agent 循环。接入真实模型时，只替换 ModelProvider，不修改 Agent Kernel。

## 学习方式

- 初学者按 0～15 顺序学习。
- 已掌握 LLM API 的开发者可从阶段 2 开始。
- 已会 Tool Calling、但系统仍像聊天机器人的开发者，从阶段 7～9 开始。
- 教育产品团队重点学习阶段 7、9、10、12、13。
- MCP、框架和厂商 SDK 都是实现手段；先理解稳定接口，再选择具体技术。

## 课程约束

- 每章说明职责边界、数据模型、成功路径和失败路径。
- 每个阶段必须有可运行实验、练习和验收标准。
- 主线使用供应商无关接口，厂商 SDK 放在适配器或延伸阅读。
- 规则匹配程序称为工作流或工具助手，不冒充自主 Agent。
- 多智能体必须在完整单 Agent 之后学习。
- Prompt 不代替权限、状态机、持久化和测试。

统一术语见 [GLOSSARY.md](GLOSSARY.md)，旧教程迁移关系见 [LEGACY-MAP.md](LEGACY-MAP.md)，贡献章节使用 [CHAPTER-TEMPLATE.md](CHAPTER-TEMPLATE.md)。

