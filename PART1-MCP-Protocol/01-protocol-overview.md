# MCP 协议架构总览

> 本章目标：理解 MCP 协议的设计哲学、三层架构、以及 Client/Server 的协作方式。学完本章后，你应能用自己的话解释"MCP 是什么"。

---

## 1. 为什么需要 MCP？

### 1.1 一个具体的问题

假设你开发了一个 AI 助手，用户问"帮我查一下北京的天气"，你会怎么做？

**没有 MCP 的做法**：

```
AI 模型 ──hardcode──► 调用某个天气 API ──返回──► 模型回复用户
```

问题来了：
- 如果用户换了一个 AI 模型（比如从 Claude 换到 GPT-4），天气功能需要重新集成
- 如果你写了一个 GitHub 工具，想在另一个 AI 应用中使用，需要重写一遍
- 每个 AI 应用和每个外部工具之间都是**点对点集成**，复杂度 O(n×m)

### 1.2 MCP 的解决思路

MCP 的核心思想是：**在 AI 模型和外部工具之间加一层标准协议**

```
AI 应用              MCP 协议               MCP Server
(Claude,            (标准化接口)            (天气服务,
 GPT-4,                              GitHub, 
 Cursor...)    ◄────►  统一通信    ◄────►  文件系统...)
                     规范
```

**有了 MCP**：
- AI 应用只需要实现一次 MCP Client
- 每个外部工具只需要实现一次 MCP Server
- 新增工具只需要配置一下，不需要改代码

这就像 USB 的思路：**一次实现，到处可用**。

### 1.3 MCP 的设计目标

| 目标 | 说明 | 实现方式 |
|------|------|---------|
| **标准化** | 统一的接口定义 | JSON-RPC 2.0 + 固定方法名 |
| **可扩展** | 新功能不破坏旧功能 | Capability 能力协商 |
| **安全** | 细粒度权限控制 | 声明式权限模型 |
| **双向通信** | Server 也能主动推送 | Notification 机制 |
| **传输无关** | 不绑定具体网络协议 | Transport 层抽象 |

---

## 2. 三层架构

MCP 协议可以分为三层，理解每一层的职责很重要：

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│                                                             │
│   Tools（工具）     Resources（资源）     Prompts（提示模板）  │
│   "查天气"         "用户配置文件"         "代码审查模板"      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    Protocol Layer                           │
│                                                             │
│   JSON-RPC 2.0 消息格式                                      │
│   方法命名空间 {namespace}/{action}                          │
│   Capability 能力协商                                        │
│   错误码体系                                                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    Transport Layer                          │
│                                                             │
│   stdio（标准输入/输出）     SSE（HTTP + Server-Sent Events） │
│   进程间通信                 跨网络通信                       │
└─────────────────────────────────────────────────────────────┘
```

**为什么这样分层？**

- **应用层**负责"做什么"（查天气、读文件）
- **协议层**负责"怎么说"（请求什么格式、响应什么格式）
- **传输层**负责"怎么传"（进程内通信还是网络通信）

分层的好处：当需要支持新的传输方式（比如 WebSocket）时，只需要改传输层，应用层和协议层完全不用动。

---

## 3. 核心概念：Host、Client、Server

### 3.1 三种角色

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Host                               │
│                                                             │
│   定义：运行 AI 模型的应用程序                                │
│   职责：协调多个 Client，管理整体生命周期                     │
│                                                             │
│   示例：Claude Desktop、Cursor IDE、OpenClaw、自己的 Agent   │
│                                                             │
│   ┌───────────────────────────────────────────────────────┐ │
│   │                 MCP Client (嵌入在 Host 内)             │ │
│   │   职责：与 Server 建立连接，发送请求，接收响应           │ │
│   └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ MCP 协议
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      MCP Server                            │
│                                                             │
│   定义：提供具体功能的外部服务                                │
│   职责：暴露工具、提供资源、定义提示词模板                    │
│                                                             │
│   示例：天气服务 Server、GitHub Server、数据库 Server         │
└─────────────────────────────────────────────────────────────┘
```

**关键理解**：
- 1 个 Host 可以有多个 Client（比如连接多个 MCP Server）
- 1 个 Client 同时只连接 1 个 Server（1:1 关系）
- Server 可以被多个 Client 同时连接（取决于传输层实现）

### 3.2 Host 与 Client 的关系

很多资料把 Host 和 Client 混为一谈，我们来理清：

```
MCP Host（应用层）
├── MCP Client A  ──►  连接 ──►  MCP Server（天气服务）
├── MCP Client B  ──►  连接 ──►  MCP Server（GitHub 服务）
└── MCP Client C  ──►  连接 ──►  MCP Server（数据库服务）
```

- **Host** 是 AI 应用本身，它是逻辑概念
- **Client** 是 Host 内嵌的协议实现，它是技术概念
- 用户感知到的是 Host（Claude Desktop），而不是 Client

### 3.3 Server 与工具的关系

一个 MCP Server 可以暴露多个工具：

```
MCP Server（天气服务）
├── 工具：get_weather（查实时天气）
├── 工具：get_forecast（查天气预报）
├── 资源：location://default-city（默认城市配置）
└── 提示：weather_report（天气报告模板）
```

---

## 4. 四种核心能力

MCP 定义了 4 种能力（称为"原语"），Server 通过声明 Capability 来告知 Client 它支持哪些：

### 4.1 Tools（工具）— AI 可以主动调用

**是什么**：Server 暴露的一组可执行功能，AI 模型可以像调用函数一样调用它们。

**典型场景**：
- 查天气、搜文件、调 API
- 任何需要外部数据或计算的能力

**消息流**：
```
Client ──tools/list──► Server    // 获取可用工具列表
Client ──tools/call──► Server    // 调用具体工具
```

### 4.2 Resources（资源）— AI 可以读取

**是什么**：Server 提供的数据内容，AI 可以读取但不能执行。

**典型场景**：
- 用户配置文件
- 知识库文档
- 数据库查询结果

**消息流**：
```
Client ──resources/list──► Server   // 获取可用资源列表
Client ──resources/read──► Server   // 读取资源内容
```

**注意**：Resource 和 Tool 的区别

| | Tool | Resource |
|--|------|---------|
| **行为** | 执行动作（查天气） | 读取数据（读配置文件） |
| **副作用** | 有（修改了外部状态） | 无（只读） |
| **类比** | 函数调用 | 文件读取 |

### 4.3 Prompts（提示模板）— AI 可以加载

**是什么**：预定义的提示词模板，Server 提供，Client 可以按需获取。

**典型场景**：
- 代码审查模板（填入仓库名、生成审查要点）
- 翻译模板（填入源语言、目标语言）
- 周报生成模板（填入工作内容）

**为什么需要**：避免每次都传递完整的提示词，通过模板 + 变量的方式动态生成。

### 4.4 Sampling（采样）— Server 可以让 AI 执行

**是什么**：Server 反向请求 AI 能力，让 Host 的 LLM 生成内容。

**典型场景**：
- Server 收到一段文本，需要 AI 总结
- Server 需要 AI 帮忙格式化输出

**这是一个高级特性**：大多数 MCP Server 不需要实现 Sampling。

---

## 5. 通信模式

MCP 有三种通信模式：

### 5.1 请求-响应（Request/Response）

```
Client                              Server
  │                                    │
  │ ──── Request (id=1) ────────────► │  "查一下北京天气"
  │                                    │
  │ ◄──── Response (id=1) ─────────── │  "北京：晴，25°C"
  │                                    │
```

特点：
- 一问一答，有来有回
- 每个请求有唯一 id
- 支持并发多个请求

### 5.2 通知（Notification）

```
Client                              Server
  │                                    │
  │ ◄──── Notification ────────────── │  "工具列表已更新"
  │                                    │
```

特点：
- 单向发送，不需要响应
- 没有 id 字段
- 用于：推送更新、事件通知

### 5.3 握手（Handshake）

```
Client                              Server
  │                                    │
  │ ──── initialize ────────────────► │  "我支持这些能力..."
  │                                    │
  │ ◄──── initialize response ──────── │  "我支持这些能力..."
  │                                    │
  │ ──── notifications/initialized ──► │  "好，我们开始吧"
  │                                    │
```

特点：
- 连接建立后的第一步
- 双方交换 Capability
- 握手完成后才能进行其他操作

---

## 6. 完整通信流程

```
┌──────────────────────────────────────────────────────────────────┐
│                      MCP 完整通信流程                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 建立连接                                                     │
│     Client ──transport.connect()──► Server                      │
│                                                                  │
│  2. 握手（必须的第一步）                                          │
│     Client ──initialize──► Server                                │
│                 │                                               │
│     Client ◄──initialize result── Server                        │
│                 │                                               │
│     Client ──notifications/initialized──► Server                │
│                                                                  │
│  3. Client 发现 Server 能力                                      │
│     Client ──tools/list──► Server  →  获取工具有哪些            │
│     Client ──resources/list──► Server →  获取资源有哪些         │
│     Client ──prompts/list──► Server  →  获取提示模板有哪些      │
│                                                                  │
│  4. AI 决定调用工具（循环）                                       │
│                                                                  │
│     ┌─────────────────────────────────────┐                     │
│     │           ReAct 循环                 │                     │
│     │                                      │                     │
│     │  Thought: "我需要查天气"             │                     │
│     │  Action:  tools/call                │                     │
│     │  ◄─── Server 返回结果                │                     │
│     │  Observation: "北京：晴，25°C"       │                     │
│     │  (如果还没完成任务，继续循环)         │                     │
│     └─────────────────────────────────────┘                     │
│                                                                  │
│  5. 读取资源（可选）                                              │
│     Client ──resources/read──► Server                          │
│                                                                  │
│  6. 加载提示模板（可选）                                         │
│     Client ──prompts/get──► Server                              │
│                                                                  │
│  7. 关闭连接                                                     │
│     Client ──notifications/cancelled──► Server                 │
│     或 Server 主动关闭                                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**为什么 handshake 是必须的？**

试想：如果没有握手，Client 不知道 Server 支持什么功能，可能调用了不存在的方法导致报错。握手确保了双方在正式开始通信之前，先确认彼此的能力。

---

## 7. 消息格式基础

### 7.1 所有消息都是 JSON-RPC 2.0

MCP 完全基于 JSON-RPC 2.0 规范，所有消息都是 JSON：

```typescript
// JSON-RPC 请求
{
  "jsonrpc": "2.0",       // 协议版本，固定是 "2.0"
  "id": 1,                // 请求 ID（响应时返回相同的 ID）
  "method": "tools/list", // 方法名
  "params": {}            // 参数（可选）
}

// JSON-RPC 响应
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "tools": [...] }  // 成功时返回 result
}

// JSON-RPC 错误响应
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {               // 出错时返回 error
    "code": -32602,
    "message": "Invalid params"
  }
}

// JSON-RPC 通知（没有 id）
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

### 7.2 方法命名规范

MCP 用 `{namespace}/{action}` 的格式组织方法名：

| 命名空间 | 动作 | 方法名 | 说明 |
|---------|------|--------|------|
| initialize | — | `initialize` | 握手请求 |
| ping | — | `ping` | 心跳检测 |
| tools | list | `tools/list` | 获取工具列表 |
| tools | call | `tools/call` | 调用工具 |
| resources | list | `resources/list` | 获取资源列表 |
| resources | read | `resources/read` | 读取资源 |
| prompts | list | `prompts/list` | 获取提示列表 |
| prompts | get | `prompts/get` | 获取提示内容 |

---

## 8. Capability 能力协商

### 8.1 什么是 Capability？

Capability 是 MCP 的扩展机制，Server 通过声明 Capability 告诉 Client 它支持哪些功能。

```typescript
// Server 声明自己的 Capability
interface ServerCapabilities {
  tools?: {
    listChanged?: boolean;  // 是否支持 tools/list_changed 通知
  };
  resources?: {
    subscribe?: boolean;    // 是否支持资源订阅
    listChanged?: boolean; // 是否支持 resources/list_changed 通知
  };
  prompts?: {
    listChanged?: boolean;
  };
}
```

### 8.2 握手时的 Capability 交换

```
Client                              Server
  │                                    │
  │ ──── initialize ────────────────► │  Client 声明自己的 Capability
  │     capabilities: {               │    "我支持 roots.listChanged"
  │       roots: { listChanged: true } │
  │     }                              │
  │                                    │
  │ ◄──── initialize result ───────── │  Server 声明自己的 Capability
  │     capabilities: {               │    "我支持 tools 和 resources.subscribe"
  │       tools: {},                   │
  │       resources: { subscribe: true }│
  │     }                              │
  │                                    │
```

### 8.3 Capability 的实际作用

Client 收到 Server 的 Capability 后，就知道：
- 可以调用哪些方法（没声明的不要调用）
- Server 会主动推送哪些通知（可以监听）
- 是否需要订阅变更通知

---

## 9. 传输层概述

### 9.1 两种传输方式

| 传输方式 | 原理 | 适用场景 |
|---------|------|---------|
| **stdio** | 通过进程 stdin/stdout 通信 | 本地工具、CLI 工具 |
| **SSE** | HTTP POST 请求 + Server-Sent Events 响应 | 远程服务 |

### 9.2 stdio 传输原理

```
┌─────────────┐         stdin          ┌─────────────┐
│             │ ◄────────────────────── │             │
│  MCP Client │                         │  MCP Server │
│             │ ────────────────────────► │             │
└─────────────┘         stdout          └─────────────┘

                 stderr（错误日志，不走协议）
                 ◄────────────────────────
```

特点：
- Server 作为子进程启动
- 所有消息都是一行一个 JSON
- 简单、安全、无网络依赖

### 9.3 SSE 传输原理

```
Client ──── POST /mcp (请求) ──────────────────► Server
         ◄─── EventStream (SSE 响应) ─────────── Server
```

特点：
- 支持跨网络通信
- Server 可以主动推送通知
- 适合生产环境部署

---

## 10. 本章小结

学完本章，你应该理解：

```
MCP 是什么
├── 设计目标：标准化 AI 与外部工具的通信
├── 三层架构：应用层 → 协议层 → 传输层
└── 三种角色：Host、Client、Server

四种核心能力
├── Tools：AI 可调用的工具
├── Resources：AI 可读取的资源
├── Prompts：AI 可加载的提示模板
└── Sampling：Server 可请求 AI 生成内容

通信模式
├── Request/Response：有问有答
├── Notification：单向通知
└── Handshake：连接建立的第一步

Capability 机制
└── Server 声明自己支持哪些功能
```

---

## 下一步

继续阅读：
- [02-json-rpc-spec.md](02-json-rpc-spec.md) — JSON-RPC 2.0 完整规范
- [03-message-types.md](03-message-types.md) — MCP 消息类型详解
