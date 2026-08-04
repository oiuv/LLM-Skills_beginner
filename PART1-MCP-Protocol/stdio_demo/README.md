# STDIO 传输模式演示（2026-07-28 版本）

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
5. **无状态**: 每个请求通过 `_meta` 携带协议版本和能力（2026-07-28 变更）

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

## 核心概念

### 消息格式（2026-07-28 版本）

```json
// Request (Client → Server)
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}

// Response (Server → Client)
{"jsonrpc":"2.0","id":1,"result":{"resultType":"complete","tools":[{"name":"get_weather"}]}}

// Notification (Server → Client, 无 id)
{"jsonrpc":"2.0","method":"notifications/tools/list_changed","params":{"_meta":{"io.modelcontextprotocol/subscriptionId":1}}}
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
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

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
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

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
