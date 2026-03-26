# LLM-Skills_beginner

> 从零开始学习 MCP 协议、Server/Client 开发、Skills 系统、Agent 实现的完整教程

---

## 完整学习路径

```
PART1: MCP 协议层（理论基础）
├── 01-protocol-overview.md     协议设计哲学、三层架构、四种能力
├── 02-json-rpc-spec.md        JSON-RPC 2.0 完整规范
├── 03-message-types.md        MCP 消息类型详解
├── 04-capabilities.md          Capability 协商机制
├── 05-transport-layer.md       stdio 和 Streamable HTTP 传输层
└── 06-error-handling.md       错误码体系与调试

PART2: MCP Server 开发
├── 01-server-architecture.md   Server 架构与组件协作
├── 02-tool-definition.md      工具定义与 inputSchema
├── 03-resource-management.md  资源管理与订阅机制
├── 04-prompt-management.md    提示词模板
└── 05-session-lifecycle.md    会话状态管理

PART3: MCP Client 开发
├── 01-client-architecture.md  Client 架构
├── 02-connection-management.md  连接管理与重连
└── 03-tool-discovery.md     工具发现与调用

PART4: Skills 系统
├── 01-skills-specification.md  SKILL.md 格式规范
└── 02-skill-parser.md       Skill 解析器实现

PART5: Agent 实现
├── 01-agent-architecture.md   Agent 架构设计
├── 02-react-pattern.md      ReAct 推理模式
├── 03-tool-orchestration.md  工具编排模式
└── 04-memory-system.md      三层记忆系统

PART6: 完整项目
└── 01-project-overview.md   Weather + GitHub 助手完整实现

PART7: 生产环境
└── 01-deployment-guide.md  容器化、监控、安全、CI/CD
```

---

## 学习目标

完成本教程后，你将掌握：

- 理解 MCP 协议的设计原理和通信机制
- 开发自己的 MCP Server（工具、资源、提示词）
- 开发自己的 MCP Client（连接管理、请求分发）
- 设计和实现 Skills（SKILL.md 规范、解析器）
- 实现 Agent 系统（ReAct、工具编排、记忆系统）
- 完整项目实战
- 生产环境部署

---

## 内容特色

| 特色 | 说明 |
|------|------|
| **原理优先** | 每个概念都讲"为什么"，不只是"是什么" |
| **完整代码** | 每个知识点都有可运行的完整代码 |
| **循序渐进** | 从协议层到应用层，认知顺序排列 |
| **实践导向** | 理论 + 代码 + 示例，可直接应用到项目 |

---

## 推荐学习顺序

```
第一阶段：协议基础
PART1-MCP-Protocol/
└── 6 章协议内容，理解 MCP 为什么这样设计

第二阶段：Server 开发
PART2-MCP-Server/
└── 5 章内容，掌握工具、资源、提示词定义

第三阶段：Client 开发
PART3-MCP-Client/
└── 3 章内容，理解连接管理和工具调用

第四阶段：Skills 系统
PART4-Skills-System/
├── 00-quickstart.md              5 分钟快速入门
├── 01-skills-specification.md    SKILL.md 格式规范
├── 02-skill-parser.md           Skill 解析器实现
├── 03-skill-creation-guide.md   Skill 创建最佳实践
├── 04-skill-evaluation.md       Skill 评估与优化
├── 05-advanced-skill-examples.md 复杂 Skill 案例
├── 06-description-optimization.md 触发描述优化
└── 07-skill-testing.md          Skill 测试与迭代

第五阶段：Agent 实现
PART5-Agent/
└── 4 章内容，掌握 ReAct、工具编排、记忆系统

第六阶段：项目实战
PART6-Demo-Project/
└── 综合运用所有知识

第七阶段：生产部署
PART7-Production/
└── 容器化、监控、安全、CI/CD
```

---

## 项目结构

```
LLM-Skills_beginner/
├── PART1-MCP-Protocol/       协议层理论
├── PART2-MCP-Server/         Server 开发
├── PART3-MCP-Client/         Client 开发
├── PART4-Skills-System/       Skills 系统
├── PART5-Agent/               Agent 实现
├── PART6-Demo-Project/        完整项目
└── PART7-Production/          生产部署
```

---

## 技术栈

- **语言**：TypeScript / Node.js
- **协议**：JSON-RPC 2.0
- **传输**：stdio、Streamable HTTP
- **SDK**：@modelcontextprotocol/sdk

---

## 配套项目

教程包含一个完整的演示项目：

```
demo-project/
├── servers/
│   ├── weather-server/        天气 MCP Server
│   └── github-server/         GitHub MCP Server
└── src/
    ├── agent/                 Agent 实现
    ├── mcp/                   MCP Client
    └── cli.ts                 CLI 入口
```

---

_Last updated: 2026-03-26_
