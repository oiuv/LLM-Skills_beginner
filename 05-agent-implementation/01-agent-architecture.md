# Agent 架构设计与实现

> 从零构建生产级 AI Agent 的完整指南

---

## 1. Agent 核心架构

### 1.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         Agent 系统                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   输入层 (Input Layer)                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │   用户输入   │  │   系统事件   │  │   工具回调   │     │   │
│  │  │   (Text)    │  │  (Events)   │  │ (Callbacks) │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   理解层 (Understanding)                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │   Intent    │  │   Entity    │  │   Context   │     │   │
│  │  │  意图识别    │  │  实体提取    │  │  上下文理解  │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   决策层 (Decision)                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │   Planning  │  │   Memory    │  │   Reasoning │     │   │
│  │  │  任务规划    │  │  记忆检索    │  │  推理决策    │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   执行层 (Execution)                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │  Tool Call  │  │  Skill Use  │  │   Action    │     │   │
│  │  │  工具调用    │  │  技能应用    │  │  其他行动    │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   输出层 (Output)                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │   Response  │  │   Stream    │  │   Update    │     │   │
│  │  │  最终回复    │  │  流式输出    │  │  状态更新    │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件

```typescript
// Agent 核心类
class Agent {
  // 核心组件
  private llm: LLMInterface;
  private memory: MemorySystem;
  private planner: TaskPlanner;
  private toolRegistry: ToolRegistry;
  private skillManager: SkillManager;
  
  // 状态管理
  private state: AgentState;
  private context: ContextManager;
  
  // 执行控制
  private executor: ActionExecutor;
  private observer: ExecutionObserver;
  
  constructor(config: AgentConfig) {
    this.llm = config.llm;
    this.memory = new MemorySystem(config.memory);
    this.planner = new TaskPlanner(config.planner);
    this.toolRegistry = new ToolRegistry();
    this.skillManager = new SkillManager();
    this.state = new AgentState();
    this.context = new ContextManager();
    this.executor = new ActionExecutor();
    this.observer = new ExecutionObserver();
  }
  
  // 主入口
  async run(input: UserInput): Promise<AgentOutput> {
    // 1. 初始化上下文
    const ctx = await this.context.create(input);
    
    // 2. 理解意图
    const understanding = await this.understand(ctx);
    
    // 3. 规划任务
    const plan = await this.plan(understanding);
    
    // 4. 执行循环
    const result = await this.executeLoop(plan, ctx);
    
    // 5. 生成输出
    return this.generateOutput(result, ctx);
  }
}
```

---

## 2. ReAct 模式实现

### 2.1 ReAct 循环

```
┌─────────────────────────────────────────────────────────────┐
│                     ReAct 循环                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────┐                                               │
│   │  Start  │                                               │
│   └────┬────┘                                               │
│        │                                                     │
│        ▼                                                     │
│   ┌─────────────────────────────────────┐                   │
│   │  Thought: 分析当前状态，决定下一步    │                   │
│   │  "我需要查询天气来完成用户的请求"     │                   │
│   └─────────────────────────────────────┘                   │
│        │                                                     │
│        ▼                                                     │
│   ┌─────────────────────────────────────┐                   │
│   │  Action: 执行具体操作               │                   │
│   │  调用 weather.get(city="北京")      │                   │
│   └─────────────────────────────────────┘                   │
│        │                                                     │
│        ▼                                                     │
│   ┌─────────────────────────────────────┐                   │
│   │  Observation: 观察执行结果          │                   │
│   │  "北京：晴天，25°C"                  │                   │
│   └─────────────────────────────────────┘                   │
│        │                                                     │
│        ▼                                                     │
│   ┌─────────────────────────────────────┐                   │
│   │  是否完成任务？                      │                   │
│   └─────────────────────────────────────┘                   │
│        │                                                     │
│    ┌───┴───┐                                                 │
│    │       │                                                 │
│   是      否                                                │
│    │       │                                                 │
│    ▼       └────────────────┐                               │
│   ┌─────────────┐            │                               │
│   │   Finish    │            │                               │
│   │  生成回复    │            │                               │
│   └─────────────┘            │                               │
│                              │                               │
│                              └──────→ [继续循环]              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 代码实现

```typescript
// ReAct Agent 实现
class ReActAgent {
  private maxIterations = 10;
  
  async run(input: string): Promise<string> {
    const context: ReActContext = {
      input,
      history: [],
      currentStep: 0
    };
    
    while (context.currentStep < this.maxIterations) {
      // 1. Thought
      const thought = await this.think(context);
      context.history.push({ type: "thought", content: thought });
      
      // 2. Action
      const action = await this.decideAction(context);
      
      if (action.type === "finish") {
        return action.result;
      }
      
      context.history.push({ type: "action", content: action });
      
      // 3. Observation
      const observation = await this.executeAction(action);
      context.history.push({ type: "observation", content: observation });
      
      context.currentStep++;
    }
    
    throw new Error("Max iterations reached");
  }
  
  private async think(context: ReActContext): Promise<string> {
    const prompt = this.buildThoughtPrompt(context);
    const response = await this.llm.complete(prompt);
    return response;
  }
  
  private async decideAction(context: ReActContext): Promise<Action> {
    const prompt = this.buildActionPrompt(context);
    const response = await this.llm.complete(prompt);
    return this.parseAction(response);
  }
  
  private async executeAction(action: Action): Promise<string> {
    switch (action.type) {
      case "tool_call":
        return await this.callTool(action.tool, action.params);
      case "skill_use":
        return await this.useSkill(action.skill, action.params);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }
  
  private buildThoughtPrompt(context: ReActContext): string {
    return `You are an AI assistant. Analyze the following context and decide what to do next.

User Input: ${context.input}

History:
${context.history.map(h => `${h.type}: ${h.content}`).join("\n")}

What should you do next? Think step by step.`;
  }
  
  private buildActionPrompt(context: ReActContext): string {
    return `Based on your thought, decide the next action.

Available tools:
${this.getToolDescriptions()}

Available skills:
${this.getSkillDescriptions()}

Respond in JSON format:
{
  "type": "tool_call" | "skill_use" | "finish",
  "tool"?: "tool_name",
  "skill"?: "skill_name",
  "params"?: {},
  "result"?: "final answer (if finish)"
}`;
  }
}

interface ReActContext {
  input: string;
  history: Step[];
  currentStep: number;
}

type Step = 
  | { type: "thought"; content: string }
  | { type: "action"; content: Action }
  | { type: "observation"; content: string };

type Action = 
  | { type: "tool_call"; tool: string; params: object }
  | { type: "skill_use"; skill: string; params: object }
  | { type: "finish"; result: string };
```

---

## 3. 记忆系统设计

### 3.1 记忆类型

```typescript
// 记忆系统架构
class MemorySystem {
  private shortTerm: ShortTermMemory;
  private longTerm: LongTermMemory;
  private working: WorkingMemory;
  
  constructor(config: MemoryConfig) {
    this.shortTerm = new ShortTermMemory(config.shortTerm);
    this.longTerm = new LongTermMemory(config.longTerm);
    this.working = new WorkingMemory();
  }
  
  // 添加记忆
  async add(content: string, type: MemoryType): Promise<void> {
    const memory: Memory = {
      id: generateId(),
      content,
      type,
      timestamp: Date.now(),
      embedding: await this.embed(content)
    };
    
    if (type === "short_term") {
      await this.shortTerm.add(memory);
    } else {
      await this.longTerm.add(memory);
    }
  }
  
  // 检索记忆
  async retrieve(query: string, options: RetrieveOptions): Promise<Memory[]> {
    const queryEmbedding = await this.embed(query);
    
    // 并行检索
    const [shortTermResults, longTermResults] = await Promise.all([
      this.shortTerm.search(queryEmbedding, options.limit),
      this.longTerm.search(queryEmbedding, options.limit)
    ]);
    
    // 合并和排序
    return this.mergeResults(shortTermResults, longTermResults, options.limit);
  }
  
  // 生成上下文
  async buildContext(currentInput: string, maxTokens: number): Promise<string> {
    const relevant = await this.retrieve(currentInput, { limit: 10 });
    
    // 按重要性排序
    const sorted = this.rankByImportance(relevant);
    
    // 构建上下文（考虑 token 限制）
    return this.formatContext(sorted, maxTokens);
  }
  
  private async embed(text: string): Promise<number[]> {
    // 调用 embedding 模型
    return await embeddingModel.embed(text);
  }
}

// 短期记忆（当前会话）
class ShortTermMemory {
  private memories: Memory[] = [];
  private maxSize: number;
  
  constructor(config: { maxSize: number }) {
    this.maxSize = config.maxSize;
  }
  
  async add(memory: Memory): Promise<void> {
    this.memories.push(memory);
    
    // 保持大小限制
    if (this.memories.length > this.maxSize) {
      this.memories.shift();
    }
  }
  
  async search(embedding: number[], limit: number): Promise<Memory[]> {
    // 简单的相似度计算
    return this.memories
      .map(m => ({ ...m, score: cosineSimilarity(m.embedding, embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  
  getRecent(n: number): Memory[] {
    return this.memories.slice(-n);
  }
  
  clear(): void {
    this.memories = [];
  }
}

// 长期记忆（向量数据库）
class LongTermMemory {
  private vectorDB: VectorDatabase;
  
  constructor(config: { connectionString: string }) {
    this.vectorDB = new VectorDatabase(config.connectionString);
  }
  
  async add(memory: Memory): Promise<void> {
    await this.vectorDB.insert({
      id: memory.id,
      vector: memory.embedding,
      metadata: {
        content: memory.content,
        timestamp: memory.timestamp,
        type: memory.type
      }
    });
  }
  
  async search(embedding: number[], limit: number): Promise<Memory[]> {
    const results = await this.vectorDB.search(embedding, limit);
    return results.map(r => ({
      id: r.id,
      content: r.metadata.content,
      type: r.metadata.type,
      timestamp: r.metadata.timestamp,
      embedding: r.vector
    }));
  }
}

// 工作记忆（当前任务）
class WorkingMemory {
  private facts = new Map<string, string>();
  
  set(key: string, value: string): void {
    this.facts.set(key, value);
  }
  
  get(key: string): string | undefined {
    return this.facts.get(key);
  }
  
  getAll(): Record<string, string> {
    return Object.fromEntries(this.facts);
  }
  
  clear(): void {
    this.facts.clear();
  }
}
```

### 3.2 上下文压缩

```typescript
// 上下文压缩器
class ContextCompressor {
  async compress(
    messages: Message[],
    maxTokens: number
  ): Promise<Message[]> {
    let totalTokens = this.estimateTokens(messages);
    
    if (totalTokens <= maxTokens) {
      return messages;
    }
    
    // 策略 1: 移除旧的系统消息
    const systemMessages = messages.filter(m => m.role === "system");
    const nonSystemMessages = messages.filter(m => m.role !== "system");
    
    // 策略 2: 摘要旧对话
    const recentMessages = nonSystemMessages.slice(-10);
    const oldMessages = nonSystemMessages.slice(0, -10);
    
    if (oldMessages.length > 0) {
      const summary = await this.summarize(oldMessages);
      const summaryMessage: Message = {
        role: "system",
        content: `Previous conversation summary: ${summary}`
      };
      
      return [...systemMessages, summaryMessage, ...recentMessages];
    }
    
    // 策略 3: 截断
    return this.truncateMessages(messages, maxTokens);
  }
  
  private async summarize(messages: Message[]): Promise<string> {
    const prompt = `Summarize the following conversation in 2-3 sentences:\n\n${
      messages.map(m => `${m.role}: ${m.content}`).join("\n")
    }`;
    
    return await this.llm.complete(prompt);
  }
  
  private truncateMessages(messages: Message[], maxTokens: number): Message[] {
    // 保留最新的消息，直到达到 token 限制
    const result: Message[] = [];
    let currentTokens = 0;
    
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const tokens = this.estimateTokens([message]);
      
      if (currentTokens + tokens > maxTokens) {
        break;
      }
      
      result.unshift(message);
      currentTokens += tokens;
    }
    
    return result;
  }
  
  private estimateTokens(messages: Message[]): number {
    // 简化的 token 估算
    const text = messages.map(m => m.content).join("");
    return Math.ceil(text.length / 4);
  }
}
```

---

## 4. 工具调用编排

### 4.1 工具注册表

```typescript
// 工具注册表
class ToolRegistry {
  private tools = new Map<string, Tool>();
  private schemas = new Map<string, ToolSchema>();
  
  register(tool: Tool): void {
    // 验证工具定义
    this.validateTool(tool);
    
    this.tools.set(tool.name, tool);
    this.schemas.set(tool.name, tool.schema);
  }
  
  async execute(name: string, params: object): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    
    // 验证参数
    const validation = this.validateParams(name, params);
    if (!validation.valid) {
      throw new Error(`Invalid params: ${validation.errors.join(", ")}`);
    }
    
    // 执行工具
    const startTime = Date.now();
    try {
      const result = await tool.execute(params);
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
  
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }
  
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }
  
  getSchemas(): ToolSchema[] {
    return Array.from(this.schemas.values());
  }
  
  private validateTool(tool: Tool): void {
    if (!tool.name) throw new Error("Tool name is required");
    if (!tool.execute) throw new Error("Tool execute function is required");
    if (!tool.schema) throw new Error("Tool schema is required");
  }
  
  private validateParams(name: string, params: object): ValidationResult {
    const schema = this.schemas.get(name);
    if (!schema) return { valid: false, errors: ["Schema not found"] };
    
    // 使用 JSON Schema 验证
    return validateJsonSchema(params, schema.inputSchema);
  }
}

interface Tool {
  name: string;
  description: string;
  schema: ToolSchema;
  execute: (params: object) => Promise<unknown>;
}

interface ToolSchema {
  name: string;
  description: string;
  inputSchema: object;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}
```

### 4.2 并行工具调用

```typescript
// 并行工具执行器
class ParallelToolExecutor {
  private maxConcurrency: number;
  
  constructor(maxConcurrency: number = 5) {
    this.maxConcurrency = maxConcurrency;
  }
  
  async executeParallel(
    calls: ToolCall[],
    registry: ToolRegistry
  ): Promise<ToolResult[]> {
    const semaphore = new Semaphore(this.maxConcurrency);
    
    const promises = calls.map(async (call) => {
      await semaphore.acquire();
      try {
        return await registry.execute(call.name, call.params);
      } finally {
        semaphore.release();
      }
    });
    
    return await Promise.all(promises);
  }
  
  async executeSequential(
    calls: ToolCall[],
    registry: ToolRegistry
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    
    for (const call of calls) {
      const result = await registry.execute(call.name, call.params);
      results.push(result);
      
      // 如果失败，停止后续执行
      if (!result.success && call.stopOnError) {
        break;
      }
    }
    
    return results;
  }
  
  async executeChain(
    calls: ChainedToolCall[],
    registry: ToolRegistry
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    let context: object = {};
    
    for (const call of calls) {
      // 注入上下文
      const params = { ...call.params, ...context };
      
      const result = await registry.execute(call.name, params);
      results.push(result);
      
      if (!result.success) break;
      
      // 更新上下文
      if (call.outputKey) {
        context[call.outputKey] = result.data;
      }
    }
    
    return results;
  }
}

interface ToolCall {
  name: string;
  params: object;
  stopOnError?: boolean;
}

interface ChainedToolCall extends ToolCall {
  outputKey?: string;
}
```

---

## 5. 流式处理

### 5.1 流式响应实现

```typescript
// 流式处理器
class StreamingHandler {
  async *streamResponse(
    input: string,
    context: Context
  ): AsyncGenerator<StreamChunk> {
    // 1. 发送思考开始
    yield { type: "thought_start", content: "Analyzing request..." };
    
    // 2. 意图识别
    const intent = await this.recognizeIntent(input);
    yield { type: "thought", content: `Intent: ${intent.type}` };
    
    // 3. 规划
    yield { type: "thought", content: "Planning steps..." };
    const plan = await this.plan(intent);
    
    // 4. 执行
    for (const step of plan.steps) {
      yield { type: "action_start", content: step.description };
      
      const result = await this.executeStep(step);
      
      yield {
        type: "action_complete",
        content: result.success ? "Done" : "Failed",
        data: result
      };
    }
    
    // 5. 生成回复
    yield { type: "generating", content: "Generating response..." };
    
    const responseStream = await this.llm.streamComplete(input);
    for await (const chunk of responseStream) {
      yield { type: "content", content: chunk };
    }
    
    yield { type: "complete" };
  }
}

interface StreamChunk {
  type: "thought_start" | "thought" | "action_start" | "action_complete" | "generating" | "content" | "complete";
  content?: string;
  data?: unknown;
}
```

---

## 6. 完整 Agent 示例

```typescript
// 完整的 Agent 实现
class CompleteAgent {
  private llm: LLMInterface;
  private memory: MemorySystem;
  private tools: ToolRegistry;
  private skills: SkillManager;
  private maxIterations = 10;
  
  constructor(config: AgentConfig) {
    this.llm = config.llm;
    this.memory = new MemorySystem(config.memory);
    this.tools = new ToolRegistry();
    this.skills = new SkillManager();
    
    // 注册默认工具
    this.registerDefaultTools();
  }
  
  async run(input: string): Promise<AgentResult> {
    const startTime = Date.now();
    const context = await this.buildContext(input);
    
    // ReAct 循环
    for (let i = 0; i < this.maxIterations; i++) {
      // 思考
      const thought = await this.think(context);
      context.addThought(thought);
      
      // 决策
      const action = await this.decide(context);
      
      if (action.type === "respond") {
        // 生成最终回复
        const response = await this.generateResponse(context);
        
        // 保存到记忆
        await this.memory.add(`User: ${input}\nAssistant: ${response}`, "long_term");
        
        return {
          response,
          thoughts: context.thoughts,
          actions: context.actions,
          duration: Date.now() - startTime
        };
      }
      
      // 执行动作
      const observation = await this.execute(action, context);
      context.addObservation(observation);
    }
    
    throw new Error("Max iterations reached");
  }
  
  private async buildContext(input: string): Promise<AgentContext> {
    // 检索相关记忆
    const relevantMemories = await this.memory.retrieve(input, { limit: 5 });
    
    // 获取活跃技能
    const activeSkills = this.skills.getActiveSkills();
    
    return new AgentContext({
      input,
      memories: relevantMemories,
      skills: activeSkills,
      tools: this.tools.getSchemas()
    });
  }
  
  private async think(context: AgentContext): Promise<string> {
    const prompt = `Given the user input and context, what should you do next?

Input: ${context.input}

Relevant memories:
${context.memories.map(m => `- ${m.content}`).join("\n")}

Available tools:
${context.tools.map(t => `- ${t.name}: ${t.description}`).join("\n")}

Think step by step:`;

    return await this.llm.complete(prompt);
  }
  
  private async decide(context: AgentContext): Promise<Action> {
    const prompt = `Based on your thought, decide the next action.

Thought: ${context.getLastThought()}

Available actions:
1. Use tool: { "type": "tool", "tool": "tool_name", "params": {} }
2. Use skill: { "type": "skill", "skill": "skill_name", "params": {} }
3. Respond to user: { "type": "respond" }

Respond in JSON format.`;

    const response = await this.llm.complete(prompt);
    return JSON.parse(response);
  }
  
  private async execute(action: Action, context: AgentContext): Promise<string> {
    switch (action.type) {
      case "tool":
        const result = await this.tools.execute(action.tool, action.params);
        return JSON.stringify(result);
        
      case "skill":
        const skillResult = await this.skills.execute(action.skill, action.params);
        return JSON.stringify(skillResult);
        
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }
  
  private async generateResponse(context: AgentContext): Promise<string> {
    const prompt = `Generate a helpful response to the user based on the conversation history.

User: ${context.input}

Thought process:
${context.thoughts.map(t => `- ${t}`).join("\n")}

Observations:
${context.observations.map(o => `- ${o}`).join("\n")}

Response:`;

    return await this.llm.complete(prompt);
  }
  
  private registerDefaultTools(): void {
    this.tools.register({
      name: "search",
      description: "Search for information",
      schema: {
        name: "search",
        description: "Search for information",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" }
          },
          required: ["query"]
        }
      },
      execute: async (params) => {
        // 实现搜索逻辑
        return { results: [] };
      }
    });
  }
}

interface AgentResult {
  response: string;
  thoughts: string[];
  actions: Action[];
  duration: number;
}
```

---

## 7. 最佳实践

### DO
- ✅ 使用 ReAct 模式进行推理
- ✅ 实现多层次记忆系统
- ✅ 支持并行工具调用
- ✅ 添加执行超时控制
- ✅ 实现流式响应
- ✅ 记录完整的执行轨迹
- ✅ 支持优雅降级

### DON'T
- ❌ 无限循环没有退出条件
- ❌ 一次性加载所有记忆
- ❌ 同步阻塞工具调用
- ❌ 忽略工具执行错误
- ❌ 硬编码提示词
- ❌ 不考虑 token 限制

---

## 下一步

继续阅读：
- [02-production-optimization.md](02-production-optimization.md) - 生产环境优化
- [../06-demo-project/](06-demo-project/) - 完整项目示例
