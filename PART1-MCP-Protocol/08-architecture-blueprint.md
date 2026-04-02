# 完整系统架构蓝图

> 本章目标：建立完整的系统架构认知，理解从用户请求到工具执行的完整数据流。学完本章后，你应能画出系统架构图，并解释每层的作用。

---

## 1. 为什么需要理解完整架构？

在学习具体技术细节之前，先建立**完整的架构认知**至关重要。

想象你在学习汽车：
- 不了解架构的人：知道怎么换轮胎、怎么加机油，但不知道它们如何协同工作
- 了解架构的人：知道引擎产生动力→变速箱传递→车轮转动，每个部件在系统中的位置

**架构认知帮助你**：
1. **定位问题**：出问题时知道去哪层排查
2. **设计系统**：知道如何组合各层构建应用
3. **理解约束**：明白每层的能力边界

---

## 2. 六层架构模型

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           完整系统架构六层模型                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Layer 1: 用户层（User Interface）                                   │   │
│  │  ─────────────────────────────────                                  │   │
│  │  职责：接收用户输入，展示最终结果                                     │   │
│  │  示例：Web界面、CLI命令行、聊天窗口                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Layer 2: Agent层（决策与编排）                                       │   │
│  │  ─────────────────────────────────                                  │   │
│  │  职责：理解意图、规划步骤、协调执行                                   │   │
│  │  组件：Intent Parser、Planner、Memory、Response Builder              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Layer 3: Skills层（能力封装）                                        │   │
│  │  ─────────────────────────────────                                  │   │
│  │  职责：封装标准工作流程，提供系统提示词                               │   │
│  │  形式：SKILL.md 文件（YAML Frontmatter + Markdown）                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Layer 4: MCP层（协议连接）                                           │   │
│  │  ─────────────────────────────────                                  │   │
│  │  职责：标准化工具发现、调用、结果返回                                 │   │
│  │  组件：MCP Client、MCP Server、JSON-RPC 协议                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Layer 5: Tools层（原子能力）                                         │   │
│  │  ─────────────────────────────────                                  │   │
│  │  职责：提供具体功能实现（查天气、读文件、调API）                      │   │
│  │  形式：Tool Definition（name、description、parameters）              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Layer 6: 系统执行层（System Execution）                              │   │
│  │  ─────────────────────────────────                                  │   │
│  │  职责：真正执行操作（HTTP请求、文件读写、脚本运行）                   │   │
│  │  实现：Node.js/Python/Go 代码                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 每层详解

### 3.1 Layer 1: 用户层（User Interface）

**职责**：接收用户输入，展示最终结果

```
用户层形式：
├── Web界面（如 ChatGPT 网页版）
├── CLI命令行（如 Cursor 终端）
├── IDE插件（如 VS Code 扩展）
├── 桌面应用（如 Claude Desktop）
└── API接口（供其他系统调用）
```

**关键理解**：用户层只负责"输入输出"，不参与智能决策。

```typescript
// 用户层代码示例（CLI）
async function main() {
  const userInput = await askUser("你想做什么？");
  // 将输入传递给 Agent 层
  const result = await agent.process(userInput);
  // 展示结果
  console.log(result);
}
```

### 3.2 Layer 2: Agent层（决策与编排）

**职责**：理解意图、规划步骤、协调执行

```
Agent层组件：
┌─────────────────────────────────────────┐
│           Agent Core                    │
├─────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │ Intent  │  │ Planner │  │ Memory  │ │
│  │ Parser  │  │         │  │ Manager │ │
│  └─────────┘  └─────────┘  └─────────┘ │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │ Context │  │ Tool    │  │Response │ │
│  │ Builder │  │Executor │  │ Builder │ │
│  └─────────┘  └─────────┘  └─────────┘ │
└─────────────────────────────────────────┘
```

**核心流程**：
```
用户输入
    │
    ▼
┌─────────────┐
│ Intent      │ → 理解用户想做什么
│ Parser      │
└─────────────┘
    │
    ▼
┌─────────────┐
│ Context     │ → 构建完整上下文（历史、记忆、可用工具）
│ Builder     │
└─────────────┘
    │
    ▼
┌─────────────┐
│ Planner     │ → 规划执行步骤
│             │
└─────────────┘
    │
    ▼
┌─────────────┐
│ Tool        │ → 调用工具（进入下层）
│ Executor    │
└─────────────┘
    │
    ▼
┌─────────────┐
│ Response    │ → 生成最终回复
│ Builder     │
└─────────────┘
```

### 3.3 Layer 3: Skills层（能力封装）

**职责**：封装标准工作流程，提供系统提示词

```
Skill层作用：
┌─────────────────────────────────────────┐
│  用户请求："分析特斯拉财报"              │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Agent识别：匹配"财报分析 Skill"         │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  加载 SKILL.md：                        │
│  ├── 系统提示词（指导LLM如何分析）       │
│  ├── 执行流程（Step 1→2→3）             │
│  └── 所需工具（get_financial_data等）    │
└─────────────────────────────────────────┘
```

**SKILL.md 结构**：
```markdown
---
name: financial-analyzer
description: 财报分析专家
triggers:
  - 分析财报
  - 财务分析
---

# 财报分析 Skill

## 系统提示词
你是一个专业的财务分析师...

## 执行流程
### Step 1: 获取数据
调用 `get_financial_data` 工具...

### Step 2: 分析指标
...

### Step 3: 生成报告
...
```

### 3.4 Layer 4: MCP层（协议连接）

**职责**：标准化工具发现、调用、结果返回

```
MCP层架构：
┌─────────────────────────────────────────┐
│              MCP Host                   │
│           （AI应用程序）                 │
│  ┌─────────────────────────────────┐   │
│  │         MCP Client              │   │
│  │  ┌─────────┐    ┌─────────┐    │   │
│  │  │ Tool    │    │Resource │    │   │
│  │  │ Manager │    │ Manager │    │   │
│  │  └─────────┘    └─────────┘    │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                    │
                    │ MCP协议（JSON-RPC 2.0）
                    ▼
┌─────────────────────────────────────────┐
│            MCP Server                   │
│         （外部工具服务）                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │  Tools  │  │Resources│  │ Prompts │ │
│  └─────────┘  └─────────┘  └─────────┘ │
└─────────────────────────────────────────┘
```

**MCP 核心操作**：
```typescript
// 1. 发现工具
const tools = await mcpClient.listTools();
// 返回: [{ name: "get_weather", description: "...", parameters: {...} }]

// 2. 调用工具
const result = await mcpClient.callTool("get_weather", { city: "北京" });
// 返回: { temperature: 25, condition: "晴" }

// 3. 读取资源
const resource = await mcpClient.readResource("config://default-city");
// 返回: "北京"
```

### 3.5 Layer 5: Tools层（原子能力）

**职责**：提供具体功能实现

```
Tool层示例：
┌─────────────────────────────────────────┐
│           Weather Server                │
├─────────────────────────────────────────┤
│  Tool: get_weather                      │
│  ├── description: "获取指定城市天气"     │
│  ├── parameters:                        │
│  │   └── city: string (required)       │
│  └── returns:                           │
│      ├── temperature: number            │
│      └── condition: string              │
├─────────────────────────────────────────┤
│  Tool: get_forecast                     │
│  ├── description: "获取天气预报"         │
│  └── ...                                │
└─────────────────────────────────────────┘
```

**Tool 定义**：
```typescript
interface Tool {
  name: string;           // 工具名称
  description: string;    // 功能描述（LLM据此决定是否调用）
  parameters: {           // 参数定义
    type: "object";
    properties: Record<string, Parameter>;
    required: string[];
  };
}
```

### 3.6 Layer 6: 系统执行层（System Execution）

**职责**：真正执行操作

```
系统执行层：
┌─────────────────────────────────────────┐
│         System Execution Layer          │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐    ┌─────────────┐    │
│  │ HTTP Client │    │ File System │    │
│  │ （调用API）  │    │ （读写文件） │    │
│  └─────────────┘    └─────────────┘    │
│                                         │
│  ┌─────────────┐    ┌─────────────┐    │
│  │  Database   │    │  Subprocess │    │
│  │ （数据库）   │    │ （运行脚本） │    │
│  └─────────────┘    └─────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

**关键理解**：这一层是**真正动手**的地方，LLM 永远不会直接接触这一层。

---

## 4. 数据流详解

### 4.1 完整请求处理流程

```
用户："帮我查一下北京天气"

Layer 1: 用户层
├── 接收输入："帮我查一下北京天气"
└── 传递给 Agent 层

Layer 2: Agent层
├── Intent Parser：识别意图为 weather_query
├── Context Builder：构建上下文（历史对话、可用工具）
└── Planner：规划步骤 [调用天气工具]

Layer 3: Skills层（可选）
├── 如果匹配 Weather Skill
├── 加载 Skill 的系统提示词和执行流程
└── 按 Skill 定义执行

Layer 4: MCP层
├── MCP Client：发现可用工具
├── 找到 get_weather 工具
├── 构建 JSON-RPC 请求
└── 发送给 MCP Server

Layer 5: Tools层
├── MCP Server：接收请求
├── 解析参数：{ city: "北京" }
└── 调用实际实现

Layer 6: 系统执行层
├── 发起 HTTP 请求到天气 API
├── 接收响应：{ temp: 25, condition: "晴" }
└── 返回给上层

逐层返回：
Layer 6 → Layer 5：返回原始数据
Layer 5 → Layer 4：包装为 MCP 响应
Layer 4 → Layer 3：返回工具结果
Layer 3 → Layer 2：按 Skill 流程处理
Layer 2 → Layer 1：生成自然语言回复
Layer 1 → 用户："北京今天晴，25°C"
```

### 4.2 数据格式转换

```
┌─────────────────────────────────────────────────────────────────┐
│                      数据格式转换链                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1: 自然语言                                              │
│  "帮我查一下北京天气"                                            │
│           │                                                     │
│           ▼ 解析                                                │
│                                                                 │
│  Layer 2: 结构化意图                                            │
│  { type: "weather_query", entities: { city: "北京" } }          │
│           │                                                     │
│           ▼ 规划                                                │
│                                                                 │
│  Layer 3: Skill 指令                                            │
│  { skill: "weather_assistant", step: "query_current" }          │
│           │                                                     │
│           ▼ 映射                                                │
│                                                                 │
│  Layer 4: MCP 请求（JSON-RPC）                                   │
│  {                                                              │
│    "jsonrpc": "2.0",                                           │
│    "method": "tools/call",                                     │
│    "params": { "name": "get_weather", "arguments": {...} }     │
│  }                                                              │
│           │                                                     │
│           ▼ 传输                                                │
│                                                                 │
│  Layer 5: 工具调用                                               │
│  get_weather({ city: "北京" })                                  │
│           │                                                     │
│           ▼ 执行                                                │
│                                                                 │
│  Layer 6: 系统操作                                               │
│  fetch("https://api.weather.com/v1/current?city=北京")         │
│           │                                                     │
│           ▼ 返回                                                │
│                                                                 │
│  Layer 6: API 响应                                               │
│  { "temperature": 25, "condition": "晴", "humidity": 60% }       │
│           │                                                     │
│           ▼ 包装                                                │
│                                                                 │
│  Layer 5: 工具结果                                               │
│  { content: [{ type: "text", text: "25°C, 晴" }] }              │
│           │                                                     │
│           ▼ 传输                                                │
│                                                                 │
│  Layer 4: MCP 响应                                               │
│  { "result": { "content": [...] } }                             │
│           │                                                     │
│           ▼ 处理                                                │
│                                                                 │
│  Layer 3: Skill 输出                                             │
│  "北京天气：25°C，晴，湿度60%"                                    │
│           │                                                     │
│           ▼ 生成                                                │
│                                                                 │
│  Layer 2: 最终回复                                               │
│  "北京今天天气不错，25°C晴天，适合出门！"                          │
│           │                                                     │
│           ▼ 展示                                                │
│                                                                 │
│  Layer 1: 用户界面                                               │
│  [显示] 北京今天天气不错，25°C晴天，适合出门！                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 从代码视角看架构

### 5.1 每层对应的代码

```
┌─────────────────────────────────────────────────────────────────┐
│                      代码层面的架构映射                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1: 用户层                                                 │
│  ├── CLI: readline.question()                                   │
│  ├── Web: React/Vue 组件                                        │
│  └── API: Express/FastAPI 路由                                  │
│                                                                 │
│  Layer 2: Agent层                                                │
│  ├── Agent class                                                │
│  ├── IntentParser class                                         │
│  ├── Planner class                                              │
│  └── ToolExecutor class                                         │
│                                                                 │
│  Layer 3: Skills层                                               │
│  ├── SkillLoader class                                          │
│  ├── SKILL.md 文件                                              │
│  └── skill-parser.ts                                            │
│                                                                 │
│  Layer 4: MCP层                                                  │
│  ├── MCPClient class                                            │
│  ├── MCPServer class                                            │
│  └── protocol/ (JSON-RPC 实现)                                  │
│                                                                 │
│  Layer 5: Tools层                                                │
│  ├── @modelcontextprotocol/sdk                                  │
│  ├── server.tool() 装饰器                                       │
│  └── tool definitions                                           │
│                                                                 │
│  Layer 6: 系统执行层                                             │
│  ├── fetch/axios (HTTP)                                         │
│  ├── fs (文件系统)                                               │
│  ├── child_process (脚本)                                       │
│  └── db drivers (数据库)                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 代码示例：跨层调用

```typescript
// Layer 1: 用户层（CLI）
async function main() {
  const input = await askUser("你想做什么？");
  const agent = new Agent();
  const result = await agent.process(input);  // → Layer 2
  console.log(result);
}

// Layer 2: Agent层
class Agent {
  async process(input: string) {
    // 理解意图
    const intent = await this.intentParser.parse(input);
    
    // 规划步骤
    const plan = await this.planner.createPlan(intent);
    
    // 执行步骤
    for (const step of plan.steps) {
      if (step.type === "tool_call") {
        const result = await this.toolExecutor.execute(
          step.tool, 
          step.params
        );  // → Layer 3/4/5/6
      }
    }
    
    // 生成回复
    return await this.responseBuilder.build(...);
  }
}

// Layer 3: Skills层
class SkillLoader {
  async load(skillName: string) {
    const skillContent = await fs.readFile(`skills/${skillName}.md`);
    return this.parser.parse(skillContent);
  }
}

// Layer 4: MCP层
class MCPClient {
  async callTool(name: string, args: any) {
    const request = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name, arguments: args }
    };
    return await this.transport.send(request);  // → Layer 5
  }
}

// Layer 5: Tools层（MCP Server）
const server = new MCPServer();

server.tool("get_weather", {
  description: "获取天气",
  parameters: { city: { type: "string" } }
}, async ({ city }) => {
  return await getWeatherFromAPI(city);  // → Layer 6
});

// Layer 6: 系统执行层
async function getWeatherFromAPI(city: string) {
  const response = await fetch(
    `https://api.weather.com/v1/current?city=${city}`
  );
  return await response.json();
}
```

---

## 6. 关键设计原则

### 6.1 分层的好处

```
┌─────────────────────────────────────────────────────────────────┐
│                        分层的好处                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 关注点分离                                                   │
│     ├── 每层只关心自己的职责                                     │
│     ├── 用户层不关心怎么调用工具                                 │
│     └── 工具层不关心用户怎么输入                                 │
│                                                                 │
│  2. 可替换性                                                     │
│     ├── 可以换不同的用户界面（Web/CLI/IDE）                       │
│     ├── 可以换不同的 LLM（GPT-4/Claude/文心）                     │
│     └── 可以换不同的传输层（stdio/HTTP）                          │
│                                                                 │
│  3. 可测试性                                                     │
│     ├── 每层可以独立测试                                         │
│     ├── 可以 Mock 下层依赖                                       │
│     └── 单元测试更容易                                           │
│                                                                 │
│  4. 可扩展性                                                     │
│     ├── 新增 Skill 不需要改 Agent                                │
│     ├── 新增 MCP Server 不需要改 Client                          │
│     └── 新增工具不需要改协议层                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 层间接口设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        层间接口                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1 ↔ Layer 2                                               │
│  interface AgentInput { text: string; context?: any; }          │
│  interface AgentOutput { response: string; metadata?: any; }    │
│                                                                 │
│  Layer 2 ↔ Layer 3                                               │
│  interface Skill { name: string; prompt: string; workflow: []; }│
│  interface SkillResult { output: string; steps: []; }           │
│                                                                 │
│  Layer 3 ↔ Layer 4                                               │
│  interface ToolCall { name: string; arguments: any; }           │
│  interface ToolResult { content: Content[]; isError?: boolean; }│
│                                                                 │
│  Layer 4 ↔ Layer 5                                               │
│  interface JSONRPCRequest { jsonrpc: "2.0"; method: string; ... }│
│  interface JSONRPCResponse { jsonrpc: "2.0"; result?: any; ... } │
│                                                                 │
│  Layer 5 ↔ Layer 6                                               │
│  interface ToolImplementation { (args: any) => Promise<any>; }  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 本章小结

```
核心认知

六层架构
├── Layer 1: 用户层（输入输出）
├── Layer 2: Agent层（决策编排）
├── Layer 3: Skills层（能力封装）
├── Layer 4: MCP层（协议连接）
├── Layer 5: Tools层（原子能力）
└── Layer 6: 系统执行层（真正执行）

关键洞察
├── 每层有明确的职责边界
├── 上层依赖下层，下层不依赖上层
├── 数据在层间流动时格式转换
├── LLM 只在 Layer 2 参与决策
└── 真正"动手"的是 Layer 6

设计原则
├── 关注点分离
├── 可替换性
├── 可测试性
└── 可扩展性
```

---

## 下一步

继续阅读：
- [05-function-calling-mechanism.md](../PART5-Agent/05-function-calling-mechanism.md) — Function Calling 机制详解
- [09-tool-vs-skill-discovery.md](../PART4-Skills-System/09-tool-vs-skill-discovery.md) — Tool 与 Skill 发现机制对比

---

_Last updated: 2026-04-02_
