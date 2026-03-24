# MCP Server 架构设计

> 从零构建生产级 MCP Server 的完整指南

---

## 1. Server 核心组件

### 1.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Server                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Transport Layer                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │   stdio     │  │     SSE     │  │  WebSocket  │     │   │
│  │  │   Handler   │  │   Handler   │  │   Handler   │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Protocol Handler                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │   Request   │  │  Response   │  │ Notification│     │   │
│  │  │   Parser    │  │   Builder   │  │   Handler   │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Core Logic                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │ Initialize  │  │   Router    │  │   State     │     │   │
│  │  │   Handler   │  │             │  │   Manager   │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Feature Modules                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │    Tools    │  │  Resources  │  │   Prompts   │     │   │
│  │  │   Manager   │  │   Manager   │  │   Manager   │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Business Logic                           │   │
│  │         (Your Implementation)                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 核心类设计

```typescript
// Server 主类
class MCPServer {
  private transport: Transport;
  private protocol: ProtocolHandler;
  private state: ServerState;
  private tools: ToolsManager;
  private resources: ResourcesManager;
  private prompts: PromptsManager;
  
  constructor(options: ServerOptions) {
    this.state = new ServerState();
    this.tools = new ToolsManager();
    this.resources = new ResourcesManager();
    this.prompts = new PromptsManager();
    this.protocol = new ProtocolHandler(this);
  }
  
  // 启动 Server
  async start(transport: Transport): Promise<void> {
    this.transport = transport;
    await this.transport.connect();
    this.transport.onMessage(this.handleMessage.bind(this));
  }
  
  // 处理消息
  private async handleMessage(message: JSONRPCMessage): Promise<void> {
    const response = await this.protocol.handle(message);
    if (response) {
      await this.transport.send(response);
    }
  }
  
  // 注册工具
  registerTool(tool: Tool): void {
    this.tools.register(tool);
  }
  
  // 发送通知
  async notify(method: string, params: unknown): Promise<void> {
    const notification: JSONRPCNotification = {
      jsonrpc: "2.0",
      method,
      params
    };
    await this.transport.send(notification);
  }
}

// Server 状态管理
class ServerState {
  private initialized = false;
  private clientCapabilities: ClientCapabilities = {};
  private serverCapabilities: ServerCapabilities;
  
  constructor(capabilities: ServerCapabilities) {
    this.serverCapabilities = capabilities;
  }
  
  isInitialized(): boolean {
    return this.initialized;
  }
  
  setInitialized(capabilities: ClientCapabilities): void {
    this.clientCapabilities = capabilities;
    this.initialized = true;
  }
  
  getClientCapabilities(): ClientCapabilities {
    return this.clientCapabilities;
  }
  
  getServerCapabilities(): ServerCapabilities {
    return this.serverCapabilities;
  }
}
```

---

## 2. 请求路由系统

### 2.1 路由设计

```typescript
// 路由处理器类型
type RequestHandler = (params: unknown) => Promise<unknown>;
type NotificationHandler = (params: unknown) => Promise<void>;

// 路由表
class Router {
  private requestHandlers = new Map<string, RequestHandler>();
  private notificationHandlers = new Map<string, NotificationHandler>();
  
  // 注册请求处理器
  registerRequest(method: string, handler: RequestHandler): void {
    this.requestHandlers.set(method, handler);
  }
  
  // 注册通知处理器
  registerNotification(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.set(method, handler);
  }
  
  // 处理消息
  async handle(message: JSONRPCMessage): Promise<JSONRPCResponse | null> {
    if (this.isNotification(message)) {
      await this.handleNotification(message as JSONRPCNotification);
      return null;
    }
    
    return await this.handleRequest(message as JSONRPCRequest);
  }
  
  private async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const handler = this.requestHandlers.get(request.method);
    
    if (!handler) {
      return this.createErrorResponse(
        request.id,
        -32601,
        `Method not found: ${request.method}`
      );
    }
    
    try {
      const result = await handler(request.params);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result
      };
    } catch (error) {
      return this.createErrorResponse(
        request.id,
        -32603,
        error instanceof Error ? error.message : "Internal error"
      );
    }
  }
  
  private async handleNotification(notification: JSONRPCNotification): Promise<void> {
    const handler = this.notificationHandlers.get(notification.method);
    if (handler) {
      await handler(notification.params);
    }
  }
  
  private createErrorResponse(
    id: string | number,
    code: number,
    message: string
  ): JSONRPCResponse {
    return {
      jsonrpc: "2.0",
      id,
      error: { code, message }
    };
  }
  
  private isNotification(message: JSONRPCMessage): boolean {
    return !("id" in message);
  }
}
```

### 2.2 标准路由注册

```typescript
// 注册标准 MCP 方法
function registerStandardRoutes(router: Router, server: MCPServer): void {
  // Initialize
  router.registerRequest("initialize", async (params) => {
    const result = await server.handleInitialize(params as InitializeRequest);
    return result;
  });
  
  // Ping
  router.registerRequest("ping", async () => {
    return {}; // Empty response
  });
  
  // Tools
  router.registerRequest("tools/list", async () => {
    return { tools: server.getTools() };
  });
  
  router.registerRequest("tools/call", async (params) => {
    return await server.callTool(params as CallToolRequest);
  });
  
  // Resources
  router.registerRequest("resources/list", async () => {
    return { resources: server.getResources() };
  });
  
  router.registerRequest("resources/read", async (params) => {
    return await server.readResource(params as ReadResourceRequest);
  });
  
  // Prompts
  router.registerRequest("prompts/list", async () => {
    return { prompts: server.getPrompts() };
  });
  
  router.registerRequest("prompts/get", async (params) => {
    return await server.getPrompt(params as GetPromptRequest);
  });
  
  // Notifications
  router.registerNotification("notifications/initialized", async () => {
    server.setInitialized();
  });
}
```

---

## 3. 并发处理

### 3.1 并发模型

```typescript
// 并发请求管理
class ConcurrentRequestManager {
  private activeRequests = new Map<string | number, AbortController>();
  private maxConcurrent: number;
  private semaphore: Semaphore;
  
  constructor(maxConcurrent: number = 10) {
    this.maxConcurrent = maxConcurrent;
    this.semaphore = new Semaphore(maxConcurrent);
  }
  
  async execute<T>(
    id: string | number,
    operation: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const controller = new AbortController();
    this.activeRequests.set(id, controller);
    
    try {
      await this.semaphore.acquire();
      return await operation(controller.signal);
    } finally {
      this.activeRequests.delete(id);
      this.semaphore.release();
    }
  }
  
  cancelRequest(id: string | number): void {
    const controller = this.activeRequests.get(id);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(id);
    }
  }
  
  cancelAll(): void {
    for (const [id, controller] of this.activeRequests) {
      controller.abort();
    }
    this.activeRequests.clear();
  }
}

// 信号量实现
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];
  
  constructor(permits: number) {
    this.permits = permits;
  }
  
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }
  
  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    } else {
      this.permits++;
    }
  }
}
```

### 3.2 请求超时处理

```typescript
// 带超时的请求处理
async function handleRequestWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  requestId: string | number
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Request ${requestId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  return Promise.race([operation(), timeoutPromise]);
}

// 使用示例
router.registerRequest("tools/call", async (params) => {
  return await handleRequestWithTimeout(
    async () => await executeTool(params),
    30000, // 30秒超时
    params._meta?.requestId || "unknown"
  );
});
```

---

## 4. 错误处理策略

### 4.1 错误分类

```typescript
// MCP 错误基类
class MCPError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "MCPError";
  }
}

// 具体错误类型
class ToolExecutionError extends MCPError {
  constructor(message: string, data?: unknown) {
    super(-32003, message, data);
    this.name = "ToolExecutionError";
  }
}

class ResourceNotFoundError extends MCPError {
  constructor(uri: string) {
    super(-32002, `Resource not found: ${uri}`, { uri });
    this.name = "ResourceNotFoundError";
  }
}

class PermissionDeniedError extends MCPError {
  constructor(resource: string) {
    super(-32004, `Permission denied: ${resource}`, { resource });
    this.name = "PermissionDeniedError";
  }
}
```

### 4.2 全局错误处理器

```typescript
// 错误处理中间件
class ErrorHandler {
  private errorListeners: Array<(error: MCPError, context: ErrorContext) => void> = [];
  
  onError(listener: (error: MCPError, context: ErrorContext) => void): void {
    this.errorListeners.push(listener);
  }
  
  async handle<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T | JSONRPCResponse> {
    try {
      return await operation();
    } catch (error) {
      const mcpError = this.normalizeError(error);
      
      // 通知监听器
      this.errorListeners.forEach(listener => {
        try {
          listener(mcpError, context);
        } catch {}
      });
      
      // 返回错误响应
      return {
        jsonrpc: "2.0",
        id: context.requestId,
        error: {
          code: mcpError.code,
          message: mcpError.message,
          data: mcpError.data
        }
      };
    }
  }
  
  private normalizeError(error: unknown): MCPError {
    if (error instanceof MCPError) {
      return error;
    }
    
    if (error instanceof Error) {
      return new MCPError(-32603, error.message);
    }
    
    return new MCPError(-32603, "Unknown error");
  }
}

interface ErrorContext {
  requestId: string | number;
  method: string;
  timestamp: Date;
}
```

---

## 5. 状态管理

### 5.1 生命周期状态机

```typescript
// Server 状态枚举
enum ServerState {
  CREATED = "created",
  INITIALIZING = "initializing",
  READY = "ready",
  SHUTTING_DOWN = "shutting_down",
  CLOSED = "closed"
}

// 状态机实现
class ServerStateMachine {
  private state = ServerState.CREATED;
  private stateListeners = new Map<ServerState, Array<() => void>>();
  
  getState(): ServerState {
    return this.state;
  }
  
  transition(to: ServerState): void {
    const from = this.state;
    
    // 验证状态转换
    if (!this.isValidTransition(from, to)) {
      throw new Error(`Invalid state transition: ${from} -> ${to}`);
    }
    
    this.state = to;
    
    // 触发监听器
    const listeners = this.stateListeners.get(to);
    listeners?.forEach(listener => {
      try {
        listener();
      } catch {}
    });
    
    console.log(`State transition: ${from} -> ${to}`);
  }
  
  onState(state: ServerState, listener: () => void): void {
    if (!this.stateListeners.has(state)) {
      this.stateListeners.set(state, []);
    }
    this.stateListeners.get(state)!.push(listener);
  }
  
  private isValidTransition(from: ServerState, to: ServerState): boolean {
    const validTransitions: Record<ServerState, ServerState[]> = {
      [ServerState.CREATED]: [ServerState.INITIALIZING],
      [ServerState.INITIALIZING]: [ServerState.READY, ServerState.CLOSED],
      [ServerState.READY]: [ServerState.SHUTTING_DOWN],
      [ServerState.SHUTTING_DOWN]: [ServerState.CLOSED],
      [ServerState.CLOSED]: []
    };
    
    return validTransitions[from]?.includes(to) ?? false;
  }
}
```

---

## 6. 完整 Server 实现示例

```typescript
// 完整的 MCP Server 实现
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

class WeatherServer {
  private server: Server;
  private state: ServerStateMachine;
  
  constructor() {
    this.state = new ServerStateMachine();
    this.server = new Server(
      {
        name: "weather-server",
        version: "1.0.0"
      },
      {
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: true }
        }
      }
    );
    
    this.setupHandlers();
  }
  
  private setupHandlers(): void {
    // Initialize
    this.server.setRequestHandler("initialize", async (request) => {
      this.state.transition(ServerState.INITIALIZING);
      
      return {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: true }
        },
        serverInfo: {
          name: "weather-server",
          version: "1.0.0"
        }
      };
    });
    
    // Initialized notification
    this.server.setRequestHandler("notifications/initialized", async () => {
      this.state.transition(ServerState.READY);
    });
    
    // Tools
    this.server.setRequestHandler("tools/list", async () => {
      return {
        tools: [
          {
            name: "get_weather",
            description: "查询城市天气",
            inputSchema: {
              type: "object",
              properties: {
                city: { type: "string", description: "城市名称" }
              },
              required: ["city"]
            }
          }
        ]
      };
    });
    
    this.server.setRequestHandler("tools/call", async (request) => {
      if (request.params.name === "get_weather") {
        const { city } = request.params.arguments;
        const weather = await this.fetchWeather(city);
        return {
          content: [{ type: "text", text: weather }]
        };
      }
      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }
  
  private async fetchWeather(city: string): Promise<string> {
    // 实际实现...
    return `${city}: 晴天 25°C`;
  }
  
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("Server started");
  }
  
  async stop(): Promise<void> {
    this.state.transition(ServerState.SHUTTING_DOWN);
    await this.server.close();
    this.state.transition(ServerState.CLOSED);
    console.log("Server stopped");
  }
}

// 启动
const server = new WeatherServer();
server.start().catch(console.error);

// 优雅关闭
process.on("SIGINT", async () => {
  await server.stop();
  process.exit(0);
});
```

---

## 7. 性能优化

### 7.1 连接池

```typescript
// MCP Server 连接池
class ServerConnectionPool {
  private connections = new Map<string, Connection>();
  private maxConnections: number;
  
  constructor(maxConnections: number = 100) {
    this.maxConnections = maxConnections;
  }
  
  async acquire(clientId: string): Promise<Connection> {
    if (this.connections.size >= this.maxConnections) {
      throw new Error("Connection pool exhausted");
    }
    
    let conn = this.connections.get(clientId);
    if (!conn) {
      conn = await this.createConnection(clientId);
      this.connections.set(clientId, conn);
    }
    
    return conn;
  }
  
  release(clientId: string): void {
    // 可选：实现连接复用策略
  }
  
  private async createConnection(clientId: string): Promise<Connection> {
    // 创建新连接
    return new Connection(clientId);
  }
}
```

### 7.2 缓存策略

```typescript
// 工具结果缓存
class ToolResultCache {
  private cache = new Map<string, CacheEntry>();
  private ttl: number;
  
  constructor(ttlMs: number = 60000) {
    this.ttl = ttlMs;
  }
  
  get(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value;
  }
  
  set(key: string, value: unknown): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }
  
  invalidate(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }
}

interface CacheEntry {
  value: unknown;
  timestamp: number;
}
```

---

## 8. 测试策略

### 8.1 单元测试

```typescript
// Server 单元测试
import { describe, it, expect, beforeEach } from "vitest";

describe("WeatherServer", () => {
  let server: WeatherServer;
  
  beforeEach(() => {
    server = new WeatherServer();
  });
  
  it("should handle initialize request", async () => {
    const response = await server.handleInitialize({
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" }
    });
    
    expect(response.protocolVersion).toBe("2024-11-05");
    expect(response.serverInfo.name).toBe("weather-server");
  });
  
  it("should list tools", async () => {
    const response = await server.handleToolsList();
    expect(response.tools).toHaveLength(1);
    expect(response.tools[0].name).toBe("get_weather");
  });
  
  it("should call tool", async () => {
    const response = await server.handleToolCall({
      name: "get_weather",
      arguments: { city: "北京" }
    });
    
    expect(response.content[0].type).toBe("text");
    expect(response.content[0].text).toContain("北京");
  });
});
```

### 8.2 集成测试

```typescript
// 集成测试
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

describe("MCP Integration", () => {
  it("should communicate between client and server", async () => {
    // 启动 Server
    const server = new WeatherServer();
    await server.start();
    
    // 创建 Client
    const client = new Client({ name: "test", version: "1.0.0" }, {});
    
    // 连接并初始化
    await client.connect(transport);
    
    // 调用工具
    const result = await client.callTool({
      name: "get_weather",
      arguments: { city: "北京" }
    });
    
    expect(result.content[0].text).toContain("北京");
    
    // 清理
    await client.close();
    await server.stop();
  });
});
```

---

## 9. 部署和运维

### 9.1 容器化部署

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

USER node

CMD ["node", "dist/server.js"]
```

### 9.2 健康检查

```typescript
// 健康检查端点
class HealthChecker {
  private checks = new Map<string, HealthCheck>();
  
  register(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
  }
  
  async check(): Promise<HealthStatus> {
    const results = new Map<string, boolean>();
    
    for (const [name, check] of this.checks) {
      try {
        results.set(name, await check());
      } catch {
        results.set(name, false);
      }
    }
    
    const healthy = results.values().every(v => v);
    
    return {
      status: healthy ? "healthy" : "unhealthy",
      checks: Object.fromEntries(results),
      timestamp: new Date().toISOString()
    };
  }
}

type HealthCheck = () => Promise<boolean>;

interface HealthStatus {
  status: "healthy" | "unhealthy";
  checks: Record<string, boolean>;
  timestamp: string;
}
```

---

## 10. 最佳实践总结

### DO（推荐做法）

- ✅ 使用状态机管理生命周期
- ✅ 实现优雅关闭机制
- ✅ 添加请求超时控制
- ✅ 使用结构化日志
- ✅ 实现健康检查
- ✅ 添加性能监控
- ✅ 编写完整测试
- ✅ 使用 TypeScript 类型安全

### DON'T（避免做法）

- ❌ 在初始化前处理请求
- ❌ 忽略错误处理
- ❌ 无限制并发
- ❌ 硬编码配置
- ❌ 阻塞事件循环
- ❌ 忽略资源清理

---

## 下一步

继续阅读：
- [02-tool-definition.md](02-tool-definition.md) - 工具定义规范
- [03-resource-management.md](03-resource-management.md) - 资源管理
