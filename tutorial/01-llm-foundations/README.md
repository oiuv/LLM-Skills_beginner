# 阶段 1：LLM 应用基础

> 前置知识：阶段 0、Promise 和基础 HTTP  
> 里程碑：用统一接口完成可验证的结构化模型调用

## 为什么 Agent 课程要先讲模型边界

Agent 的决策质量受模型影响，但工程可靠性不能交给模型。模型输出具有概率性、上下文窗口有限、可能产生不存在的事实，也不知道你的真实权限和系统状态。

本阶段只学习 Agent 必需的模型知识：

- message 与 role；
- token、上下文窗口和截断；
- structured output；
- streaming；
- 模型错误、限流和超时；
- 供应商适配器；
- 确定性测试替身。

模型训练、微调和 Transformer 数学不属于本课程主线。

## 统一 ModelProvider

~~~ts
interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
}

interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

type ModelDecision =
  | { type: "answer"; content: string }
  | { type: "tool_calls"; calls: ProposedToolCall[] }
  | { type: "request_input"; question: string };

interface ModelProvider {
  decide(input: {
    messages: ModelMessage[];
    tools: ToolDescriptor[];
    responseSchema?: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<ModelDecision>;
}
~~~

Agent Kernel 只依赖 ModelProvider。真实模型、离线 ScriptedModel、回放模型和测试 Fake 都实现这个接口。

## 消息不是完整状态

System、User、Assistant、Tool 消息适合表达模型可见上下文，但不要把数据库事务、权限和任务状态只保存成消息。

上下文构建器应从真实状态派生 messages：

~~~
Thread + Memory + Current Task + Skill + Tool Policy
                         ↓
                   Context Builder
                         ↓
                      Messages
~~~

模型看到的是投影，不是系统事实来源。

## Structured Output

需要稳定读取的输出必须结构化。例如学习诊断：

~~~ts
interface Diagnosis {
  topic: string;
  mastery: number;
  misconceptions: string[];
  evidence: string[];
  nextAction: "explain" | "practice" | "assess";
}
~~~

运行时需要：

1. 给模型明确 Schema；
2. 解析 JSON；
3. 校验类型、范围和枚举；
4. 校验失败时有限重试；
5. 多次失败后返回可观察错误。

“模型返回了 JSON”不等于“输出有效”。例如 mastery 必须在 0～1，topic 不能是空字符串。

## 上下文预算

上下文通常按优先级组装：

1. 不可丢失：系统身份、安全策略、当前任务。
2. 高优先级：最近对话、当前计划、工具结果。
3. 可压缩：历史对话、长文档、旧任务。
4. 按需检索：长期记忆、知识库和旧 Artifact。

当超出预算时，先检索和摘要，不要简单删除最早消息。摘要必须保留事实来源和未解决事项。

## Streaming 与最终状态

流式输出改善体验，但只有完整、校验后的结果才能提交为最终状态。中途 token 可以展示，不能直接当作已保存的计划或 Tool 参数。

~~~
模型流 → UI 临时展示
模型结束 → 解析与校验 → 提交正式状态
~~~

用户取消时应触发 AbortSignal，并把 Run 标记为 cancelled，而不是只停止前端动画。

## 错误分类

| 错误 | 处理 |
|---|---|
| 网络暂时失败 | 指数退避重试 |
| 限流 | 遵守服务端等待时间并切换队列 |
| 鉴权失败 | 不重试，要求修复配置 |
| 上下文过长 | 压缩、检索或拆分 |
| Schema 校验失败 | 带错误信息有限重试 |
| 内容策略拒绝 | 记录原因并采用安全替代路径 |
| 用户取消 | 立即传播取消信号 |

## 确定性测试

不要让基础单元测试依赖远程模型。ScriptedModel 按顺序返回预设决策：

~~~ts
class ScriptedModel implements ModelProvider {
  constructor(private decisions: ModelDecision[]) {}

  async decide(): Promise<ModelDecision> {
    const decision = this.decisions.shift();
    if (!decision) throw new Error("No scripted decision");
    return decision;
  }
}
~~~

真实模型用于集成测试和评测集；Kernel、Tool Registry 和状态机使用确定性测试。

## 常见错误

1. 在业务代码中到处直接调用厂商 SDK。
2. 把温度设为 0 当成绝对确定性保证。
3. 不校验结构化输出。
4. 把完整用户数据库塞进 Prompt。
5. 把流式半成品写入正式状态。

## 练习与验收

实现一个 ModelProvider 测试替身，依次返回 request_input、tool_calls 和 answer。

验收标准：

- Kernel 代码不导入具体厂商 SDK；
- 结构化输出经过运行时校验；
- 取消信号能够传播；
- 单元测试不需要网络和 API Key。

