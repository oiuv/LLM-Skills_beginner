# 完整演示项目：天气 + GitHub 助手

> 本章目标：通过一个完整的项目，整合 MCP Server、MCP Client、Skills 和 Agent 的所有知识点。学完本章后，你应能独立完成一个完整的 Agent 项目。

---

## 1. 项目概述

### 1.1 项目目标

构建一个**天气 + GitHub 助手**，让用户可以：

- 查询全球城市的天气
- 搜索 GitHub 仓库
- 根据天气和 GitHub 活动生成旅行建议

### 1.2 技术架构

```
┌──────────────────────────────────────────────────────────────────┐
│                         项目架构                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                      CLI / Web UI                       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                    │
│                              ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                     Agent (ReAct)                        │   │
│   │  - Intent Parser                                        │   │
│   │  - Memory System                                        │   │
│   │  - Tool Orchestrator                                    │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                    │
│                              ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    MCP Client                             │   │
│   │  - Weather Server Client                                 │   │
│   │  - GitHub Server Client                                  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                    │
│              ┌───────────────┼───────────────┐                 │
│              ▼                               ▼                 │
│   ┌─────────────────────┐     ┌─────────────────────┐         │
│   │   Weather MCP Server │     │  GitHub MCP Server  │         │
│   │  - get_weather      │     │  - search_repo     │         │
│   │  - get_forecast      │     │  - get_repo_info   │         │
│   │  - get_air_quality   │     │  - list_commits    │         │
│   └─────────────────────┘     └─────────────────────┘         │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. 项目结构

```
demo-project/
├── README.md
├── package.json
├── tsconfig.json
│
├── servers/
│   ├── weather-server/          # 天气 MCP Server
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── tools.ts
│   │   │   └── weather-api.ts
│   │   ├── SKILL.md
│   │   └── package.json
│   │
│   └── github-server/           # GitHub MCP Server
│       ├── src/
│       │   ├── index.ts
│       │   ├── tools.ts
│       │   └── github-api.ts
│       ├── SKILL.md
│       └── package.json
│
├── src/
│   ├── agent/
│   │   ├── index.ts            # Agent 入口
│   │   ├── intent-parser.ts    # 意图解析
│   │   ├── react-executor.ts   # ReAct 执行器
│   │   └── memory.ts           # 记忆系统
│   │
│   ├── mcp/
│   │   ├── client.ts          # MCP Client 封装
│   │   └── tool-registry.ts    # 工具注册表
│   │
│   ├── skills/
│   │   ├── loader.ts          # Skill 加载器
│   │   └── skill-templates/    # Skill 模板
│   │
│   └── cli.ts                  # CLI 入口
│
└── tests/
    └── integration.test.ts    # 集成测试
```

---

## 3. Weather MCP Server 实现（2026-07-28 版本）

### 3.1 工具定义

```typescript
// servers/weather-server/src/tools.ts

import { z } from "zod";

// 使用 Zod schema 定义工具（2026-07-28 版本）
export const getWeatherTool = {
  name: "get_weather",
  title: "天气查询",
  description: "获取城市实时天气，包括温度、湿度、风速等",
  inputSchema: z.object({
    city: z.string().describe("城市名称（中文或英文）"),
    units: z.enum(["metric", "imperial"]).default("metric").describe("温度单位"),
  }),
};

export const getForecastTool = {
  name: "get_forecast",
  title: "天气预报",
  description: "获取城市天气预报，支持 1-7 天",
  inputSchema: z.object({
    city: z.string().describe("城市名称"),
    days: z.number().min(1).max(7).default(3).describe("预报天数"),
  }),
};

export const getAirQualityTool = {
  name: "get_air_quality",
  title: "空气质量",
  description: "获取城市空气质量指数（AQI）",
  inputSchema: z.object({
    city: z.string().describe("城市名称"),
  }),
};
```

### 3.2 Server 主类

```typescript
// servers/weather-server/src/index.ts

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { WeatherAPI } from "./weather-api";

// 创建 MCP Server 实例（新 API：McpServer）
const server = new McpServer({
  name: "weather-server",
  version: "1.0.0",
});

const weatherAPI = new WeatherAPI();

// 注册工具（新 API：registerTool + Zod schema）
server.registerTool(
  "get_weather",
  {
    title: "天气查询",
    description: "获取城市实时天气，包括温度、湿度、风速等",
    inputSchema: z.object({
      city: z.string().describe("城市名称（中文或英文）"),
      units: z.enum(["metric", "imperial"]).default("metric").describe("温度单位"),
    }),
  },
  async ({ city, units }) => {
    const result = await weatherAPI.getWeather(city, units);
    return {
      content: [{ type: "text" as const, text: result }],
    };
  }
);

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

  try {
    let result: unknown;

    switch (name) {
      case "get_weather":
        result = await weatherAPI.getWeather(args.city, args.units || "metric");
        break;

      case "get_forecast":
        result = await weatherAPI.getForecast(args.city, args.days || 3);
        break;

      case "get_air_quality":
        result = await weatherAPI.getAirQuality(args.city);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Weather MCP Server started");
}

main().catch(console.error);
```

### 3.3 Weather API 模拟

```typescript
// servers/weather-server/src/weather-api.ts

interface WeatherData {
  city: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  updatedAt: string;
}

export class WeatherAPI {
  /**
   * 获取实时天气（模拟数据）
   */
  async getWeather(city: string, units: "metric" | "imperial" = "metric"): Promise<WeatherData> {
    // 模拟 API 延迟
    await this.delay(100);

    // 模拟数据
    const temp = Math.round(Math.random() * 30 + 5);
    const conditions = ["晴", "多云", "阴", "小雨", "雷阵雨"];

    return {
      city,
      temperature: units === "metric" ? temp : Math.round(temp * 9/5 + 32),
      condition: conditions[Math.floor(Math.random() * conditions.length)],
      humidity: Math.round(Math.random() * 40 + 40),
      windSpeed: Math.round(Math.random() * 10 + 2),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * 获取天气预报
   */
  async getForecast(city: string, days: number = 3): Promise<WeatherData[]> {
    await this.delay(150);

    const forecast: WeatherData[] = [];
    const conditions = ["晴", "多云", "阴", "小雨"];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);

      forecast.push({
        city,
        temperature: Math.round(Math.random() * 20 + 10),
        condition: conditions[Math.floor(Math.random() * conditions.length)],
        humidity: Math.round(Math.random() * 40 + 40),
        windSpeed: Math.round(Math.random() * 8 + 2),
        updatedAt: date.toISOString()
      });
    }

    return forecast;
  }

  /**
   * 获取空气质量
   */
  async getAirQuality(city: string): Promise<{ city: string; aqi: number; level: string }> {
    await this.delay(100);

    const aqi = Math.round(Math.random() * 150 + 20);
    let level: string;

    if (aqi <= 50) level = "优";
    else if (aqi <= 100) level = "良";
    else if (aqi <= 150) level = "轻度污染";
    else if (aqi <= 200) level = "中度污染";
    else level = "重度污染";

    return { city, aqi, level };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 3.4 package.json

```json
{
  "name": "weather-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^1.0.0",
    "@modelcontextprotocol/client": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

---

## 4. GitHub MCP Server 实现

### 4.1 工具定义

```typescript
// servers/github-server/src/tools.ts

import { z } from "zod";

export const githubTools: Tool[] = [
  {
    name: "search_repositories",
    description: "搜索 GitHub 仓库",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词"
        },
        language: {
          type: "string",
          description: "编程语言筛选"
        },
        limit: {
          type: "number",
          default: 5,
          maximum: 20,
          description: "返回数量"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "get_repository",
    description: "获取仓库详细信息",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "list_commits",
    description: "获取仓库最近提交记录",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        limit: {
          type: "number",
          default: 10,
          maximum: 50
        }
      },
      required: ["owner", "repo"]
    }
  }
];
```

### 4.2 Server 主类

```typescript
// servers/github-server/src/index.ts

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { githubTools } from "./tools";
import { GitHubAPI } from "./github-api";

const server = new Server(
  { name: "github-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const githubAPI = new GitHubAPI();

server.setRequestHandler(ListToolsRequest, async () => {
  return { tools: githubTools };
});

server.setRequestHandler(CallToolRequest, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case "search_repositories":
        result = await githubAPI.searchRepos(args.query, args.language, args.limit || 5);
        break;

      case "get_repository":
        result = await githubAPI.getRepo(args.owner, args.repo);
        break;

      case "list_commits":
        result = await githubAPI.getCommits(args.owner, args.repo, args.limit || 10);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub MCP Server started");
}

main().catch(console.error);
```

---

## 5. Agent 实现

### 5.1 MCP Client 封装

```typescript
// src/mcp/client.ts

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

interface Tool {
  name: string;
  description: string;
  inputSchema: object;
}

export class MCPClientManager {
  private clients: Map<string, Client> = new Map();

  async connect(name: string, command: string, args: string[] = []): Promise<void> {
    const client = new Client(
      { name: `${name}-client`, version: "1.0.0" },
      { capabilities: { roots: { listChanged: true } } }
    );

    const transport = new StdioClientTransport({ command, args });
    await client.connect(transport);

    this.clients.set(name, client);
    console.log(`Connected to ${name}`);
  }

  async listTools(name: string): Promise<Tool[]> {
    const client = this.clients.get(name);
    if (!client) throw new Error(`Client ${name} not found`);

    const response = await client.request({ method: "tools/list" }, { tools: {} });
    return response.tools;
  }

  async callTool(name: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const client = this.clients.get(name);
    if (!client) throw new Error(`Client ${name} not found`);

    const response = await client.request(
      { method: "tools/call", params: { name: toolName, arguments: args } },
      { tools: {} }
    );

    return response.content;
  }

  async disconnect(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.close();
      this.clients.delete(name);
    }
  }
}
```

### 5.2 ReAct Agent 实现

```typescript
// src/agent/react-executor.ts

import { MCPClientManager } from "../mcp/client";

interface ReActStep {
  thought: string;
  action?: {
    tool: string;
    params: Record<string, unknown>;
  };
  observation?: string;
}

export class ReActExecutor {
  private maxIterations = 5;

  constructor(
    private llm: (prompt: string) => Promise<string>,
    private mcpManager: MCPClientManager
  ) {}

  async execute(userInput: string): Promise<string> {
    const history: ReActStep[] = [];

    for (let i = 0; i < this.maxIterations; i++) {
      // 1. Thought
      const thoughtPrompt = this.buildThoughtPrompt(userInput, history);
      const thought = await this.llm(thoughtPrompt);
      history.push({ thought });

      // 2. 决定行动
      const actionPrompt = this.buildActionPrompt(thought, history);
      const actionResponse = await this.llm(actionPrompt);

      try {
        const action = this.parseAction(actionResponse);

        if (action.type === "respond") {
          return action.content;
        }

        // 3. 执行行动
        const [server, tool] = action.tool.split(".");
        const observation = await this.mcpManager.callTool(server, tool, action.params);
        history[history.length - 1].action = action;
        history[history.length - 1].observation = JSON.stringify(observation);

      } catch (error) {
        history[history.length - 1].action = { tool: "error", params: {} };
        history[history.length - 1].observation = `Error: ${error.message}`;
      }
    }

    return "抱歉，我无法完成这个任务。";
  }

  private buildThoughtPrompt(input: string, history: ReActStep[]): string {
    const historyText = history.length > 0
      ? history.map(h => `Thought: ${h.thought}\nAction: ${h.action ? JSON.stringify(h.action) : 'N/A'}\nObservation: ${h.observation || 'N/A'}`).join("\n\n")
      : "";

    return `
分析用户请求，决定下一步行动。

用户输入: ${input}

对话历史:
${historyText}

请分析当前状态，用一句话描述你的思考。
`;
  }

  private buildActionPrompt(thought: string, history: ReActStep[]): string {
    return `
根据你的思考，决定下一步行动。

思考: ${thought}

可用工具:
- weather.get_weather: 获取城市天气
- weather.get_forecast: 获取天气预报
- weather.get_air_quality: 获取空气质量
- github.search_repositories: 搜索 GitHub 仓库
- github.get_repository: 获取仓库详情

返回 JSON 格式：
{
  "type": "tool_call" | "respond",
  "tool": "server.toolname（如果是 tool_call）",
  "params": { "参数": "值" },
  "content": "回复内容（如果是 respond）"
}
`;
  }

  private parseAction(response: string): { type: string; tool?: string; params?: Record<string, unknown>; content?: string } {
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return { type: "respond", content: response };
  }
}
```

### 5.3 CLI 入口

```typescript
// src/cli.ts

import * as readline from "readline";
import { MCPClientManager } from "./mcp/client";
import { ReActExecutor } from "./agent/react-executor";

async function main() {
  console.log("=== 天气 + GitHub 助手 ===\n");

  // 连接 MCP Servers
  const mcpManager = new MCPClientManager();

  await mcpManager.connect("weather", "node", ["servers/weather-server/dist/index.js"]);
  await mcpManager.connect("github", "node", ["servers/github-server/dist/index.js"]);

  // 创建 LLM 模拟（实际应接入真实 LLM）
  const llm = async (prompt: string): Promise<string> => {
    // 简单模拟，实际应调用 OpenAI/Claude 等
    if (prompt.includes("天气")) {
      return JSON.stringify({ type: "tool_call", tool: "weather.get_weather", params: { city: "北京" } });
    }
    if (prompt.includes("GitHub")) {
      return JSON.stringify({ type: "tool_call", tool: "github.search_repositories", params: { query: "model context protocol" } });
    }
    return JSON.stringify({ type: "respond", content: "好的，我来帮你处理。" });
  };

  // 创建 Agent
  const agent = new ReActExecutor(llm, mcpManager);

  // CLI 循环
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = () => {
    rl.question("\n你: ", async (input) => {
      if (input.toLowerCase() === "exit") {
        rl.close();
        await mcpManager.disconnect("weather");
        await mcpManager.disconnect("github");
        console.log("\n再见！");
        return;
      }

      const response = await agent.execute(input);
      console.log(`\n助手: ${response}`);

      ask();
    });
  };

  ask();
}

main().catch(console.error);
```

---

## 6. 运行项目

### 6.1 安装依赖

```bash
# 安装所有 Server 依赖
cd servers/weather-server && npm install
cd servers/github-server && npm install

# 构建 TypeScript
cd servers/weather-server && npm run build
cd servers/github-server && npm run build

# 安装主项目依赖
cd demo-project && npm install
```

### 6.2 运行

```bash
# 编译后运行
npm run build
npm start

# 或直接运行 CLI
npx ts-node src/cli.ts
```

### 6.3 测试交互

```
=== 天气 + GitHub 助手 ===

你: 北京今天天气怎么样？
助手: 正在查询北京天气...

你: 搜索一下 MCP 相关的仓库
助手: 正在搜索 GitHub...

你: exit
再见！
```

---

## 7. 扩展建议

### 7.1 添加 Skills

```markdown
<!-- servers/weather-server/SKILL.md -->
---
name: weather_assistant
description: 查询天气和预报
tools:
  - weather.get_weather
  - weather.get_forecast
---

## 工作流程

1. 理解用户需求（实时/预报）
2. 调用相应工具
3. 格式化输出
```

### 7.2 添加记忆

在 Agent 中集成 Memory System，实现跨会话记住用户偏好。

### 7.3 添加更多工具

- 添加 GitHub Actions 工具
- 添加文件操作工具
- 添加数据库工具

---

## 8. 本章小结

```
项目完整实现了
├── MCP Server：Weather Server 和 GitHub Server
├── MCP Client：通过 stdio 连接 Server
├── Agent：基于 ReAct 模式
├── Skills：SKILL.md 规范定义
└── CLI：用户交互界面

关键代码
├── tools.ts：MCP 工具定义
├── index.ts：Server 主类
├── client.ts：Client 封装
└── react-executor.ts：ReAct 执行器

运行方式
├── npm install
├── npm run build
└── npm start
```

---

## PART6 总结

```
PART6-Demo-Project 完整内容
├── 01-project-overview    项目概述、架构、完整实现
```

---

## 下一步

继续阅读：
- [PART7-Production/01-deployment-guide.md](../PART7-Production/01-deployment-guide.md) — 生产部署指南
