# Agent 框架生态

> 本章目标：了解当前主流 Agent 框架的设计哲学、核心差异和适用场景，能根据项目需求选择合适的框架。学完本章后，你应能画出各框架的架构对比图，并做出合理的选型决策。

---

## 1. 为什么需要了解框架？

### 1.1 自己造 vs 用框架

```
前几章我们学了：
├── Function Calling（怎么调工具）
├── ReAct（怎么推理）
├── Memory（怎么记东西）
├── Planning（怎么规划）
├── Reflection（怎么反思）
└── Multi-Agent（怎么协作）

这些都是"原材料"，自己组装可以工作，但需要处理：
├── 对话状态管理
├── 工具调用的错误处理和重试
├── 多轮对话的上下文维护
├── 并发和异步控制
├── 流式输出
├── 可观测性（调试 Agent 在干什么）
└── ...大量工程细节

框架帮你处理这些"胶水代码"，让你专注于业务逻辑。
```

### 1.2 框架不是必须的

```
什么时候用框架：
├── 快速原型验证（几天内跑通想法）
├── 需要复杂的状态管理（多步骤、有条件分支）
├── 需要可视化调试（看 Agent 的决策过程）
└── 团队协作（框架提供统一的代码结构）

什么时候自己写：
├── 需要极致控制（框架的抽象挡住了你需要的底层能力）
├── 性能敏感（框架的抽象层有额外开销）
├── 简单场景（一个 API 调用就能搞定的事）
└── 学习目的（理解原理比使用工具更重要）
```

---

## 2. 主流框架一览

### 2.1 全景图

```
Agent 框架生态（2024-2026）

├── 图模型驱动
│   ├── LangGraph（LangChain 出品）
│   └── AutoGen（微软出品）
│
├── 角色驱动
│   ├── CrewAI
│   └── MetaGPT
│
├── 原生 SDK
│   ├── OpenAI Agents SDK（OpenAI 官方）
│   └── Anthropic Claude SDK
│
├── 平台型
│   ├── Dify（开源 LLMOps 平台）
│   └── Coze（字节跳动）
│
└── 通用框架
    └── Semantic Kernel（微软）
```

---

## 3. 核心框架详解

### 3.1 LangGraph

```
设计哲学：把 Agent 看作一个"有状态的图"

┌──────────────────────────────────────────┐
│              LangGraph 架构               │
│                                           │
│   ┌──────┐    ┌──────┐    ┌──────┐      │
│   │ 节点A │ →  │ 节点B │ →  │ 节点C │      │
│   │(思考) │    │(工具) │    │(输出) │      │
│   └──┬───┘    └──┬───┘    └──────┘      │
│      │           │                        │
│      │    ┌──────┘                        │
│      ▼    ▼                               │
│   ┌──────────┐                           │
│   │ 条件边   │ → 根据结果决定走哪条路      │
│   └──────────┘                           │
│                                           │
│   核心概念：                               │
│   - State：共享状态对象                    │
│   - Node：处理函数                         │
│   - Edge：节点间的连接（普通/条件）         │
│   - Checkpoint：状态快照（支持暂停/恢复）   │
└──────────────────────────────────────────┘
```

**代码示例**：

```typescript
import { StateGraph, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

// 定义状态
const State = Annotation.Root({
  messages: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
  }),
  currentStep: Annotation<string>,
});

// 定义节点
async function think(state: typeof State.State) {
  const llm = new ChatOpenAI({ model: "gpt-4o" });
  const response = await llm.invoke(state.messages);
  return { messages: [response.content], currentStep: "think" };
}

async function useTool(state: typeof State.State) {
  // 执行工具调用
  const result = await executeTool(state.currentTool);
  return { messages: [result], currentStep: "tool" };
}

// 条件路由
function shouldContinue(state: typeof State.State) {
  return state.needsTool ? "tool" : "end";
}

// 构建图
const graph = new StateGraph(State)
  .addNode("think", think)
  .addNode("tool", useTool)
  .addEdge("think", shouldContinue)   // 条件边
  .addEdge("tool", "think")           // 工具结果回到思考
  .addEdge("think", "end")            // 不需要工具时结束
  .compile();
```

**特点**：
- ✅ 可视化调试（图结构天然可以画出来）
- ✅ 状态持久化（Checkpoint 支持暂停/恢复/回溯）
- ✅ 灵活的控制流（条件分支、循环、并行）
- ❌ 学习曲线较陡（图模型概念需要适应）
- ❌ 依赖 LangChain 生态

---

### 3.2 CrewAI

```
设计哲学：把 Agent 看作一个"团队成员"

┌──────────────────────────────────────────┐
│              CrewAI 架构                  │
│                                           │
│   ┌──────────────────────────────┐       │
│   │           Crew               │       │
│   │         （团队）              │       │
│   │                              │       │
│   │  ┌────────┐  ┌────────┐    │       │
│   │  │ Agent 1│  │ Agent 2│    │       │
│   │  │研究员   │  │写作者   │    │       │
│   │  │Role:xx │  │Role:xx │    │       │
│   │  │Goal:xx │  │Goal:xx │    │       │
│   │  │Tools:[]│  │Tools:[]│    │       │
│   │  └────────┘  └────────┘    │       │
│   │                              │       │
│   │  ┌────────┐  ┌────────┐    │       │
│   │  │ Task 1 │  │ Task 2 │    │       │
│   │  │描述     │  │描述     │    │       │
│   │  │Agent:1 │  │Agent:2 │    │       │
│   │  └────────┘  └────────┘    │       │
│   └──────────────────────────────┘       │
│                                           │
│   核心概念：                               │
│   - Agent：有角色、目标、背景的 AI 角色    │
│   - Task：具体任务，分配给某个 Agent       │
│   - Crew：Agent + Task 的组合，执行流程    │
│   - Process：sequential（串行）或          │
│              hierarchical（分层）          │
└──────────────────────────────────────────┘
```

**代码示例**：

```typescript
import { Agent, Task, Crew } from "crewai";

// 定义 Agent
const researcher = new Agent({
  role: "市场研究员",
  goal: "深入分析目标市场的竞争格局和用户需求",
  backstory: "你是一位有 10 年经验的市场分析师，擅长数据驱动的洞察",
  tools: [searchTool, webScraperTool],
});

const writer = new Agent({
  role: "报告撰写专家",
  goal: "将研究结果转化为清晰、有说服力的报告",
  backstory: "你是一位资深商业写手，擅长将复杂数据转化为易懂的叙述",
});

// 定义 Task
const researchTask = new Task({
  description: "分析 AI Agent 框架市场的竞争格局",
  expectedOutput: "包含市场规模、主要玩家、趋势的结构化分析",
  agent: researcher,
});

const reportTask = new Task({
  description: "基于研究结果撰写市场调研报告",
  expectedOutput: "一份 2000 字的专业市场报告",
  agent: writer,
  context: [researchTask],  // 依赖研究任务的结果
});

// 组建 Crew 并执行
const crew = new Crew({
  agents: [researcher, writer],
  tasks: [researchTask, reportTask],
  process: "sequential",  // 串行执行
});

const result = await crew.kickoff();
```

**特点**：
- ✅ 概念直觉（角色、任务、团队 — 非技术人员也能理解）
- ✅ 上手快（定义 Agent 和 Task 就能跑）
- ✅ 内置委派机制（Agent 可以把子任务委派给其他 Agent）
- ❌ 灵活度有限（复杂的条件分支不好表达）
- ❌ 调试困难（不如 LangGraph 的图可视化）

---

### 3.3 OpenAI Agents SDK

```
设计哲学：最小抽象，贴近原生 API

┌──────────────────────────────────────────┐
│          OpenAI Agents SDK 架构           │
│                                           │
│   ┌──────────────────────────────┐       │
│   │          Agent               │       │
│   │   - instructions（system prompt）    │
│   │   - tools（工具列表）         │       │
│   │   - handoffs（委派目标）      │       │
│   └──────────┬───────────────────┘       │
│              │                            │
│              ▼                            │
│   ┌──────────────────────────────┐       │
│   │        Runner                 │       │
│   │   - run() / run_sync()       │       │
│   │   - 自动处理 tool calls      │       │
│   │   - 自动处理 handoffs        │       │
│   │   - 内置 guardrails          │       │
│   └──────────────────────────────┘       │
│                                           │
│   核心概念：                               │
│   - Agent：定义 + instructions + tools    │
│   - Runner：执行引擎                      │
│   - Handoff：Agent 之间的委派             │
│   - Guardrail：输入/输出校验              │
│   - Tracing：内置的执行追踪               │
└──────────────────────────────────────────┘
```

**代码示例**：

```typescript
import { Agent, Runner, tool } from "@openai/agents";
import { z } from "zod";

// 定义工具
const weatherTool = tool({
  name: "get_weather",
  description: "获取指定城市的天气",
  parameters: z.object({
    city: z.string().describe("城市名称"),
  }),
  execute: async ({ city }) => {
    return `${city}：晴，25°C`;
  },
});

// 定义 Agent
const agent = new Agent({
  name: "助手",
  instructions: "你是一个 helpful 的天气助手",
  tools: [weatherTool],
});

// 执行
const result = await Runner.run(agent, "北京天气怎么样？");
console.log(result.finalOutput);
```

**特点**：
- ✅ 最接近原生 Function Calling（概念少，学习成本低）
- ✅ 内置 Tracing（OpenAI Dashboard 可以看执行过程）
- ✅ 内置 Guardrails（输入输出校验）
- ✅ Handoff 机制简洁（Agent 之间委派只需要一行配置）
- ❌ 绑定 OpenAI 模型（不能用 Claude、Gemini 等）
- ❌ 功能相对基础（复杂场景需要自己扩展）

---

### 3.4 AutoGen（微软）

```
设计哲学：以对话为中心的多 Agent 协作

┌──────────────────────────────────────────┐
│              AutoGen 架构                 │
│                                           │
│   ┌────────┐   对话   ┌────────┐        │
│   │Agent A │ ←──────→ │Agent B │        │
│   │(助手)   │          │(代码)   │        │
│   └────┬───┘          └────┬───┘        │
│        │                    │             │
│        └────────┬───────────┘             │
│                 ▼                          │
│          ┌──────────┐                    │
│          │ GroupChat │ 多 Agent 群聊       │
│          │ Manager   │ 控制发言顺序        │
│          └──────────┘                    │
│                                           │
│   核心概念：                               │
│   - ConversableAgent：可以对话的 Agent    │
│   - GroupChat：多 Agent 对话管理          │
│   - HumanProxy：人类参与对话的接口        │
│   - Code Executor：安全执行代码的沙箱     │
└──────────────────────────────────────────┘
```

**特点**：
- ✅ 多 Agent 对话管理成熟（GroupChat 是强项）
- ✅ 内置代码执行沙箱（安全运行 Agent 生成的代码）
- ✅ 支持人类参与（HumanProxy 让人类加入 Agent 对话）
- ❌ 概念较重（ConversableAgent、GroupChat、Speaker Selection...）
- ❌ v0.2 和 v0.4 API 差异大，文档混乱

---

## 4. 框架对比

### 4.1 一表对比

| 维度 | LangGraph | CrewAI | OpenAI SDK | AutoGen |
|------|-----------|--------|------------|---------|
| **设计哲学** | 有状态图 | 团队协作 | 最小抽象 | 对话驱动 |
| **学习曲线** | 陡峭 | 平缓 | 平缓 | 中等 |
| **控制流** | 极灵活（图） | 有限（串行/分层） | 中等（handoff） | 灵活（对话轮转） |
| **多 Agent** | ✅ 原生支持 | ✅ 核心特性 | ✅ Handoff | ✅ 核心特性 |
| **状态管理** | ✅ Checkpoint | ❌ 基础 | ❌ 基础 | ❌ 基础 |
| **可视化** | ✅ 图可视化 | ❌ | ✅ Tracing | ❌ |
| **模型绑定** | 无（多模型） | 无（多模型） | OpenAI only | 无（多模型） |
| **适合场景** | 复杂工作流 | 快速搭建团队 | OpenAI 生态 | 多 Agent 对话 |

### 4.2 选型决策树

```
你的项目需要什么？

├── 快速验证想法，1-2 天出原型
│   └── ✅ CrewAI（概念直觉，上手快）
│
├── 只用 OpenAI 模型，想要最简方案
│   └── ✅ OpenAI Agents SDK（官方支持，最小抽象）
│
├── 复杂工作流，有条件分支、循环、暂停恢复
│   └── ✅ LangGraph（图模型最灵活）
│
├── 多 Agent 对话，需要人类参与
│   └── ✅ AutoGen（对话管理最成熟）
│
├── 需要精细控制，不想被框架束缚
│   └── ✅ 自己写（用原生 SDK + Function Calling）
│
└── 不确定
    └── 先用 CrewAI 验证想法，需要更多控制时迁移到 LangGraph
```

---

## 5. 框架之外：平台型方案

```
如果你不想写代码：

┌──────────────────────────────────────────────┐
│                平台型方案                      │
│                                               │
│  Dify（开源）                                  │
│  ├── 可视化拖拽编排 Agent                      │
│  ├── 内置 RAG、工具集成                        │
│  ├── 支持自定义代码节点                        │
│  └── 适合：快速搭建 AI 应用，不想写代码        │
│                                               │
│  Coze（字节跳动）                              │
│  ├── 可视化 Bot 搭建                          │
│  ├── 丰富的插件市场                            │
│  ├── 一键发布到飞书/微信/Discord               │
│  └── 适合：非技术用户，快速上线 Bot            │
│                                               │
│  LangFlow（LangChain 出品）                   │
│  ├── LangGraph 的可视化版本                    │
│  ├── 拖拽节点构建图                            │
│  └── 适合：LangGraph 用户，想要可视化调试      │
└──────────────────────────────────────────────┘
```

---

## 6. 不依赖框架的核心能力

```
无论用不用框架，这些能力都是必须的：

1. Function Calling 理解
   └── 知道 LLM 是怎么"调用"工具的

2. Prompt 设计
   └── 框架不能帮你写好 prompt

3. 系统架构能力
   └── 知道什么时候用单 Agent、什么时候用多 Agent

4. 错误处理
   └── 工具调用失败、LLM 输出异常、网络超时...

5. 评估能力
   └── 怎么判断 Agent 的输出质量

框架帮你处理的是：状态管理、并发控制、日志追踪、工具注册等工程细节。
但 Agent 的"智能"取决于你的 prompt 和架构设计，不取决于框架。
```

---

## 小结

| 要点 | 内容 |
|------|------|
| **框架不是必须的** | 简单场景自己写，复杂场景用框架 |
| **LangGraph** | 图模型，最灵活，适合复杂工作流 |
| **CrewAI** | 角色驱动，最直觉，适合快速原型 |
| **OpenAI SDK** | 最小抽象，绑定 OpenAI，适合纯 OpenAI 生态 |
| **AutoGen** | 对话驱动，适合多 Agent 对话 + 人类参与 |
| **选型原则** | 快速原型用 CrewAI，复杂流程用 LangGraph，不确定就先简单后迁移 |
