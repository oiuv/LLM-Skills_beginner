# Function Calling 机制详解

> 本章目标：彻底搞懂"LLM 只会生成文本，为什么能调用工具"。学完本章后，你应能画出 Function Calling 的完整流程图，并实现一个基础的工具调用系统。

---

## 1. 核心问题：LLM 能调用工具吗？

**答案：不能。**

这是一个常见的误解。让我们澄清 LLM 的本质：

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM 的本质                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  输入：文本（Prompt）                                        │
│    │                                                        │
│    ▼                                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  大语言模型                          │   │
│  │                                                     │   │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐        │   │
│  │  │ Tokenize│ → │ 推理    │ → │ Detoken │        │   │
│  │  │ 分词    │    │ 预测    │    │ 生成文本 │        │   │
│  │  └─────────┘    └─────────┘    └─────────┘        │   │
│  │                                                     │   │
│  │  核心操作：预测下一个最可能的词                      │   │
│  └─────────────────────────────────────────────────────┘   │
│    │                                                        │
│    ▼                                                        │
│  输出：文本（Response）                                      │
│                                                             │
│  ❌ 没有网络能力                                             │
│  ❌ 没有文件系统能力                                         │
│  ❌ 没有执行环境                                             │
│  ❌ 甚至不知道自己生成的文本会被用来做什么                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**关键洞察**：LLM 只是一个"文本生成器"，它生成什么文本，完全取决于训练时学到的模式。它**没有任何**与外部世界交互的能力。

---

## 2. 系统的"桥接"机制

既然 LLM 不能调用工具，那工具是怎么被调用的？

**答案：通过"系统层"桥接。**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Function Calling 架构                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         LLM（大语言模型）                            │   │
│  │                                                                     │   │
│  │  职责：生成文本（包括调用指令）                                      │   │
│  │                                                                     │   │
│  │  输入：用户请求 + 可用工具列表 + 历史对话                            │   │
│  │                                                                     │   │
│  │  输出：                                                             │   │
│  │  ├── 情况1：直接回答（"北京今天晴"）                                │   │
│  │  └── 情况2：调用指令（JSON格式的工具调用）                          │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ 生成文本（可能是JSON）                  │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      系统层（System Layer）                          │   │
│  │                                                                     │   │
│  │  职责：解析LLM输出，执行真实操作，返回结果                           │   │
│  │                                                                     │   │
│  │  步骤：                                                             │   │
│  │  1. 解析LLM输出（是不是JSON？）                                      │   │
│  │  2. 如果是JSON，提取工具名和参数                                     │   │
│  │  3. 执行真实的函数调用（HTTP/文件/脚本）                             │   │
│  │  4. 将结果包装成Prompt，返回给LLM                                    │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ 工具执行结果                            │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         LLM（第二轮）                                │   │
│  │                                                                     │   │
│  │  输入：工具执行结果                                                  │   │
│  │                                                                     │   │
│  │  输出：最终回复（"北京今天晴，25°C"）                                │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│                              返回给用户                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**核心洞察**：
- **LLM 是"指挥官"**：只负责生成调用指令
- **系统是"执行者"**：负责解析指令并真正执行
- **两者通过结构化文本（JSON）通信**

---

## 3. 完整执行流程

### 3.1 多轮循环流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Function Calling 多轮循环                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  第1轮：理解请求                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  用户："帮我查一下北京天气"                                          │   │
│  │                                                                     │   │
│  │  系统构建Prompt：                                                    │   │
│  │  ```                                                                │   │
│  │  你是一个助手。你可以使用以下工具：                                  │   │
│  │                                                                     │   │
│  │  工具1: get_weather                                                 │   │
│  │  - 描述：获取指定城市的天气                                          │   │
│  │  - 参数：{"city": "string"}                                         │   │
│  │                                                                     │   │
│  │  用户请求：帮我查一下北京天气                                        │   │
│  │                                                                     │   │
│  │  如果需要调用工具，请输出JSON格式：                                  │   │
│  │  {"tool": "工具名", "arguments": {"参数": "值"}}                    │   │
│  │  ```                                                                │   │
│  │                                                                     │   │
│  │  LLM思考："用户要查北京天气，我需要调用get_weather工具"              │   │
│  │                                                                     │   │
│  │  LLM输出：                                                           │   │
│  │  {"tool": "get_weather", "arguments": {"city": "北京"}}             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  系统层处理                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1. 解析JSON：tool="get_weather", arguments={"city": "北京"}        │   │
│  │  2. 查找对应函数                                                     │   │
│  │  3. 执行：get_weather("北京")                                       │   │
│  │  4. 发起HTTP请求到天气API                                            │   │
│  │  5. 获得结果：{"temp": 25, "condition": "晴"}                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  第2轮：生成回复                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  系统构建新Prompt：                                                  │   │
│  │  ```                                                                │   │
│  │  工具调用结果：                                                      │   │
│  │  {"temp": 25, "condition": "晴"}                                    │   │
│  │                                                                     │   │
│  │  请根据以上结果回复用户。                                            │   │
│  │  ```                                                                │   │
│  │                                                                     │   │
│  │  LLM思考："天气是25度晴天，我应该用友好的语气回复"                   │   │
│  │                                                                     │   │
│  │  LLM输出："北京今天天气不错，25°C晴天，适合出门！"                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│                              返回给用户                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 为什么需要多轮？

```
单轮对话（无法实现工具调用）：
用户：查北京天气
LLM：我不知道实时天气，我的知识截止到2024年...
❌ 无法获取实时信息

多轮对话（Function Calling）：
第1轮：
用户：查北京天气
LLM：{"tool": "get_weather", "args": {"city": "北京"}}
系统：执行工具 → 返回结果

第2轮：
系统：工具返回 {"temp": 25, "condition": "晴"}
LLM：北京今天25°C，晴天
✅ 成功获取实时信息
```

---

## 4. LLM 怎么知道要输出 JSON？

这是通过**特殊的 Prompt 工程**实现的。

### 4.1 手动方式（早期实现）

```typescript
const systemPrompt = `
你是一个助手。你可以使用以下工具：

工具1: get_weather
- 描述：获取指定城市的天气
- 参数：{"city": "string"}

工具2: save_file
- 描述：保存内容到文件
- 参数：{"path": "string", "content": "string"}

当你需要调用工具时，请严格按照以下 JSON 格式输出，不要添加任何解释：
{"tool": "工具名称", "arguments": {"参数名": "参数值"}}

如果不需要调用工具，直接回答用户问题。
`;

const response = await llm.chat({
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: "帮我查一下北京天气" }
  ]
});

// 解析 LLM 输出
const text = response.choices[0].message.content;

try {
  const toolCall = JSON.parse(text);
  // 是 JSON，执行工具
  const result = await executeTool(toolCall.tool, toolCall.arguments);
} catch (e) {
  // 不是 JSON，直接返回给用户
  return text;
}
```

### 4.2 标准方式（OpenAI Function Calling API）

```typescript
// 更标准的做法：使用 OpenAI 的 Function Calling API
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    { role: "user", content: "帮我查一下北京天气" }
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "获取指定城市的天气",
        parameters: {
          type: "object",
          properties: {
            city: {
              type: "string",
              description: "城市名称"
            }
          },
          required: ["city"]
        }
      }
    }
  ],
  tool_choice: "auto"  // 让模型自动决定是否调用
});

// 检查模型是否要调用工具
const message = response.choices[0].message;

if (message.tool_calls) {
  // 模型要求调用工具
  for (const toolCall of message.tool_calls) {
    const functionName = toolCall.function.name;
    const functionArgs = JSON.parse(toolCall.function.arguments);
    
    console.log(`模型要求调用: ${functionName}`);
    console.log(`参数:`, functionArgs);
    
    // ⚠️ 系统层真正执行！
    const result = await executeTool(functionName, functionArgs);
    
    // 将结果返回给模型
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(result)
    });
  }
  
  // 再次调用模型，让它基于工具结果生成回复
  const finalResponse = await openai.chat.completions.create({
    model: "gpt-4",
    messages: messages
  });
  
  return finalResponse.choices[0].message.content;
} else {
  // 模型直接回答
  return message.content;
}
```

### 4.3 两种方式对比

| 方式 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| **手动 JSON** | 通用，不依赖特定模型 | 需要手动解析，容易出错 | 任何模型 |
| **Function Calling API** | 标准化，结构化，可靠 | 只支持特定模型 | OpenAI、兼容模型 |

---

## 5. 系统层的核心实现

### 5.1 工具注册与执行

```typescript
// 工具注册表
class ToolRegistry {
  private tools: Map<string, ToolImplementation> = new Map();
  
  // 注册工具
  register(name: string, implementation: ToolImplementation) {
    this.tools.set(name, implementation);
  }
  
  // 执行工具
  async execute(name: string, args: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool(args);
  }
  
  // 获取工具列表（用于构建 Prompt）
  getToolDescriptions(): ToolDefinition[] {
    return Array.from(this.tools.entries()).map(([name, impl]) => ({
      name,
      description: impl.description,
      parameters: impl.parameters
    }));
  }
}

// 工具实现示例
const registry = new ToolRegistry();

// 注册天气工具
registry.register("get_weather", async (args: { city: string }) => {
  const response = await fetch(
    `https://api.weather.com/v1/current?city=${args.city}`
  );
  return await response.json();
});

// 注册文件工具
registry.register("save_file", async (args: { path: string; content: string }) => {
  await fs.writeFile(args.path, args.content);
  return { success: true };
});
```

### 5.2 完整的 Function Calling 循环

```typescript
class FunctionCallingAgent {
  private llm: LLMInterface;
  private toolRegistry: ToolRegistry;
  private messages: Message[] = [];
  
  constructor(llm: LLMInterface, tools: ToolRegistry) {
    this.llm = llm;
    this.toolRegistry = tools;
  }
  
  async process(userInput: string): Promise<string> {
    // 1. 添加用户消息
    this.messages.push({
      role: "user",
      content: userInput
    });
    
    // 2. 构建系统提示词（包含工具描述）
    const systemPrompt = this.buildSystemPrompt();
    
    // 3. 调用 LLM
    let response = await this.llm.chat({
      messages: [
        { role: "system", content: systemPrompt },
        ...this.messages
      ]
    });
    
    // 4. 循环处理工具调用
    while (this.isToolCall(response)) {
      // 4.1 解析工具调用
      const toolCalls = this.parseToolCalls(response);
      
      // 4.2 执行工具
      for (const toolCall of toolCalls) {
        console.log(`执行工具: ${toolCall.name}`);
        console.log(`参数:`, toolCall.arguments);
        
        try {
          const result = await this.toolRegistry.execute(
            toolCall.name,
            toolCall.arguments
          );
          
          // 4.3 将结果加入对话历史
          this.messages.push({
            role: "assistant",
            content: null,
            tool_calls: [toolCall]
          });
          
          this.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
          
        } catch (error) {
          // 4.4 处理错误
          this.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error: error instanceof Error ? error.message : "Unknown error"
            })
          });
        }
      }
      
      // 4.5 再次调用 LLM，让它基于工具结果继续
      response = await this.llm.chat({
        messages: [
          { role: "system", content: systemPrompt },
          ...this.messages
        ]
      });
    }
    
    // 5. 返回最终回复
    const finalResponse = response.choices[0].message.content;
    this.messages.push({
      role: "assistant",
      content: finalResponse
    });
    
    return finalResponse;
  }
  
  private buildSystemPrompt(): string {
    const toolDescriptions = this.toolRegistry
      .getToolDescriptions()
      .map(tool => `
工具: ${tool.name}
描述: ${tool.description}
参数: ${JSON.stringify(tool.parameters)}
      `.trim())
      .join("\n\n");
    
    return `
你是一个助手。你可以使用以下工具：

${toolDescriptions}

当你需要调用工具时，请输出 JSON 格式：
{"tool": "工具名", "arguments": {"参数": "值"}}

如果不需要调用工具，直接回答。
    `.trim();
  }
  
  private isToolCall(response: any): boolean {
    const content = response.choices[0].message.content;
    try {
      const parsed = JSON.parse(content);
      return parsed.tool !== undefined;
    } catch {
      return false;
    }
  }
  
  private parseToolCalls(response: any): ToolCall[] {
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);
    return [{
      id: generateId(),
      name: parsed.tool,
      arguments: parsed.arguments
    }];
  }
}
```

---

## 6. 为什么需要 MCP？

理解了 Function Calling 机制后，你可能会问：既然系统层可以实现工具调用，为什么还需要 MCP？

### 6.1 没有 MCP 的问题

```
场景：你的 AI 助手需要集成天气、GitHub、邮件三个功能

没有 MCP：
┌─────────────────────────────────────────────────────────────┐
│                      你的 AI 助手                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  天气功能                                             │   │
│  │  ├── 调用 weather.com API                           │   │
│  │  ├── 处理认证（API Key）                             │   │
│  │  ├── 解析响应格式                                    │   │
│  │  └── 错误处理                                        │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  GitHub 功能                                          │   │
│  │  ├── 调用 GitHub API                                │   │
│  │  ├── 处理 OAuth 认证                                 │   │
│  │  ├── 解析 GraphQL 响应                               │   │
│  │  └── 错误处理                                        │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  邮件功能                                             │   │
│  │  ├── 调用 SMTP 服务                                  │   │
│  │  ├── 处理邮件模板                                    │   │
│  │  ├── 管理附件                                        │   │
│  │  └── 错误处理                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  问题：                                                      │
│  ├── 每个功能都要写适配代码                                  │
│  ├── 不同 API 格式不同，需要分别处理                         │
│  ├── 认证方式不同，需要分别管理                              │
│  └── 想换天气提供商？重写！                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 有 MCP 的解决方案

```
有 MCP：
┌─────────────────────────────────────────────────────────────┐
│                      你的 AI 助手                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  MCP Client（统一实现）                               │   │
│  │  ├── 发现工具：tools/list                             │   │
│  │  ├── 调用工具：tools/call                             │   │
│  │  └── 读取资源：resources/read                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│                            │ MCP 协议（JSON-RPC 2.0）       │
│                            ▼                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  MCP Server（天气）   MCP Server（GitHub）           │   │
│  │  ├── 实现天气查询     ├── 实现 GitHub 操作           │   │
│  │  └── 暴露标准接口     └── 暴露标准接口               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  优势：                                                      │
│  ├── 每个 Server 独立开发和维护                              │
│  ├── 统一接口，无需适配                                      │
│  ├── 即插即用，配置即可使用                                  │
│  └── 社区生态，直接使用他人开发的 Server                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 MCP 的核心价值

| 价值 | 说明 |
|------|------|
| **标准化** | 统一的工具定义格式、调用方式、返回格式 |
| **解耦** | AI 应用和工具实现完全解耦 |
| **复用** | 一个 Server 可以被多个 AI 应用使用 |
| **生态** | 社区共享，像安装 App 一样安装工具 |

---

## 7. 本章小结

```
核心认知

LLM 的本质
├── 输入文本 → 输出文本
├── 没有网络、文件系统、执行环境能力
└── 只是一个"文本生成器"

Function Calling 机制
├── LLM 生成调用指令（JSON格式）
├── 系统层解析并执行真实操作
├── 结果返回给 LLM 生成最终回复
└── 多轮循环直到任务完成

关键洞察
├── LLM 是"指挥官"，只生成指令
├── 系统是"执行者"，真正动手
├── 两者通过结构化文本通信
└── MCP 标准化了工具连接协议

为什么需要 MCP
├── 解决 N×M 集成困境
├── 标准化接口，即插即用
└── 构建可复用的工具生态
```

---

## 8. 动手实践

### 8.1 实现一个最小化的 Function Calling 系统

```typescript
// minimal-function-calling.ts

interface Tool {
  name: string;
  description: string;
  execute: (args: any) => Promise<any>;
}

class MinimalFunctionCalling {
  private tools: Map<string, Tool> = new Map();
  private llm: (prompt: string) => Promise<string>;
  
  constructor(llm: (prompt: string) => Promise<string>) {
    this.llm = llm;
  }
  
  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }
  
  async process(userInput: string): Promise<string> {
    // 构建系统提示词
    const toolDescriptions = Array.from(this.tools.values())
      .map(t => `工具: ${t.name}\n描述: ${t.description}`)
      .join("\n\n");
    
    const systemPrompt = `
你是一个助手。你可以使用以下工具：

${toolDescriptions}

如果需要调用工具，请输出JSON格式：
{"tool": "工具名", "arguments": {"参数": "值"}}

用户请求：${userInput}
    `.trim();
    
    // 调用 LLM
    const response = await this.llm(systemPrompt);
    
    // 检查是否是工具调用
    try {
      const toolCall = JSON.parse(response);
      if (toolCall.tool && this.tools.has(toolCall.tool)) {
        // 执行工具
        const tool = this.tools.get(toolCall.tool)!;
        const result = await tool.execute(toolCall.arguments);
        
        // 再次调用 LLM 生成回复
        const finalPrompt = `
工具调用结果：${JSON.stringify(result)}

请根据以上结果回复用户。
        `.trim();
        
        return await this.llm(finalPrompt);
      }
    } catch {
      // 不是 JSON，直接返回
    }
    
    return response;
  }
}

// 使用示例
const agent = new MinimalFunctionCalling(async (prompt) => {
  // 这里接入真实的 LLM API
  // 示例使用模拟
  if (prompt.includes("天气")) {
    return '{"tool": "get_weather", "arguments": {"city": "北京"}}';
  }
  return "直接回答";
});

// 注册工具
agent.registerTool({
  name: "get_weather",
  description: "获取指定城市的天气",
  execute: async (args: { city: string }) => {
    // 模拟 API 调用
    return { city: args.city, temp: 25, condition: "晴" };
  }
});

// 运行
agent.process("帮我查一下北京天气").then(console.log);
// 输出：北京今天25°C，晴天
```

---

## 下一步

继续阅读：
- [09-tool-vs-skill-discovery.md](../PART4-Skills-System/09-tool-vs-skill-discovery.md) — Tool 与 Skill 发现机制对比
- [02-react-pattern.md](02-react-pattern.md) — ReAct 推理模式

---

_Last updated: 2026-04-02_
