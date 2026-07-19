# Agent 架构设计

> 本章目标：理解 AI Agent 的核心概念、架构设计、以及与 MCP 的关系。学完本章后，你应能设计自己的 Agent 系统架构。

---

## 1. Agent 是什么？

### 1.1 从聊天机器人到 Agent

```
聊天机器人：
User: "北京天气如何？" → AI: "北京今天晴，25°C" → User: "谢谢"

Agent：
User: "帮我订下周去上海的机票" → Agent → 自动完成：
    1. 查日历确认下周日期
    2. 搜索机票
    3. 比较价格
    4. 确认并下单
    5. 发送确认邮件
→ User: (收到订票成功的邮件)
```

**Agent 的核心特征**：
- **自主规划**：理解目标，规划步骤
- **工具使用**：调用外部工具获取信息、执行动作
- **多步执行**：一个请求可能需要多步操作
- **状态维护**：记住之前的上下文

### 1.2 MCP 在 Agent 系统中的位置

```
┌─────────────────────────────────────────────────────────────────┐
│                       AI Agent 系统                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Agent Core                            │   │
│  │                                                          │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐          │   │
│  │   │Planning │    │ Memory  │    │Reasoning│          │   │
│  │   │  模块   │    │  模块   │    │  模块   │          │   │
│  │   └─────────┘    └─────────┘    └─────────┘          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    MCP Client                             │   │
│  │         （连接外部 MCP Servers，获取工具能力）              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    MCP Servers                            │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐          │   │
│  │   │ Weather │    │  GitHub │    │  Email  │          │   │
│  │   │ Server  │    │  Server │    │  Server │          │   │
│  │   └─────────┘    └─────────┘    └─────────┘          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Agent 的核心能力

| 能力 | 说明 | 实现方式 |
|------|------|---------|
| **理解意图** | 理解用户的真实目标 | LLM 语义理解 |
| **规划步骤** | 将目标分解为可执行的步骤 | ReAct / CoT |
| **调用工具** | 使用工具完成具体任务 | MCP Client |
| **记忆上下文** | 记住之前的对话和状态 | Memory System |
| **生成回复** | 将结果以自然语言返回 | LLM 生成 |

---

## 2. Agent 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       Agent 整体架构                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    输入层 (Input Layer)                  │   │
│  │                                                          │   │
│  │   ┌─────────┐  ┌─────────┐  ┌─────────┐               │   │
│  │   │  用户   │  │ 系统事件 │  │ 工具回调 │               │   │
│  │   │  输入   │  │         │  │         │               │   │
│  │   └────┬────┘  └────┬────┘  └────┬────┘               │   │
│  │        │              │              │                      │   │
│  │        └──────────────┼──────────────┘                      │   │
│  │                       ▼                                       │   │
│  └───────────────────────┼───────────────────────────────────────┘   │
│                          ▼                                           │
│  ┌───────────────────────┼───────────────────────────────────────┐ │
│  │                  理解层 (Understanding)                         │ │
│  │                                                              │ │
│  │   ┌─────────┐  ┌─────────┐  ┌─────────┐                    │ │
│  │   │ Intent  │  │ Entity │  │ Context │                    │ │
│  │   │ 解析   │  │ 提取   │  │ 构建    │                    │ │
│  │   └─────────┘  └─────────┘  └─────────┘                    │ │
│  │                       │                                       │ │
│  │                       └───────────────┐                       │ │
│  └──────────────────────────────────────┼───────────────────────┘ │
│                                         ▼                        │
│  ┌──────────────────────────────────────┼───────────────────────┐ │
│  │                    决策层 (Decision)                          │ │
│  │                                                              │ │
│  │   ┌─────────┐  ┌─────────┐  ┌─────────┐                    │ │
│  │   │ Planning │  │ Memory  │  │Routing  │                    │ │
│  │   │  规划   │  │ 记忆   │  │ 路由   │                    │ │
│  │   └─────────┘  └─────────┘  └─────────┘                    │ │
│  │                       │                                       │ │
│  │                       └───────────────┐                       │ │
│  └──────────────────────────────────────┼───────────────────────┘ │
│                                         ▼                        │
│  ┌──────────────────────────────────────┼───────────────────────┐ │
│  │                    执行层 (Execution)                         │ │
│  │                                                              │ │
│  │   ┌─────────┐  ┌─────────┐  ┌─────────┐                    │ │
│  │   │  Tool   │  │ Skill  │  │ Response│                    │ │
│  │   │  Executor│  │ Loader │  │ Builder │                    │ │
│  │   └─────────┘  └─────────┘  └─────────┘                    │ │
│  │                       │                                       │ │
│  └───────────────────────┼───────────────────────────────────────┘ │
│                          ▼                                          │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    输出层 (Output Layer)                         │ │
│  │                                                               │ │
│  │   ┌─────────┐  ┌─────────┐  ┌─────────┐                      │ │
│  │   │ 流式输出 │  │  结构化  │  │  状态   │                      │ │
│  │   │         │  │  回复   │  │  更新   │                      │ │
│  │   └─────────┘  └─────────┘  └─────────┘                      │ │
│  │                                                              │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件职责

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **Intent Parser** | 理解用户意图 | 用户消息 | 意图类型 + 参数 |
| **Context Builder** | 构建对话上下文 | 历史消息 + 记忆 | 完整上下文 |
| **Planner** | 规划执行步骤 | 意图 | 步骤列表 |
| **Tool Executor** | 调用外部工具 | 工具名 + 参数 | 工具结果 |
| **Skill Loader** | 加载领域技能 | 技能名 | 技能提示词 |
| **Memory Manager** | 管理记忆 | 新信息 | 检索结果 |
| **Response Builder** | 生成最终回复 | 所有中间结果 | 最终回复 |

---

## 3. 消息处理流程

### 3.1 完整流程

```
┌──────────────────────────────────────────────────────────────────┐
│                      Agent 消息处理完整流程                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. 接收输入                                                     │
│     User: "帮我查一下北京明天会不会下雨"                            │
│                                                                   │
│  2. 理解意图                                                     │
│     ┌─────────────────────────────────────────┐                  │
│     │ Intent: weather_query                    │                  │
│     │ Entities: { city: "北京", time: "明天" } │                  │
│     └─────────────────────────────────────────┘                  │
│                                                                   │
│  3. 规划步骤                                                     │
│     ┌─────────────────────────────────────────┐                  │
│     │ Plan:                                    │                  │
│     │   1. call_tool(get_forecast, city=北京)│                  │
│     │   2. analyze(result) 判断是否下雨         │                  │
│     │   3. generate_response                   │                  │
│     └─────────────────────────────────────────┘                  │
│                                                                   │
│  4. 执行步骤                                                     │
│     ┌─────────────────────────────────────────┐                  │
│     │ Tool Executor → MCP → Weather Server    │                  │
│     │ Weather Server → 明天北京有雨             │                  │
│     └─────────────────────────────────────────┘                  │
│                                                                   │
│  5. 生成回复                                                     │
│     ┌─────────────────────────────────────────┐                  │
│     │ 北京明天有小雨，记得带伞出门哦！🌂         │                  │
│     └─────────────────────────────────────────┘                  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 代码层面的流程

```typescript
// agent.ts

class Agent {
  private intentParser: IntentParser;
  private contextBuilder: ContextBuilder;
  private planner: Planner;
  private memoryManager: MemoryManager;
  private toolExecutor: ToolExecutor;
  private skillLoader: SkillLoader;
  private responseBuilder: ResponseBuilder;

  /**
   * 处理用户消息
   */
  async process(input: UserInput): Promise<AgentOutput> {
    // 1. 理解意图
    const intent = await this.intentParser.parse(input);

    // 2. 构建上下文
    const context = await this.contextBuilder.build(intent);

    // 3. 规划步骤
    const plan = await this.planner.createPlan(intent, context);

    // 4. 执行计划
    const executionResult = await this.executePlan(plan, context);

    // 5. 生成回复
    const response = await this.responseBuilder.build(
      intent,
      executionResult,
      context
    );

    // 6. 保存到记忆
    await this.memoryManager.add({
      type: "conversation",
      userInput: input,
      response,
      intent,
      plan
    });

    return response;
  }

  /**
   * 执行计划
   */
  private async executePlan(
    plan: Plan,
    context: Context
  ): Promise<ExecutionResult> {
    const results: StepResult[] = [];

    for (const step of plan.steps) {
      switch (step.type) {
        case "tool_call":
          // 调用工具
          const toolResult = await this.toolExecutor.execute(
            step.tool,
            step.params
          );
          results.push({ step, result: toolResult, success: true });
          break;

        case "skill_use":
          // 加载并使用技能
          const skill = await this.skillLoader.load(step.skill);
          const skillResult = await this.executeWithSkill(step, skill);
          results.push({ step, result: skillResult, success: true });
          break;

        case "reasoning":
          // LLM 推理
          const reasoning = await this.reasoning(step.prompt, context);
          results.push({ step, result: reasoning, success: true });
          break;

        case "respond":
          // 直接回复（最终步骤）
          return { stepResults: results, finalResponse: step.content };
      }
    }

    return { stepResults: results, finalResponse: null };
  }
}
```

---

## 4. 核心组件详解

### 4.1 Intent Parser（意图解析）

```typescript
// intent-parser.ts

interface Intent {
  type: string;
  confidence: number;
  entities: Record<string, unknown>;
  originalInput: string;
}

class IntentParser {
  constructor(private llm: LLMInterface) {}

  async parse(input: UserInput): Promise<Intent> {
    // 使用 LLM 解析意图
    const prompt = `
用户输入: "${input.text}"

请分析这个输入，返回 JSON 格式的意图：
{
  "type": "意图类型",
  "confidence": 0.0-1.0,
  "entities": { "实体": "值" },
  "reasoning": "分析理由"
}

意图类型包括：
- weather_query: 天气查询
- code_review: 代码审查
- travel_planning: 旅行规划
- data_analysis: 数据分析
- general_conversation: 一般对话
`;

    const response = await this.llm.complete(prompt);
    const parsed = JSON.parse(response);

    return {
      type: parsed.type,
      confidence: parsed.confidence,
      entities: parsed.entities || {},
      originalInput: input.text
    };
  }
}
```

### 4.2 Context Builder（上下文构建）

```typescript
// context-builder.ts

interface Context {
  messages: Message[];
  memory: MemoryItem[];
  skills: Skill[];
  availableTools: Tool[];
  sessionInfo: SessionInfo;
}

class ContextBuilder {
  constructor(private memoryManager: MemoryManager) {}

  async build(intent: Intent): Promise<Context> {
    // 1. 获取最近对话历史
    const recentMessages = await this.getRecentMessages(10);

    // 2. 检索相关记忆
    const relevantMemory = await this.memoryManager.retrieve(intent.originalInput);

    // 3. 确定需要的技能
    const relevantSkills = this.determineSkills(intent);

    // 4. 获取可用工具
    const availableTools = await this.getAvailableTools(intent);

    // 5. 构建完整上下文
    return {
      messages: recentMessages,
      memory: relevantMemory,
      skills: relevantSkills,
      availableTools,
      sessionInfo: this.getSessionInfo()
    };
  }

  private async getRecentMessages(limit: number): Promise<Message[]> {
    // 从消息历史中获取最近的消息
    return [];
  }

  private determineSkills(intent: Intent): Skill[] {
    // 根据意图类型确定需要的技能
    const skillMap: Record<string, string[]> = {
      weather_query: ["weather_assistant"],
      code_review: ["code_reviewer"],
      travel_planning: ["travel_planner"],
      data_analysis: ["data_analyst"]
    };

    const skillNames = skillMap[intent.type] || [];
    return skillNames.map(name => SkillLoader.get(name));
  }
}
```

### 4.3 Tool Executor（工具执行器）

```typescript
// tool-executor.ts

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}

class ToolExecutor {
  constructor(
    private mcpClient: MCPClient,
    private retryHandler: RetryHandler
  ) {}

  /**
   * 执行工具调用
   */
  async execute(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // 1. 检查工具是否存在
      const tool = this.mcpClient.getTool(toolName);
      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      // 2. 调用工具（带重试）
      const result = await this.retryHandler.executeWithRetry(
        async () => {
          return await this.mcpClient.callTool(toolName, params);
        },
        {
          maxAttempts: 3,
          retryableErrors: ["timeout", "rate_limit"]
        }
      );

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 批量执行工具
   */
  async executeParallel(
    calls: Array<{ tool: string; params: Record<string, unknown> }>
  ): Promise<ToolResult[]> {
    return Promise.all(
      calls.map(call => this.execute(call.tool, call.params))
    );
  }
}
```

---

## 5. 状态管理

### 5.1 Agent 状态机

```
┌──────────────────────────────────────────────────────────────────┐
│                       Agent 状态机                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  IDLE ──── receive_input ──── PROCESSING ──── waiting_tools ───► │
│    ▲                              │              │                  │
│    │                              │              │                  │
│    │         ┌────────────────────┘              │                  │
│    │         │                                   │                  │
│    │         │ all tools completed               │                  │
│    │         ▼                                   │                  │
│    │      COMPLETING ◄───────────────────────────┘                  │
│    │         │                                                     │
│    │         │ response generated                                  │
│    │         ▼                                                     │
│    └── respond ─────────────────────────────────────────────► IDLE │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 状态定义

```typescript
// agent-state.ts

enum AgentState {
  IDLE = "idle",                 // 等待输入
  PROCESSING = "processing",      // 处理中（理解意图、规划）
  WAITING_TOOLS = "waiting_tools", // 等待工具调用结果
  COMPLETING = "completing",     // 生成回复中
  ERROR = "error"               // 发生错误
}

interface AgentStatus {
  state: AgentState;
  currentIntent?: Intent;
  currentPlan?: Plan;
  completedSteps: number;
  totalSteps: number;
  startTime?: Date;
}
```

---

## 6. 完整 Agent 类

### 6.1 主类实现

```typescript
// agent.ts

export class Agent {
  private state = AgentState.IDLE;
  private status: AgentStatus;

  constructor(
    private llm: LLMInterface,
    private mcpClient: MCPClient,
    private memoryManager: MemoryManager,
    private intentParser: IntentParser,
    private planner: Planner,
    private toolExecutor: ToolExecutor,
    private skillLoader: SkillLoader,
    private responseBuilder: ResponseBuilder
  ) {
    this.status = {
      state: AgentState.IDLE,
      completedSteps: 0,
      totalSteps: 0
    };
  }

  /**
   * 处理用户消息
   */
  async process(input: UserInput): Promise<AgentOutput> {
    try {
      // 1. 更新状态
      this.setState(AgentState.PROCESSING);
      const startTime = Date.now();

      // 2. 理解意图
      const intent = await this.intentParser.parse(input);
      this.status.currentIntent = intent;

      // 3. 构建上下文
      const context = await this.buildContext(intent);

      // 4. 规划步骤
      const plan = await this.planner.createPlan(intent, context);
      this.status.currentPlan = plan;
      this.status.totalSteps = plan.steps.length;

      // 5. 执行计划
      const executionResult = await this.executePlan(plan, context);

      // 6. 生成回复
      this.setState(AgentState.COMPLETING);
      const response = await this.responseBuilder.build(
        intent,
        executionResult,
        context
      );

      // 7. 保存记忆
      await this.memoryManager.addConversation(input, response, intent, plan);

      // 8. 返回结果
      this.setState(AgentState.IDLE);

      return {
        response,
        intent,
        plan,
        executionResult,
        duration: Date.now() - startTime
      };

    } catch (error) {
      this.setState(AgentState.ERROR);
      throw error;
    }
  }

  /**
   * 构建上下文
   */
  private async buildContext(intent: Intent): Promise<Context> {
    const [recentMessages, relevantMemory, skills, tools] = await Promise.all([
      this.getRecentMessages(10),
      this.memoryManager.retrieve(intent.originalInput),
      this.skillLoader.getRelevantSkills(intent),
      this.mcpClient.listTools()
    ]);

    return {
      messages: recentMessages,
      memory: relevantMemory,
      skills,
      availableTools: tools,
      sessionInfo: this.getSessionInfo()
    };
  }

  /**
   * 执行计划
   */
  private async executePlan(
    plan: Plan,
    context: Context
  ): Promise<ExecutionResult> {
    const results: StepResult[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      this.status.completedSteps = i;

      let stepResult: StepResult;

      switch (step.type) {
        case "tool_call":
          stepResult = await this.executeToolStep(step, context);
          break;

        case "skill_use":
          stepResult = await this.executeSkillStep(step, context);
          break;

        case "reasoning":
          stepResult = await this.executeReasoningStep(step, context);
          break;

        case "respond":
          return {
            stepResults: results,
            finalResponse: step.content,
            completed: true
          };

        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      results.push(stepResult);

      // 如果步骤失败，根据策略决定是否继续
      if (!stepResult.success && step.errorHandling === "stop") {
        return {
          stepResults: results,
          completed: false,
          failedAt: i
        };
      }
    }

    return {
      stepResults: results,
      completed: true
    };
  }

  private async executeToolStep(step: PlanStep, context: Context): Promise<StepResult> {
    const result = await this.toolExecutor.execute(step.tool!, step.params!);

    return {
      step,
      success: result.success,
      result: result.data,
      error: result.error,
      duration: result.duration
    };
  }

  private setState(newState: AgentState): void {
    console.log(`[Agent] State: ${this.state} → ${newState}`);
    this.state = newState;
    this.status.state = newState;
  }

  getStatus(): AgentStatus {
    return { ...this.status };
  }
}
```

---

## 7. 与 MCP 的关系

### 7.1 Agent 如何使用 MCP

```
Agent 系统                          MCP 组件
───────────────────────────────────────────────────────────────

Tool Executor  ───── MCP Client ───── MCP Server (如天气)
                  │
                  │  tools/call
                  │  tools/list
                  ├────────────────────────────── MCP Server (如 GitHub)
                  │  tools/call
                  │  resources/read
                  ├────────────────────────────── MCP Server (如 文件系统)
                  │  tools/call
                  └────────────────────────────── MCP Server (如 Email)
```

### 7.2 集成 MCP Client

```typescript
// agent-with-mcp.ts

class AgentWithMCP {
  private agent: Agent;
  private mcpClients: Map<string, MCPClient> = new Map();

  constructor() {
    // 创建 MCP Client 并连接到各个 Server
    this.setupMCPClients();
  }

  private async setupMCPClients(): Promise<void> {
    // 天气服务
    const weatherClient = await this.createClient("weather-server");
    this.mcpClients.set("weather", weatherClient);

    // GitHub 服务
    const githubClient = await this.createClient("github-server");
    this.mcpClients.set("github", githubClient);

    // 文件服务
    const fileClient = await this.createClient("file-server");
    this.mcpClients.set("file", fileClient);
  }

  private async createClient(serverPath: string): Promise<MCPClient> {
    const client = new MCPClient();
    await client.connect(serverPath);
    return client;
  }

  /**
   * 获取所有可用工具
   */
  async getAllAvailableTools(): Promise<Tool[]> {
    const allTools: Tool[] = [];

    for (const [name, client] of this.mcpClients) {
      const tools = await client.listTools();
      allTools.push(...tools.map(t => ({
        ...t,
        name: `${name}.${t.name}` // 添加命名空间
      })));
    }

    return allTools;
  }
}
```

---

## 8. 本章小结

```
Agent 架构核心要点

Agent 是什么
├── 自主理解目标并规划步骤
├── 调用外部工具完成复杂任务
├── 维护上下文和记忆
└── 与 MCP 配合获取工具能力

核心组件
├── Intent Parser: 理解用户意图
├── Context Builder: 构建执行上下文
├── Planner: 规划执行步骤
├── Tool Executor: 调用 MCP 工具
├── Memory Manager: 管理记忆
└── Response Builder: 生成回复

状态机
├── IDLE → PROCESSING → WAITING_TOOLS → COMPLETING → IDLE
└── 错误状态单独处理

与 MCP 关系
├── Tool Executor 通过 MCP Client 调用工具
├── 每个 MCP Server 提供一种能力
├── Agent 聚合多个 MCP Server 的能力
└── MCP 是 Agent 与外部世界交互的桥梁
```

---

## 下一步

继续阅读：
- [02-react-pattern.md](02-react-pattern.md) — ReAct 推理模式详解
