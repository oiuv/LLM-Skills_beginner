# 阶段 15：毕业项目——完整指导学习 Agent

> 前置知识：阶段 0～14  
> 目标：交付一个不是规则路由 Demo 的完整 Agent 系统

## 产品场景

学生可以：

- 输入学习目标；
- 上传题目图片或语音提问；
- 让 Agent 诊断薄弱知识点；
- 通过提示和练习学习；
- 获得一周学习计划；
- 在计划时间收到复习任务；
- 在手机和电脑续接同一 Thread；
- 查看系统保存的学习状态和记忆；
- 导出学习报告。

## 必须实现的系统对象

~~~
User
LearnerProfile
KnowledgeState
Thread
Run
Turn
Goal
Plan
Task
Trigger
Job
ToolCall
MemoryRecord
Checkpoint
Artifact
TraceEvent
~~~

不要求一开始使用复杂数据库，但接口和状态转换必须存在。

## 必须实现的组件

1. ModelProvider：真实模型适配器 + ScriptedModel。
2. ContextBuilder：按预算组装上下文。
3. AgentKernel：循环、状态和停止条件。
4. Planner：计划、成功条件和重规划。
5. ToolRegistry：本地 Tool 和至少一个 MCP Tool。
6. SkillRegistry/Runner：至少两个学习 Skills。
7. ThreadStore/MemoryStore：持久化与检索。
8. PolicyEngine：允许、拒绝和审批。
9. ToolExecutor：Schema、取消、超时、幂等。
10. ArtifactStore：笔记、计划、测验或报告。
11. Scheduler/TaskQueue：时间和事件触发。
12. LearnerModelService：知识状态和证据。
13. TraceStore：可回放事件。
14. Evaluation：离线用例和发布门槛。

## 推荐 Tools

- calculator；
- lookup_concept；
- retrieve_resource；
- analyze_answer；
- generate_quiz；
- save_note；
- create_learning_plan；
- schedule_review；
- update_knowledge_state；
- export_learning_report。

至少一个写 Tool 需要审批，至少一个 Tool 支持取消，所有写 Tool 支持幂等。

## 推荐 Skills

### diagnose-mistakes

读取题目与作答证据，诊断知识点和错误类型，信息不足时询问，不直接修改 KnowledgeState。

### guided-practice

按 Hint Ladder 引导学生完成练习，记录使用了几级提示。

### weekly-learning-review

聚合本周证据，生成报告，更新计划并安排下周复习。

## 三条端到端验收路径

### 路径 A：即时学习

1. 用户上传题目；
2. 多模态层生成 OCR 和图像证据；
3. Agent 发现信息不足并询问用户作答；
4. Skill 诊断误区；
5. Agent 给第一级提示；
6. 用户回答；
7. Tool 评测；
8. 生成新练习；
9. 更新 KnowledgeState；
10. 保存学习记录 Artifact。

### 路径 B：计划与调度

1. 用户设置两周目标；
2. Planner 读取时间约束和知识状态；
3. 生成有验收条件的 Plan；
4. 用户确认高层计划；
5. Scheduler 创建每日 Trigger；
6. 到期后创建 Job 并恢复 Thread；
7. 完成测验后事件触发重规划；
8. 换设备后仍能看到最新状态。

### 路径 C：失败恢复

1. Agent 创建复习 Artifact；
2. 保存日历 Tool 成功；
3. Worker 在通知前崩溃；
4. Job 租约过期；
5. 新 Worker 从 Checkpoint 恢复；
6. 幂等记录阻止重复创建日历；
7. 只重试通知；
8. Trace 能完整解释过程。

## 开发迭代

| Sprint | 交付 |
|---|---|
| 1 | ScriptedModel、Tool Registry、最小 Kernel |
| 2 | Plan、Thread、Memory、Trace |
| 3 | MCP Adapter、Skills、Policy、Artifact |
| 4 | Learner Model 与学习闭环 |
| 5 | Scheduler、Queue、Checkpoint |
| 6 | 多模态、跨端和评测 |
| 7 | 真实模型、生产部署和故障演练 |

每个 Sprint 结束时保持项目可运行，不创建一批长期未接入的空接口。

## 自动化测试最低要求

- Kernel 正常完成；
- 最大步数停止；
- Tool 参数校验失败；
- Tool 超时和取消；
- 权限拒绝与审批恢复；
- 幂等写入；
- Thread 持久化和版本冲突；
- Memory 删除；
- Scheduler 去重；
- Worker 崩溃恢复；
- Skill 触发与误触发；
- Prompt Injection 不产生越权动作；
- KnowledgeState 只基于证据更新。

## 不算完成的情况

- 意图由关键词 if/else 完成；
- 模型只生成最终文本，工具路径由代码固定；
- 所有状态只保存在 messages 数组；
- 定时任务只使用进程内 setTimeout；
- Skill 只有 Markdown，没有加载和执行；
- MCP Tool 绕过权限执行；
- 多智能体只是多调用几次模型；
- 没有失败路径和自动化测试；
- 只展示漂亮回复，无法证明学习效果。

## 最终交付物

- 可运行源码；
- 架构图和核心对象说明；
- 本地启动指南；
- 示例数据；
- 评测集与测试报告；
- 安全和隐私说明；
- Trace 回放示例；
- 生产部署方案；
- 三条端到端演示记录。

## 阶段 16：把毕业项目封装成专家产品

毕业项目证明 Runtime 能力完整；下一阶段不重写 Kernel，而是把其中稳定的教学能力抽成 Expert Package：

- IDENTITY、SOUL 和 AGENTS 定义产品身份、教学价值与跨任务纪律；
- diagnose-mistakes、guided-practice 等流程进入版本化 Skills；
- 教学策略和评测 Rubric 进入可检索 References；
- Tool 与 Connector 只作为 Capability Requirement 声明；
- Memory Policy 约束学习状态写入，但真实 LearnerProfile 和 KnowledgeState 仍留在 Runtime；
- 复习计划成为默认关闭的 Automation Template；
- 端到端验收路径转成 Expert Evaluation Suite。

完成封装后，安装或升级专家不应要求修改 AgentKernel、MemoryStore、Scheduler 或 PolicyEngine。具体方案与完整样例见[阶段 16：Expert Package](../16-expert-packaging/README.md)。
