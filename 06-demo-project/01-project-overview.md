# 演示项目：智能旅行助手

> 完整的 Agent + MCP + Skills 实现示例

---

## 1. 项目概述

### 1.1 项目目标

构建一个**智能旅行助手**，演示：
- ✅ MCP Server 开发（天气查询服务）
- ✅ Skills 开发（旅行规划技能）
- ✅ Agent 实现（协调 MCP 和 Skills）
- ✅ 完整的工作流程

### 1.2 功能特性

```
用户输入: "我想去北京旅游，帮我规划一下"
    │
    ▼
┌─────────────────────────────────────────┐
│  Agent                                  │
│  1. 理解意图 → 需要天气 + 行程规划       │
│  2. 调用 MCP → 查询北京天气              │
│  3. 加载 Skill → 获取旅行规划知识        │
│  4. 整合输出 → 完整旅行方案              │
└─────────────────────────────────────────┘
    │
    ▼
输出:
🌍 北京旅行规划
━━━━━━━━━━━━━━━━━━
🌤️ 天气: 晴天 25°C
📅 Day 1: 故宫 → 天安门
📅 Day 2: 长城 → 颐和园
💡 建议: 带薄外套，预约门票
```

### 1.3 技术栈

- **语言**: TypeScript / Node.js
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **架构**: ReAct Agent + MCP + Skills

---

## 2. 项目结构

```
06-demo-project/
├── 01-project-overview.md      # 本文件
├── 02-mcp-server/              # MCP Server 实现
│   ├── src/
│   │   ├── server.ts          # Server 主类
│   │   ├── tools.ts           # 工具定义
│   │   └── index.ts           # 入口
│   ├── package.json
│   └── tsconfig.json
├── 03-skills/                  # Skills 定义
│   └── travel/
│       └── SKILL.md           # 旅行规划技能
├── 04-agent/                   # Agent 实现
│   ├── src/
│   │   ├── agent.ts           # Agent 主类
│   │   ├── react.ts           # ReAct 实现
│   │   ├── memory.ts          # 记忆系统
│   │   └── index.ts           # 入口
│   ├── package.json
│   └── tsconfig.json
├── 05-integration/             # 整合运行
│   └── demo.ts                # 完整演示
└── README.md                   # 快速开始
```

---

## 3. 快速开始

### 3.1 安装依赖

```bash
# 1. 进入项目目录
cd 06-demo-project

# 2. 安装 MCP Server 依赖
cd 02-mcp-server
npm install

# 3. 安装 Agent 依赖
cd ../04-agent
npm install

# 4. 返回根目录
cd ..
```

### 3.2 运行演示

```bash
# 运行完整演示
npx ts-node 05-integration/demo.ts
```

### 3.3 分步测试

```bash
# 测试 MCP Server
cd 02-mcp-server
npm run test

# 测试 Agent
cd ../04-agent
npm run test
```

---

## 4. 核心代码预览

### 4.1 MCP Server（天气服务）

```typescript
// 02-mcp-server/src/server.ts
class WeatherServer {
  private server: Server;
  
  constructor() {
    this.server = new Server(
      { name: "weather-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    
    this.setupTools();
  }
  
  private setupTools(): void {
    // 工具: 查询天气
    this.server.setRequestHandler("tools/call", async (request) => {
      if (request.params.name === "get_weather") {
        const { city } = request.params.arguments;
        const weather = await this.fetchWeather(city);
        
        return {
          content: [{ type: "text", text: weather }]
        };
      }
      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }
  
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("Weather server started");
  }
}
```

### 4.2 Skill（旅行规划）

```markdown
<!-- 03-skills/travel/SKILL.md -->
---
name: travel-planner
description: 专业旅行规划助手
tools:
  - weather.get
---

## 工作流程

1. 查询目的地天气
2. 根据天气推荐景点
3. 规划每日行程
4. 提供实用建议

## 输出格式

```
🌍 {城市}旅行规划
━━━━━━━━━━━━━━━━━━
🌤️ 天气: {天气信息}
📅 Day 1: {行程}
📅 Day 2: {行程}
💡 建议: {实用建议}
```
```

### 4.3 Agent（协调器）

```typescript
// 04-agent/src/agent.ts
class TravelAgent {
  private mcpClient: Client;
  private skillLoader: SkillLoader;
  private llm: LLMInterface;
  
  async run(userInput: string): Promise<string> {
    // 1. 理解意图
    const intent = await this.understand(userInput);
    
    // 2. 查询天气（MCP）
    const weather = await this.mcpClient.callTool({
      name: "get_weather",
      arguments: { city: intent.city }
    });
    
    // 3. 加载 Skill
    const skill = this.skillLoader.load("./skills/travel");
    
    // 4. 生成规划
    return await this.generatePlan(intent.city, weather, skill);
  }
}
```

---

## 5. 工作流程详解

### 5.1 完整流程图

```
用户: "我想去北京旅游"
    │
    ▼
┌─────────────────────────────────────────┐
│ Step 1: Agent 理解意图                   │
│                                         │
│  LLM 分析:                               │
│  - 意图: travel_planning                │
│  - 实体: city = "北京"                   │
│  - 需求: 天气 + 行程规划                  │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ Step 2: 调用 MCP Server                  │
│                                         │
│  Request:                                │
│  {                                        │
│    "method": "tools/call",               │
│    "params": {                           │
│      "name": "get_weather",              │
│      "arguments": { "city": "北京" }      │
│    }                                     │
│  }                                        │
│                                         │
│  Response:                               │
│  {                                        │
│    "content": [{                         │
│      "type": "text",                     │
│      "text": "北京: 晴天 25°C"            │
│    }]                                     │
│  }                                        │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ Step 3: 加载 Skill                       │
│                                         │
│  解析 SKILL.md:                          │
│  - 读取 YAML frontmatter                 │
│  - 解析 Markdown 内容                    │
│  - 构建系统提示词                        │
│                                         │
│  注入到 Agent 上下文:                     │
│  "你具备旅行规划技能..."                  │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ Step 4: 生成最终回复                     │
│                                         │
│  LLM 输入:                               │
│  - 用户请求                              │
│  - 天气数据                              │
│  - Skill 知识                            │
│                                         │
│  LLM 输出:                               │
│  🌍 北京旅行规划                          │
│  ━━━━━━━━━━━━━━━━━━                     │
│  🌤️ 天气: 晴天 25°C                      │
│  📅 Day 1: 故宫 → 天安门                 │
│  💡 建议: 带薄外套                        │
└─────────────────────────────────────────┘
    │
    ▼
用户收到完整旅行规划
```

---

## 6. 关键实现细节

### 6.1 MCP 通信流程

```typescript
// 建立连接
const client = new Client({ name: "agent", version: "1.0.0" }, {});
const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"]
});
await client.connect(transport);

// 发现工具
const tools = await client.listTools();
console.log("Available tools:", tools);

// 调用工具
const result = await client.callTool({
  name: "get_weather",
  arguments: { city: "北京" }
});
```

### 6.2 Skill 解析流程

```typescript
// 读取 SKILL.md
const content = fs.readFileSync("SKILL.md", "utf8");

// 分离 frontmatter 和 content
const { frontmatter, markdown } = splitContent(content);

// 解析 YAML
const metadata = yaml.parse(frontmatter);

// 解析 Markdown 章节
const sections = parseMarkdown(markdown);

// 构建提示词
const prompt = buildPrompt(metadata, sections);
```

### 6.3 Agent 决策流程

```typescript
// ReAct 循环
async function reactLoop(input: string) {
  const context = [];
  
  for (let i = 0; i < maxIterations; i++) {
    // Thought
    const thought = await llm.complete(buildThoughtPrompt(input, context));
    context.push({ type: "thought", content: thought });
    
    // Action
    const action = await llm.complete(buildActionPrompt(context));
    
    if (action.type === "finish") {
      return action.result;
    }
    
    // Observation
    const observation = await executeAction(action);
    context.push({ type: "observation", content: observation });
  }
}
```

---

## 7. 扩展练习

### 练习 1: 添加新工具
在 MCP Server 中添加：
```typescript
// 查询景点
server.registerTool("get_attractions", {
  description: "查询城市热门景点",
  parameters: {
    city: { type: "string" }
  }
});
```

### 练习 2: 增强 Skill
在 SKILL.md 中添加：
```markdown
## 美食推荐

根据城市推荐特色美食...

## 交通指南

提供交通出行建议...
```

### 练习 3: 添加记忆功能
在 Agent 中实现：
```typescript
// 保存用户偏好
await memory.add(`User prefers ${preference}`, "long_term");

// 检索历史
const history = await memory.retrieve(userInput);
```

---

## 8. 调试技巧

### 8.1 日志记录

```typescript
// 启用详细日志
const DEBUG = true;

function log(step: string, data: unknown) {
  if (DEBUG) {
    console.log(`[${step}]`, JSON.stringify(data, null, 2));
  }
}

// 使用
log("MCP Request", request);
log("MCP Response", response);
```

### 8.2 分步测试

```typescript
// 单独测试 MCP
async function testMCP() {
  const client = new Client(...);
  await client.connect(transport);
  const result = await client.callTool({...});
  console.log(result);
}

// 单独测试 Skill
async function testSkill() {
  const skill = skillLoader.load("./skills/travel");
  console.log(skill.prompt);
}
```

---

## 9. 常见问题

### Q: MCP Server 启动失败？
A: 检查：
1. Node.js 版本 >= 18
2. 依赖已安装
3. 端口未被占用

### Q: Skill 解析错误？
A: 检查：
1. YAML frontmatter 格式正确
2. 分隔符 `---` 存在
3. 必填字段已填写

### Q: Agent 不调用工具？
A: 检查：
1. 工具已正确注册
2. LLM 提示词包含工具描述
3. 参数格式正确

---

## 10. 下一步

1. **阅读源码**: 查看 `02-mcp-server/`, `03-skills/`, `04-agent/` 的完整实现
2. **运行演示**: 执行 `05-integration/demo.ts`
3. **修改实验**: 尝试添加新功能
4. **深入学习**: 回到前面的章节，理解每个组件的详细实现

---

*开始你的 Agent 开发之旅！*
