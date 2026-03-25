# STDIO 传输模式演示

> 通过标准输入输出（stdin/stdout）进行进程间通信

## 什么是 STDIO 模式？

STDIO 是 MCP 最简单的传输模式，适用于**同一台机器上的进程间通信**。

```
┌─────────────┐      stdin/stdout      ┌─────────────┐
│   Client    │  ◄──────────────────►  │   Server    │
│  (父进程)   │    (标准输入输出)      │  (子进程)   │
└─────────────┘                        └─────────────┘
```

## 工作原理

1. **Client 启动 Server 作为子进程**
2. **Client → Server**: 通过 Server 的 stdin 写入 JSON-RPC 消息
3. **Server → Client**: 通过 Server 的 stdout 写入响应
4. **消息格式**: 每行一个 JSON 对象（NDJSON - Newline Delimited JSON）

## 适用场景

- ✅ 本地开发测试
- ✅ 同机部署的 AI 应用
- ✅ 需要进程隔离的场景
- ✅ 简单的工具调用

## 运行演示

### 1. 安装依赖

```bash
npm install
```

### 2. 运行演示

```bash
# 自动运行完整演示
node client.js
```

Client 会自动启动 Server 子进程，完成整个演示流程。

## 演示流程

```
============================================================
MCP STDIO Client 演示 (Node.js)
============================================================
🔗 启动 Server: server.js
✅ 已连接到 Server

🚀 步骤 1: 初始化连接
------------------------------------------------------------
✅ 初始化成功
   Client 和 Server 已通过 MCP 协议握手

🚀 步骤 2: 获取工具列表
------------------------------------------------------------
✅ 发现 2 个工具:
   🔧 get_weather: 获取指定城市的天气信息
   🔧 calculate: 执行数学计算

🚀 步骤 3: 调用工具 'get_weather'
------------------------------------------------------------
   参数: { city: '北京' }
✅ 结果:
🌤️ 北京天气：晴天，25°C，湿度45%

🚀 步骤 3: 调用工具 'calculate'
------------------------------------------------------------
   参数: { expression: '2 + 3 * 4' }
✅ 结果:
🧮 2 + 3 * 4 = 14

============================================================
✅ 所有操作完成！

👋 已断开连接
```

## 核心概念

### 消息格式

```json
// Request (Client → Server)
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}

// Response (Server → Client)
{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"get_weather"}]}}

// Notification (Server → Client, 无 id)
{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}
```

### 生命周期

```
Client                    Server
  │                         │
  │ ──── initialize ──────► │
  │ ◄──── initialized ───── │
  │                         │
  │ ──── tools/list ──────► │
  │ ◄──── tools/list ────── │
  │                         │
  │ ──── tools/call ──────► │
  │ ◄──── tools/call ────── │
  │                         │
  │ ──── shutdown ────────► │
  │ ◄──── shutdown ──────── │
```

## 代码结构

```
stdio_demo/
├── package.json      # 项目配置
├── server.js         # MCP Server 实现
├── client.js         # MCP Client 实现
└── README.md         # 说明文档
```

## 优点 vs 缺点

| 优点 | 缺点 |
|------|------|
| 简单直接 | 只能本地通信 |
| 无需网络配置 | 不能跨机器 |
| 进程隔离 | 需要管理子进程生命周期 |
| 安全性高（进程边界） | 不适合高并发 |

## 关键代码解析

### Server 端

```javascript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// 创建 Server
const server = new Server({
  name: "demo-stdio-server",
  version: "1.0.0",
}, {
  capabilities: { tools: {} },
});

// 注册工具处理器
server.setRequestHandler("tools/list", async () => {
  return { tools: [...] };
});

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;
  // 执行工具逻辑
  return { content: [...] };
});

// 启动
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Client 端

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// 创建 Transport（自动启动 Server 子进程）
const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"],
});

// 创建 Client
const client = new Client({
  name: "demo-stdio-client",
  version: "1.0.0",
}, {
  capabilities: {},
});

// 连接
await client.connect(transport);

// 调用工具
const result = await client.callTool({
  name: "get_weather",
  arguments: { city: "北京" },
});
```

## 与 Streamable HTTP 模式的对比

| 特性 | STDIO | Streamable HTTP |
|------|-------|-----------------|
| 通信范围 | 本机进程 | 网络（可跨机器） |
| 协议 | 标准输入输出 | HTTP + Chunked Transfer |
| Server 推送 | ❌ 不支持 | ✅ 支持 |
| 并发 | 低 | 高 |
| 部署复杂度 | 低 | 中等 |
| 会话恢复 | ❌ 不支持 | ✅ 支持 |

## 学习要点

1. **进程间通信**: 理解父子进程如何通过管道通信
2. **JSON-RPC 2.0**: 掌握请求-响应-通知的消息格式
3. **生命周期**: 理解 initialize → ready → shutdown 的流程
4. **SDK 封装**: 官方 SDK 如何处理底层通信细节
