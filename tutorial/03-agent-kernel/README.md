# 阶段 3：Agent Kernel

> 前置知识：阶段 2  
> 里程碑：实现可停止、可追踪、可测试的单 Agent 决策循环

## 从 Tool Loop 到 Agent Kernel

Tool Loop 只解决“模型调用工具”。Agent Kernel 还要负责：

- 将输入归属到 Thread 和 Run；
- 构建每一轮上下文；
- 维护目标、计划和工作状态；
- 选择可见 Tools 和 Skills；
- 应用权限和预算；
- 记录 Trace；
- 处理等待用户、取消和失败；
- 判断继续、暂停或结束。

## Kernel 输入与输出

~~~ts
interface RunRequest {
  threadId: string;
  trigger: "user" | "schedule" | "event" | "agent";
  observation: Observation;
}

type RunOutcome =
  | { status: "completed"; answer: string; artifactIds: string[] }
  | { status: "waiting"; reason: "user_input" | "approval"; prompt: string }
  | { status: "cancelled" }
  | { status: "failed"; error: string };
~~~

Kernel 不直接处理 HTTP、数据库驱动或 UI。它通过 Store 和服务接口读取状态。

## Agent 状态机

~~~
queued
  ↓
running ──→ waiting_user ──→ running
   │       waiting_approval ─→ running
   │
   ├──→ completed
   ├──→ failed
   └──→ cancelled
~~~

每次迁移必须记录事件。waiting 不是失败，cancelled 也不应被错误地自动重试。

## Context Builder

每轮调用模型前，从以下来源组装上下文：

1. 系统身份和不可变策略；
2. 当前 Goal、Task 和 Plan；
3. 最近 Turn 与尚未解决的问题；
4. 与当前任务相关的长期记忆；
5. 激活的 Skill；
6. 当前允许的 Tool 描述；
7. 最近 Tool Result；
8. 剩余预算。

上下文构建应是独立组件，便于测试“模型实际看到了什么”。

## Action 类型

~~~ts
type AgentAction =
  | { type: "answer"; content: string }
  | { type: "tool_calls"; calls: ProposedToolCall[] }
  | { type: "update_plan"; plan: Plan }
  | { type: "request_input"; question: string }
  | { type: "request_approval"; operation: string }
  | { type: "delegate"; role: string; task: string }
  | { type: "finish"; summary: string };
~~~

模型只提出 Action。Runtime 根据状态和策略接受、拒绝或转换 Action。

## ReAct 循环

ReAct 可以理解为：

~~~
Reason：结合目标和 Observation 选择下一步
Act：执行 Tool 或其他 Action
Observe：把结构化结果加入状态
~~~

工程实现不需要保存或暴露模型私有思维过程。Trace 应记录可观察的决策摘要、调用、结果和状态迁移。

## 停止条件

至少包括：

- 模型明确完成；
- 目标的验收条件满足；
- 请求等待用户信息；
- 请求等待审批；
- 达到最大步数；
- 达到时间、token、费用或工具预算；
- 连续重复同一动作；
- 用户取消；
- 不可恢复错误；
- 策略拒绝。

只设置 maxSteps 不能阻止短循环中的重复副作用，应保存调用签名并检测重复。

## 失败处理

| 失败 | Kernel 决策 |
|---|---|
| Tool 可重试错误 | 在预算内退避重试 |
| Tool 不可重试错误 | 把错误作为 Observation，允许重规划 |
| Schema 失败 | 要求模型修正一次或有限次数 |
| 权限拒绝 | 请求授权或选择替代方案 |
| 用户信息不足 | 转为 waiting_user |
| 上下文过长 | 压缩后继续 |
| 预算耗尽 | 保存 Checkpoint 并结束或等待确认 |

## Trace

一次 Run 应记录：

- 输入 Observation；
- 上下文版本和模型配置；
- 每个可见 Tool；
- 模型 Action；
- 策略判断；
- Tool 参数、耗时和结果摘要；
- 状态迁移；
- 最终 Outcome；
- token、成本和错误。

Trace 是调试、评测和审计共同的事实来源。

## 常见错误

1. 在一个巨大 while 循环里混合模型、数据库和工具代码。
2. 只返回字符串，不返回 RunOutcome。
3. waiting 状态只存在内存中，进程重启后丢失。
4. 每轮把所有工具和所有历史都发给模型。
5. 让模型决定自己的权限和预算。

## 练习与验收

使用 ScriptedModel 测试三条路径：

1. 调用 calculator 后回答；
2. 缺少信息时进入 waiting_user；
3. 重复调用相同写工具时被循环检测器阻止。

验收标准：

- Kernel 不依赖具体模型或数据库实现；
- 状态迁移合法且可追踪；
- 所有结束路径产生 RunOutcome；
- 取消和预算能中止正在执行的工具；
- 测试不访问网络。

## 延伸阅读

- [Agent 架构](../../PART5-Agent/02-agent-architecture.md)
- [ReAct 模式](../../PART5-Agent/03-react-pattern.md)
- [工具编排](../../PART5-Agent/04-tool-orchestration.md)

