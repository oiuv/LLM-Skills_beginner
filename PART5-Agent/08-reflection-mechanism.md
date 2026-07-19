# Reflection 机制

> 本章目标：理解 Agent 如何通过自我反思提升输出质量，掌握 Reflexion 架构和自校验策略。学完本章后，你应能为 Agent 实现反思与自我纠错能力。

---

## 1. 为什么 Agent 需要 Reflection？

### 1.1 LLM 的固有问题

```
LLM 的本质：预测下一个最可能的 token。

这意味着：
├── 它会"自信地犯错" — 输出看起来很流畅，但内容可能是错的
├── 它不会"回头检查" — 生成完就结束了，不会自己审视
├── 它容易"一条路走到黑" — 第一步错了，后续步骤会基于错误前提继续
└── 它有"讨好倾向" — 倾向于给出用户想听的答案，而不是正确的答案
```

### 1.2 没有 Reflection 的 Agent

```
User: "这段代码有 bug 吗？"

def calculate_average(numbers):
    total = sum(numbers)
    return total / len(numbers)  # 空列表会 ZeroDivisionError

Agent（无反思）：
├── 思考：代码看起来是对的，求和再除以长度
├── 回答："代码没有 bug，正确计算了平均值"
└── ❌ 漏掉了空列表的边界情况
```

### 1.3 有 Reflection 的 Agent

```
Agent（有反思）：
├── 第一轮思考：代码看起来是对的，求和再除以长度
├── 第一轮回答："代码没有 bug"
├── 🔄 反思：等一下，我检查边界情况了吗？
├── 第二轮思考：如果 numbers 是空列表，len(numbers) = 0，会除零
├── 第二轮回答："有一个 bug — 空列表会导致 ZeroDivisionError，
│              建议添加 if not numbers: return 0"
└── ✅ 找到了真正的 bug
```

---

## 2. Reflection 的三种模式

### 2.1 模式一：Self-Critique（自我审查）

最简单的反思形式——生成答案后，再用 LLM 审查自己的答案。

```
┌──────────────────────────────────────────────┐
│             Self-Critique 流程                 │
│                                               │
│   ┌──────────────┐                           │
│   │  Generator   │ 生成初始答案               │
│   └──────┬───────┘                           │
│          │                                    │
│          ▼                                    │
│   ┌──────────────┐                           │
│   │   Critic     │ 审查答案的质量和正确性      │
│   │  （同一个 LLM）│                           │
│   └──────┬───────┘                           │
│          │                                    │
│          ├── 通过 → 返回答案                   │
│          │                                    │
│          └── 不通过 → 反馈给 Generator 重新生成 │
│                                               │
└──────────────────────────────────────────────┘
```

**代码实现**：

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

async function generateWithSelfCritique(
  task: string,
  maxRetries = 3
): Promise<string> {

  // 第一步：生成初始答案
  let answer = await generate(task, "无之前的反馈");

  // 第二步：循环审查
  for (let i = 0; i < maxRetries; i++) {
    const critique = await review(task, answer);

    if (critique.passed) {
      console.log(`✅ 第 ${i + 1} 轮审查通过`);
      return answer;
    }

    console.log(`🔄 第 ${i + 1} 轮审查未通过：${critique.feedback}`);
    answer = await generate(task, critique.feedback);
  }

  console.log(`⚠️ 达到最大重试次数，返回当前最佳答案`);
  return answer;
}

// 生成答案
async function generate(task: string, feedback: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `任务：${task}

${feedback !== "无之前的反馈" ? `上一轮审查反馈：${feedback}\n请根据反馈改进你的回答。` : ""}

请给出你的回答。`
    }]
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

// 审查答案
async function review(task: string, answer: string): Promise<{
  passed: boolean;
  feedback: string;
}> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `你是一个严格的代码审查专家。

原始任务：${task}

待审查的回答：
${answer}

请从以下维度审查：
1. 正确性：回答是否准确？
2. 完整性：是否遗漏了重要方面？
3. 清晰度：解释是否清楚易懂？

请以 JSON 格式返回：
{
  "passed": true/false,
  "feedback": "具体的改进建议（如果 passed=false）"
}`
    }]
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(text);
}
```

### 2.2 模式二：Reflexion（反思学习）

Reflexion 比 Self-Critique 更进一步——不仅审查当前答案，还把反思结果存入 Memory，避免下次犯同样的错。

```
┌──────────────────────────────────────────────────────┐
│                   Reflexion 架构                      │
│                                                       │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│   │ Actor    │ →  │Evaluator │ →  │Reflector │      │
│   │（执行者） │    │（评估者） │    │（反思者） │      │
│   └────┬─────┘    └──────────┘    └────┬─────┘      │
│        │                               │             │
│        │         ┌──────────┐          │             │
│        │         │ Memory   │ ←────────┘             │
│        │         │（反思记忆）│  反思结论存入 Memory    │
│        │         └────┬─────┘                        │
│        │              │                              │
│        └──────────────┘  下一次执行时参考反思记忆      │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**关键区别**：

| | Self-Critique | Reflexion |
|---|---|---|
| 反思范围 | 当前任务 | 当前任务 + 跨任务 |
| 记忆 | 无 | 有（反思存入 Memory） |
| 学习 | 不学习 | 从失败中学习 |
| 适合 | 单次任务质量提升 | 需要反复执行的类似任务 |

**Reflexion 的工作流程**：

```
第一轮：执行任务
├── Actor: 尝试解决任务
├── Evaluator: 评估结果（通过/失败）
├── Reflector: 如果失败，生成反思
│   └── "我之前假设 numbers 不会为空，这是错误的假设。
│        以后处理数组时，必须先检查边界情况。"
└── 反思存入 Memory

第二轮：再次执行类似任务
├── Actor: 从 Memory 中读取之前的反思
├── "上次的经验：处理数组要先检查边界"
├── Actor: 主动添加空列表检查
└── ✅ 一次通过
```

### 2.3 模式三：Multi-Agent Debate（多 Agent 辩论）

在 Multi-Agent 章节已经介绍过 Debate 模式，它本质上也是一种 Reflection——通过外部视角发现盲点。

```
与 Self-Critique 的区别：

Self-Critique:  自己检查自己 → 容易"当局者迷"
Debate:         别人检查我   → "旁观者清"

效果对比：
├── Self-Critique: 能发现 60-70% 的问题
├── Debate:        能发现 80-90% 的问题
└── 代价：Debate 的 token 消耗是 Self-Critique 的 3-5 倍
```

---

## 3. Agent 循环中的 Reflection

### 3.1 在 ReAct 中加入 Reflection

```
标准 ReAct：  思考 → 行动 → 观察 → 思考 → 行动 → 观察 ...

增强 ReAct：  思考 → 行动 → 观察 → 反思 → 思考 → 行动 → 观察 → 反思 ...
                                          ↑
                                     每步之后加一个反思检查点

反思检查点做的事：
1. 这步的结果符合预期吗？
2. 有没有发现新的约束或问题？
3. 需要调整后续策略吗？
4. 是否已经完成目标（可以提前结束）？
```

### 3.2 在 Plan-and-Execute 中加入 Reflection

```
标准流程：  Plan → Execute → Replan

增强流程：  Plan → Execute → Reflect → Replan
                                      ↑
                               反思决定是否需要重规划

Reflect 的输出：
{
  "current_progress": "完成了 3/7 步",
  "issues_found": ["步骤 2 的类型声明不完整"],
  "plan_adjustment_needed": true,
  "reason": "发现项目用了 monorepo，需要分别配置每个包"
}
```

### 3.3 代码：带 Reflection 的 ReAct

```typescript
async function reactWithReflection(
  goal: string,
  tools: Tool[],
  maxSteps = 10
) {
  let history: string[] = [];
  let reflections: string[] = [];

  for (let step = 0; step < maxSteps; step++) {
    // 1. ReAct 的思考步骤（参考之前的反思）
    const thought = await think(goal, history, reflections);

    if (thought.includes("任务已完成")) {
      return extractFinalAnswer(history);
    }

    // 2. 行动
    const action = await decideAction(thought, tools);
    const observation = await executeAction(action);

    // 3. 反思
    const reflection = await reflect(goal, thought, action, observation);

    history.push(`Step ${step + 1}: ${thought} → ${action} → ${observation}`);
    reflections.push(reflection);

    // 4. 如果反思发现严重问题，立即调整
    if (reflection.includes("严重问题")) {
      console.log("⚠️ 反思发现严重问题，调整策略...");
    }
  }
}

async function reflect(
  goal: string,
  thought: string,
  action: string,
  observation: string
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `目标：${goal}

最近一步：
- 思考：${thought}
- 行动：${action}
- 结果：${observation}

请简要反思：
1. 这步结果是否符合预期？
2. 有没有发现新问题？
3. 需要调整策略吗？

用 1-2 句话总结反思结论。`
    }]
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}
```

---

## 4. Reflection 的 Prompt 设计

### 4.1 Critic Prompt 的关键要素

```
一个好的 Critic Prompt 要做到：

1. 明确审查维度
   ❌ "这个回答好吗？"  → 太模糊
   ✅ "从正确性、完整性、可执行性三个维度审查"

2. 要求结构化输出
   ❌ 自由文本 → 难以解析
   ✅ JSON 格式 → {passed, feedback, severity}

3. 给出具体标准
   ❌ "检查是否有错误"
   ✅ "检查：空值处理、边界条件、类型安全、错误处理"

4. 避免"讨好"倾向
   ❌ "请评价这个回答"
   ✅ "请尝试找出这个回答中的问题，如果找不到问题再确认通过"
```

### 4.2 反思的粒度控制

```
反思太粗：  "这步没问题" → 没有信息量
反思太细：  "这行代码的第 3 个参数应该是 string 而不是 number" → 太具体，不通用
反思刚好：  "处理用户输入时需要做类型校验" → 可复用的经验

粒度控制的 Prompt：
"""
请生成一条可以在未来复用的经验教训，不要太具体（针对某行代码），
也不要太笼统（"要仔细"），要针对具体的问题模式。
例如："当 API 返回可能为空时，必须先做空值检查再使用结果"
"""
```

---

## 5. Reflection 的成本与收益

### 5.1 Token 消耗对比

```
无反思：
├── 任务执行：~2,000 tokens
└── 总计：~2,000 tokens

Self-Critique（1 轮审查）：
├── 任务执行：~2,000 tokens
├── 审查：~1,500 tokens（读答案 + 输出审查意见）
├── 可能的重新生成：~2,000 tokens
└── 总计：~3,500-5,500 tokens（1.7x-2.7x）

Reflexion（反思 + 记忆）：
├── 任务执行：~2,000 tokens
├── 评估：~500 tokens
├── 反思生成：~500 tokens
├── 记忆读取：~300 tokens
└── 总计：~3,300 tokens（1.6x）

Debate（2 Agent + 3 轮）：
├── Agent A：~1,500 × 3 = ~4,500 tokens
├── Agent B：~1,500 × 3 = ~4,500 tokens
├── Judge：~2,000 tokens
└── 总计：~11,000 tokens（5.5x）
```

### 5.2 什么时候值得用 Reflection？

```
值得用：
├── 代码生成/审查（错误代价高）
├── 医疗/法律/金融建议（准确性关键）
├── 多步推理任务（错误会传播）
└── 需要反复执行的批量任务（Reflexion 学习后效率提升）

不值得用：
├── 简单的问答（"今天星期几"）
├── 创意生成（没有"正确答案"）
├── 实时性要求高的场景（反思需要额外时间）
└── 预算紧张的场景（token 成本翻倍）
```

---

## 6. 与 Memory 系统的集成

```
Reflection 产生的三种记忆：

1. 任务记忆（Task Memory）
   └── "这次任务的第 3 步失败了，因为 API 超时"
   └── 生命周期：当前任务结束后可丢弃

2. 经验记忆（Experience Memory）
   └── "调用外部 API 时要设置超时和重试机制"
   └── 生命周期：长期保留，跨任务复用

3. 模式记忆（Pattern Memory）
   └── "数组操作前先检查空值，这是常见 bug 模式"
   └── 生命周期：永久保留，提升通用能力

存入 Memory 的格式建议：
{
  "type": "reflection",
  "task_type": "代码审查",
  "issue": "忽略了空列表边界情况",
  "lesson": "处理数组/列表时，必须先检查是否为空",
  "confidence": 0.9,
  "times_applied": 0
}
```

---

## 小结

| 要点 | 内容 |
|------|------|
| **为什么** | LLM 会自信地犯错，不会回头检查 |
| **三种模式** | Self-Critique（自查）、Reflexion（学习式反思）、Debate（辩论） |
| **与 ReAct** | 在 ReAct 循环中加反思检查点，每步后审视结果 |
| **与 Planning** | 反思决定是否需要重规划 |
| **与 Memory** | 反思结论存入 Memory，下次类似任务直接复用 |
| **成本** | token 消耗 1.5x-5x，按任务重要性决定是否使用 |
