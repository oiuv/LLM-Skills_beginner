# MCP 消息类型详解

> 本章目标：掌握 MCP 所有消息类型的完整字段定义，能够正确构造和解析任何 MCP 消息。学完本章后，你应能手动写出任何一个 MCP 请求/响应的 JSON 结构。
>
> **版本说明**：本教程基于 MCP 协议版本 `2026-07-28`。该版本将 MCP 从有状态会话模型改为**无状态协议**，移除了 `initialize` 握手，改为每请求携带协议元数据。

---

## 1. 消息类型总览

```
MCP 消息（2026-07-28 版本）
├── 发现消息
│   ├── server/discover（Request）— 可选，查询服务器能力
│   └── server/discover result（Response）
│
├── 工具消息
│   ├── tools/list（Request）
│   ├── tools/list result（Response）— 含 resultType、ttlMs、cacheScope
│   ├── tools/call（Request）
│   └── tools/call result（Response）— 含 resultType
│
├── 资源消息
│   ├── resources/list（Request）
│   ├── resources/list result（Response）
│   ├── resources/templates/list（Request）
│   ├── resources/read（Request）
│   └── resources/read result（Response）
│
├── 提示词消息
│   ├── prompts/list（Request）
│   ├── prompts/list result（Response）
│   ├── prompts/get（Request）
│   └── prompts/get result（Response）
│
├── 订阅消息
│   ├── subscriptions/listen（Request）— 打开通知流
│   ├── notifications/subscriptions/acknowledged（Notification）
│   └── notifications/tools/list_changed 等（Notification）
│
└── 系统消息
    ├── notifications/cancelled（Notification）
    └── notifications/progress（Notification）
```

**与旧版（2025-11-25）的主要变化**：
- ❌ 移除：`initialize`、`notifications/initialized`、`ping`、`resources/subscribe`、`resources/unsubscribe`
- ✅ 新增：`server/discover`、`subscriptions/listen`、`resultType` 字段
- 🔄 变更：所有请求通过 `_meta` 携带协议版本和能力（无状态）

---

## 2. 无状态模型与 `_meta` 字段

> **重大变更**：`2026-07-28` 版本将 MCP 从有状态会话改为**无状态协议**。移除了 `initialize`/`notifications/initialized` 握手，每个请求通过 `_meta` 字段独立携带协议版本和能力。

### 2.1 无状态协议

MCP 是无状态协议：每个请求自包含，携带处理所需的所有信息。服务器独立处理每个请求，不依赖先前请求的上下文。

**核心变化**：
- ❌ 旧版：连接时 `initialize` 握手一次，后续请求依赖会话状态
- ✅ 新版：每个请求在 `_meta` 中携带 `protocolVersion` 和 `clientCapabilities`

### 2.2 `_meta` 字段

所有 MCP 请求都通过 `_meta` 字段携带协议元数据：

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

**`_meta` 保留键**：

| 键 | 类型 | 必填 | 说明 |
|---|------|------|------|
| `io.modelcontextprotocol/protocolVersion` | string | ✅ | 协议版本（如 `"2026-07-28"`） |
| `io.modelcontextprotocol/clientInfo` | object | 建议 | Client 名称和版本 |
| `io.modelcontextprotocol/clientCapabilities` | object | ✅ | Client 能力声明 |
| `io.modelcontextprotocol/logLevel` | string | ❌ | 日志级别（每请求 opt-in） |
| `progressToken` | string/number | ❌ | 进度通知令牌 |

**服务器响应中的 `_meta`**：

| 键 | 类型 | 说明 |
|---|------|------|
| `io.modelcontextprotocol/serverInfo` | object | Server 名称和版本 |
| `io.modelcontextprotocol/subscriptionId` | number | 订阅通知关联 ID |

### 2.3 server/discover（Request）— 可选发现

Client 可以在发送其他请求之前调用 `server/discover` 获取服务器信息：

```json
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
```

### 2.4 server/discover result（Response）

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "resultType": "complete",
    "supportedVersions": ["2026-07-28"],
    "capabilities": {
      "tools": {
        "listChanged": true
      },
      "resources": {},
      "prompts": {}
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

**result 字段详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `resultType` | string | 固定 `"complete"`，表示请求完成 |
| `supportedVersions` | string[] | 服务器支持的协议版本列表 |
| `capabilities` | object | 服务器能力声明 |
| `ttlMs` | number | 缓存有效期（毫秒） |
| `cacheScope` | string | `"public"` 或 `"private"` |

### 2.5 版本不兼容处理

如果服务器不支持请求的版本，返回 `UnsupportedProtocolVersionError`：

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

Client 应从 `data.supported` 中选择一个兼容版本重试。

### 2.6 新旧版本对比

```
旧版（2025-11-25）有状态模型：
Client                              Server
  │                                    │
  │ ──── initialize ────────────────► │  ← 一次性握手
  │ ◄─── initialize result ─────────── │
  │ ──── notifications/initialized ──► │  ← 握手完成
  │                                    │
  │ ──── tools/call ────────────────► │  ← 后续请求依赖会话
  │ ◄─── tools/call result ─────────── │

新版（2026-07-28）无状态模型：
Client                              Server
  │                                    │
  │ ──── server/discover ────────────► │  ← 可选发现
  │ ◄─── discover result ───────────── │
  │                                    │
  │ ──── tools/call ────────────────► │  ← 每请求自带 _meta
  │    _meta: {protocolVersion, ...}   │
  │ ◄─── tools/call result ─────────── │
  │                                    │
  │ ──── tools/call ────────────────► │  ← 无状态，不依赖前序
  │    _meta: {protocolVersion, ...}   │
  │ ◄─── tools/call result ─────────── │
```

---

## 3. 工具消息

工具是 MCP 最核心的能力，允许 AI 模型调用外部功能。

### 3.1 tools/list（Request）

获取 Server 提供的所有工具。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**说明**：
- `params` 为空对象，可以省略
- 这个请求通常在握手后立即发送一次，结果可以缓存

### 3.2 tools/list result（Response）

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "tools": [
      {
        "name": "get_weather",
        "title": "天气查询",
        "description": "查询城市实时天气",
        "inputSchema": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "城市名称"
            },
            "units": {
              "type": "string",
              "enum": ["metric", "imperial"],
              "description": "温度单位"
            }
          },
          "required": ["city"]
        }
      }
    ],
    "ttlMs": 300000,
    "cacheScope": "public"
  }
}
```

**result 字段详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `resultType` | string | 固定 `"complete"`，表示请求完成 |
| `tools` | array | 工具列表 |
| `ttlMs` | number | 缓存有效期（毫秒），此处 5 分钟 |
| `cacheScope` | string | `"public"` 或 `"private"` |

**result.tools 数组元素详解**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 工具唯一标识符，snake_case |
| `title` | string | ❌ | 人类可读的展示名（2026-07-28 新增） |
| `description` | string | ✅ | 工具功能描述，供 LLM 理解何时使用 |
| `inputSchema` | object | ✅ | JSON Schema 格式的参数定义 |
| `outputSchema` | object | ❌ | 输出格式定义（2026-07-28 新增） |

**inputSchema 详解**：

inputSchema 是一个标准的 [JSON Schema](https://json-schema.org/) 对象，MCP 要求的最小字段：

```typescript
interface InputSchema {
  type: "object";  // MCP 固定为 object
  properties: {
    [key: string]: {
      type: string;        // string, number, boolean, array, object
      description?: string; // 参数描述
      enum?: unknown[];    // 枚举值
      default?: unknown;   // 默认值
    };
  };
  required?: string[];      // 必需参数列表
}
```

### 3.3 tools/call（Request）

调用具体的工具。

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "北京",
      "units": "metric"
    }
  }
}
```

**params 字段详解**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 要调用的工具名称 |
| `arguments` | object | ✅ | 工具参数，与 inputSchema 对应 |

### 3.4 tools/call result（Response）

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "resultType": "complete",
    "content": [
      {
        "type": "text",
        "text": "北京：晴天，25°C，湿度 45%"
      }
    ],
    "isError": false
  }
}
```

**result 字段详解**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `resultType` | string | ✅ | `"complete"` 表示完成，`"input_required"` 表示需要更多信息（MRTR 模式） |
| `content` | array | ✅ | 返回内容数组 |
| `isError` | boolean | ❌ | 是否为错误结果，默认为 false |

> **MRTR 模式**：当 `resultType` 为 `"input_required"` 时，表示服务器需要客户端提供更多信息（如用户确认、LLM 采样等）。详见 [Multi Round-Trip Requests](/specification/2026-07-28/basic/patterns/mrtr)。

**content 数组元素详解**：

```typescript
// text 类型
{ "type": "text", "text": "..." }

// image 类型
{
  "type": "image",
  "data": "base64编码的图片数据",
  "mimeType": "image/png"
}

// resource 类型（引用资源）
{
  "type": "resource",
  "resource": {
    "uri": "file:///config/app.json",
    "mimeType": "application/json",
    "text": "{ ... }"
  }
}
```

### 3.5 工具调用错误处理

```json
// 工具不存在
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32601,
    "message": "Tool not found: unknown_tool"
  }
}

// 参数无效
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32602,
    "message": "Invalid params: city is required"
  }
}

// 工具执行失败
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32003,
    "message": "Tool execution failed: API rate limit exceeded"
  }
}
```

### 3.6 notifications/tools/list_changed（Notification）

Server 主动通知工具列表变更。

**发送时机**：Server 的工具列表发生变化时。

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/list_changed"
}
```

**Client 收到后应该**：重新调用 `tools/list` 获取最新列表。

---

## 4. 资源消息

资源是 Server 提供的数据内容，AI 可以读取但不能执行。

### 4.1 resources/list（Request）

获取 Server 提供的所有资源。

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "resources/list",
  "params": {}
}
```

### 4.2 resources/list result（Response）

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "resources": [
      {
        "uri": "file:///data/user.json",
        "name": "用户数据",
        "description": "当前登录用户的信息",
        "mimeType": "application/json"
      },
      {
        "uri": "git://repo/{owner}/{name}",
        "name": "GitHub 仓库",
        "description": "访问 GitHub 仓库信息",
        "mimeType": "application/json"
      }
    ],
    "resourceTemplates": [
      {
        "uriTemplate": "git://repo/{owner}/{name}",
        "name": "GitHub 仓库",
        "description": "访问指定 GitHub 仓库的信息",
        "mimeType": "application/json"
      }
    ]
  }
}
```

**result 字段详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `resources` | array | 静态资源列表 |
| `resourceTemplates` | array | 动态资源模板列表 |

**resources 元素详解**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `uri` | string | ✅ | 资源唯一标识符 |
| `name` | string | ✅ | 资源名称 |
| `description` | string | ❌ | 资源描述 |
| `mimeType` | string | ❌ | MIME 类型 |

**resourceTemplates 元素详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `uriTemplate` | string | URI 模板，使用 `{变量名}` 占位 |
| `name` | string | 模板名称 |
| `description` | string | 模板描述 |
| `mimeType` | string | MIME 类型 |

### 4.3 resources/read（Request）

读取资源内容。

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "resources/read",
  "params": {
    "uri": "file:///data/user.json"
  }
}
```

**params 详解**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `uri` | string | ✅ | 资源的 URI |

### 4.4 resources/read result（Response）

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "contents": [
      {
        "uri": "file:///data/user.json",
        "mimeType": "application/json",
        "text": "{ \"name\": \"张三\", \"age\": 30 }"
      }
    ]
  }
}
```

**result.contents 详解**：

返回数组是因为某些资源可能包含多个部分（如文件夹）。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `uri` | string | ✅ | 资源 URI |
| `mimeType` | string | ❌ | MIME 类型 |
| `text` | string | 二选一 | 文本内容（UTF-8） |
| `blob` | string | 二选一 | Base64 编码的二进制内容 |

### 4.5 subscriptions/listen（Request）— 订阅通知

> **2026-07-28 变更**：`resources/subscribe` 和 `resources/unsubscribe` 已被移除，统一使用 `subscriptions/listen` 打开通知流。

客户端通过 `subscriptions/listen` 打开一个长连接通知流，指定想接收的通知类型：

```json
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
```

**notifications 过滤器**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `toolsListChanged` | boolean | 接收 `notifications/tools/list_changed` |
| `promptsListChanged` | boolean | 接收 `notifications/prompts/list_changed` |
| `resourcesListChanged` | boolean | 接收 `notifications/resources/list_changed` |
| `resourceSubscriptions` | string[] | 接收指定资源的 `notifications/resources/updated` |

### 4.6 notifications/subscriptions/acknowledged（Notification）

服务器确认订阅，反映同意的通知类型：

```json
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
```

### 4.7 notifications/resources/updated（Notification）

服务器通知资源已更新（通过订阅流推送）：

```json
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

> **注意**：所有订阅通知都携带 `io.modelcontextprotocol/subscriptionId`，用于关联通知与订阅请求。

---

## 5. 提示词消息

提示词模板允许 Server 提供可复用的提示词，Client 可以获取后填充变量生成最终提示。

### 5.1 prompts/list（Request）

获取所有可用的提示词模板。

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "prompts/list",
  "params": {}
}
```

### 5.2 prompts/list result（Response）

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "prompts": [
      {
        "name": "code_review",
        "description": "代码审查模板",
        "arguments": [
          {
            "name": "repo",
            "description": "仓库路径",
            "required": true
          },
          {
            "name": "language",
            "description": "编程语言",
            "required": false
          }
        ]
      }
    ]
  }
}
```

**prompts 元素详解**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 提示词名称 |
| `description` | string | ✅ | 提示词描述 |
| `arguments` | array | ❌ | 参数定义 |

**arguments 元素详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 参数名称 |
| `description` | string | 参数描述 |
| `required` | boolean | 是否必需 |

### 5.3 prompts/get（Request）

获取具体提示词内容（填充变量后）。

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "prompts/get",
  "params": {
    "name": "code_review",
    "arguments": {
      "repo": "foo/bar",
      "language": "python"
    }
  }
}
```

**params 详解**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 提示词名称 |
| `arguments` | object | ❌ | 变量值 |

### 5.4 prompts/get result（Response）

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "messages": [
      {
        "role": "user",
        "content": {
          "type": "text",
          "text": "请审查这个 Python 仓库: foo/bar\n\n重点检查：\n1. 代码规范\n2. 潜在 bug\n3. 性能问题"
        }
      }
    ]
  }
}
```

**result.messages 详解**：

返回的是完整的对话消息数组，可直接用于 LLM 调用。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `role` | string | ✅ | 角色：`user` 或 `system` |
| `content` | object | ✅ | 内容对象 |

**content.text 详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | 固定为 `"text"` |
| `text` | string | 提示词文本 |

---

## 6. 系统消息

### 6.1 notifications/cancelled（Notification）

通知对方取消一个请求。

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/cancelled",
  "params": {
    "requestId": 3,
    "reason": "User cancelled the operation"
  }
}
```

**params 详解**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `requestId` | number/string | ✅ | 要取消的请求 ID |
| `reason` | string | ❌ | 取消原因 |

### 6.4 notifications/progress（Notification）

通知长时间运行的请求的进度。

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "task-123",
    "progress": 50,
    "total": 100
  }
}
```

**params 详解**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `progressToken` | string | ✅ | 进度令牌（之前请求中约定） |
| `progress` | number | ✅ | 当前进度值 |
| `total` | number | ❌ | 总进度值 |

---

## 7. 完整类型定义

### 7.1 TypeScript 类型（2026-07-28 版本）

```typescript
// MCP 消息完整类型定义（2026-07-28 版本）

// ============ 请求类型 ============

// 每个请求都通过 _meta 携带协议元数据
interface MCPRequestMeta {
  "io.modelcontextprotocol/protocolVersion": string;  // 必填
  "io.modelcontextprotocol/clientInfo"?: { name: string; version: string };
  "io.modelcontextprotocol/clientCapabilities": Record<string, unknown>;  // 必填
  "io.modelcontextprotocol/logLevel"?: string;
  progressToken?: string | number;
}

interface DiscoverRequest {
  jsonrpc: "2.0";
  id: number;
  method: "server/discover";
  params: { _meta: MCPRequestMeta };
}

interface ToolsListRequest {
  jsonrpc: "2.0";
  id: number;
  method: "tools/list";
  params: { _meta: MCPRequestMeta };
}

interface ToolsCallRequest {
  jsonrpc: "2.0";
  id: number;
  method: "tools/call";
  params: {
    name: string;
    arguments: Record<string, unknown>;
    _meta: MCPRequestMeta;
  };
}

interface SubscriptionsListenRequest {
  jsonrpc: "2.0";
  id: number;
  method: "subscriptions/listen";
  params: {
    _meta: MCPRequestMeta;
    notifications: {
      toolsListChanged?: boolean;
      promptsListChanged?: boolean;
      resourcesListChanged?: boolean;
      resourceSubscriptions?: string[];
    };
  };
}

// ============ 响应类型 ============

// 所有结果都必须包含 resultType
interface MCPResult {
  resultType: "complete" | "input_required";
}

interface DiscoverResult extends MCPResult {
  resultType: "complete";
  supportedVersions: string[];
  capabilities: ServerCapabilities;
  _meta?: { "io.modelcontextprotocol/serverInfo"?: { name: string; version: string } };
  ttlMs?: number;
  cacheScope?: "public" | "private";
}

interface ToolsListResult extends MCPResult {
  resultType: "complete";
  tools: Tool[];
  ttlMs?: number;
  cacheScope?: "public" | "private";
}

interface ToolsCallResult extends MCPResult {
  resultType: "complete";
  content: Content[];
  isError?: boolean;
}

// MRTR 模式：服务器请求更多信息
interface InputRequiredResult extends MCPResult {
  resultType: "input_required";
  inputRequests?: Record<string, unknown>;
  requestState?: string;
}

// ============ 通知类型 ============

interface SubscriptionsAcknowledgedNotification {
  jsonrpc: "2.0";
  method: "notifications/subscriptions/acknowledged";
  params: {
    _meta: { "io.modelcontextprotocol/subscriptionId": number };
    notifications: Record<string, unknown>;
  };
}

interface ToolsListChangedNotification {
  jsonrpc: "2.0";
  method: "notifications/tools/list_changed";
  params: {
    _meta: { "io.modelcontextprotocol/subscriptionId": number };
  };
}

// ============ 辅助类型 ============

interface Tool {
  name: string;
  title?: string;  // 2026-07-28 新增：人类可读展示名
  description: string;
  inputSchema: InputSchema;
  outputSchema?: Record<string, unknown>;  // 2026-07-28 新增
}

interface InputSchema {
  type: "object";
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: unknown[];
    default?: unknown;
  }>;
  required?: string[];
}

interface Content {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: {
    uri: string;
    mimeType?: string;
    text?: string;
  };
}

interface ClientCapabilities {
  elicitation?: {};
  extensions?: Record<string, unknown>;
}

interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  extensions?: Record<string, unknown>;
}
```

---

## 8. 本章小结

```
MCP 消息类型速查（2026-07-28 版本）

发现（可选）
└── server/discover → 获取服务器能力和支持的版本

工具（最常用）
├── tools/list → 获取工具列表（含 inputSchema、title、缓存字段）
└── tools/call → 调用工具（返回 content 数组，含 resultType）

资源（用于读取数据）
├── resources/list → 获取资源列表
├── resources/read → 读取资源内容
└── subscriptions/listen → 订阅变更通知

提示词（模板复用）
├── prompts/list → 获取提示词列表
└── prompts/get → 获取填充后的提示词

系统
├── notifications/cancelled → 取消请求
└── notifications/progress → 进度通知

关键变化（vs 2025-11-25）
├── 无状态：每个请求通过 _meta 携带协议版本和能力
├── 移除：initialize 握手、ping、resources/subscribe
├── 新增：server/discover、subscriptions/listen、resultType
└── 新增：工具 title 字段、缓存字段（ttlMs、cacheScope）
```

---

## 下一步

继续阅读：
- [04-capabilities.md](04-capabilities.md) — Capability 协商机制详解
- [05-transport-layer.md](05-transport-layer.md) — stdio 和 Streamable HTTP 传输层实现
