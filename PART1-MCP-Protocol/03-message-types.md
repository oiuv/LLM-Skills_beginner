# MCP 消息类型详解

> 本章目标：掌握 MCP 所有消息类型的完整字段定义，能够正确构造和解析任何 MCP 消息。学完本章后，你应能手动写出任何一个 MCP 请求/响应的 JSON 结构。

---

## 1. 消息类型总览

```
MCP 消息
├── 握手消息
│   ├── initialize（Request）
│   ├── initialize result（Response）
│   └── notifications/initialized（Notification）
│
├── 工具消息
│   ├── tools/list（Request）
│   ├── tools/list result（Response）
│   ├── tools/call（Request）
│   └── tools/call result（Response）
│
├── 资源消息
│   ├── resources/list（Request）
│   ├── resources/list result（Response）
│   ├── resources/read（Request）
│   ├── resources/read result（Response）
│   ├── resources/subscribe（Request）
│   ├── resources/unsubscribe（Request）
│   └── resources/updated（Notification）
│
├── 提示词消息
│   ├── prompts/list（Request）
│   ├── prompts/list result（Response）
│   ├── prompts/get（Request）
│   └── prompts/get result（Response）
│
└── 系统消息
    ├── ping（Request）
    ├── ping result（Response）
    ├── notifications/cancelled（Notification）
    └── notifications/progress（Notification）
```

---

## 2. 握手消息

握手是 MCP 连接的第一步，方向固定为 Client → Server。

### 2.1 initialize（Request）

Client 发起握手请求。

**触发时机**：连接建立后，发送任何其他请求之前。

```json
{
  "jsonrpc": "2.0",
  "id": 0,
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
      "name": "my-agent",
      "version": "1.0.0"
    }
  }
}
```

**params 字段详解**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `protocolVersion` | string | ✅ | 协议版本，固定 `"2024-11-05"` |
| `capabilities` | object | ✅ | Client 支持的能力 |
| `clientInfo` | object | ✅ | Client 应用信息 |

**capabilities 详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `roots` | object | 文件系统根目录支持 |
| `roots.listChanged` | boolean | 是否支持 `notifications/roots/list_changed` |
| `sampling` | object | 是否支持 Server 请求 LLM 采样 |

**clientInfo 详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 应用名称 |
| `version` | string | 应用版本号 |

### 2.2 initialize result（Response）

Server 响应握手请求。

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {
        "listChanged": true
      },
      "resources": {
        "subscribe": true,
        "listChanged": true
      },
      "prompts": {
        "listChanged": true
      }
    },
    "serverInfo": {
      "name": "weather-server",
      "version": "1.0.0"
    }
  }
}
```

**result 字段详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `protocolVersion` | string | Server 使用的协议版本 |
| `capabilities` | object | Server 支持的能力 |
| `serverInfo` | object | Server 应用信息 |

**capabilities.tools 详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `listChanged` | boolean | 是否支持 `notifications/tools/list_changed` |

**capabilities.resources 详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `subscribe` | boolean | 是否支持 `resources/subscribe` |
| `listChanged` | boolean | 是否支持 `notifications/resources/list_changed` |

**capabilities.prompts 详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `listChanged` | boolean | 是否支持 `notifications/prompts/list_changed` |

**serverInfo 详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | Server 名称 |
| `version` | string | Server 版本号 |

### 2.3 notifications/initialized（Notification）

Client 告知 Server 握手完成。

**发送时机**：收到 Server 的 initialize 响应后立即发送。

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

**注意**：
- 这是一个 Notification，没有 id
- Server 收到后才认为握手完成
- Server 在握手完成前不会处理其他请求

### 2.4 握手完整流程

```
Client                              Server
  │                                    │
  │ ──── initialize ────────────────► │
  │    protocolVersion: "2024-11-05"   │
  │    capabilities: {...}             │
  │    clientInfo: {...}               │
  │                                    │
  │ ◄─── initialize result ─────────── │
  │    protocolVersion: "2024-11-05"   │
  │    capabilities: {...}             │
  │    serverInfo: {...}               │
  │                                    │
  │ ──── notifications/initialized ──► │  ← 握手完成
  │                                    │
  │         ▼ 可以开始发送其他请求 ▼     │
  │                                    │
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
    "tools": [
      {
        "name": "get_weather",
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
    ]
  }
}
```

**result.tools 数组元素详解**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 工具唯一标识符，snake_case |
| `description` | string | ✅ | 工具功能描述，供 LLM 理解何时使用 |
| `inputSchema` | object | ✅ | JSON Schema 格式的参数定义 |

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
| `content` | array | ✅ | 返回内容数组 |
| `isError` | boolean | ❌ | 是否为错误结果，默认为 false |

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

### 4.5 resources/subscribe（Request）

订阅资源变更通知。

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "resources/subscribe",
  "params": {
    "uri": "file:///data/user.json"
  }
}
```

**说明**：
- 订阅后，当资源内容变化时，Server 会主动推送 `notifications/resources/updated`
- 不是所有 Server 都支持此功能（需要检查 `capabilities.resources.subscribe`）

### 4.6 resources/unsubscribe（Request）

取消订阅资源变更。

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "resources/unsubscribe",
  "params": {
    "uri": "file:///data/user.json"
  }
}
```

### 4.7 notifications/resources/updated（Notification）

Server 主动通知资源已更新。

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "uri": "file:///data/user.json"
  }
}
```

**params 详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `uri` | string | 更新的资源 URI |

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

### 6.1 ping（Request）

心跳检测，用于检查连接是否存活。

```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "method": "ping",
  "params": {}
}
```

### 6.2 ping result（Response）

```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "result": {}
}
```

**说明**：ping 的 result 是空对象，只要 Server 响应了，就说明连接正常。

### 6.3 notifications/cancelled（Notification）

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

### 7.1 TypeScript 类型

```typescript
// MCP 消息完整类型定义

// ============ 请求类型 ============

interface InitializeRequest {
  jsonrpc: "2.0";
  id: number;
  method: "initialize";
  params: {
    protocolVersion: string;
    capabilities: ClientCapabilities;
    clientInfo: { name: string; version: string };
  };
}

interface ToolsListRequest {
  jsonrpc: "2.0";
  id: number;
  method: "tools/list";
  params: {};
}

interface ToolsCallRequest {
  jsonrpc: "2.0";
  id: number;
  method: "tools/call";
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface ResourcesListRequest {
  jsonrpc: "2.0";
  id: number;
  method: "resources/list";
  params: {};
}

interface ResourcesReadRequest {
  jsonrpc: "2.0";
  id: number;
  method: "resources/read";
  params: { uri: string };
}

interface PromptsListRequest {
  jsonrpc: "2.0";
  id: number;
  method: "prompts/list";
  params: {};
}

interface PromptsGetRequest {
  jsonrpc: "2.0";
  id: number;
  method: "prompts/get";
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

// ============ 响应类型 ============

interface InitializeResult {
  jsonrpc: "2.0";
  id: number;
  result: {
    protocolVersion: string;
    capabilities: ServerCapabilities;
    serverInfo: { name: string; version: string };
  };
}

interface ToolsListResult {
  jsonrpc: "2.0";
  id: number;
  result: {
    tools: Tool[];
  };
}

interface ToolsCallResult {
  jsonrpc: "2.0";
  id: number;
  result: {
    content: Content[];
    isError?: boolean;
  };
}

interface ResourcesListResult {
  jsonrpc: "2.0";
  id: number;
  result: {
    resources: Resource[];
    resourceTemplates?: ResourceTemplate[];
  };
}

interface ResourcesReadResult {
  jsonrpc: "2.0";
  id: number;
  result: {
    contents: ResourceContent[];
  };
}

// ============ 通知类型 ============

interface InitializedNotification {
  jsonrpc: "2.0";
  method: "notifications/initialized";
}

interface ToolsListChangedNotification {
  jsonrpc: "2.0";
  method: "notifications/tools/list_changed";
}

interface ResourcesUpdatedNotification {
  jsonrpc: "2.0";
  method: "notifications/resources/updated";
  params: { uri: string };
}

// ============ 辅助类型 ============

interface Tool {
  name: string;
  description: string;
  inputSchema: InputSchema;
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

interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
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
  roots?: { listChanged?: boolean };
  sampling?: {};
}

interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  sampling?: {};
}
```

---

## 8. 本章小结

```
MCP 消息类型速查

握手（必须按顺序）
├── initialize → initialize result → notifications/initialized
└── params 和 result 中包含 capabilities 交换

工具（最常用）
├── tools/list → 获取工具列表（含 inputSchema）
└── tools/call → 调用工具（返回 content 数组）

资源（用于读取数据）
├── resources/list → 获取资源列表
├── resources/read → 读取资源内容
├── resources/subscribe → 订阅变更
└── notifications/resources/updated → 推送变更

提示词（模板复用）
├── prompts/list → 获取提示词列表
└── prompts/get → 获取填充后的提示词

系统
├── ping → 心跳检测
└── notifications/cancelled → 取消请求
```

---

## 下一步

继续阅读：
- [04-capabilities.md](04-capabilities.md) — Capability 协商机制详解
- [05-transport-layer.md](05-transport-layer.md) — stdio 和 SSE 传输层实现
