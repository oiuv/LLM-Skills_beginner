# MCP 协议 2026-07-28 版本升级完全指南

> 从 `2025-11-25` 到 `2026-07-28`，MCP 协议经历了一次根本性的架构变革。本文将详细解读每一项变更，帮助你快速理解新协议、迁移旧代码。

---

## 写在前面

2026 年 7 月 28 日，Model Context Protocol（MCP）发布了重大版本更新。这次更新不是小修小补，而是对协议核心模型的重新设计——**MCP 从有状态会话模型变为无状态协议**。

如果你正在使用 MCP 构建 AI 应用、开发 MCP Server/Client，或者只是想了解这个协议的最新动态，这篇文章都会对你有所帮助。

### 为什么这次更新如此重要？

想象一下，你之前和 MCP 服务器通信就像是打电话——先拨号建立连接（`initialize` 握手），然后在通话过程中来回交流（依赖会话状态），最后挂断电话（`DELETE` 会话）。

而现在，更像是发邮件——每封邮件都是独立的，邮件里写清楚你是谁、你要什么（`_meta` 字段），服务器收到后独立处理，不需要记住之前的对话。

这个变化带来了几个关键好处：
- **更简单**：不需要管理会话生命周期
- **更可靠**：服务器崩溃不影响客户端，重启后直接重试
- **更灵活**：支持无状态负载均衡、水平扩展
- **更安全**：每个请求都携带完整的能力声明，服务器可以精确验证

---

## 目录

1. [核心架构变化：从有状态到无状态](#1-核心架构变化从有状态到无状态)
2. [握手机制：从 initialize 到 server/discover](#2-握手机制从-initialize-到-serverdiscover)
3. [_meta 字段：每请求的协议元数据](#3-_meta-字段每请求的协议元数据)
4. [通知机制：从自动推送到订阅式 opt-in](#4-通知机制从自动推送到订阅式-opt-in)
5. [MRTR 模式：服务器不再主动发请求](#5-mrtr-模式服务器不再主动发请求)
6. [resultType 字段：多态响应](#6-resulttype-字段多态响应)
7. [Tasks 移为扩展](#7-tasks-移为扩展)
8. [废弃功能与迁移路径](#8-废弃功能与迁移路径)
9. [新增概念：Elicitation、MCP Apps、Extensions](#9-新增概念elicitationmcp-appsextensions)
10. [错误码体系更新](#10-错误码体系更新)
11. [缓存机制：ttlMs 和 cacheScope](#11-缓存机制ttlms-和-cachescope)
12. [工具定义增强：title 和 outputSchema](#12-工具定义增强title-和-outputschema)
13. [SDK 迁移指南](#13-sdk-迁移指南)
14. [完整代码对比](#14-完整代码对比)
15. [常见问题 FAQ](#15-常见问题-faq)

---

## 1. 核心架构变化：从有状态到无状态

### 1.1 旧模型（2025-11-25）：有状态会话

在旧版本中，MCP 的通信模型是这样的：

```
Client                              Server
  │                                    │
  │ ──── initialize ────────────────► │  第一步：握手
  │ ◄─── initialize result ─────────── │
  │ ──── notifications/initialized ──► │  握手完成
  │                                    │
  │ ──── tools/call ────────────────► │  后续请求依赖会话状态
  │ ◄─── result ───────────────────── │
  │                                    │
  │ ──── DELETE (Mcp-Session-Id) ───► │  关闭会话
```

这个模型有几个问题：
- 服务器需要维护会话状态，增加了复杂度
- 会话断开后需要恢复机制（`Last-Event-ID`）
- 不支持无状态负载均衡
- 每个连接只能服务一个客户端

### 1.2 新模型（2026-07-28）：无状态协议

新版本中，MCP 变成了完全无状态的：

```
Client                              Server
  │                                    │
  │ ──── tools/call ────────────────► │  每个请求自带 _meta
  │    _meta: {                        │
  │      protocolVersion: "2026-07-28"│
  │      clientCapabilities: {...}    │
  │    }                               │
  │ ◄─── result ───────────────────── │  服务器独立处理
  │                                    │
  │ ──── tools/call ────────────────► │  另一个请求，同样自包含
  │    _meta: {protocolVersion, ...}  │
  │ ◄─── result ───────────────────── │
```

**关键变化**：
- ❌ 移除：`Mcp-Session-Id` 头部
- ❌ 移除：SSE 流恢复（`Last-Event-ID`）
- ✅ 新增：每个请求通过 `_meta` 携带协议版本和能力

### 1.3 无状态的意义

无状态模型带来的好处：

| 特性 | 有状态（旧） | 无状态（新） |
|------|-------------|-------------|
| 服务器复杂度 | 需要管理会话 | 无需管理会话 |
| 负载均衡 | 需要会话亲和性 | 任意节点处理 |
| 故障恢复 | 需要会话恢复机制 | 直接重试 |
| 水平扩展 | 受限于会话状态 | 随意扩展 |
| 连接复用 | 每连接一个会话 | 任意请求走任意连接 |

---

## 2. 握手机制：从 initialize 到 server/discover

### 2.1 旧的三步握手（已移除）

```json
// 第一步：Client → Server
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "roots": { "listChanged": true },
      "sampling": {}
    },
    "clientInfo": {
      "name": "my-agent",
      "version": "1.0.0"
    }
  }
}

// 第二步：Server → Client
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": { "subscribe": true }
    },
    "serverInfo": {
      "name": "weather-server",
      "version": "1.0.0"
    }
  }
}

// 第三步：Client → Server
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

### 2.2 新的 server/discover（可选）

在新版本中，`server/discover` 是**可选的**前置发现机制。客户端可以直接发送任何请求，如果版本不兼容，服务器会返回错误。

```json
// 可选：Client → Server
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "server/discover",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "my-agent",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {
        "elicitation": {}
      }
    }
  }
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "resultType": "complete",
    "supportedVersions": ["2026-07-28"],
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": {}
    },
    "_meta": {
      "io.modelcontextprotocol/serverInfo": {
        "name": "weather-server",
        "version": "1.0.0"
      }
    },
    "ttlMs": 3600000,
    "cacheScope": "public"
  }
}
```

### 2.3 为什么 server/discover 是可选的？

因为每个请求都携带了协议版本，服务器可以独立处理每个请求。如果版本不兼容，服务器返回 `UnsupportedProtocolVersionError`：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32022,
    "message": "Unsupported protocol version",
    "data": {
      "supported": ["2026-07-28"],
      "requested": "2025-11-25"
    }
  }
}
```

客户端从 `data.supported` 中选择一个兼容版本重试即可。

---

## 3. _meta 字段：每请求的协议元数据

### 3.1 什么是 _meta？

`_meta` 是 MCP 2026-07-28 版本引入的核心概念。它是一个附加在每个请求 `params` 中的字段，携带协议级别的元数据。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": { "city": "北京" },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "my-agent",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {
        "elicitation": {}
      }
    }
  }
}
```

### 3.2 _meta 保留键

| 键 | 类型 | 必填 | 说明 |
|---|------|------|------|
| `io.modelcontextprotocol/protocolVersion` | string | ✅ | 协议版本（如 `"2026-07-28"`） |
| `io.modelcontextprotocol/clientInfo` | object | 建议 | Client 名称和版本 |
| `io.modelcontextprotocol/clientCapabilities` | object | ✅ | Client 能力声明 |
| `io.modelcontextprotocol/logLevel` | string | ❌ | 日志级别（每请求 opt-in） |
| `progressToken` | string/number | ❌ | 进度通知令牌 |

### 3.3 服务器响应中的 _meta

服务器也可以在响应的 `_meta` 中声明身份：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "content": [{ "type": "text", "text": "北京：晴，25°C" }],
    "_meta": {
      "io.modelcontextprotocol/serverInfo": {
        "name": "weather-server",
        "version": "1.0.0"
      }
    }
  }
}
```

### 3.4 _meta 键的命名规则

- 前缀使用反向 DNS：`io.modelcontextprotocol/`、`com.example/`
- `io.modelcontextprotocol/` 和 `dev.mcp/` 前缀保留给 MCP 规范
- 名称必须以字母数字开头和结尾，可包含 `-`、`_`、`.`

---

## 4. 通知机制：从自动推送到订阅式 opt-in

### 4.1 旧的通知模式（已移除）

```json
// 旧：客户端订阅资源
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "resources/subscribe",
  "params": { "uri": "file:///data/user.json" }
}

// 旧：服务器自动推送
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": { "uri": "file:///data/user.json" }
}
```

问题：客户端无法控制接收哪些通知，服务器可能推送不需要的消息。

### 4.2 新的订阅模式（2026-07-28）

```json
// 新：客户端打开订阅流，指定想接收的通知类型
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "subscriptions/listen",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {}
    },
    "notifications": {
      "toolsListChanged": true,
      "resourcesListChanged": true,
      "resourceSubscriptions": ["file:///data/user.json"]
    }
  }
}

// 新：服务器确认订阅
{
  "jsonrpc": "2.0",
  "method": "notifications/subscriptions/acknowledged",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/subscriptionId": 5
    },
    "notifications": {
      "toolsListChanged": true,
      "resourcesListChanged": true,
      "resourceSubscriptions": ["file:///data/user.json"]
    }
  }
}

// 新：服务器推送通知（携带订阅 ID）
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/subscriptionId": 5
    },
    "uri": "file:///data/user.json"
  }
}
```

### 4.3 通知过滤器

| 字段 | 类型 | 说明 |
|------|------|------|
| `toolsListChanged` | boolean | 接收 `notifications/tools/list_changed` |
| `promptsListChanged` | boolean | 接收 `notifications/prompts/list_changed` |
| `resourcesListChanged` | boolean | 接收 `notifications/resources/list_changed` |
| `resourceSubscriptions` | string[] | 接收指定资源的 `notifications/resources/updated` |

### 4.4 订阅取消

- **客户端取消**：关闭 SSE 流（HTTP）或发送 `notifications/cancelled`（stdio）
- **服务器取消**：发送空 `subscriptions/listen` 响应表示优雅关闭
- **断线重连**：stdio 重连后必须重新发送 `subscriptions/listen`

---

## 5. MRTR 模式：服务器不再主动发请求

### 5.1 旧模式（已移除）

在旧版本中，服务器可以直接向客户端发起 JSON-RPC 请求：

```json
// 旧：服务器直接请求客户端
{
  "jsonrpc": "2.0",
  "id": 100,
  "method": "sampling/createMessage",
  "params": {
    "messages": [{ "role": "user", "content": { "type": "text", "text": "..." } }],
    "maxTokens": 100
  }
}
```

问题：这打破了 JSON-RPC 的请求-响应模型，增加了实现复杂度。

### 5.2 新的 MRTR 模式（2026-07-28）

在新版本中，**服务器不得发起 JSON-RPC 请求**。当服务器需要客户端提供更多信息时，返回 `InputRequiredResult`：

```json
// 第一轮：客户端请求
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "book_flight",
    "arguments": { "destination": "Barcelona" },
    "_meta": { "io.modelcontextprotocol/protocolVersion": "2026-07-28", ... }
  }
}

// 服务器返回 InputRequiredResult
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "input_required",
    "inputRequests": {
      "seat_preference": {
        "method": "elicitation/create",
        "params": {
          "mode": "form",
          "message": "请选择座位偏好",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "seat": {
                "type": "string",
                "enum": ["window", "aisle", "middle"],
                "description": "座位类型"
              }
            },
            "required": ["seat"]
          }
        }
      }
    },
    "requestState": "AEAD-protected-blob"
  }
}

// 第二轮：客户端重试原请求，附带 inputResponses
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "book_flight",
    "arguments": { "destination": "Barcelona" },
    "inputResponses": {
      "seat_preference": {
        "action": "accept",
        "content": { "seat": "window" }
      }
    },
    "requestState": "AEAD-protected-blob",
    "_meta": { "io.modelcontextprotocol/protocolVersion": "2026-07-28", ... }
  }
}

// 服务器返回最终结果
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "resultType": "complete",
    "content": [{ "type": "text", "text": "已预订靠窗座位" }]
  }
}
```

### 5.3 MRTR 的核心概念

| 概念 | 说明 |
|------|------|
| `InputRequiredResult` | `resultType: "input_required"`，表示需要更多信息 |
| `inputRequests` | 服务器请求的输入，键为服务器分配的标识符 |
| `inputResponses` | 客户端的响应，键对应 `inputRequests` |
| `requestState` | 不透明字符串，客户端必须原样回传，服务器用它恢复状态 |

### 5.4 支持 MRTR 的请求

只有以下请求可以返回 `InputRequiredResult`：
- `tools/call`
- `resources/read`
- `prompts/get`

### 5.5 requestState 安全要求

- 服务器必须验证 `requestState` 的完整性（HMAC/AEAD）
- 将 `requestState` 视为攻击者控制的输入
- 应包含：已认证主体、短过期时间、原始请求标识符
- 客户端不得检查、解析、修改 `requestState`

---

## 6. resultType 字段：多态响应

### 6.1 新增必填字段

所有 MCP 响应的 `result` 对象现在**必须**包含 `resultType` 字段：

```json
// 成功完成
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "content": [{ "type": "text", "text": "北京：晴，25°C" }]
  }
}

// 需要更多信息（MRTR 模式）
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "input_required",
    "inputRequests": { ... }
  }
}
```

### 6.2 resultType 值

| 值 | 说明 |
|---|------|
| `"complete"` | 请求完成，`result` 包含最终内容 |
| `"input_required"` | 请求未完成，需要更多信息，`result` 包含 `InputRequiredResult` |

### 6.3 向后兼容

对于不包含 `resultType` 的旧版服务器响应，客户端**必须**将其视为 `"complete"`。

---

## 7. Tasks 移为扩展

### 7.1 旧的核心协议 Tasks（已移除）

```json
// 旧：列出任务
{ "method": "tasks/list" }

// 旧：阻塞式获取结果
{ "method": "tasks/result" }
```

### 7.2 新的 Tasks 扩展（io.modelcontextprotocol/tasks）

Tasks 现在是一个官方扩展，通过 `capabilities.extensions` 声明支持：

```json
// 服务器能力声明
{
  "capabilities": {
    "tools": {},
    "extensions": {
      "io.modelcontextprotocol/tasks": {}
    }
  }
}
```

**关键变化**：
- ❌ 移除：`tasks/list`
- ❌ 移除：阻塞式 `tasks/result`
- ✅ 新增：轮询 `tasks/get`
- ✅ 新增：`tasks/update`（客户端输入）
- ✅ 新增：`CreateTaskResult`（`resultType: "task"`）

---

## 8. 废弃功能与迁移路径

### 8.1 废弃清单

| 功能 | 废弃版本 | 迁移方案 | 最早移除 |
|------|---------|---------|---------|
| **Roots** | 2026-07-28 | 工具参数/资源 URI/服务器配置 | 2027-07-28 后 |
| **Sampling** | 2026-07-28 | 直接集成 LLM provider API | 2027-07-28 后 |
| **Logging** | 2026-07-28 | stderr/OpenTelemetry | 2027-07-28 后 |
| **Dynamic Client Registration** | 2026-07-28 | Client ID Metadata Documents | 2027-07-28 后 |
| `includeContext` 值 | 2025-11-25 | 省略或 `"none"` | 跟随 Sampling |
| **HTTP+SSE 传输** | 2025-03-26 | Streamable HTTP | SEP-2596 Final 后 3 个月 |

### 8.2 Roots 迁移

**旧**：客户端通过 `roots/list` 告知服务器文件系统边界

**新**：通过工具参数、资源 URI 或服务器配置传递

```typescript
// 旧：使用 roots
const roots = await client.listRoots();

// 新：通过工具参数传递目录
await client.callTool("list_files", {
  directory: "/Users/me/project"
});
```

### 8.3 Sampling 迁移

**旧**：服务器通过 `sampling/createMessage` 请求 LLM 采样

**新**：直接集成 LLM provider API

```typescript
// 旧：服务器请求采样
const result = await client.createMessage({
  messages: [{ role: "user", content: "..." }]
});

// 新：服务器直接调用 LLM API
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic();
const result = await anthropic.messages.create({
  model: "claude-sonnet-5-20250514",
  messages: [{ role: "user", content: "..." }]
});
```

### 8.4 Logging 迁移

**旧**：`logging/setLevel` 会话级设置

**新**：每请求 `_meta.io.modelcontextprotocol/logLevel`

```json
{
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "_meta": {
      "io.modelcontextprotocol/logLevel": "info"
    }
  }
}
```

---

## 9. 新增概念：Elicitation、MCP Apps、Extensions

### 9.1 Elicitation（替代 Sampling）

Elicitation 是新的客户端原语，允许服务器请求用户输入：

**两种模式**：
- **Form 模式**：服务器通过 schema 构建表单收集用户输入
- **URL 模式**：服务器提供 URL，用户在浏览器中完成交互（适合 OAuth）

```json
// Elicitation 请求（通过 MRTR 的 inputRequests）
{
  "method": "elicitation/create",
  "params": {
    "mode": "form",
    "message": "请确认预订信息",
    "requestedSchema": {
      "type": "object",
      "properties": {
        "confirm": { "type": "boolean", "description": "确认预订" },
        "seat": {
          "type": "string",
          "enum": ["window", "aisle"],
          "description": "座位偏好"
        }
      },
      "required": ["confirm"]
    }
  }
}
```

### 9.2 MCP Apps

MCP Apps 是可在 AI 客户端内运行的交互式 UI 组件：
- 表单、选择器、仪表盘
- 渲染在 sandboxed iframe 中
- 通过 `ui/*` 桥接协议通信

### 9.3 Extensions 扩展机制

扩展通过 `capabilities.extensions` 声明：

```json
{
  "capabilities": {
    "extensions": {
      "io.modelcontextprotocol/tasks": {},
      "io.modelcontextprotocol/ui": {
        "mimeTypes": ["text/html;profile=mcp-app"]
      }
    }
  }
}
```

---

## 10. 错误码体系更新

### 10.1 错误码分区

| 范围 | 说明 |
|------|------|
| `-32700` ~ `-32600` | JSON-RPC 标准错误 |
| `-32000` ~ `-32019` | Legacy（新实现不应使用） |
| `-32020` ~ `-32099` | MCP 规范保留 |

### 10.2 新增错误码

| 错误码 | 名称 | 说明 |
|--------|------|------|
| `-32020` | `HeaderMismatch` | 镜像头部缺失或错误 |
| `-32021` | `MissingRequiredClientCapability` | 缺少客户端声明的能力 |
| `-32022` | `UnsupportedProtocolVersion` | 不支持的协议版本 |

### 10.3 版本不兼容处理

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32022,
    "message": "Unsupported protocol version",
    "data": {
      "supported": ["2026-07-28"],
      "requested": "2025-11-25"
    }
  }
}
```

客户端应从 `data.supported` 中选择兼容版本重试。

---

## 11. 缓存机制：ttlMs 和 cacheScope

### 11.1 新增缓存字段

`tools/list`、`resources/list`、`prompts/list` 等列表响应现在包含缓存字段：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "tools": [...],
    "ttlMs": 300000,
    "cacheScope": "public"
  }
}
```

### 11.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `ttlMs` | number | 缓存有效期（毫秒），此处 5 分钟 |
| `cacheScope` | string | `"public"`（可共享缓存）或 `"private"`（仅客户端） |

### 11.3 缓存失效

当服务器发送 `notifications/tools/list_changed` 时，即使 TTL 未过期，客户端也应视为缓存失效。

---

## 12. 工具定义增强：title 和 outputSchema

### 12.1 title 字段

工具现在可以包含人类可读的 `title` 字段：

```json
{
  "name": "get_weather",
  "title": "天气查询",
  "description": "查询指定城市的当前天气信息",
  "inputSchema": { ... }
}
```

### 12.2 outputSchema 字段

工具可以声明输出格式：

```json
{
  "name": "get_weather",
  "title": "天气查询",
  "description": "查询天气",
  "inputSchema": { ... },
  "outputSchema": {
    "type": "object",
    "properties": {
      "temperature": { "type": "number" },
      "condition": { "type": "string" },
      "humidity": { "type": "number" }
    }
  }
}
```

`outputSchema` 用于：
- Code Mode 中生成精确的类型化 API
- 客户端验证工具输出
- 文档生成

---

## 13. SDK 迁移指南

### 13.1 包名变化

| 旧 | 新 |
|---|---|
| `@modelcontextprotocol/sdk` (Server) | `@modelcontextprotocol/server` |
| `@modelcontextprotocol/sdk` (Client) | `@modelcontextprotocol/client` |

### 13.2 Server 端迁移

**旧代码**：

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "weather-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [{
      name: "get_weather",
      description: "查询天气",
      inputSchema: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名称" }
        },
        required: ["city"]
      }
    }]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  // 处理工具调用
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

**新代码**：

```typescript
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

const server = new McpServer({
  name: "weather-server",
  version: "1.0.0",
});

server.registerTool(
  "get_weather",
  {
    title: "天气查询",
    description: "查询指定城市的当前天气信息",
    inputSchema: z.object({
      city: z.string().describe("城市名称"),
    }),
  },
  async ({ city }) => {
    const weather = await fetchWeather(city);
    return {
      content: [{ type: "text" as const, text: weather }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 13.3 Client 端迁移

**旧代码**：

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client(
  { name: "my-client", version: "1.0.0" },
  { capabilities: {} }
);

const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"],
});

await client.connect(transport);
```

**新代码**：

```typescript
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const client = new Client(
  { name: "my-client", version: "1.0.0" },
  { capabilities: {} }
);

const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"],
});

await client.connect(transport);
```

---

## 14. 完整代码对比

### 14.1 天气查询 Server 完整对比

**旧版（2025-11-25）**：

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "weather-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "get_weather",
    description: "查询天气",
    inputSchema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"]
    }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === "get_weather") {
    return {
      content: [{ type: "text", text: `${args.city}：晴，25°C` }]
    };
  }
  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

**新版（2026-07-28）**：

```typescript
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

const server = new McpServer({
  name: "weather-server",
  version: "1.0.0",
});

server.registerTool(
  "get_weather",
  {
    title: "天气查询",
    description: "查询指定城市的当前天气信息",
    inputSchema: z.object({
      city: z.string().describe("城市名称"),
    }),
  },
  async ({ city }) => ({
    content: [{ type: "text" as const, text: `${city}：晴，25°C` }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 14.2 主要差异总结

| 方面 | 旧版 | 新版 |
|------|------|------|
| 导入 | `@modelcontextprotocol/sdk` | `@modelcontextprotocol/server` |
| Server 类 | `Server` | `McpServer` |
| 工具注册 | `setRequestHandler(ListToolsRequestSchema, ...)` + `setRequestHandler(CallToolRequestSchema, ...)` | `registerTool(name, config, handler)` |
| 参数验证 | 手写 JSON Schema | Zod schema |
| 工具标题 | 无 | `title` 字段 |
| 握手 | 自动 `initialize` | 每请求 `_meta` |

---

## 15. 常见问题 FAQ

### Q1: 旧版客户端能连接新版服务器吗？

**Dual-era 服务器**可以同时支持新旧两种客户端。服务器根据请求格式判断 era：
- 带 `_meta` 的请求 → 现代语义
- `initialize` 请求 → 旧版语义

### Q2: 新版客户端能连接旧版服务器吗？

可以。客户端应先用 `server/discover` 探测，如果服务器不支持，回退到 `initialize` 握手。

### Q3: _meta 字段是必须的吗？

是的。`io.modelcontextprotocol/protocolVersion` 和 `io.modelcontextprotocol/clientCapabilities` 是必填字段。缺少任何一个，服务器应返回 `-32602` Invalid params 错误。

### Q4: 为什么移除了 ping？

因为 MCP 现在是无状态协议，不需要心跳检测连接是否存活。传输层（如 TCP）有自己的 keepalive 机制。

### Q5: Sampling 被废弃了，我该怎么做？

如果你的服务器需要 LLM 能力，直接集成 LLM provider API（如 Anthropic SDK、OpenAI SDK）。不要通过 MCP 请求客户端的 LLM。

### Q6: Roots 被废弃了，怎么传递目录信息？

通过工具参数、资源 URI 或服务器配置传递。例如：

```typescript
// 通过工具参数
await client.callTool("list_files", {
  directory: "/Users/me/project"
});

// 通过资源 URI
await client.readResource("file:///Users/me/project");
```

### Q7: 通知订阅断线后怎么办？

- HTTP：重新发送 `subscriptions/listen`
- stdio：重新发送 `subscriptions/listen`（服务器不保持订阅状态）

### Q8: requestState 可以为空吗？

可以。`InputRequiredResult` 必须包含 `inputRequests` 或 `requestState` 至少一个。如果服务器不需要状态管理，可以只发 `inputRequests`。

### Q9: 错误码 -32002 还能用吗？

不能。`-32002`（资源未找到）已被替换为 `-32602`（Invalid params）。新实现不应使用 `-32002`。

### Q10: 如何测试我的服务器是否兼容新版本？

使用 MCP Inspector：

```bash
npx @modelcontextprotocol/inspector --cli node your-server.js --method server/discover
```

如果返回 `supportedVersions: ["2026-07-28"]`，说明服务器支持新版本。

---

## 附录：变更清单速查

### 主要变更（9 项）

1. ✅ 无状态协议：移除 `Mcp-Session-Id`
2. ✅ 移除 `initialize` 握手：每请求 `_meta`
3. ✅ 新增 `server/discover`：可选前置发现
4. ✅ `subscriptions/listen`：替代 `resources/subscribe`
5. ✅ 移除 `ping`、`logging/setLevel`、`notifications/roots/list_changed`
6. ✅ Tasks 移为扩展
7. ✅ MRTR 模式：替代服务器主动请求
8. ✅ `resultType` 字段：所有响应必须包含
9. ✅ 移除 SSE 流恢复

### 次要变更（12 项）

1. ✅ `extensions` 字段
2. ✅ OpenTelemetry trace context
3. ✅ `tools/list` 确定性顺序
4. ✅ 标准 MCP 请求头
5. ✅ `ttlMs` 和 `cacheScope` 缓存字段
6. ✅ 资源未找到错误码 `-32002` → `-32602`
7. ✅ 授权响应 `iss` 参数
8. ✅ DCR `application_type`
9. ✅ 客户端凭证绑定
10. ✅ JSON Schema 2020-12
11. ✅ 移除 `notifications/elicitation/complete`
12. ✅ 错误码分配策略

### 新增概念

- Elicitation（替代 Sampling）
- MCP Apps（交互式 UI）
- MCP Bundles（打包分发）
- MCP Registry（服务器注册）
- Extensions（扩展机制）
- Client ID Metadata Documents（替代 DCR）
- 渐进式工具发现
- Code Mode（程序化工具调用）
- 功能生命周期政策

---

## 参考资料

- [MCP 官方规范](https://modelcontextprotocol.io/specification/2026-07-28)
- [Key Changes](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [Deprecated Features](https://modelcontextprotocol.io/specification/2026-07-28/deprecated)
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
- [MCP SDKs](https://modelcontextprotocol.io/docs/2026-07-28/sdk)

---

> 本文基于 MCP 协议 2026-07-28 版本编写。如有疑问或建议，欢迎在评论区讨论。
