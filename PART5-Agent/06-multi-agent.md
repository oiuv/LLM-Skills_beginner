# Multi-Agent 协作

> 本章目标：理解为什么需要多 Agent 协作、主流的协作模式、以及如何实现 Agent 间的通信与协调。学完本章后，你应能设计和实现多 Agent 系统。

---

## 1. 为什么需要多 Agent？

### 1.1 单 Agent 的局限

```
单 Agent 处理复杂任务：

User: "分析竞品产品 A、B、C，写一份市场调研报告"

Agent（单体）：
├── 思考：需要搜索 A、B、C 的信息...
├── 搜索 A → 读文档 → 整理 ✅
├── 搜索 B → 读文档 → 整理 ✅
├── 搜索 C → 读文档 → 整理 ✅
├── 分析对比...
├── 写报告...
└── 问题：
    ├── 上下文窗口爆了（累积了太多中间结果）
    ├── 每一步都用同一个"人格"（搜索和写报告需要不同专长）
    ├── 无法并行（必须串行，效率低）
    └── 错误会传播（A 的分析错误会影响最终结论）
```

**单 Agent 的三大瓶颈**：

| 瓶颈 | 说明 |
|------|------|
| **上下文窗口** | 复杂任务的中间结果会迅速填满 context，导致信息丢失 |
| **专业分工** | 一个 prompt 很难同时擅长搜索、分析、写作、校验 |
| **串行执行** | 子任务之间必须排队，浪费时间 |

### 1.2 多 Agent 的解法

```
多 Agent 协作：

User: "分析竞品产品 A、B、C，写一份市场调研报告"

Orchestrator（调度者）：
├── 派发任务 ──────────────────────────┐
│                                      ▼
│   ┌──────────┐  ┌──────────┐  ┌──────────┐
│   │Researcher│  │Researcher│  │Researcher│    ← 并行执行
│   │  分析 A  │  │  分析 B  │  │  分析 C  │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘
│        │              │              │
│        ▼              ▼              ▼
├── 收集三份分析结果
├── 派发给 Writer Agent → 写报告初稿
├── 派发给 Reviewer Agent → 审校质量
└── 返回最终报告给 User
```

**多 Agent 的优势**：

| 优势 | 说明 |
|------|------|
| **并行处理** | 研究 A/B/C 可以同时进行 |
| **上下文隔离** | 每个 Agent 只需要自己的上下文，不会互相干扰 |
| **专业分工** | Researcher 专注搜索，Writer 专注写作，Reviewer 专注校验 |
| **容错能力** | C 的分析失败不影响 A 和 B |

---

## 2. 四种主流协作模式

### 2.1 模式一：Orchestrator-Worker（调度者-工人）

```
最常用的模式，也是 Hermes Agent 的 delegation 机制采用的模式：

                    ┌──────────────────┐
                    │   Orchestrator   │
                    │  （理解目标，拆分  │
                    │   任务，分配工作） │
                    └───────┬──────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Worker 1 │ │ Worker 2 │ │ Worker 3 │
        │ （搜索）  │ │ （分析）  │ │ （写作）  │
        └──────────┘ └──────────┘ └──────────┘
              │             │             │
              └─────────────┼─────────────┘
                            ▼
                    ┌──────────────────┐
                    │   Orchestrator   │
                    │ （汇总、质量检查） │
                    └──────────────────┘
```

**特点**：
- Orchestrator 不做具体工作，只负责拆任务和收结果
- Worker 之间互不通信，都只跟 Orchestrator 交互
- 适合：任务可以清晰拆分为独立子任务的场景

**代码示例**（伪代码）：

```typescript
async function orchestrator(userGoal: string) {
  // 1. 用 LLM 拆分子任务
  const plan = await llm.chat({
    messages: [
      { role: "system", content: "你是任务调度专家，把用户目标拆成可并行的子任务" },
      { role: "user", content: userGoal }
    ]
  });
  const subtasks = JSON.parse(plan); // [{task: "分析A", agent: "researcher"}, ...]

  // 2. 并行派发给 Worker
  const results = await Promise.all(
    subtasks.map(task => spawnWorker(task))
  );

  // 3. 汇总结果
  const report = await llm.chat({
    messages: [
      { role: "system", content: "你是报告撰写专家" },
      { role: "user", content: `基于以下分析结果写报告：\n${JSON.stringify(results)}` }
    ]
  });

  return report;
}
```

### 2.2 模式二：Pipeline（流水线）

```
任务按顺序流过多个 Agent，每个 Agent 负责一个阶段：

User: "把这篇英文论文翻译成中文并加上注释"

┌──────────┐    ┌──────────┐    ┌──────────┐
│Translator│ →  │ Refiner  │ →  │ Annotator│
│  翻译     │    │  润色     │    │  加注释   │
└──────────┘    └──────────┘    └──────────┘
  粗译结果        润色结果        最终输出
```

**特点**：
- 串行执行，上游的输出是下游的输入
- 每个 Agent 专注一个阶段，可以有专门的 system prompt
- 适合：有明确阶段划分的处理流程

**与 ReAct 循环的区别**：
- ReAct 是**一个 Agent 内部**的思考-行动循环
- Pipeline 是**多个 Agent 之间**的顺序协作

### 2.3 模式三：Debate（辩论）

```
多个 Agent 对同一问题给出不同观点，通过辩论达成共识：

┌──────────┐     ┌──────────┐
│ Agent A  │ ←→  │ Agent B  │     ← 互相挑战对方观点
│（乐观派） │     │（悲观派） │
└────┬─────┘     └────┬─────┘
     │                │
     ▼                ▼
┌──────────────────────────────┐
│         Judge Agent          │     ← 裁判，综合判断
│   （综合 A、B 的论点做决策）    │
└──────────────────────────────┘
```

**特点**：
- 通过对抗提高决策质量
- 适合：需要多角度评估的场景（投资决策、风险评估、代码审查）
- 缺点：token 消耗大（多轮辩论）

**代码示例**（伪代码）：

```typescript
async function debate(question: string, rounds = 3) {
  let history: string[] = [];

  for (let i = 0; i < rounds; i++) {
    // Agent A 发表观点
    const opinionA = await agentA.chat(
      `问题：${question}\n\n历史讨论：\n${history.join("\n")}\n\n请给出你的观点和论据。`
    );
    history.push(`[A 第${i+1}轮] ${opinionA}`);

    // Agent B 反驳
    const opinionB = await agentB.chat(
      `问题：${question}\n\n历史讨论：\n${history.join("\n")}\n\n请分析对方观点的问题，给出你的看法。`
    );
    history.push(`[B 第${i+1}轮] ${opinionB}`);
  }

  // Judge 做最终判断
  const verdict = await judge.chat(
    `问题：${question}\n\n完整辩论记录：\n${history.join("\n")}\n\n请综合双方观点，给出最终结论。`
  );

  return verdict;
}
```

### 2.4 模式四：Autonomous Swarm（自主群组）

```
多个 Agent 共享一个工作空间，自主认领任务：

┌─────────────────────────────────────────┐
│            共享任务队列                    │
│  [任务1] [任务2] [任务3] [任务4] [任务5]   │
└──────┬──────────┬──────────┬────────────┘
       │          │          │
       ▼          ▼          ▼
  ┌─────────┐┌─────────┐┌─────────┐
  │ Agent A ││ Agent B ││ Agent C │
  │（前端专）││（后端专）││（测试专）│
  └─────────┘└─────────┘└─────────┘
       │          │          │
       └──────────┴──────────┘
                  ▼
           共享代码仓库
```

**特点**：
- 没有中央调度者，Agent 自主选择适合自己的任务
- 通过共享状态（任务队列、代码仓库）协调
- 适合：大规模并行任务，如代码生成、批量数据处理
- 缺点：协调复杂，容易冲突

---

## 3. Agent 间通信机制

多 Agent 协作的核心问题：**Agent 之间怎么传递信息？**

### 3.1 三种通信方式

```
方式一：消息传递（Message Passing）
┌────────┐  消息  ┌────────┐
│Agent A │ ───→  │Agent B │    Agent A 的输出直接作为 B 的输入
└────────┘       └────────┘

方式二：共享状态（Shared State）
┌────────┐         ┌────────┐
│Agent A │ ──写──→ │ 共享   │ ←──读── │Agent B │
└────────┘         │ 状态   │         └────────┘
                   └────────┘

方式三：事件驱动（Event-Driven）
┌────────┐  发布事件  ┌───────┐  订阅通知  ┌────────┐
│Agent A │ ────→    │ EventBus│  ────→    │Agent B │
└────────┘          └───────┘           └────────┘
```

### 3.2 实际选择建议

| 方式 | 适用场景 | 实现复杂度 |
|------|---------|----------|
| **消息传递** | Pipeline、Orchestrator-Worker | 低（函数参数传递即可） |
| **共享状态** | Swarm、需要频繁读写中间结果 | 中（需要状态管理器） |
| **事件驱动** | Agent 数量多、松耦合 | 高（需要消息队列） |

**大多数场景用消息传递就够了**。只有在 Agent 数量超过 5 个或需要动态增减 Agent 时，才考虑事件驱动。

---

## 4. 实现 Multi-Agent 的关键挑战

### 4.1 上下文传递

```
问题：Orchestrator 把任务派给 Worker 时，要传多少上下文？

方案 A：全量传递（把所有信息都给 Worker）
├── 优点：Worker 信息完整
├── 缺点：浪费 token，Worker 可能被无关信息干扰
└── 适合：子任务高度依赖全局上下文

方案 B：最小传递（只给 Worker 必要信息）
├── 优点：高效，Worker 专注
├── 缺点：Worker 可能缺少关键背景
└── 适合：子任务相对独立

方案 C：渐进传递（先给概要，Worker 按需索取详情）
├── 优点：平衡效率和完整性
├── 缺点：实现复杂
└── 适合：大型复杂任务
```

### 4.2 结果汇总

```
问题：多个 Worker 返回的结果格式不一致怎么办？

解决：在 Worker 的 system prompt 中明确定义输出格式

Worker Prompt 片段：
"""
请以以下 JSON 格式返回分析结果：
{
  "product": "产品名称",
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["劣势1", "劣势2"],
  "market_share": "市场份额",
  "summary": "一句话总结"
}
"""
```

### 4.3 错误处理

```
某个 Worker 失败了怎么办？

策略一：重试
└── Worker 返回错误 → Orchestrator 重新派发（最多 N 次）

策略二：降级
└── Worker 失败 → Orchestrator 用已有结果继续（跳过该部分）

策略三：替代
└── Worker A 失败 → 用 Worker B 尝试（不同策略的 Agent）

策略四：上报
└── Worker 失败 → 告知用户，请求人工介入
```

### 4.4 成本控制

```
多 Agent 的最大成本：token 消耗

单 Agent 处理一个任务：~2,000 tokens
3 个 Worker 并行：~2,000 × 3 + Orchestrator ~1,000 = ~7,000 tokens

优化策略：
1. Worker 用小模型（如 gpt-4o-mini），Orchestrator 用大模型（如 gpt-4o）
2. 限制 Worker 的输出长度
3. 只在任务真正可并行时才用多 Agent
4. 缓存 Worker 结果（相同子任务不重复执行）
```

---

## 5. 与 MCP 的关系

```
多 Agent 系统中，MCP 的位置：

┌──────────────────────────────────────────────┐
│              Multi-Agent System                │
│                                               │
│  Orchestrator ←→ Worker A ←→ Worker B         │
│       │              │            │            │
│       ▼              ▼            ▼            │
│  ┌─────────┐   ┌─────────┐  ┌─────────┐     │
│  │MCP Client│   │MCP Client│  │MCP Client│     │
│  └────┬─────┘   └────┬────┘  └────┬────┘     │
│       │              │            │            │
│       ▼              ▼            ▼            │
│  MCP Servers    MCP Servers   MCP Servers      │
└──────────────────────────────────────────────┘
```

- **MCP 是工具层**：每个 Agent 通过 MCP Client 连接工具
- **MCP 不是通信层**：Agent 之间的通信不在 MCP 的职责范围内
- Agent 间通信需要**另外的机制**（函数调用、消息队列、HTTP API 等）

---

## 6. 什么时候用多 Agent？

### 6.1 决策树

```
你的任务需要多 Agent 吗？

├── 任务可以拆成独立子任务？
│   ├── 是 → 子任务可以并行？
│   │   ├── 是 → ✅ Orchestrator-Worker（并行效率最高）
│   │   └── 否 → 子任务有先后顺序？
│   │       ├── 是 → ✅ Pipeline
│   │       └── 否 → 单 Agent + ReAct 就够了
│   └── 否 → 需要多角度评估？
│       ├── 是 → ✅ Debate
│       └── 否 → 单 Agent 就够了
└── 任务需要多种专业能力？
    ├── 是 → 能力差异大吗？
    │   ├── 是 → ✅ 多 Agent（不同 system prompt）
    │   └── 否 → 单 Agent + 多工具就够了
    └── 否 → 单 Agent 就够了
```

### 6.2 反模式：不要滥用多 Agent

```
❌ 错误用法：
"查个天气" → 派 Orchestrator → 派 Researcher Agent → 查天气 → 返回
（杀鸡用牛刀，一个 API 调用就够了）

✅ 正确用法：
"对比分析 5 个城市的天气、交通、酒店，推荐旅行目的地"
→ Orchestrator 拆分为 5 个城市 × 3 个维度 = 15 个子任务
→ 并行执行，汇总分析
```

---

## 7. 完整代码示例：Orchestrator-Worker

> 完整可运行代码见 `PART5-Agent/code/multi-agent-demo.ts`

```typescript
/**
 * Multi-Agent Demo: Orchestrator-Worker 模式
 *
 * 场景：对比分析多个产品的优缺点
 * Orchestrator: 拆分任务、汇总结果
 * Researcher Worker: 分析单个产品
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Worker: 分析单个产品
async function researcherWorker(product: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `分析 ${product} 的优缺点，以 JSON 格式返回：
{
  "product": "${product}",
  "pros": ["优势1", "优势2", "优势3"],
  "cons": ["劣势1", "劣势2"],
  "summary": "一句话总结"
}`
    }]
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return text;
}

// Orchestrator: 拆分任务、并行执行、汇总
async function orchestrator(products: string[]) {
  console.log(`[Orchestrator] 收到任务：分析 ${products.length} 个产品`);

  // 1. 并行派发给 Worker
  console.log(`[Orchestrator] 并行派发 ${products.length} 个 Worker...`);
  const results = await Promise.all(
    products.map(p => researcherWorker(p))
  );

  // 2. 汇总结果
  console.log(`[Orchestrator] 收集到所有结果，开始汇总...`);
  const summary = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `基于以下产品分析结果，写一份对比报告：

${results.join("\n\n")}

要求：
1. 列出每个产品的核心优劣势
2. 横向对比各产品
3. 给出推荐建议`
    }]
  });

  return summary.content[0].type === "text" ? summary.content[0].text : "";
}

// 运行
const products = ["Notion", "Obsidian", "Logseq"];
orchestrator(products).then(report => {
  console.log("\n===== 最终报告 =====\n");
  console.log(report);
});
```

---

## 小结

| 要点 | 内容 |
|------|------|
| **为什么** | 单 Agent 有上下文、分工、并行三大瓶颈 |
| **四种模式** | Orchestrator-Worker、Pipeline、Debate、Swarm |
| **通信方式** | 消息传递（最常用）、共享状态、事件驱动 |
| **关键挑战** | 上下文传递、结果汇总、错误处理、成本控制 |
| **与 MCP** | MCP 是工具层，不是 Agent 间通信层 |
| **何时用** | 任务可拆分、需要并行、需要多种专业能力时 |
