# Planning 机制

> 本章目标：理解 Agent 如何将复杂目标拆解为可执行的步骤，掌握 Plan-and-Execute 模式与 ReAct 的区别，以及动态重规划策略。学完本章后，你应能为 Agent 实现规划能力。

---

## 1. 为什么 Agent 需要 Planning？

### 1.1 ReAct 的隐含假设

上一章学了 ReAct 模式：思考 → 行动 → 观察 → 循环。看起来很完美，但它有一个隐含假设：

```
ReAct 假设：Agent 能在每一步做出正确的"下一步"决策。

实际问题：

User: "帮我把项目从 JavaScript 迁移到 TypeScript"

ReAct 的做法（逐反应式）：
Step 1: 思考 → "先看看项目结构" → 观察 → 看到了 package.json
Step 2: 思考 → "先装 TypeScript" → 观察 → 装好了
Step 3: 思考 → "改个文件试试" → 观察 → 报错了
Step 4: 思考 → "修一下报错" → 观察 → 又报错了
Step 5: 思考 → "再修" → 观察 → 还是报错
...（陷入局部修复，没有全局视野）
```

**ReAct 的问题：走一步看一步，缺乏全局规划。**

就像你去一个陌生城市，ReAct 是"每到一个路口就问路"，而 Planning 是"先查好完整路线再出发"。

### 1.2 有规划 vs 没规划

```
没有规划的 Agent（纯 ReAct）：
├── 能处理简单任务（1-3 步）
├── 复杂任务容易"迷路"
├── 不知道已经完成了多少，还剩多少
└── 容易重复劳动（做了 A 又撤销 A）

有规划的 Agent（Planning + ReAct）：
├── 先制定全局计划
├── 按计划逐步执行
├── 随时知道进度（完成了几步 / 总共几步）
└── 计划失败时能动态调整
```

---

## 2. Plan-and-Execute 模式

### 2.1 核心思想

```
Plan-and-Execute = 先规划，后执行

┌──────────────────────────────────────────────────────┐
│                    Plan-and-Execute                   │
│                                                       │
│   ┌──────────────┐                                   │
│   │   Planner    │  ← 用大模型制定全局计划            │
│   │ （规划 Agent）│                                   │
│   └──────┬───────┘                                   │
│          │ 输出：[Step1, Step2, Step3, ...]           │
│          ▼                                           │
│   ┌──────────────┐                                   │
│   │  Executor    │  ← 逐步执行，每步可以用 ReAct     │
│   │ （执行 Agent）│                                   │
│   └──────┬───────┘                                   │
│          │ 执行结果                                   │
│          ▼                                           │
│   ┌──────────────┐                                   │
│   │  Replanner   │  ← 检查是否需要调整计划            │
│   │ （重规划）     │                                   │
│   └──────────────┘                                   │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### 2.2 三阶段详解

**阶段一：Planning（规划）**

```
输入：用户的高层目标
输出：有序的步骤列表

User: "把项目从 JS 迁移到 TS"

Planner 输出：
[
  "1. 分析项目结构，统计所有 .js 文件和依赖",
  "2. 安装 TypeScript 及相关类型包",
  "3. 创建 tsconfig.json 配置文件",
  "4. 将入口文件从 .js 改为 .ts，解决编译错误",
  "5. 逐个迁移其他文件",
  "6. 更新构建脚本和 CI 配置",
  "7. 运行完整测试验证"
]
```

**阶段二：Execute（执行）**

```
按计划逐步执行，每一步本身可以用 ReAct 循环：

Step 1: 分析项目结构
  └── ReAct 循环：
      ├── 思考：需要列出所有 JS 文件
      ├── 行动：find . -name "*.js"
      ├── 观察：找到了 47 个文件
      ├── 思考：还需要看 package.json 的依赖
      ├── 行动：cat package.json
      └── 观察：有 12 个依赖，3 个需要类型包

Step 2: 安装 TypeScript
  └── ReAct 循环：
      ├── 思考：需要安装 typescript 和类型包
      ├── 行动：npm install -D typescript @types/node ...
      └── 观察：安装成功

...（逐步推进）
```

**阶段三：Replanning（重规划）**

```
执行过程中发现问题，需要调整计划：

执行 Step 5: 迁移 utils.js
  └── 发现：utils.js 依赖了一个没有类型的第三方库
  └── Replanner 判断：需要在 Step 5 之前插入新步骤

调整后的计划：
[
  ...之前的步骤...,
  "5a. 为无类型库创建 .d.ts 声明文件",  ← 新增
  "5b. 迁移 utils.js",
  ...之后的步骤...
]
```

---

## 3. 代码实现

### 3.1 最小 Plan-and-Execute 实现

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

interface Plan {
  goal: string;
  steps: string[];
  currentStep: number;
  results: string[];
}

// 阶段一：规划
async function plan(goal: string): Promise<string[]> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `你是一个任务规划专家。请将以下目标拆解为具体的执行步骤。

目标：${goal}

要求：
1. 每个步骤应该是独立可执行的
2. 步骤之间有合理的先后顺序
3. 步骤数量在 3-8 个之间
4. 每个步骤描述要具体，不能模糊

请以 JSON 数组格式返回步骤列表：
["步骤1描述", "步骤2描述", ...]`
    }]
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(text);
}

// 阶段二：执行单个步骤
async function executeStep(step: string, context: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `你是一个任务执行专家。

当前任务：${step}

上下文：
${context}

请执行这个任务并返回结果。如果任务无法完成，说明原因。`
    }]
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

// 阶段三：重规划检查
async function replan(plan: Plan): Promise<string[] | null> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `你是一个计划审查专家。

原始目标：${plan.goal}

当前计划和执行情况：
${plan.steps.map((s, i) => {
  const status = i < plan.currentStep ? "✅ 已完成" : i === plan.currentStep ? "🔄 进行中" : "⏳ 待执行";
  const result = i < plan.results.length ? `\n   结果：${plan.results[i]}` : "";
  return `${i + 1}. ${s} [${status}]${result}`;
}).join("\n")}

请判断：
1. 当前计划是否需要调整？
2. 如果需要，返回调整后的完整步骤列表
3. 如果不需要，返回 null

请以 JSON 格式返回：
{"needs_replan": true/false, "new_steps": [...]}`
    }]
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const result = JSON.parse(text);
  return result.needs_replan ? result.new_steps : null;
}

// 主流程
async function planAndExecute(goal: string) {
  console.log(`🎯 目标：${goal}\n`);

  // 1. 制定计划
  const steps = await plan(goal);
  console.log("📋 计划：");
  steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  console.log();

  const planState: Plan = {
    goal,
    steps,
    currentStep: 0,
    results: []
  };

  // 2. 逐步执行
  while (planState.currentStep < planState.steps.length) {
    const step = planState.steps[planState.currentStep];
    console.log(`\n🔄 执行步骤 ${planState.currentStep + 1}: ${step}`);

    const context = planState.results.length > 0
      ? `之前的执行结果：\n${planState.results.map((r, i) => `步骤${i + 1}: ${r}`).join("\n")}`
      : "这是第一个步骤。";

    const result = await executeStep(step, context);
    planState.results.push(result);
    console.log(`✅ 完成：${result.substring(0, 100)}...`);

    // 3. 检查是否需要重规划
    const newSteps = await replan(planState);
    if (newSteps) {
      console.log("\n⚠️ 计划需要调整！");
      planState.steps = newSteps;
      console.log("📋 新计划：");
      newSteps.forEach((s, i) => {
        const done = i < planState.currentStep ? "✅" : "⏳";
        console.log(`  ${done} ${i + 1}. ${s}`);
      });
    }

    planState.currentStep++;
  }

  console.log("\n🎉 所有步骤执行完毕！");
}

// 运行
planAndExecute("分析当前目录的代码质量并生成改进建议报告");
```

### 3.2 Plan 的 Prompt 设计技巧

```
好的 Plan Prompt 要素：

1. 角色定义
   "你是一个任务规划专家"

2. 约束条件
   - 步骤数量范围（3-8 步）
   - 每步要具体可执行
   - 步骤间要有逻辑顺序

3. 输出格式
   明确要求 JSON 数组，方便解析

4. 示例（可选但推荐）
   "例如：['列出所有文件', '分析代码风格', '生成报告']"

---

常见错误：Prompt 太模糊

❌ "把任务拆成几步"
→ LLM 可能返回：["准备工作", "开始做", "完成"]
→ 太模糊，执行时没法操作

✅ "将目标拆解为 3-8 个具体步骤，每个步骤必须包含明确的动词和对象"
→ ["分析 package.json 中的依赖列表", "为每个依赖检查是否有 @types 包"]
→ 具体，可执行
```

---

## 4. ReAct vs Plan-and-Execute

```
                    ReAct              Plan-and-Execute
                    ─────              ────────────────
决策时机             每一步临时决策       先全局规划再执行

适用任务             简单、步骤少         复杂、步骤多

上下文需求           只看当前状态         需要全局视野

容错方式             走错了再试           计划失败时重规划

token 消耗           较低               较高（规划+执行+检查）

类比                GPS 实时导航         出发前查好路线
```

### 选择建议

```
用 ReAct：
├── 任务步骤 ≤ 3
├── 不确定性高，需要灵活应变
├── 每步结果决定下一步方向
└── 例子："搜索这个 API 的文档并总结"

用 Plan-and-Execute：
├── 任务步骤 ≥ 4
├── 有明确的阶段性目标
├── 需要并行执行某些步骤
└── 例子："重构这个模块的代码架构"

混合模式（最实用）：
├── Planner 制定全局计划
├── Executor 用 ReAct 执行每一步
└── Replanner 在需要时调整计划
```

---

## 5. 动态重规划策略

### 5.1 什么时候需要重规划？

```
触发重规划的信号：

1. 执行失败
   └── 步骤执行报错，当前方法走不通

2. 发现新信息
   └── 执行过程中发现之前不知道的约束或依赖

3. 预期外的结果
   └── 结果和计划假设不符（比如文件比预想的多 10 倍）

4. 外部条件变化
   └── 用户中途改需求、API 限流、服务不可用
```

### 5.2 重规划策略

```
策略一：最小调整（推荐）
├── 只修改当前步骤之后的计划
├── 保留已完成步骤的结果
└── 适合：大部分场景

策略二：回退重来
├── 从某个检查点重新开始
├── 丢弃之后的所有结果
└── 适合：发现前面步骤有根本性错误

策略三：分支探索
├── 保留原计划，同时尝试新方案
├── 最终选择效果更好的分支
└── 适合：不确定性高的任务（代价是 token 翻倍）
```

### 5.3 重规划的 Prompt 设计

```
重规划 Prompt 要素：

1. 明确告诉 LLM 哪些步骤已完成、结果是什么
2. 说明触发重规划的原因（失败？新信息？）
3. 约束：已完成的步骤不要动，只调整后面的
4. 要求输出完整的调整后计划（不是只输出差异）

示例：
"""
目标：将项目迁移到 TypeScript

原计划和执行情况：
1. ✅ 分析项目结构 → 找到 47 个 JS 文件
2. ✅ 安装 TypeScript → 安装成功
3. 🔄 创建 tsconfig.json → 发现项目用了 Babel，需要额外配置
4. ⏳ 迁移入口文件
5. ⏳ 迁移其他文件

由于步骤 3 发现了 Babel 依赖，需要调整计划。
请输出调整后的完整计划，已完成的步骤保留不变。
"""
```

---

## 6. Planning 与 Memory 的协作

```
Planning 需要 Memory 的支持：

┌──────────────────────────────────────────────┐
│                Agent 系统                      │
│                                               │
│   ┌─────────┐      ┌─────────┐              │
│   │ Planner │ ←──→ │ Memory  │              │
│   └────┬────┘      └─────────┘              │
│        │                                      │
│        │  规划时参考：                         │
│        │  - 过往类似任务的计划                  │
│        │  - 已知的工具能力和限制                │
│        │  - 用户偏好                          │
│        │                                      │
│        ▼                                      │
│   ┌──────────────┐                           │
│   │   Executor   │ 执行时记录：               │
│   │  （ReAct 循环）│ - 每步结果写入 Memory     │
│   └──────────────┘  - 失败原因写入 Memory     │
│                      - 重规划决策写入 Memory    │
└──────────────────────────────────────────────┘
```

**Memory 在 Planning 中的作用**：

| Memory 类型 | Planning 中的用途 |
|------------|-----------------|
| **短期记忆** | 当前计划的执行状态（完成了几步、中间结果） |
| **长期记忆** | 过往类似任务的成功/失败经验，用于改进新计划 |
| **工作记忆** | 当前步骤需要的上下文（文件列表、API 返回值等） |

```
例子：有了 Memory 的 Planner

第一次任务："分析项目代码质量"
→ 制定了 5 步计划，第 3 步发现要先装 eslint（计划外）

第二次任务："分析另一个项目代码质量"
→ Planner 从 Memory 中找到上次经验
→ 新计划自动包含"安装 eslint"这一步
→ 不需要重规划，一次走通
```

---

## 7. 高级模式：Hierarchical Planning（分层规划）

```
复杂任务需要多层规划：

User: "开发一个完整的博客系统"

第一层：高层规划（Planner A）
├── 1. 设计数据库 schema
├── 2. 实现后端 API
├── 3. 实现前端页面
├── 4. 集成测试
└── 5. 部署

第二层：子任务规划（每个步骤的 Planner）
├── Step 1 → Planner B1：
│   ├── 1.1 分析需求，确定数据实体
│   ├── 1.2 设计 ER 图
│   ├── 1.3 编写 migration 文件
│   └── 1.4 运行 migration 验证
│
├── Step 2 → Planner B2：
│   ├── 2.1 设计 API 路由
│   ├── 2.2 实现用户认证
│   ├── 2.3 实现 CRUD 接口
│   └── 2.4 编写 API 测试
│
└── ...（每层都可以再细分）

第三层：执行（Executor，用 ReAct）
```

**与 Multi-Agent 的结合**：

```
分层规划天然适合 Orchestrator-Worker 模式：

Orchestrator = 高层 Planner（拆大任务）
Worker = 低层 Planner + Executor（规划并执行子任务）

┌─────────────────────────────────────┐
│         Orchestrator                 │
│    "开发博客系统" → [5个大步骤]       │
└──────────┬──────────────────────────┘
           │
     ┌─────┴─────┐─────┬─────┐
     ▼           ▼     ▼     ▼
  Worker 1   Worker 2  ...  Worker 5
  "设计DB"   "实现API"
  ├── 子计划  ├── 子计划
  └── 执行    └── 执行
```

---

## 小结

| 要点 | 内容 |
|------|------|
| **为什么** | ReAct 走一步看一步，复杂任务需要全局视野 |
| **核心模式** | Plan-and-Execute：规划 → 执行 → 重规划 |
| **与 ReAct** | 不是替代关系，是组合使用（规划用 Plan，执行用 ReAct） |
| **重规划** | 失败/新信息/预期外结果时触发，最小调整为首选策略 |
| **与 Memory** | 规划时参考经验，执行时记录结果，形成正循环 |
| **高级** | 分层规划适合超大任务，天然搭配 Multi-Agent |
