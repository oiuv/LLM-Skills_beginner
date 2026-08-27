# 阶段 0：认识完整 Agent 系统

> 前置知识：会阅读基础 TypeScript  
> 里程碑：能区分聊天、工作流、工具助手和自主 Agent

## 学习目标

- 理解 Agent 的必要组成和职责边界；
- 掌握 Thread、Run、Turn、Task、Tool Call 等核心对象；
- 能判断一个需求是否真的需要 Agent；
- 能画出指导学习 Agent 的完整生命周期。

## 从聊天到 Agent

四类系统经常被混用：

| 类型 | 决策方式 | 状态 | 外部动作 | 适合场景 |
|---|---|---|---|---|
| Chatbot | 模型生成回复 | 对话历史 | 通常没有 | 问答、改写、总结 |
| Workflow | 代码预先定义步骤 | 流程状态 | 固定动作 | 稳定、重复业务 |
| Tool Assistant | 模型选择少量工具 | 会话状态 | 有 | 搜索、查询、计算 |
| Agent | 围绕目标动态规划和执行 | 持久 Thread/Task | 有且受治理 | 开放式多步任务 |

是否使用 Agent，应看任务是否同时具备开放目标、动态决策、多步反馈和外部行动。固定表单审批不需要 Agent；“分析薄弱知识点、生成计划、每日跟踪并调整”适合 Agent。

## Agent 的最小闭环

~~~
Observe：读取用户输入、记忆和环境
Think：理解状态并判断下一步
Act：回答、调用工具、请求确认或委派
Observe：接收动作结果
Repeat：继续、重规划或结束
~~~

这个闭环必须由运行时控制。模型只负责产生候选决策，不能直接获得文件系统、数据库或账号权限。

## 完整系统分层

1. 感知层：文本、语音、图片、屏幕和设备上下文。
2. 上下文层：Thread、记忆、Skill、工具描述和当前任务状态。
3. Agent Kernel：目标、策略、规划、循环和停止条件。
4. 能力层：Tool Registry、MCP Client、Connector、Skill Runner。
5. 执行层：校验、权限、审批、沙箱、重试和取消。
6. 状态层：Memory、Thread、Task、Checkpoint、Artifact。
7. 控制面：Scheduler、Event Bus、Queue、Worker、多 Agent 调度。
8. 治理面：安全、评测、追踪、成本、审计和数据生命周期。

## 核心对象模型

~~~ts
type ID = string;

interface Thread {
  id: ID;
  userId: ID;
  goal?: string;
  activeRunId?: ID;
  memoryRefs: ID[];
  artifactRefs: ID[];
  version: number;
}

interface Run {
  id: ID;
  threadId: ID;
  trigger: "user" | "schedule" | "event" | "agent";
  status: "queued" | "running" | "waiting" | "completed" | "failed";
  turns: Turn[];
}

interface Turn {
  index: number;
  observation: Observation;
  action?: AgentAction;
}

interface Observation {
  kind: "text" | "audio" | "image" | "screen" | "tool_result" | "event";
  content: unknown;
  source: string;
  occurredAt: string;
}
~~~

为什么要先定义对象？因为跨设备恢复、后台调度、重试和审计都依赖稳定标识。如果只保存 messages 数组，后续无法回答“哪个任务失败了”“哪个工具产生了这个文件”。

## Agent 一次运行的生命周期

1. 接收输入或触发事件。
2. 根据 threadId 加载 Thread。
3. 新建 Run 并保存 trigger。
4. 构建当前上下文。
5. 调用模型产生 Action。
6. 运行时校验 Action。
7. 执行动作并记录 Observation。
8. 更新工作记忆、计划和学习者模型。
9. 达到停止条件后生成 Artifact 或回复。
10. 保存 Checkpoint、Trace 和下一次触发条件。

## 设计原则

- 模型可替换：Agent Kernel 不绑定某个模型 API。
- 工具最小权限：模型只看到被允许的能力。
- 状态显式：重要状态不能只藏在 Prompt 中。
- 所有副作用可追踪：写文件、发消息和修改数据都产生事件。
- 默认单 Agent：只有角色或权限确实需要隔离时才引入多 Agent。
- 失败是正常路径：超时、拒绝、取消、重试必须进入数据模型。
- 教学效果优先：学习 Agent 的成功不是“回复很像老师”，而是学习状态改善。

## 常见错误

1. 把任意 LLM 应用都叫 Agent。
2. 用大段 Prompt 代替任务状态机。
3. 把 MCP 当作规划器或记忆系统。
4. 把对话历史当作全部长期记忆。
5. 在没有单 Agent 基线前引入多智能体。

## 练习与验收

基础练习：为“每天检查错题并安排复习”画出对象和事件流。

设计练习：解释为什么 Scheduler 应在模型循环之外。

验收标准：

- 能说明 Tool、MCP、Skill、Memory 和 Scheduler 的不同职责；
- 能为一次用户请求标出 Thread、Run、Turn；
- 能列出至少三个非模型组件；
- 能判断三个具体需求是否需要 Agent。

## 延伸阅读

- [现有 Agent 架构章节](../../PART5-Agent/02-agent-architecture.md)
- [现有架构蓝图](../../PART1-MCP-Protocol/08-architecture-blueprint.md)

