# MCP Client 架构设计与实现

> 从零构建生产级 MCP Client 的完整指南

---

## 1. Client 核心架构

### 1.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Client                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Transport Layer                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │   stdio     │  │     SSE     │  │  WebSocket  │     │   │
│  │  │   Client    │  │   Client    │  │   Client    │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Protocol Handler                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │   Request   │  │  Response   │  │ Notification│     │   │
│  │  │   Builder   │  │   Parser    │  │   Handler   │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Core Components                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │ Connection  │  │   State     │  │   Request   │     │   │
│  │  │   Manager   │  │   Manager   │  │   Manager   │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Feature Layer                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │   Tool      │  │  Resource   │  │   Prompt    │     │   │
│  │  │  Discovery  │  │   Manager   │  │   Manager   │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 核心类设计

```typescript
// MCP Client 主类
class MCPClient {
  // 传输层
  private transport: Transport;
  
  // 协议处理
  private protocol: ProtocolHandler;
  
  // 状态管理
  private state: ClientState;
  private connectionManager: ConnectionManager;
  
  // 功能模块
  private toolManager: ToolManager;
  private resourceManager: ResourceManager;
  private promptManager: PromptManager;
  
  // 请求管理
  private requestManager: RequestManager;
  
  constructor(options: ClientOptions) {
    this.state = new ClientState();
    this.protocol = new ProtocolHandler();
    this.connectionManager = new ConnectionManager();
    this.toolManager = new ToolManager();
    this.resourceManager = new ResourceManager();
    this.promptManager = new PromptManager();
    this.requestManager = new RequestManager();
  }
  
  // 连接到 Server
  async connect(transport: Transport): Promise<void> {
    this.transport = transport;
    
    // 1. 建立传输连接
    await this.transport.connect();
    
    // 2. 设置消息处理器
    this.transport.onMessage(this.handleMessage.bind(this));
    this.transport.onError(this.handleError.bind(this));
    this.transport.onClose(this.handleClose.bind(this));
    
    // 3. 初始化握手
    await this.initialize();
    
    // 4. 启动心跳检测
    this.startHeartbeat();
  }
  
  // 断开连接
  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    await this.transport.close();
    this.state.reset();
  }
  
  // 处理收到的消息
  private async handleMessage(message: JSONRPCMessage): Promise<void> {
    if (this.isResponse(message)) {
      this.requestManager.handleResponse(message as JSONRPCResponse);
    } else if (this.isNotification(message)) {
      await this.handleNotification(message as JSONRPCNotification);
    }
  }
  
  // 发送请求
  private async sendRequest<T>(
    method: string,
    params?: unknown
  ): Promise<T> {
    const request = this.protocol.buildRequest(method, params);
    return this.requestManager.execute<T>(request, this.transport);
  }
}
```

---

## 2. 连接管理

### 2.1 连接状态机

```
┌─────────┐    connect()     ┌─────────────┐
│  IDLE   │ ───────────────► │ CONNECTING  │
└─────────┘                  └──────┬──────┘
                                    │
                                    │ success
                                    ▼
┌─────────┐   disconnect()  ┌─────────────┐
│  CLOSED │ ◄────────────── │ INITIALIZING│
└─────────┘                 └──────┬──────┘
      ▲                            │
      │                            │ initialized
      │                            ▼
      │                    ┌─────────────┐
      └─────────────────── │   READY     │
        connection lost    └─────────────┘
```

### 2.2 连接管理器实现

```typescript
class ConnectionManager {
  private state: ConnectionState = ConnectionState.IDLE;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000; // ms
  
  async connect(transport: Transport): Promise<void> {
    this.setState(ConnectionState.CONNECTING);
    
    try {
      await transport.connect();
      this.setState(ConnectionState.INITIALIZING);
      
      // 等待初始化完成
      await this.waitForInitialization();
      this.setState(ConnectionState.READY);
      
      // 重置重连计数
      this.reconnectAttempts = 0;
    } catch (error) {
      this.setState(ConnectionState.ERROR);
      throw error;
    }
  }
  
  async reconnect(transport: Transport): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw new Error("Max reconnection attempts reached");
    }
    
    this.reconnectAttempts++;
    
    // 指数退避
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    await sleep(delay);
    
    try {
      await this.connect(transport);
    } catch (error) {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        return this.reconnect(transport);
      }
      throw error;
    }
  }
  
  private setState(state: ConnectionState): void {
    this.state = state;
    this.emit("stateChange", state);
  }
  
  getState(): ConnectionState {
    return this.state;
  }
  
  isReady(): boolean {
    return this.state === ConnectionState.READY;
  }
}

enum ConnectionState {
  IDLE = "idle",
  CONNECTING = "connecting",
  INITIALIZING = "initializing",
  READY = "ready",
  ERROR = "error",
  CLOSED = "closed"
}
```

---

## 3. 请求管理

### 3.1 请求管理器

```typescript
class RequestManager {
  private pendingRequests = new Map<string | number, PendingRequest>();
  private idCounter = 0;
  private defaultTimeout = 30000; // 30s
  
  // 执行请求
  async execute<T>(
    request: JSONRPCRequest,
    transport: Transport,
    timeout?: number
  ): Promise<T> {
    const id = request.id ?? this.generateId();
    request.id = id;
    
    return new Promise((resolve, reject) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${id} timed out`));
      }, timeout ?? this.defaultTimeout);
      
      // 存储待处理请求
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeoutId,
        timestamp: Date.now()
      });
      
      // 发送请求
      transport.send(request).catch((error) => {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(id);
        reject(error);
      });
    });
  }
  
  // 处理响应
  handleResponse(response: JSONRPCResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn(`Received response for unknown request: ${response.id}`);
      return;
    }
    
    // 清理
    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(response.id);
    
    // 处理结果
    if (response.error) {
      pending.reject(new MCPError(response.error.code, response.error.message));
    } else {
      pending.resolve(response.result as T);
    }
  }
  
  // 取消所有待处理请求
  cancelAll(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(`Request cancelled: ${reason}`));
    }
    this.pendingRequests.clear();
  }
  
  // 生成唯一 ID
  private generateId(): number {
    return ++this.idCounter;
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeoutId: NodeJS.Timeout;
  timestamp: number;
}
```

### 3.2 批量请求

```typescript
// 批量请求处理器
class BatchRequestManager {
  private batch: JSONRPCRequest[] = [];
  private maxBatchSize = 100;
  private flushInterval = 50; // ms
  private timer: NodeJS.Timeout | null = null;
  
  add(request: JSONRPCRequest): void {
    this.batch.push(request);
    
    if (this.batch.length >= this.maxBatchSize) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }
  
  private scheduleFlush(): void {
    if (this.timer) return;
    
    this.timer = setTimeout(() => {
      this.flush();
    }, this.flushInterval);
  }
  
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    if (this.batch.length === 0) return;
    
    const batch = this.batch;
    this.batch = [];
    
    // 发送批量请求
    await this.transport.send(batch);
  }
}
```

---

## 4. 工具发现与管理

### 4.1 工具管理器

```typescript
class ToolManager {
  private tools = new Map<string, Tool>();
  private schemas = new Map<string, ToolSchema>();
  private client: MCPClient;
  
  constructor(client: MCPClient) {
    this.client = client;
  }
  
  // 发现工具
  async discover(): Promise<Tool[]> {
    const response = await this.client.sendRequest<{ tools: Tool[] }>(
      "tools/list"
    );
    
    // 更新本地缓存
    for (const tool of response.tools) {
      this.tools.set(tool.name, tool);
      this.schemas.set(tool.name, tool.inputSchema);
    }
    
    return response.tools;
  }
  
  // 调用工具
  async call(name: string, args: object): Promise<ToolResult> {
    // 验证参数
    const validation = this.validateArgs(name, args);
    if (!validation.valid) {
      throw new Error(`Invalid arguments: ${validation.errors.join(", ")}`);
    }
    
    // 调用
    const response = await this.client.sendRequest<CallToolResult>(
      "tools/call",
      { name, arguments: args }
    );
    
    return {
      content: response.content,
      isError: response.isError ?? false
    };
  }
  
  // 获取工具列表
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }
  
  // 获取工具定义
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }
  
  // 验证参数
  private validateArgs(name: string, args: object): ValidationResult {
    const schema = this.schemas.get(name);
    if (!schema) {
      return { valid: false, errors: ["Tool not found"] };
    }
    
    return validateJsonSchema(args, schema);
  }
  
  // 监听工具变更
  async subscribeToChanges(): Promise<void> {
    if (!this.client.supportsCapability("tools", "listChanged")) {
      console.warn("Server does not support tool list change notifications");
      return;
    }
    
    this.client.onNotification("notifications/tools/list_changed", async () => {
      console.log("Tool list changed, rediscovering...");
      await this.discover();
    });
  }
}

interface Tool {
  name: string;
  description: string;
  inputSchema: object;
}

interface ToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError: boolean;
}
```

---

## 5. 资源管理

### 5.1 资源管理器

```typescript
class ResourceManager {
  private resources = new Map<string, Resource>();
  private subscriptions = new Set<string>();
  private client: MCPClient;
  
  constructor(client: MCPClient) {
    this.client = client;
  }
  
  // 列出资源
  async list(): Promise<Resource[]> {
    const response = await this.client.sendRequest<{ resources: Resource[] }>(
      "resources/list"
    );
    
    for (const resource of response.resources) {
      this.resources.set(resource.uri, resource);
    }
    
    return response.resources;
  }
  
  // 读取资源
  async read(uri: string): Promise<ResourceContent> {
    const response = await this.client.sendRequest<{ contents: ResourceContent[] }>(
      "resources/read",
      { uri }
    );
    
    return response.contents[0];
  }
  
  // 订阅资源变更
  async subscribe(uri: string): Promise<void> {
    if (!this.client.supportsCapability("resources", "subscribe")) {
      throw new Error("Server does not support resource subscriptions");
    }
    
    await this.client.sendRequest("resources/subscribe", { uri });
    this.subscriptions.add(uri);
    
    // 监听变更通知
    this.client.onNotification("notifications/resources/updated", (params) => {
      if (params.uri === uri) {
        this.emit("resourceUpdated", params);
      }
    });
  }
  
  // 取消订阅
  async unsubscribe(uri: string): Promise<void> {
    await this.client.sendRequest("resources/unsubscribe", { uri });
    this.subscriptions.delete(uri);
  }
  
  // 获取资源模板
  async getResourceTemplates(): Promise<ResourceTemplate[]> {
    const response = await this.client.sendRequest<{
      resourceTemplates: ResourceTemplate[]
    }>("resources/templates/list");
    
    return response.resourceTemplates;
  }
}

interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64
}
```

---

## 6. 完整 Client 实现示例

```typescript
// 完整的 MCP Client 实现
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

class CompleteMCPClient {
  private client: Client;
  private transport: StdioClientTransport;
  private toolManager: ToolManager;
  private resourceManager: ResourceManager;
  private connected = false;
  
  constructor() {
    this.client = new Client(
      { name: "my-client", version: "1.0.0" },
      { capabilities: { sampling: {} } }
    );
    
    this.toolManager = new ToolManager(this.client);
    this.resourceManager = new ResourceManager(this.client);
  }
  
  // 连接到 Server
  async connect(serverCommand: string, serverArgs: string[]): Promise<void> {
    // 创建传输层
    this.transport = new StdioClientTransport({
      command: serverCommand,
      args: serverArgs
    });
    
    // 连接
    await this.client.connect(this.transport);
    this.connected = true;
    
    console.log("✅ Connected to MCP Server");
    
    // 发现工具
    const tools = await this.toolManager.discover();
    console.log(`📦 Discovered ${tools.length} tools:`);
    tools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });
    
    // 订阅工具变更
    await this.toolManager.subscribeToChanges();
  }
  
  // 调用工具
  async callTool(name: string, args: object): Promise<ToolResult> {
    if (!this.connected) {
      throw new Error("Client not connected");
    }
    
    console.log(`🔧 Calling tool: ${name}`);
    console.log(`   Args: ${JSON.stringify(args)}`);
    
    const startTime = Date.now();
    const result = await this.toolManager.call(name, args);
    const duration = Date.now() - startTime;
    
    console.log(`   Result (${duration}ms): ${JSON.stringify(result.content)}`);
    
    return result;
  }
  
  // 读取资源
  async readResource(uri: string): Promise<ResourceContent> {
    if (!this.connected) {
      throw new Error("Client not connected");
    }
    
    console.log(`📖 Reading resource: ${uri}`);
    
    return await this.resourceManager.read(uri);
  }
  
  // 断开连接
  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    await this.client.close();
    this.connected = false;
    
    console.log("👋 Disconnected from MCP Server");
  }
  
  // 获取所有工具
  getTools(): Tool[] {
    return this.toolManager.getTools();
  }
}

// 使用示例
async function main() {
  const client = new CompleteMCPClient();
  
  try {
    // 连接
    await client.connect("node", ["./server.js"]);
    
    // 调用工具
    const result = await client.callTool("get_weather", {
      city: "北京"
    });
    
    console.log("Weather:", result.content[0].text);
    
  } finally {
    // 断开
    await client.disconnect();
  }
}

main().catch(console.error);
```

---

## 7. 高级特性

### 7.1 连接池

```typescript
class MCPClientPool {
  private clients: MCPClient[] = [];
  private maxSize: number;
  private currentIndex = 0;
  
  constructor(maxSize: number = 5) {
    this.maxSize = maxSize;
  }
  
  async initialize(serverConfig: ServerConfig): Promise<void> {
    for (let i = 0; i < this.maxSize; i++) {
      const client = new MCPClient();
      await client.connect(serverConfig.command, serverConfig.args);
      this.clients.push(client);
    }
  }
  
  // 轮询获取 Client
  getClient(): MCPClient {
    const client = this.clients[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.clients.length;
    return client;
  }
  
  // 并行执行
  async executeParallel<T>(
    tasks: Array<(client: MCPClient) => Promise<T>>
  ): Promise<T[]> {
    const promises = tasks.map((task, i) => {
      const client = this.clients[i % this.clients.length];
      return task(client);
    });
    
    return Promise.all(promises);
  }
  
  async closeAll(): Promise<void> {
    await Promise.all(this.clients.map(c => c.disconnect()));
  }
}
```

### 7.2 重试策略

```typescript
class RetryHandler {
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      delay = 1000,
      backoff = 2,
      retryableErrors = []
    } = options;
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // 检查是否应该重试
        if (!this.shouldRetry(error, retryableErrors)) {
          throw error;
        }
        
        if (attempt < maxAttempts) {
          const waitTime = delay * Math.pow(backoff, attempt - 1);
          console.log(`Retry ${attempt}/${maxAttempts} after ${waitTime}ms`);
          await sleep(waitTime);
        }
      }
    }
    
    throw lastError;
  }
  
  private shouldRetry(error: unknown, retryableErrors: string[]): boolean {
    if (error instanceof MCPError) {
      // 特定错误码重试
      const retryableCodes = [-32001, -32603]; // timeout, internal error
      return retryableCodes.includes(error.code);
    }
    
    if (error instanceof Error) {
      return retryableErrors.some(e => error.message.includes(e));
    }
    
    return false;
  }
}

interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoff?: number;
  retryableErrors?: string[];
}
```

---

## 8. 测试

```typescript
// Client 测试
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("MCPClient", () => {
  let client: MCPClient;
  
  beforeEach(async () => {
    client = new MCPClient();
    await client.connect("node", ["./test-server.js"]);
  });
  
  afterEach(async () => {
    await client.disconnect();
  });
  
  it("should discover tools", async () => {
    const tools = await client.discoverTools();
    expect(tools.length).toBeGreaterThan(0);
  });
  
  it("should call tool", async () => {
    const result = await client.callTool("echo", { message: "hello" });
    expect(result.content[0].text).toBe("hello");
  });
  
  it("should handle tool errors", async () => {
    await expect(
      client.callTool("unknown_tool", {})
    ).rejects.toThrow("Tool not found");
  });
  
  it("should timeout on slow requests", async () => {
    await expect(
      client.callTool("slow_operation", {}, { timeout: 100 })
    ).rejects.toThrow("timeout");
  });
});
```

---

## 9. 最佳实践

### DO
- ✅ 使用连接池管理多个连接
- ✅ 实现重试和超时机制
- ✅ 缓存工具列表避免重复请求
- ✅ 使用类型安全的消息处理
- ✅ 实现优雅关闭

### DON'T
- ❌ 不检查 Server capabilities 就使用功能
- ❌ 忽略通知消息
- ❌ 不处理连接断开
- ❌ 同步阻塞调用
- ❌ 不验证工具参数

---

## 下一步

继续阅读：
- `04-skills-spec/` - Skills 规范
- `05-agent-implementation/` - Agent 实现
- `06-demo-project/` - 完整项目示例
