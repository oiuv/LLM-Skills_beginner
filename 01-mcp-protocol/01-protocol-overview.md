# MCP 协议架构总览

> 面向开发者的 Model Context Protocol 技术规范

---

## 1. 协议设计目标

MCP 协议的设计目标是为 AI 模型与外部工具之间建立**标准化、可扩展、安全**的通信机制。

### 1.1 核心设计原则

| 原则 | 说明 | 实现方式 |
|-----|------|---------|
| **标准化** | 统一的通信格式 | JSON-RPC 2.0 |
| **可扩展** | 支持新功能不破坏兼容性 | Capability 协商 |
| **安全** | 细粒度权限控制 | 声明式权限模型 |
| **双向** | Server 和 Client 都能主动通信 | Notification 机制 |
| **传输无关** | 支持多种传输层 | stdio / SSE / 自定义 |

### 1.2 协议分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│         (Tools / Resources / Prompts / Sampling)            │
├─────────────────────────────────────────────────────────────┤
│                    Protocol Layer                           │
│              (JSON-RPC 2.0 + MCP Extensions)                │
├─────────────────────────────────────────────────────────────┤
│                    Transport Layer                          │
│                (stdio / SSE / WebSocket)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 核心概念

### 2.1 角色定义

#### MCP Host
- **定义**: 运行 AI 模型的应用程序
- **职责**: 协调多个 Client，管理生命周期
- **示例**: Claude Desktop, Cursor, 自定义 Agent

#### MCP Client
- **定义**: Host 内的协议实现，负责与 Server 通信
- **职责**: 
  - 建立和维护连接
  - 发送请求和接收响应
  - 处理 Server 的通知
  - 管理权限

#### MCP Server
- **定义**: 提供具体功能的工具服务
- **职责**:
  - 暴露工具（Tools）
  - 提供资源（Resources）
  - 定义提示词（Prompts）
  - 请求采样（Sampling）

### 2.2 通信模式

```
┌─────────────────────────────────────────────────────────────┐
│                      通信模式                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Request / Response（请求-响应）                          │
│                                                             │
│     Client                    Server                        │
│       │ ────── Request ─────► │                             │
│       │ ◄───── Response ───── │                             │
│                                                             │
│  2. Notification（通知）                                     │
│                                                             │
│     Client                    Server                        │
│       │ ◄──── Notification ── │  (Server 主动推送)           │
│       │ ──── Notification ──► │  (Client 主动推送)           │
│                                                             │
│  3. Batch（批量）                                            │
│                                                             │
│     Client                    Server                        │
│       │ ─── Request[1,2,3] ─► │                             │
│       │ ◄── Response[1,2,3] ─ │                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 协议消息格式

### 3.1 基础消息结构

所有 MCP 消息都基于 JSON-RPC 2.0 规范：

```typescript
// 基础消息接口
interface JSONRPCMessage {
  jsonrpc: "2.0";  // 协议版本，固定为 "2.0"
  id?: string | number;  // 消息标识（Request/Response 必需）
}

// 请求消息
interface JSONRPCRequest extends JSONRPCMessage {
  id: string | number;
  method: string;      // 方法名
  params?: unknown;    // 参数
}

// 响应消息
interface JSONRPCResponse extends JSONRPCMessage {
  id: string | number;
  result?: unknown;    // 成功结果
  error?: JSONRPCError; // 错误信息
}

// 通知消息（无 id）
interface JSONRPCNotification extends JSONRPCMessage {
  method: string;
  params?: unknown;
}

// 错误结构
interface JSONRPCError {
  code: number;        // 错误码
  message: string;     // 错误描述
  data?: unknown;      // 附加数据
}
```

### 3.2 MCP 方法命名规范

MCP 使用命名空间方式组织方法：

```
{namespace}/{action}
```

#### 标准命名空间

| 命名空间 | 说明 | 示例方法 |
|---------|------|---------|
| `initialize` | 初始化 | `initialize` |
| `ping` | 心跳检测 | `ping` |
| `tools` | 工具管理 | `tools/list`, `tools/call` |
| `resources` | 资源管理 | `resources/list`, `resources/read` |
| `prompts` | 提示词管理 | `prompts/list`, `prompts/get` |
| `sampling` | 采样请求 | `sampling/createMessage` |
| `notifications` | 通知 | `notifications/tools/list_changed` |

---

## 4. 协议生命周期

### 4.1 完整生命周期图

```
┌─────────────┐
│   开始      │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│ 1. 建立传输层连接                    │
│    (stdio / SSE / WebSocket)        │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ 2. 初始化握手                        │
│    Client ──initialize──► Server    │
│    Client ◄─initialize─── Server    │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ 3. 能力协商                          │
│    - 交换支持的 capabilities         │
│    - 确定协议版本                    │
│    - 协商功能特性                    │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ 4. 正常运行                          │
│    - 工具调用                        │
│    - 资源访问                        │
│    - 提示词获取                      │
│    - 采样请求                        │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ 5. 关闭连接                          │
│    - 发送关闭通知                    │
│    - 清理资源                        │
│    - 断开传输层                      │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────┐
│    结束     │
└─────────────┘
```

### 4.2 初始化流程详解

#### Step 1: Client 发送 initialize

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "roots": {
        "listChanged": true
      },
      "sampling": {}
    },
    "clientInfo": {
      "name": "my-client",
      "version": "1.0.0"
    }
  }
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `protocolVersion` | string | ✅ | 协议版本号 |
| `capabilities` | object | ✅ | Client 支持的能力 |
| `clientInfo` | object | ✅ | Client 信息 |

#### Step 2: Server 响应

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {
        "listChanged": true
      },
      "resources": {
        "subscribe": true,
        "listChanged": true
      }
    },
    "serverInfo": {
      "name": "my-server",
      "version": "1.0.0"
    }
  }
}
```

#### Step 3: Client 发送 initialized 通知

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

**关键点**:
- Server 收到 `initialized` 后才能处理其他请求
- 这确保了双方都已准备好通信

---

## 5. Capability 机制

### 5.1 Capability 定义

Capability 是 MCP 的扩展机制，用于声明支持的功能：

```typescript
// Client Capabilities
interface ClientCapabilities {
  // 根目录列表支持
  roots?: {
    listChanged?: boolean;  // 支持 roots/list_changed 通知
  };
  // 采样支持（让 Server 可以请求 LLM）
  sampling?: {};
}

// Server Capabilities
interface ServerCapabilities {
  // 工具支持
  tools?: {
    listChanged?: boolean;  // 支持 tools/list_changed 通知
  };
  // 资源支持
  resources?: {
    subscribe?: boolean;    // 支持资源订阅
    listChanged?: boolean;  // 支持 resources/list_changed 通知
  };
  // 提示词支持
  prompts?: {
    listChanged?: boolean;  // 支持 prompts/list_changed 通知
  };
  // 采样支持
  sampling?: {};
}
```

### 5.2 Capability 协商流程

```
Client Capabilities                    Server Capabilities
├─ roots.listChanged: true             ├─ tools.listChanged: true
├─ sampling: {}                        ├─ resources.subscribe: true
                                       └─ resources.listChanged: true

协商结果：双方共同支持的功能
├─ Client 可以发送 roots/list_changed
├─ Server 可以发送 tools/list_changed
├─ Server 可以发送 resources/list_changed
└─ Server 可以请求 sampling/createMessage
```

---

## 6. 传输层规范

### 6.1 支持的传输方式

| 传输方式 | 适用场景 | 特点 |
|---------|---------|------|
| **stdio** | 本地进程 | 简单、安全、无网络依赖 |
| **SSE** | 远程服务 | HTTP 兼容、可跨网络 |
| **WebSocket** | 实时通信 | 双向推送、低延迟 |

### 6.2 stdio 传输规范

```typescript
// stdio 传输实现要点

interface StdioTransport {
  // 启动 Server 进程
  spawn(command: string, args: string[]): ChildProcess;
  
  // 写入请求（到 Server 的 stdin）
  write(message: JSONRPCMessage): void;
  
  // 读取响应（从 Server 的 stdout）
  onMessage(callback: (msg: JSONRPCMessage) => void): void;
  
  // 错误处理（Server 的 stderr）
  onError(callback: (error: Error) => void): void;
}

// 消息分隔：每行一个 JSON 对象
// Client ──► Server: stdin
// Client ◄── Server: stdout
// Client ◄── Server: stderr (日志/错误)
```

### 6.3 SSE 传输规范

```typescript
// SSE 传输实现要点

interface SSETransport {
  // 建立 SSE 连接（Server → Client）
  connect(endpoint: string): EventSource;
  
  // 发送请求（Client → Server，使用 POST）
  postMessage(message: JSONRPCMessage): Promise<void>;
  
  // 接收通知（Server → Client，使用 SSE）
  onMessage(callback: (msg: JSONRPCMessage) => void): void;
}

// 连接流程：
// 1. Client GET /sse ──► Server
// 2. Server 返回 SSE 流，包含 endpoint URL
// 3. Client POST 到 endpoint 发送请求
// 4. Server 通过 SSE 流推送响应和通知
```

---

## 7. 错误处理规范

### 7.1 标准错误码

| 错误码 | 名称 | 说明 |
|-------|------|------|
| `-32700` | Parse error | JSON 解析错误 |
| `-32600` | Invalid Request | 请求格式无效 |
| `-32601` | Method not found | 方法不存在 |
| `-32602` | Invalid params | 参数错误 |
| `-32603` | Internal error | 内部错误 |
| `-32000` | Server error | 服务端错误（起始码） |
| `-32001` | Request timed out | 请求超时 |

### 7.2 MCP 特定错误码

| 错误码 | 名称 | 说明 |
|-------|------|------|
| `-32002` | Resource not found | 资源不存在 |
| `-32003` | Tool execution failed | 工具执行失败 |
| `-32004` | Permission denied | 权限不足 |
| `-32005` | Capability not supported | 不支持的能力 |

---

## 8. 协议版本管理

### 8.1 版本协商规则

```typescript
// 版本协商算法
function negotiateVersion(
  clientVersion: string,
  serverVersion: string
): string | null {
  // 1. 如果版本完全相同，直接使用
  if (clientVersion === serverVersion) {
    return clientVersion;
  }
  
  // 2. 解析版本号
  const client = parseVersion(clientVersion);
  const server = parseVersion(serverVersion);
  
  // 3. 主版本必须相同
  if (client.major !== server.major) {
    return null; // 不兼容
  }
  
  // 4. 使用较低的次版本（向后兼容）
  if (client.minor <= server.minor) {
    return clientVersion;
  } else {
    return serverVersion;
  }
}
```

### 8.2 向后兼容性

- **主版本变更**: 破坏性变更，不兼容
- **次版本变更**: 新增功能，向后兼容
- **补丁版本**: Bug 修复，完全兼容

---

## 9. 实现检查清单

开发 MCP 实现时，确保完成以下检查：

### Server 实现

- [ ] 正确处理 `initialize` 请求
- [ ] 返回正确的 capabilities
- [ ] 等待 `initialized` 通知后才处理其他请求
- [ ] 实现 `ping` 方法用于心跳检测
- [ ] 正确处理错误并返回标准错误码
- [ ] 支持至少一种传输层（stdio/SSE）

### Client 实现

- [ ] 发送正确的 `initialize` 请求
- [ ] 处理 Server 的 capabilities
- [ ] 发送 `initialized` 通知
- [ ] 实现心跳检测机制
- [ ] 正确处理异步通知
- [ ] 实现超时和重试逻辑

---

## 10. 参考资源

- [JSON-RPC 2.0 规范](https://www.jsonrpc.org/specification)
- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

---

## 下一步

继续阅读：
- [02-json-rpc-spec.md](02-json-rpc-spec.md) - JSON-RPC 2.0 详细规范
- [03-message-types.md](03-message-types.md) - MCP 消息类型详解
