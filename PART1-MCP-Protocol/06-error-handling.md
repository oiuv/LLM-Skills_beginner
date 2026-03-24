# 错误处理与调试

> 本章目标：掌握 MCP 的错误码体系，理解各类错误的含义，学会调试和排查 MCP 相关问题。学完本章后，你应能快速定位和解决 MCP 开发中的常见错误。

---

## 1. 错误码体系

### 1.1 错误码分层

MCP 的错误码分为三层：

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP 错误码体系                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  -32700 ~ -32699                                            │
│  └── JSON-RPC 规范错误（所有 JSON-RPC 实现都遵循）          │
│                                                             │
│  -32700: Parse error         JSON 解析失败                   │
│  -32600: Invalid Request     无效的请求格式                  │
│  -32601: Method not found    方法不存在                      │
│  -32602: Invalid params      参数无效                        │
│  -32603: Internal error      服务器内部错误                  │
│                                                             │
│  -32099 ~ -32000                                            │
│  └── MCP 扩展错误码                                         │
│                                                             │
│  -32000: Server error      通用服务器错误                   │
│  -32001: Request timed out 请求超时                         │
│  -32002: Resource not found 资源不存在                     │
│  -32003: Tool execution failed 工具执行失败                 │
│  -32004: Permission denied 权限不足                         │
│  -32005: Capability not supported 不支持的能力               │
│                                                             │
│  其他                                                        │
│  └── 自定义错误码（各实现自行定义）                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 错误响应结构

```typescript
interface JSONRPCError {
  code: number;       // 错误码（必须）
  message: string;    // 错误信息（必须，人类可读）
  data?: unknown;     // 附加数据（可选，机器可读）
}
```

**示例**：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32003,
    "message": "Tool execution failed",
    "data": {
      "tool": "get_weather",
      "reason": "API rate limit exceeded",
      "retryAfter": 60
    }
  }
}
```

---

## 2. 各类错误详解

### 2.1 JSON-RPC 规范错误

#### Parse error（-32700）

**含义**：收到的 JSON 字符串无法解析。

**常见原因**：
- 发送的不是有效的 JSON
- JSON 中包含非法字符
- 编码问题（如 UTF-8 BOM）

**示例**：

```json
// 发送了无效 JSON
{"jsonrpc: "2.0", "id": 1}  // 缺少引号

// 收到错误响应
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32700,
    "message": "Parse error: Unexpected token 'jsonrpc'"
  }
}
```

**调试方法**：
```typescript
// 发送前验证 JSON
function validateJSON(obj: unknown): string {
  const str = JSON.stringify(obj);
  try {
    JSON.parse(str); // 验证能否解析
    return str;
  } catch {
    throw new Error("Invalid JSON");
  }
}
```

#### Invalid Request（-32600）

**含义**：请求是有效的 JSON，但不是有效的 JSON-RPC 请求。

**常见原因**：
- 缺少 `jsonrpc` 字段
- 缺少 `method` 字段
- `id` 是 `undefined`（JSON-RPC 2.0 不允许）

**示例**：

```json
// 无效请求：缺少 method
{"jsonrpc": "2.0", "id": 1}

// 收到错误响应
{
  "error": {
    "code": -32600,
    "message": "Invalid Request: missing method"
  }
}
```

#### Method not found（-32601）

**含义**：请求的方法名不存在。

**常见原因**：
- 拼写错误（如 `tool/list` 而不是 `tools/list`）
- 调用了 Server 未声明的能力
- 握手未完成就调用其他方法

**示例**：

```json
// 请求不存在的方法
{"jsonrpc": "2.0", "id": 1, "method": "tool/list"}

// 收到错误响应
{
  "error": {
    "code": -32601,
    "message": "Method not found: tool/list"
  }
}
```

#### Invalid params（-32602）

**含义**：方法参数无效。

**常见原因**：
- 缺少必需参数
- 参数类型错误
- 参数值不在允许范围内

**示例**：

```json
// tools/call 缺少必需参数 city
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {}
  }
}

// 收到错误响应
{
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

#### Internal error（-32603）

**含义**：服务器内部发生错误。

**常见原因**：
- 服务器代码 bug
- 未捕获的异常
- 状态不一致

**示例**：

```json
{
  "error": {
    "code": -32603,
    "message": "Internal error: database connection failed"
  }
}
```

### 2.2 MCP 扩展错误

#### Server error（-32000）

**含义**：通用服务器错误，用于不适合其他具体错误码的情况。

```json
{
  "error": {
    "code": -32000,
    "message": "Server error: out of memory"
  }
}
```

#### Request timed out（-32001）

**含义**：请求处理超时。

```json
{
  "error": {
    "code": -32001,
    "message": "Request timed out after 30000ms",
    "data": {
      "method": "tools/call",
      "timeout": 30000
    }
  }
}
```

#### Resource not found（-32002）

**含义**：请求的资源不存在。

```json
// 请求不存在的资源
{"jsonrpc": "2.0", "id": 1, "method": "resources/read", "params": {"uri": "file:///nonexistent.txt"}}

// 收到错误响应
{
  "error": {
    "code": -32002,
    "message": "Resource not found: file:///nonexistent.txt"
  }
}
```

#### Tool execution failed（-32003）

**含义**：工具执行失败。

**常见原因**：
- 外部 API 调用失败
- 权限不足
- 输入验证失败
- 业务逻辑错误

```json
{
  "error": {
    "code": -32003,
    "message": "Tool execution failed: API rate limit exceeded",
    "data": {
      "tool": "get_weather",
      "reason": "rate_limit",
      "retryAfter": 60
    }
  }
}
```

#### Permission denied（-32004）

**含义**：没有权限执行操作。

```json
{
  "error": {
    "code": -32004,
    "message": "Permission denied: cannot read file /etc/passwd"
  }
}
```

#### Capability not supported（-32005）

**含义**：请求使用了 Server 不支持的能力。

```json
// Client 尝试订阅资源，但 Server 不支持
{"jsonrpc": "2.0", "id": 1, "method": "resources/subscribe", "params": {"uri": "..."}}

{
  "error": {
    "code": -32005,
    "message": "Capability not supported: resources.subscribe"
  }
}
```

---

## 3. 错误处理的最佳实践

### 3.1 Server 端最佳实践

**原则 1：使用最具体的错误码**

```typescript
// 错误：所有错误都用 Internal error
catch (error) {
  return {
    jsonrpc: "2.0",
    id: request.id,
    error: { code: -32603, message: error.message }
  };
}

// 正确：根据错误类型选择最具体的错误码
catch (error) {
  if (error instanceof NotFoundError) {
    return createError(request.id, -32002, "Resource not found");
  }
  if (error instanceof PermissionError) {
    return createError(request.id, -32004, "Permission denied");
  }
  if (error instanceof ValidationError) {
    return createError(request.id, -32602, `Invalid params: ${error.message}`);
  }
  return createError(request.id, -32603, "Internal error");
}
```

**原则 2：提供有用的错误信息**

```typescript
// 错误：太模糊
{ "code": -32003, "message": "Error" }

// 正确：有具体信息
{ "code": -32003, "message": "Tool execution failed: Weather API returned 429 (rate limit exceeded). Retry after 60 seconds." }
```

**原则 3：在 data 中提供结构化信息**

```typescript
{
  "code": -32003,
  "message": "Tool execution failed",
  "data": {
    "tool": "get_weather",
    "reason": "rate_limit",
    "retryAfter": 60,
    "originalError": "HTTP 429: Too Many Requests"
  }
}
```

**原则 4：不要在生产环境暴露敏感信息**

```typescript
// 开发环境：显示完整错误
if (process.env.NODE_ENV === "development") {
  return {
    code: -32603,
    message: error.message,
    data: { stack: error.stack }
  };
}

// 生产环境：隐藏细节
return {
  code: -32603,
  message: "Internal error"
};
```

### 3.2 Client 端最佳实践

**原则 1：总是检查响应中的 error**

```typescript
// 错误：不检查 error
const response = await send(request);
// 直接使用 response.result，可能出错

// 正确：检查 error
const response = await send(request);
if (response.error) {
  throw new MCPError(response.error.code, response.error.message, response.error.data);
}
const result = response.result;
```

**原则 2：根据错误码决定处理策略**

```typescript
async function callWithRetry(toolName: string, args: object) {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await client.callTool(toolName, args);
    } catch (error) {
      if (error instanceof MCPError) {
        // 根据错误码决定是否重试
        switch (error.code) {
          case -32001: // 超时 - 重试
            await sleep(1000 * Math.pow(2, attempt));
            continue;

          case -32003: // 工具执行失败 - 看情况
            if (error.data?.reason === "rate_limit") {
              await sleep((error.data.retryAfter || 60) * 1000);
              continue;
            }
            throw error; // 其他原因不重试

          case -32002: // 资源不存在 - 不重试
          case -32004: // 权限不足 - 不重试
            throw error;

          default:
            throw error;
        }
      }
      throw error;
    }
  }
}
```

**原则 3：用户友好的错误转换**

```typescript
function translateError(error: MCPError): string {
  switch (error.code) {
    case -32700:
      return "收到无效数据，请联系开发者";
    case -32600:
      return "请求格式错误";
    case -32601:
      return "该功能暂不可用";
    case -32602:
      return `输入有误：${error.message}`;
    case -32001:
      return "请求超时，请重试";
    case -32002:
      return "找不到请求的内容";
    case -32003:
      return `操作失败：${error.message}`;
    case -32004:
      return "没有权限执行此操作";
    default:
      return "发生了未知错误";
  }
}
```

---

## 4. 常见错误场景与调试

### 4.1 连接问题

#### 场景 1：Server 启动失败

**症状**：
```
Error: spawn ENOENT
```

**原因**：Server 可执行文件路径不存在。

**排查**：

```bash
# 检查文件是否存在
ls -la /path/to/server.js

# 检查 node 是否在 PATH 中
which node

# 检查执行权限
ls -la server.js
```

**解决方案**：

```typescript
// 使用绝对路径
const server = spawn("/usr/bin/node", ["./server.js"]);

// 或确保 node 在 PATH 中
const server = spawn("node", ["./server.js"], {
  env: { ...process.env, PATH: process.env.PATH }
});
```

#### 场景 2：Server 启动后立即退出

**症状**：Server 进程立即退出，exit code 非零。

**排查**：

```bash
# 直接运行 Server，查看 stderr 输出
node server.js 2>&1
```

**常见原因**：
- 依赖缺失
- 端口被占用
- 配置文件错误

#### 场景 3：stdio 通信无响应

**症状**：请求发送后没有响应。

**排查**：

```typescript
// 添加日志
stdin.write(JSON.stringify(request) + "\n");

// 监听 stdout
stdout.on("data", (data) => {
  console.log("Received:", data.toString());
});

// 监听 stderr
stderr.on("data", (data) => {
  console.error("Server error:", data.toString());
});
```

### 4.2 协议问题

#### 场景 1：握手失败

**症状**：
```
Error: Server refused handshake
```

**排查**：

```bash
# 1. 检查是否发送了正确的 initialize 请求
# 2. 检查协议版本是否匹配
# 3. 查看 Server 端的握手处理逻辑
```

**常见原因**：
- 协议版本不匹配
- Server 要求认证但没有提供

**解决方案**：

```typescript
// 发送正确的协议版本
const response = await send({
  jsonrpc: "2.0",
  id: 0,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05", // 确保版本正确
    capabilities: {},
    clientInfo: { name: "my-client", version: "1.0.0" }
  }
});

// 检查响应中的 serverInfo
console.log("Server:", response.result.serverInfo);
```

#### 场景 2：调用工具返回 Method not found

**症状**：
```
Error: Method not found: tools/call
```

**排查**：

```bash
# 1. 检查 Server 的 capabilities 是否包含 tools
# 2. 查看 Server 是否正确注册了 tools/call 处理器
```

**解决方案**：

```typescript
// 在调用前检查 Server 的 capabilities
const initResult = await client.initialize();
if (!initResult.capabilities.tools) {
  throw new Error("Server does not support tools");
}

// 然后再调用
await client.callTool("get_weather", { city: "北京" });
```

### 4.3 工具执行问题

#### 场景 1：参数验证失败

**症状**：
```
Error: Invalid params: city is required
```

**排查**：

```typescript
// 打印工具的 inputSchema
const { tools } = await client.listTools();
const schema = tools.find(t => t.name === "get_weather").inputSchema;
console.log("Schema:", JSON.stringify(schema, null, 2));

// 打印实际发送的参数
console.log("Sending:", arguments);
```

**解决方案**：

```typescript
// 使用 inputSchema 验证参数
const schema = tool.inputSchema;
for (const required of schema.required || []) {
  if (!(required in args)) {
    throw new Error(`Missing required argument: ${required}`);
  }
}
```

#### 场景 2：工具执行超时

**症状**：
```
Error: Request timed out after 30000ms
```

**解决方案**：

```typescript
// 增加超时时间
const result = await client.callTool("slow_operation", args, {
  timeout: 60000 // 60 秒
});

// 或实现超时重试
```

### 4.4 调试技巧

#### 技巧 1：完整的请求/响应日志

```typescript
class DebugTransport {
  constructor(private transport: Transport) {}

  async send(message: JSONRPCMessage): Promise<void> {
    console.log(">>>", JSON.stringify(message, null, 2));
    await this.transport.send(message);
  }

  // 类似地处理 onMessage...
}
```

#### 技巧 2：WireShark/tcpdump 抓包

```bash
# 抓取本地 loopback 的 MCP 通信
sudo tcpdump -i lo -A 'tcp dst port 3000 or tcp src port 3000'
```

#### 技巧 3：使用 MCP 官方测试工具

```bash
# 安装 @modelcontextprotocol/sdk 后
npx mcp dev /path/to/server.js

# 这会启动一个交互式测试环境
```

---

## 5. 错误处理代码实现

### 5.1 MCP 错误类

```typescript
// mcp-error.ts

export class MCPError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "MCPError";
  }

  /**
   * 判断是否为 MCP 错误
   */
  static isMCPError(error: unknown): error is MCPError {
    return error instanceof MCPError;
  }

  /**
   * 创建规范错误
   */
  static parseError(message: string): MCPError {
    return new MCPError(-32700, `Parse error: ${message}`);
  }

  static invalidRequest(message: string): MCPError {
    return new MCPError(-32600, `Invalid Request: ${message}`);
  }

  static methodNotFound(method: string): MCPError {
    return new MCPError(-32601, `Method not found: ${method}`);
  }

  static invalidParams(message: string, data?: unknown): MCPError {
    return new MCPError(-32602, `Invalid params: ${message}`, data);
  }

  static internalError(message: string): MCPError {
    return new MCPError(-32603, `Internal error: ${message}`);
  }

  /**
   * 创建 MCP 扩展错误
   */
  static serverError(message: string, data?: unknown): MCPError {
    return new MCPError(-32000, `Server error: ${message}`, data);
  }

  static requestTimeout(method: string, timeout: number): MCPError {
    return new MCPError(-32001, `Request timed out after ${timeout}ms: ${method}`, { method, timeout });
  }

  static resourceNotFound(uri: string): MCPError {
    return new MCPError(-32002, `Resource not found: ${uri}`, { uri });
  }

  static toolExecutionFailed(message: string, tool: string, data?: unknown): MCPError {
    return new MCPError(-32003, `Tool execution failed: ${message}`, { tool, ...data });
  }

  static permissionDenied(operation: string, resource: string): MCPError {
    return new MCPError(-32004, `Permission denied: ${operation} on ${resource}`, { operation, resource });
  }

  static capabilityNotSupported(capability: string): MCPError {
    return new MCPError(-32005, `Capability not supported: ${capability}`, { capability });
  }
}
```

### 5.2 全局错误处理器

```typescript
// error-handler.ts

type ErrorHandler = (error: MCPError, context: ErrorContext) => void;

interface ErrorContext {
  method: string;
  params?: unknown;
  requestId: string | number;
  timestamp: Date;
}

class MCPErrorHandler {
  private handlers: ErrorHandler[] = [];
  private logger: (msg: string) => void;

  constructor(logger: (msg: string) => void = console.error) {
    this.logger = logger;
  }

  /**
   * 注册错误处理器
   */
  onError(handler: ErrorHandler): void {
    this.handlers.push(handler);
  }

  /**
   * 处理错误
   */
  handle(error: unknown, context: ErrorContext): JSONRPCErrorResponse {
    const mcpError = this.normalizeError(error);
    const errorResponse = this.createErrorResponse(mcpError, context.requestId);

    // 调用所有处理器
    for (const handler of this.handlers) {
      try {
        handler(mcpError, context);
      } catch {
        // 处理器中的错误不向外传播
      }
    }

    // 记录日志
    this.logger(
      `[${context.timestamp.toISOString()}] ${context.method} failed: ` +
      `${mcpError.code} ${mcpError.message}`
    );

    return errorResponse;
  }

  /**
   * 将任意错误规范化为 MCPError
   */
  private normalizeError(error: unknown): MCPError {
    if (MCPError.isMCPError(error)) {
      return error;
    }

    if (error instanceof Error) {
      return new MCPError(-32603, error.message, { stack: error.stack });
    }

    return new MCPError(-32603, "Unknown error", { original: error });
  }

  /**
   * 创建 JSON-RPC 错误响应
   */
  private createErrorResponse(error: MCPError, requestId: string | number): JSONRPCErrorResponse {
    return {
      jsonrpc: "2.0",
      id: requestId,
      error: {
        code: error.code,
        message: error.message,
        ...(error.data !== undefined && { data: error.data }),
      },
    };
  }
}
```

### 5.3 请求级别的错误处理

```typescript
// request-handler.ts

class MCPRequestHandler {
  private errorHandler = new MCPErrorHandler();

  /**
   * 处理请求，自动捕获错误并返回错误响应
   */
  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    try {
      const result = await this.executeRequest(request);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result,
      };
    } catch (error) {
      return this.errorHandler.handle(error, {
        method: request.method,
        params: request.params,
        requestId: request.id,
        timestamp: new Date(),
      });
    }
  }

  private async executeRequest(request: JSONRPCRequest): Promise<unknown> {
    switch (request.method) {
      case "initialize":
        return this.handleInitialize(request.params);

      case "tools/list":
        return this.handleToolsList();

      case "tools/call":
        return this.handleToolsCall(request.params);

      case "ping":
        return {};

      default:
        throw MCPError.methodNotFound(request.method);
    }
  }
}
```

---

## 6. 本章小结

```
错误处理核心要点

错误码体系
├── JSON-RPC 规范错误（-32700 ~ -32603）
├── MCP 扩展错误（-32000 ~ -32005）
└── 自定义错误

Server 端原则
├── 使用最具体的错误码
├── 提供有用的错误信息
├── 在 data 中提供结构化详情
└── 生产环境不暴露敏感信息

Client 端原则
├── 总是检查响应中的 error
├── 根据错误码决定处理策略（重试/放弃/降级）
└── 用户友好的错误转换

调试技巧
├── 完整的请求/响应日志
├── 检查 Server stderr 输出
├── 使用官方测试工具
└── 检查 capabilities 声明
```

---

## PART1 总结

学完 PART1 后，你应该掌握：

```
PART1-MCP-Protocol
├── 01-protocol-overview    协议设计哲学、三层架构、四种能力
├── 02-json-rpc-spec        JSON-RPC 2.0 完整规范、批量请求、错误处理
├── 03-message-types        MCP 所有消息类型的完整字段定义
├── 04-capabilities        Capability 协商机制、版本兼容
├── 05-transport-layer      stdio 和 SSE 传输原理与实现
└── 06-error-handling      错误码体系、调试技巧、错误处理最佳实践
```

---

## 下一步

继续阅读：
- [PART2-MCP-Server/01-server-architecture.md](../PART2-MCP-Server/01-server-architecture.md) — Server 架构设计
