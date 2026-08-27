# 统一术语表

本教程按工程职责定义术语。不同框架可能使用不同名字，应优先判断组件承担什么职责。

## 核心对象

| 术语 | 定义 |
|---|---|
| Agent | 面向目标运行的闭环系统，能够理解状态、选择动作、观察结果并继续决策 |
| Agent Kernel | 负责上下文构建、决策循环、状态迁移和停止条件的核心逻辑 |
| Run | Agent 为处理一次输入、任务或触发事件而产生的一次执行实例 |
| Turn | Run 中模型与运行时的一轮交互 |
| Goal | 用户或系统希望最终达到的结果 |
| Plan | 为实现 Goal 生成的可修改步骤集合 |
| Task | 可排队、执行、重试、取消和持久化的工作单元 |
| Observation | 归一化后的输入或动作结果，包含来源、内容、时间和权限元数据 |
| Action | Agent 的下一步，包括回答、调用工具、请求确认、委派或结束 |
| Thread | 可跨多次 Run、会话和设备持续存在的用户工作上下文 |
| Checkpoint | 可以恢复 Run 或 Task 的一致状态快照 |
| Artifact | Agent 产生的可交付物，如计划、笔记、测验、代码、文件或报告 |

## 模型与能力

| 术语 | 定义 |
|---|---|
| Model Provider | 屏蔽具体模型厂商 API 差异的接口 |
| Structured Output | 按 Schema 生成的结构化模型输出 |
| Tool Calling | 模型产生工具名与参数，由运行时执行工具的机制 |
| Tool | 一个原子、可描述、可校验和可执行的能力 |
| Tool Registry | 保存 Tool Schema、执行器和策略元数据的注册表 |
| MCP | 标准化连接 AI 应用与 Tools、Resources、Prompts 等能力的协议 |
| Connector | 与具体外部应用、账号、权限和数据模型集成的适配器 |
| Skill | 针对一类任务的可发现流程知识，描述条件、步骤、工具和输出约束 |
| Skill Runner | 加载 Skill 并将其约束、资源和步骤注入 Agent Run 的组件 |
| RAG | 在生成前检索外部知识并加入上下文的模式，不等于长期记忆 |

## 专家封装

| 术语 | 定义 |
|---|---|
| Expert Package | 位于 Agent Runtime 之上的版本化产品定义，组合身份、方法论、Skills、能力需求、状态策略、自动化模板和评测 |
| Expert Definition | 某个 expertId 与 version 对应的不可变专家定义及其依赖摘要 |
| Resolved Expert Definition | Expert Package 通过路径、依赖、安全、预算和评测校验后的编译结果 |
| Expert Installation | 某环境安装 Expert Definition 后形成的依赖锁、组织配置、信任状态和可用性记录 |
| Expert Binding | 某个用户或 Thread 对一个已安装专家的选择、同意、连接和自动化配置 |
| Expert Run Context | 一次 Run 固定使用的 Expert 版本、依赖 Lock、用户状态引用和有效权限视图 |
| Automation Template | Expert Package 声明的时间或事件触发意图；绑定并编译后才能成为 Trigger |
| Trust Envelope | 关于 Package 来源、签名、Digest、审核、权限摘要、评测和撤销状态的信任记录 |

## 状态与记忆

| 术语 | 定义 |
|---|---|
| Conversation History | 当前对话的消息历史 |
| Working Memory | 当前任务需要的临时事实、中间结果和假设 |
| Episodic Memory | 过去事件、任务和结果的可检索记录 |
| Semantic Memory | 从历史中提炼的稳定事实、偏好和概念关系 |
| Learner Model | 描述目标、知识掌握度、误区、偏好和学习节奏的领域状态 |
| Context Builder | 从 Thread、Memory、Skill、Tool 和 Observation 组装模型上下文 |

## 运行时与治理

| 术语 | 定义 |
|---|---|
| Runtime | 在模型之外维护状态、执行动作、调度任务和实施策略的软件系统 |
| Scheduler | 根据时间或计划唤醒 Job 的控制面组件 |
| Event Bus | 发布、订阅和传递业务事件的组件 |
| Job | Scheduler 或 Event Trigger 创建的一次后台执行请求 |
| Worker | 从队列获取 Job 并执行 Task 或 Agent Run 的进程 |
| Policy Engine | 根据用户、工具、参数、资源和环境决定允许、拒绝或请求审批 |
| Guardrail | 对输入、决策、执行和输出施加的安全或质量约束 |
| Trace | 记录 Run、Turn、模型调用、Tool Call 和状态变化的事件链 |
| Evaluation | 使用断言、人工标注或模型评审衡量 Agent 行为和结果 |
| Idempotency | 同一动作重复执行时不会产生额外副作用的性质 |

## 容易混淆的关系

~~~
MCP Session       连接或协议层状态
Login Session     用户认证状态
Conversation      一段消息交流
Agent Thread      可跨交流、设备和任务持续存在的工作上下文
Agent Run         Thread 上发生的一次执行
~~~

~~~
Skill 说明怎样做
Tool 提供原子动作
Tool Calling 让模型提出动作
MCP 标准化能力连接方式
Connector 处理具体系统、账号和权限
Runtime 真正执行并保存状态
~~~

~~~
Expert Package       可发布定义
Expert Installation  环境级安装与依赖解析
Expert Binding       用户级选择、连接和同意
Expert Run Context   单次执行固定版本与有效权限
~~~
