# JSON-RPC 2.0 完整规范

> 本章目标：深入理解 JSON-RPC 2.0 规范，这是 MCP 的协议基础。学完本章后，你应能正确处理任何 JSON-RPC 2.0 消息，包括批量请求和错误响应。

---

## 1. JSON-RPC 2.0 简介

### 1.1 什么是 JSON-RPC？

JSON-RPC 是一个轻量级的远程过程调用（RPC）协议，使用 JSON 作为数据格式。

**设计哲学**：
- 简单：只有几种消息类型，规则很少
- 无状态：每个请求独立处理，不依赖之前的请求
- 灵活：可以传输任何 JSON 可序列化的数据

**版本历史**：
- JSON-RPC 1.0（2005）：已废弃，有缺陷
- JSON-RPC 2.0（2010）：当前版本，MCP 使用的版本
- JSON-RPC 2.0 是完全向后兼容 1.0 的

### 1.2 为什么 MCP 选用 JSON-RPC？

| 选择理由 | 说明 |
|---------|------|
| 通用性 | JSON 是所有语言都支持的数据格式 |
| 简单性 | 规则很少，容易实现 |
| 可调试性 | 消息是纯文本，人眼可以直接阅读 |
| 无状态 | 适合 MCP 的请求-响应模式 |

对比：
- 如果用 Protocol Buffers：需要额外编译，消息不可读
- 如果用 GraphQL：过于复杂，不适合简单的工具调用场景

---

## 2. 消息类型

JSON-RPC 2.0 有 3 种消息类型：

```
┌─────────────────────────────────────────────────────────────┐
│                    JSON-RPC 2.0 消息类型                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Request（请求）                                             │
│  ├── 必须有 id                                               │
│  ├── 必须有 method                                           │
│  └── 可选有 params                                          │
│                                                             │
│  Response（响应）                                             │
│  ├── 必须有 id（与对应的请求相同）                            │
│  ├── 要么有 result（成功）                                   │
│  └── 要么有 error（失败），二者互斥                           │
│                                                             │
│  Notification（通知）                                        │
│  ├── 没有 id                                                 │
│  ├── 必须有 method                                           │
│  └── 不需要响应                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Request（请求）

**什么时候用**：Client 需要 Server 执行某个操作并返回结果。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `jsonrpc` | string | ✅ | 固定值 `"2.0"` |
| `id` | string/number/null | ✅ | 请求标识，用于匹配响应 |
| `method` | string | ✅ | 要调用的方法名 |
| `params` | object/array | ❌ | 方法参数 |

**关于 id 的特别说明**：
- 不能是 `undefined`，可以是 `string`、`number` 或 `null`
- 在 MCP 中，通常用 `number`（递增整数）
- `null` 有特殊含义：表示请求是通知，不需要响应

**关于 params**：
- 可以是 `object`（具名参数）或 `array`（位置参数）
- MCP 规定用 `object`（具名参数），更清晰

**params 是 object 的例子**：
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "北京"
    }
  }
}
```

### 2.2 Response（响应）

**什么时候用**：Server 处理完请求后返回结果。

**成功响应**：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      { "name": "get_weather", "description": "查天气" }
    ]
  }
}
```

**失败响应**：
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": { "field": "city", "reason": "required" }
  }
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `jsonrpc` | string | ✅ | 固定值 `"2.0"` |
| `id` | any | ✅ | 与对应请求的 id 相同 |
| `result` | any | 见说明 | 成功时必须有，失败时不能有 |
| `error` | object | 见说明 | 失败时必须有，成功时不能有 |

**result 和 error 是互斥的**：有 result 就不能有 error，有 error 就不能有 result。

### 2.3 Notification（通知）

**什么时候用**：不需要响应的情况，如 Server 主动推送更新。

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

**特点**：
- 没有 `id` 字段（MCP 规定没有 id 的消息就是通知）
- Server 不需要响应
- Client 也不能通过 id 来关联响应

**MCP 中的通知**：

| 通知 | 发送方 | 说明 |
|------|--------|------|
| `notifications/initialized` | Client | 握手完成后告知 Server |
| `notifications/cancelled` | Client/Server | 请求被取消 |
| `notifications/tools/list_changed` | Server | 工具列表变更 |
| `notifications/resources/updated` | Server | 资源内容变更 |

---

## 3. 错误处理

### 3.1 错误对象结构

```typescript
interface JSONRPCError {
  code: number;       // 错误码（必须）
  message: string;    // 错误信息（必须，简单描述）
  data?: any;         // 附加数据（可选，详细信息）
}
```

### 3.2 预定义错误码

JSON-RPC 2.0 定义了一组标准错误码：

| 错误码 | 名称 | 说明 |
|-------|------|------|
| `-32700` | Parse error | JSON 格式错误，无法解析 |
| `-32600` | Invalid Request | 请求格式无效（不是有效的 JSON-RPC） |
| `-32601` | Method not found | 方法不存在或不可用 |
| `-32602` | Invalid params | 参数无效 |
| `-32603` | Internal error | 服务器内部错误 |

**MCP 扩展错误码**（从 `-32000` 开始）：

| 错误码 | 名称 | 说明 |
|-------|------|------|
| `-32000` | Server error | 通用服务器错误 |
| `-32001` | Request timed out | 请求超时 |
| `-32002` | Resource not found | 资源不存在 |
| `-32003` | Tool execution failed | 工具执行失败 |
| `-32004` | Permission denied | 权限不足 |
| `-32005` | Capability not supported | 不支持的能力 |

### 3.3 错误处理示例

**参数验证失败**：
```json
// Request
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {}
  }
}

// Response (Error - 缺少必需的 city 参数)
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32602,
    "message": "Invalid params: city is required",
    "data": {
      "field": "arguments.city",
      "reason": "required field missing"
    }
  }
}
```

**工具执行失败**：
```json
// Response
{
  "jsonrpc": "2.0",
  "id": 4,
  "error": {
    "code": -32003,
    "message": "Tool execution failed: API rate limit exceeded",
    "data": {
      "tool": "get_weather",
      "retryAfter": 60
    }
  }
}
```

### 3.4 错误处理的最佳实践

```
作为 Server：
├── 优先使用预定义错误码
├── 给 error.message 提供有用的信息
├── 在 data 中提供调试详情（生产环境可关闭）
└── 不要暴露敏感信息

作为 Client：
├── 总是检查 response 是否有 error
├── 根据错误码决定重试还是放弃
└── 将错误信息转换为用户友好的提示
```

---

## 4. 批量请求

### 4.1 什么是批量请求？

一次发送多个请求，Server 可以批量处理后一起返回。

**为什么有用**：
- 减少网络往返次数
- 提高吞吐量

### 4.2 批量请求格式

```json
// 一次发送 3 个请求
[
  { "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {} },
  { "jsonrpc": "2.0", "id": 2, "method": "resources/list", "params": {} },
  { "jsonrpc": "2.0", "id": 3, "method": "prompts/list", "params": {} }
]
```

### 4.3 批量响应格式

```json
// Server 返回 3 个响应（顺序无关）
[
  { "jsonrpc": "2.0", "id": 2, "result": { "resources": [...] } },
  { "jsonrpc": "2.0", "id": 1, "result": { "tools": [...] } },
  { "jsonrpc": "2.0", "id": 3, "result": { "prompts": [...] } }
]
```

### 4.4 混合成功和失败

批量响应中，可以包含成功的 result 和失败的 error：

```json
[
  { "jsonrpc": "2.0", "id": 1, "result": { "tools": [...] } },
  { "jsonrpc": "2.0", "id": 2, "error": { "code": -32601, "message": "Method not found" } },
  { "jsonrpc": "2.0", "id": 3, "result": { "resources": [...] } }
]
```

### 4.5 特殊规则

**规则 1**：如果批量请求中有一个是通知（没有 id），Server 不需要为它返回任何东西。

**规则 2**：如果批量请求本身是空的，Server 应返回空数组 `[]`（这是 Invalid Request 的一种）。

**规则 3**：如果批量请求中任何一个失败了，Server 仍然应该返回其他请求的结果。

---

## 5. 类型定义

### 5.1 TypeScript 类型定义

```typescript
// JSON-RPC 2.0 类型定义

// 请求（具有 id）
interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

// 通知（没有 id）
interface JSONRPCNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown> | unknown[];
}

// 成功响应
interface JSONRPCSuccessResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

// 错误响应
interface JSONRPCErrorResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  error: JSONRPCError;
}

// 错误对象
interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

// 联合类型（请求或通知）
type JSONRPCIncoming = JSONRPCRequest | JSONRPCNotification;

// 联合类型（响应）
type JSONRPCResponse = JSONRPCSuccessResponse | JSONRPCErrorResponse;
```

### 5.2 判断消息类型

```typescript
function getMessageType(message: unknown): "request" | "notification" | "response" {
  if (!message || typeof message !== "object") {
    return "response"; // 无效消息按响应处理
  }

  const msg = message as Record<string, unknown>;

  // 有 jsonrpc 版本且有 method → 请求或通知
  if (msg.jsonrpc === "2.0" && typeof msg.method === "string") {
    // 有 id → 请求，没有 id → 通知
    return "id" in msg ? "request" : "notification";
  }

  // 有 jsonrpc 版本且有 result 或 error → 响应
  if (msg.jsonrpc === "2.0" && ("result" in msg || "error" in msg)) {
    return "response";
  }

  return "response"; // 其他情况按响应处理
}
```

---

## 6. 实际代码实现

### 6.1 解析器实现

```typescript
// json-rpc/parser.ts

class JSONRPCParser {
  /**
   * 解析原始 JSON 字符串为 JSON-RPC 消息
   */
  parse(raw: string): JSONRPCIncoming | JSONRPCResponse | JSONRPCResponse[] {
    // 1. JSON 解析
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      throw new JSONRPCParseError("Invalid JSON");
    }

    // 2. 验证 jsonrpc 版本
    if (!this.isValidMessage(message)) {
      throw new JSONRPCInvalidError("Invalid JSON-RPC message");
    }

    // 3. 判断消息类型
    if (this.isResponse(message)) {
      return message;
    }

    if (this.isNotification(message)) {
      return message;
    }

    return message; // Request
  }

  private isValidMessage(msg: unknown): boolean {
    if (typeof msg !== "object" || msg === null) return false;
    const m = msg as Record<string, unknown>;
    return m.jsonrpc === "2.0";
  }

  private isResponse(msg: unknown): boolean {
    const m = msg as Record<string, unknown>;
    return "result" in m || "error" in m;
  }

  private isNotification(msg: unknown): boolean {
    const m = msg as Record<string, unknown>;
    return typeof m.method === "string" && !("id" in m);
  }
}

class JSONRPCParseError extends Error {
  code = -32700;
}

class JSONRPCInvalidError extends Error {
  code = -32600;
}
```

### 6.2 序列化器实现

```typescript
// json-rpc/serializer.ts

class JSONRPCSerializer {
  /**
   * 序列化请求为 JSON 字符串
   */
  serializeRequest(id: number, method: string, params?: Record<string, unknown>): string {
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params && { params }),
    };
    return JSON.stringify(request);
  }

  /**
   * 序列化通知为 JSON 字符串
   */
  serializeNotification(method: string, params?: Record<string, unknown>): string {
    const notification = {
      jsonrpc: "2.0",
      method,
      ...(params && { params }),
    };
    return JSON.stringify(notification);
  }

  /**
   * 序列化成功响应为 JSON 字符串
   */
  serializeSuccess(id: number, result: unknown): string {
    return JSON.stringify({
      jsonrpc: "2.0",
      id,
      result,
    });
  }

  /**
   * 序列化错误响应为 JSON 字符串
   */
  serializeError(id: number, code: number, message: string, data?: unknown): string {
    return JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
        ...(data !== undefined && { data }),
      },
    });
  }
}
```

### 6.3 完整的协议处理器

```typescript
// json-rpc/handler.ts

class JSONRPCHandler {
  private parser = new JSONRPCParser();
  private serializer = new JSONRPCSerializer();
  private handlers = new Map<string, (params: unknown) => Promise<unknown>>();
  private nextId = 1;

  /**
   * 注册方法处理器
   */
  register(method: string, handler: (params: unknown) => Promise<unknown>): void {
    this.handlers.set(method, handler);
  }

  /**
   * 处理接收到的消息
   */
  async handle(rawMessage: string): Promise<string> {
    try {
      const message = this.parser.parse(rawMessage);

      // 批量请求
      if (Array.isArray(message)) {
        return this.handleBatch(message);
      }

      // 通知（不需要响应）
      if (this.isNotification(message)) {
        this.handleNotification(message);
        return ""; // 返回空字符串，不发送响应
      }

      // 请求
      return await this.handleRequest(message);
    } catch (error) {
      return this.serializeError(error);
    }
  }

  private async handleRequest(request: JSONRPCRequest): Promise<string> {
    const { id, method, params } = request;

    const handler = this.handlers.get(method);
    if (!handler) {
      return this.serializer.serializeError(id, -32601, `Method not found: ${method}`);
    }

    try {
      const result = await handler(params);
      return this.serializer.serializeSuccess(id, result);
    } catch (error) {
      if (error instanceof JSONRPCError) {
        return this.serializer.serializeError(id, error.code, error.message, error.data);
      }
      return this.serializer.serializeError(id, -32603, "Internal error");
    }
  }

  private async handleBatch(batch: JSONRPCRequest[]): Promise<string> {
    const promises = batch.map((msg) => this.handleRequest(msg));
    const results = await Promise.all(promises);
    const filtered = results.filter((r) => r !== "");
    return filtered.length > 0 ? `[${filtered.join(",")}]` : "";
  }

  private handleNotification(notification: JSONRPCNotification): void {
    const handler = this.handlers.get(notification.method);
    if (handler) {
      // 通知不等待结果
      handler(notification.params).catch(() => {});
    }
  }

  private serializeError(error: unknown): string {
    if (error instanceof JSONRPCError) {
      return this.serializer.serializeError(null as any, error.code, error.message);
    }
    return this.serializer.serializeError(null as any, -32603, "Parse error");
  }

  private isNotification(msg: unknown): msg is JSONRPCNotification {
    return typeof msg === "object" && msg !== null && !("id" in msg) && "method" in msg;
  }
}
```

---

## 7. 常见错误和调试

### 7.1 常见错误

| 错误 | 原因 | 解决方法 |
|------|------|---------|
| `Parse error` | JSON 格式不对 | 检查发送的 JSON 字符串 |
| `Invalid Request` | 缺少必需字段 | 检查 jsonrpc、id、method |
| `Method not found` | 调用了不存在的方法 | 检查方法名拼写 |
| `Invalid params` | 参数格式不对 | 检查 params 结构 |
| `Internal error` | Server 端代码 bug | 查看 Server 日志 |

### 7.2 调试技巧

**技巧 1：打印原始消息**

```typescript
// Client 发送前
console.log("Sending:", JSON.stringify(request, null, 2));

// Server 接收后
console.log("Received:", rawMessage);

// Server 发送前
console.log("Sending:", JSON.stringify(response, null, 2));
```

**技巧 2：用 curl 测试 stdio**

stdio 是进程间通信，不支持直接用 curl。但如果用 Streamable HTTP 传输：

```bash
# 测试 MCP Server（HTTP 模式）
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

**技巧 3：检查 id 匹配**

Client 发送的 id 必须和 Server 返回的 id 一致：

```typescript
// Client
const id = 42;
send({ jsonrpc: "2.0", id, method: "tools/list", params: {} });

// Server 返回的 id 必须也是 42
// { jsonrpc: "2.0", id: 42, result: {...} }
```

---

## 8. 与 MCP 的关系

### 8.1 MCP 如何使用 JSON-RPC

MCP 完全遵循 JSON-RPC 2.0 规范，没有自定义扩展：

```
MCP = JSON-RPC 2.0 + MCP 特定方法名 + MCP 特定数据结构
```

**MCP 的所有方法**：

| 方法 | 类型 | 说明 |
|------|------|------|
| `initialize` | Request | 握手 |
| `ping` | Request | 心跳 |
| `notifications/initialized` | Notification | 握手完成 |
| `notifications/cancelled` | Notification | 请求取消 |
| `tools/list` | Request | 获取工具列表 |
| `tools/call` | Request | 调用工具 |
| `resources/list` | Request | 获取资源列表 |
| `resources/read` | Request | 读取资源 |
| `resources/subscribe` | Request | 订阅资源 |
| `prompts/list` | Request | 获取提示列表 |
| `prompts/get` | Request | 获取提示内容 |

### 8.2 MCP 的 params 结构

MCP 为每个方法定义了特定的 params 结构：

```typescript
// initialize 的 params
interface InitializeParams {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: { name: string; version: string };
}

// tools/call 的 params
interface CallToolParams {
  name: string;
  arguments: Record<string, unknown>;
}

// resources/read 的 params
interface ReadResourceParams {
  uri: string;
}
```

---

## 9. 本章小结

```
JSON-RPC 2.0 核心要点
├── 消息类型：Request、Response、Notification
├── Request 必须有 id，Notification 没有 id
├── Response 用 id 匹配对应的 Request
├── 错误码：预定义码（-32700 到 -32603）+ MCP 扩展码（-32000 开始）
└── 批量请求：一次发多个，返回数组

实现要点
├── Parser：解析 JSON + 验证格式 + 判断类型
├── Serializer：构造 JSON + 处理错误
├── Handler：注册方法 + 调用处理器 + 返回响应
└── 调试：打印原始消息 + 检查 id 匹配
```

---

## 下一步

继续阅读：
- [03-message-types.md](03-message-types.md) — MCP 消息类型的完整字段定义
- [04-capabilities.md](04-capabilities.md) — Capability 协商机制详解
