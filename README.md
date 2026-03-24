# LLM Agent Development Guide

> 面向开发者的 Agent + MCP + Skills 完整技术指南

---

## 📚 项目简介

本项目是一个**面向开发者的深度技术教程**，从零开始讲解如何构建生产级的 AI Agent 系统，包括：

- **MCP 协议** - 完整的协议规范和实现细节
- **MCP Server 开发** - 从零构建工具服务
- **MCP Client 开发** - 工具发现和调用
- **Skills 规范** - 技能定义和管理系统
- **Agent 架构** - ReAct 模式、记忆系统、工具编排
- **完整项目** - 可运行的演示项目

### 适合人群

- ✅ 有编程经验的开发者
- ✅ 需要实现 MCP/Agent 的工程师
- ✅ 想了解底层原理的技术人员
- ✅ 构建 AI 应用的技术团队

### 前置知识

- TypeScript/JavaScript 基础
- Node.js 开发经验
- 了解基本的 AI 概念（LLM、Prompt 等）

---

## 📁 项目结构

```
LLM-Agent-Development-Guide/
│
├── 01-mcp-protocol/              # MCP 协议详解
│   ├── 01-protocol-overview.md   # 协议架构总览
│   ├── 02-json-rpc-spec.md       # JSON-RPC 规范
│   ├── 03-message-types.md       # 消息类型
│   ├── 04-lifecycle.md           # 生命周期管理
│   ├── 05-transport-layer.md     # 传输层实现
│   └── 06-error-handling.md      # 错误处理
│
├── 02-mcp-server-dev/            # MCP Server 开发
│   ├── 01-server-architecture.md # Server 架构
│   ├── 02-tool-definition.md     # 工具定义
│   ├── 03-resource-management.md # 资源管理
│   ├── 04-prompt-management.md   # 提示词管理
│   ├── 05-permission-control.md  # 权限控制
│   └── 06-complete-example.md    # 完整示例
│
├── 03-mcp-client-dev/            # MCP Client 开发
│   ├── 01-client-architecture.md # Client 架构
│   ├── 02-connection-mgmt.md     # 连接管理
│   ├── 03-tool-discovery.md      # 工具发现
│   ├── 04-tool-invocation.md     # 工具调用
│   └── 05-complete-example.md    # 完整示例
│
├── 04-skills-spec/               # Skills 规范
│   ├── 01-skills-specification.md # 完整规范
│   ├── 02-advanced-features.md   # 高级特性
│   └── 03-skill-marketplace.md   # 技能市场
│
├── 05-agent-implementation/      # Agent 实现
│   ├── 01-agent-architecture.md  # Agent 架构
│   ├── 02-react-pattern.md       # ReAct 模式
│   ├── 03-memory-system.md       # 记忆系统
│   ├── 04-tool-orchestration.md  # 工具编排
│   └── 05-complete-example.md    # 完整示例
│
├── 06-demo-project/              # 演示项目
│   ├── 01-project-overview.md    # 项目概述
│   ├── 02-mcp-server/            # MCP Server 代码
│   ├── 03-skills/                # Skills 定义
│   ├── 04-agent/                 # Agent 代码
│   └── 05-integration/           # 整合运行
│
├── 07-production/                # 生产环境
│   ├── 01-performance.md         # 性能优化
│   ├── 02-security.md            # 安全配置
│   ├── 03-monitoring.md          # 监控日志
│   └── 04-testing.md             # 测试策略
│
└── README.md                     # 本文件
```

---

## 🚀 快速开始

### 方式一：按顺序学习（推荐）

```
Phase 1: 协议基础（2小时）
├── 01-mcp-protocol/
│   ├── 01-protocol-overview.md      [必读]
│   ├── 02-json-rpc-spec.md          [必读]
│   └── 03-message-types.md          [必读]

Phase 2: Server 开发（3小时）
├── 02-mcp-server-dev/
│   ├── 01-server-architecture.md    [必读]
│   ├── 02-tool-definition.md        [必读]
│   └── 06-complete-example.md       [代码实践]

Phase 3: Client 开发（2小时）
├── 03-mcp-client-dev/
│   ├── 01-client-architecture.md    [必读]
│   └── 05-complete-example.md       [代码实践]

Phase 4: Skills 开发（2小时）
├── 04-skills-spec/
│   └── 01-skills-specification.md   [必读+实践]

Phase 5: Agent 实现（4小时）
├── 05-agent-implementation/
│   ├── 01-agent-architecture.md     [必读]
│   ├── 02-react-pattern.md          [必读]
│   └── 05-complete-example.md       [代码实践]

Phase 6: 完整项目（3小时）
└── 06-demo-project/
    └── 01-project-overview.md       [完整实践]
```

### 方式二：按需查阅

| 我想了解... | 阅读章节 |
|------------|---------|
| MCP 协议是什么 | `01-mcp-protocol/01-protocol-overview.md` |
| 如何开发 MCP Server | `02-mcp-server-dev/` |
| 如何开发 MCP Client | `03-mcp-client-dev/` |
| Skills 如何定义 | `04-skills-spec/01-skills-specification.md` |
| Agent 如何实现 | `05-agent-implementation/` |
| 完整项目示例 | `06-demo-project/` |

### 方式三：直接运行演示

```bash
# 1. 克隆项目
cd LLM-Agent-Development-Guide

# 2. 安装依赖
cd 06-demo-project/02-mcp-server && npm install
cd ../04-agent && npm install

# 3. 运行演示
cd ../05-integration
npx ts-node demo.ts
```

---

## 📖 核心内容概览

### 1. MCP 协议

**核心概念**:
- JSON-RPC 2.0 消息格式
- Request/Response/Notification 三种消息类型
- Capability 能力协商机制
- stdio/SSE 传输层

**关键代码**:
```typescript
// 消息格式
interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

// 能力协商
interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean };
}
```

### 2. MCP Server

**核心组件**:
- 请求路由器
- 工具注册表
- 并发控制器
- 错误处理器

**关键代码**:
```typescript
class MCPServer {
  private router = new Router();
  private tools = new Map();
  
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }
  
  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    return this.router.handle(request);
  }
}
```

### 3. MCP Client

**核心组件**:
- 连接管理器
- 工具发现器
- 调用执行器
- 通知处理器

**关键代码**:
```typescript
class MCPClient {
  async connect(transport: Transport): Promise<void>;
  async listTools(): Promise<Tool[]>;
  async callTool(name: string, params: object): Promise<ToolResult>;
}
```

### 4. Skills

**核心概念**:
- SKILL.md 格式（YAML + Markdown）
- 三层架构（内置/托管/工作区）
- 门控条件（Gate）
- 版本管理

**关键代码**:
```typescript
class SkillParser {
  parse(content: string): Skill {
    const { frontmatter, markdown } = this.splitContent(content);
    const metadata = yaml.parse(frontmatter);
    const sections = this.parseMarkdown(markdown);
    return { metadata, sections };
  }
}
```

### 5. Agent

**核心概念**:
- ReAct 模式（Thought → Action → Observation）
- 记忆系统（短期/长期/工作记忆）
- 工具编排（并行/串行/链式）
- 流式处理

**关键代码**:
```typescript
class ReActAgent {
  async run(input: string): Promise<string> {
    while (iterations < maxIterations) {
      const thought = await this.think(context);
      const action = await this.decide(context);
      if (action.type === "finish") return action.result;
      const observation = await this.execute(action);
      context.addObservation(observation);
    }
  }
}
```

---

## 🎯 学习路径建议

### 路径 A: 快速上手（1天）

适合：想快速了解全貌的开发者

```
1. 阅读 01-mcp-protocol/01-protocol-overview.md [30分钟]
2. 阅读 02-mcp-server-dev/01-server-architecture.md [30分钟]
3. 阅读 04-skills-spec/01-skills-specification.md [30分钟]
4. 阅读 05-agent-implementation/01-agent-architecture.md [30分钟]
5. 运行 06-demo-project/05-integration/demo.ts [30分钟]
6. 修改 demo 代码，添加新功能 [2小时]
```

### 路径 B: 深度掌握（1周）

适合：需要完整实现的开发者

```
Day 1-2: MCP 协议和 Server 开发
- 完整阅读 01-mcp-protocol/
- 完整阅读 02-mcp-server-dev/
- 实现一个自己的 MCP Server

Day 3-4: MCP Client 和 Skills
- 完整阅读 03-mcp-client-dev/
- 完整阅读 04-skills-spec/
- 实现 Client 和 Skill 加载器

Day 5-6: Agent 实现
- 完整阅读 05-agent-implementation/
- 实现 ReAct Agent

Day 7: 整合和优化
- 完成 06-demo-project/
- 阅读 07-production/
- 性能优化和安全加固
```

### 路径 C: 按需学习（灵活）

适合：有明确需求的开发者

| 需求 | 学习内容 |
|-----|---------|
| 接入现有 MCP Server | 03-mcp-client-dev/ |
| 开发新的 MCP Server | 02-mcp-server-dev/ |
| 构建 Skill 系统 | 04-skills-spec/ |
| 实现 Agent 框架 | 05-agent-implementation/ |
| 生产环境部署 | 07-production/ |

---

## 💡 核心设计模式

### 1. 协议分层

```
Application Layer (Tools/Resources/Prompts)
           │
Protocol Layer (JSON-RPC 2.0 + MCP)
           │
Transport Layer (stdio/SSE/WebSocket)
```

### 2. Agent 架构

```
Input → Understanding → Planning → Execution → Output
              │              │            │
              ▼              ▼            ▼
           Memory        Reasoning     Tools/Skills
```

### 3. Skills 架构

```
SKILL.md → Parser → Validator → Gate Checker → Injector
                                              │
                                              ▼
                                         Agent Context
```

---

## 🔧 开发工具

### 推荐工具

- **IDE**: VS Code + TypeScript 插件
- **调试**: Chrome DevTools / VS Code Debugger
- **测试**: Vitest / Jest
- **文档**: TypeDoc

### VS Code 配置

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

---

## 📚 参考资源

### 官方文档

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [JSON-RPC 2.0 规范](https://www.jsonrpc.org/specification)

### 相关项目

- [OpenCode](https://github.com/anomalyco/opencode) - 开源 AI 编程助手
- [OpenClaw](https://github.com/openclaw/openclaw) - 个人 AI 助手

### 学习文章

- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [ReAct Pattern](https://react-lm.github.io/)

---

## 🤝 贡献

欢迎提交 Issue 和 PR！

### 贡献指南

1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 创建 Pull Request

---

## 📝 License

MIT License

---

## 💬 常见问题

### Q: 需要什么样的基础？
A: 需要 TypeScript/JavaScript 基础和 Node.js 开发经验。

### Q: 需要了解 LLM 吗？
A: 需要基本概念（Prompt、Completion 等），但不需要深入。

### Q: 可以商用吗？
A: 可以，MIT 协议允许商用。

### Q: 有视频教程吗？
A: 目前只有文档，视频教程计划中。

---

**开始你的 Agent 开发之旅！** 🚀
