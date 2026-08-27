# 阶段 11：多智能体协作

> 前置知识：阶段 3～9  
> 里程碑：在明确收益和边界下完成一次可追踪委派

## 默认不要多智能体

多智能体会增加模型调用、延迟、状态同步、权限和调试难度。先建立完整单 Agent 基线，只有以下情况再拆分：

- 角色需要独立权限；
- 上下文需要隔离；
- 任务能明显并行；
- 不同子任务需要不同模型或工具；
- 需要独立审查者；
- 组织边界要求责任分离。

“提示词太长”通常先通过 Skill 和 Context Builder 解决。

## 协作模式

| 模式 | 适用场景 |
|---|---|
| Orchestrator-Worker | 主 Agent 拆解、委派和汇总 |
| Pipeline | 阶段固定，输出依次传递 |
| Parallel Specialists | 独立子任务并行 |
| Reviewer | 一个 Agent 产出，另一个检查 |
| Debate | 高价值且多视角问题，有限轮次 |

Swarm 等开放协作模式不适合零基础主线。

## 委派数据模型

~~~ts
interface Delegation {
  id: string;
  parentRunId: string;
  childAgent: string;
  objective: string;
  inputRefs: string[];
  allowedTools: string[];
  budget: { maxTurns: number; maxCost: number };
  successCriteria: string[];
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
}
~~~

子 Agent 接收最小必要上下文和权限，不复制父 Thread 的全部历史。

## Orchestrator 职责

- 判断是否真的需要委派；
- 生成清晰 objective 和 successCriteria；
- 选择角色、工具和预算；
- 处理超时、取消和部分失败；
- 验证子 Agent 结果；
- 合并 Artifact，而不是盲目拼接文本；
- 将关键结果写回父 Run。

## 上下文传递

使用引用和结构化任务包：

~~~
目标
约束
输入 Artifact 引用
允许的 Tools
输出 Schema
验收条件
预算
~~~

不要把父 Agent 的所有消息、密钥和记忆直接发送给子 Agent。

## 结果聚合

聚合器需要：

- 校验输出 Schema；
- 去重；
- 发现矛盾；
- 追溯证据；
- 决定是否请求复核；
- 保留每个子 Agent 的来源。

多数投票不自动等于正确，多个 Agent 可能共享相同错误。

## 共享与隔离

- Task 和 Artifact 可以显式共享；
- Working Memory 默认隔离；
- 长期用户记忆由统一 Memory Policy 管理；
- Tool 权限按子任务最小化；
- 所有子 Run 关联 parentRunId；
- 取消父 Run 应传播到子 Run。

## 评估是否值得

和单 Agent 基线比较：

- 任务成功率；
- 证据完整性；
- 延迟；
- token 与费用；
- 工具调用数；
- 故障率；
- 调试复杂度。

质量提升很小但成本翻倍时，应回到单 Agent + Skill。

## 常见错误

1. 每个 Plan Step 都创建一个 Agent。
2. 子 Agent 拥有父 Agent 全部权限。
3. 只传自然语言，没有输出 Schema。
4. 父任务取消后子 Agent 继续产生副作用。
5. 通过多次模型投票掩盖缺少真实验证工具。

## 练习与验收

让“练习生成 Agent”产出测验，“审查 Agent”检查难度和答案，但保存测验的 Tool 只属于父 Agent。

验收标准：

- 委派有明确成功条件和预算；
- 子 Agent 只看到必要上下文和 Tools；
- 子 Run 可追踪到父 Run；
- 取消会传播；
- 与单 Agent 基线有成本和质量对比。

## 延伸阅读

- [现有多智能体章节](../../PART5-Agent/06-multi-agent.md)

