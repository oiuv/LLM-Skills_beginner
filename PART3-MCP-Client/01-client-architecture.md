# MCP Client 架构设计

> 本章目标：理解 MCP Client 的内部架构、各核心组件的职责、以及与 Server 协作的方式。学完本章后，你应能设计自己的 MCP Client 实现。

---

## 1. Client 在 MCP 架构中的位置

### 1.1 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                         MCP 系统全景                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      MCP Host                             │    │
│  │                                                          │    │
│  │   ┌─────────────────────────────────────────────────┐    │    │
│  │   │                 MCP Client                         │    │    │
│  │   │                                                  │    │    │
│  │   │   ┌───────────┐ ┌───────────┐ ┌───────────┐    │    │    │
│  │   │   │ Connection│ │  Request  │ │ Response  │    │    │    │
│  │   │   │  Manager  │ │  Manager  │ │  Handler  │    │    │    │
│  │   │   └───────────┘ └───────────┘ └───────────┘    │    │    │
│  │   │          │              │                         │    │    │
│  │   │          └──────────────┴───────────────────►   │    │    │
│  │   │                     Transport Layer               │    │    │
│  │   └─────────────────────────────────────────────────┘    │    │
│  │                                                          │    │
│  │   ┌─────────────────────────────────────────────────┐    │    │
│  │   │              Application Layer                    │    │    │
│  │   │   Tool Manager │ Resource Manager │ Prompt Mgr │    │    │
│  │   └─────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                    │
│                              │ MCP 协议（JSON-RPC）                │
│                              ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      MCP Server                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Client 的职责

| 职责 | 说明 |
|------|------|
| **连接管理** | 与 Server 建立连接、维护连接状态、处理断开重连 |
| **请求发送** | 构造 JSON-RPC 请求、发送到 Server |
| **响应处理** | 接收 Server 响应、分发给对应的请求处理器 |
| **能力协商** | 在握手中声明 Client 能力、验证 Server 能力 |
| **工具发现** | 从 Server 获取可用工具列表、缓存工具定义 |
| **错误处理** | 处理 Server 返回的错误、转换给上层 |
| **通知处理** | 处理 Server 主动推送的通知 |

---

## 2. Client 核心组件

### 2.1 组件总览

```
┌─────────────────────────────────────────────────────────────────┐
│                       MCP Client 内部结构                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Transport Layer                         │   │
│  │                                                          │   │
│  │   ┌─────────┐    ┌─────────────────┐    ┌─────────┐   │   │
│  │   │  stdio  │    │ Streamable HTTP │    │ 自定义  │   │   │
│  │   │  Client │    │     Client      │    │ Handler │   │   │
│  │   └────┬────┘    └────────┬────────┘    └────┬────┘   │   │
│  │        │                   │                  │         │   │
│  │        └───────────────────┴──────────────────┘         │   │
│  │                            │                               │   │
│  └────────────────────────────┼───────────────────────────────┘   │
│                               │                                     │
│                               ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Protocol Layer                          │   │
│  │                                                          │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐           │   │
│  │   │ Request │    │ Response│    │Notification│           │   │
│  │   │ Builder │    │ Parser  │    │ Handler │           │   │
│  │   └─────────┘    └─────────┘    └─────────┘           │   │
│  │                                                          │   │
│  └─────────────────────────┼─────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Core Components                         │   │
│  │                                                          │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐           │   │
│  │   │Connection│   │ Request │    │  State  │           │   │
│  │   │ Manager │    │ Manager │    │ Machine │           │   │
│  │   └─────────┘    └─────────┘    └─────────┘           │   │
│  │                                                          │   │
│  └─────────────────────────┼─────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Feature Layer                           │   │
│  │                                                          │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐           │   │
│  │   │   Tool  │    │Resource │    │ Prompt  │           │   │
│  │   │ Manager │    │ Manager │    │ Manager │           │   │
│  │   └─────────┘    └─────────┘    └─────────┘           │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 各组件职责

| 组件 | 职责 | 关键实现 |
|------|------|---------|
| **Transport Layer** | 与 Server 通信 | StdioClient、StreamableHTTPClient |
| **Protocol Layer** | JSON-RPC 编解码 | RequestBuilder、ResponseParser |
| **Connection Manager** | 连接状态、重连 | connect()、reconnect() |
| **Request Manager** | 请求分发、超时 | send()、cancel() |
| **State Machine** | 连接状态跟踪 | CONNECTING、READY、CLOSED |
| **Tool Manager** | 工具发现、调用、缓存 | listTools()、callTool() |
| **Resource Manager** | 资源读取、订阅 | listResources()、subscribe() |
| **Prompt Manager** | 提示词获取 | listPrompts()、getPrompt() |

---

## 3. 连接管理

### 3.1 连接状态机

```
┌──────────────────────────────────────────────────────────────────┐
│                      Client 状态机                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  DISCONNECTED ──connect()──► CONNECTING ──initialize──► READY  │
│         ▲                               │                     │     │
│         │                               │                     │     │
│         │       disconnect()            │                     │     │
│         └───────────────────────────────┘                     │     │
│                                                               │     │
│  READY ───发现工具/资源/提示词──► READY                       │     │
│    │                                                         │     │
│    │  connection lost                                        │     │
│    └────────────────────────► RECONNECTING ──► READY         │     │
│                                 │                              │     │
│                                 │ max retries exceeded         │     │
│                                 ▼                              │     │
│                           DISCONNECTED                         │     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 状态详解

| 状态 | 说明 | 允许的操作 |
|------|------|-----------|
| **DISCONNECTED** | 未连接 | connect() |
| **CONNECTING** | 正在连接 | 等待响应 |
| **INITIALIZING** | 正在握手 | 等待 initialize 完成 |
| **READY** | 握手完成，可以发送请求 | 所有业务请求 |
| **RECONNECTING** | 正在重连 | 自动重连 |
| **CLOSED** | 连接已关闭 | 无 |

### 3.3 Connection Manager 实现

```typescript
// connection-manager.ts

enum ConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  INITIALIZING = "initializing",
  READY = "ready",
  RECONNECTING = "reconnecting",
  CLOSED = "closed",
}

class ConnectionManager {
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  private stateListeners = new Map<ConnectionState, Function[]>();

  constructor(
    private transport: Transport,
    private serverInfo?: { name: string; version: string }
  ) {
    // 监听 transport 事件
    transport.onClose(() => this.handleTransportClose());
    transport.onError((error) => this.handleTransportError(error));
  }

  /**
   * 连接 Server
   */
  async connect(): Promise<void> {
    if (this.state !== ConnectionState.DISCONNECTED) {
      throw new Error(`Cannot connect in state: ${this.state}`);
    }

    this.setState(ConnectionState.CONNECTING);

    try {
      // 1. 建立传输层连接
      await this.transport.connect();

      // 2. 发送 initialize 请求
      this.setState(ConnectionState.INITIALIZING);
      await this.performHandshake();

      // 3. 握手成功，进入就绪状态
      this.setState(ConnectionState.READY);
      this.reconnectAttempts = 0;

    } catch (error) {
      await this.transport.close();
      this.setState(ConnectionState.DISCONNECTED);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.setState(ConnectionState.CLOSED);
    await this.transport.close();
  }

  /**
   * 执行握手
   */
  // 2026-07-28 版本：使用 server/discover 替代 initialize 握手
  private async performDiscover(): Promise<ServerCapabilities> {
    const response = await this.transport.sendRequest({
      jsonrpc: "2.0",
      id: 0,
      method: "server/discover",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": {
            name: "my-mcp-client",
            version: "1.0.0"
          },
          "io.modelcontextprotocol/clientCapabilities": this.getClientCapabilities()
        }
      }
    });

    return response.capabilities;
  }

  /**
   * 获取 Client 的 Capability（2026-07-28 版本）
   */
  private getClientCapabilities(): ClientCapabilities {
    return {
      elicitation: {}
    };
  }

  /**
   * 处理连接断开
   */
  private handleTransportClose(): void {
    if (this.state === ConnectionState.CLOSED) {
      return; // 主动关闭，不重连
    }

    console.log("[Connection] Transport closed");
    this.setState(ConnectionState.RECONNECTING);
    this.attemptReconnect();
  }

  /**
   * 处理连接错误
   */
  private handleTransportError(error: Error): void {
    console.error("[Connection] Transport error:", error.message);
  }

  /**
   * 尝试重连
   */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[Connection] Max reconnection attempts reached");
      this.setState(ConnectionState.DISCONNECTED);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[Connection] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    await new Promise((r) => setTimeout(r, delay));

    try {
      await this.connect();
    } catch (error) {
      console.error("[Connection] Reconnection failed:", error);
      // handleTransportClose 会处理继续重连
    }
  }

  private setState(newState: ConnectionState): void {
    const oldState = this.state;
    this.state = newState;

    console.log(`[Connection] State: ${oldState} → ${newState}`);

    const listeners = this.stateListeners.get(newState);
    listeners?.forEach((listener) => listener(oldState, newState));
  }

  getState(): ConnectionState {
    return this.state;
  }

  isReady(): boolean {
    return this.state === ConnectionState.READY;
  }

  onStateChange(state: ConnectionState, listener: Function): void {
    if (!this.stateListeners.has(state)) {
      this.stateListeners.set(state, []);
    }
    this.stateListeners.get(state)!.push(listener);
  }
}
```

---

## 4. 请求管理

### 4.1 Request Manager 职责

```
┌─────────────────────────────────────────────────────────────┐
│                    Request Manager                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 发送请求并等待响应                                       │
│     Request[id=1] ──────────────────────► Server            │
│                        ◄────────────────────── Response[id=1]│
│                                                              │
│  2. 处理超时                                                 │
│     Request[id=2] ─── timeout(30s) ───► Server (未响应)     │
│                              ──── 返回 TimeoutError ───►    │
│                                                              │
│  3. 取消请求                                                 │
│     Request[id=3] ─── cancel() ───► Server                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Request Manager 实现

```typescript
// request-manager.ts

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeoutId: NodeJS.Timeout;
  timestamp: number;
  method: string;
}

class RequestManager {
  private pending = new Map<string | number, PendingRequest>();
  private nextId = 1;
  private defaultTimeout = 30000; // 30 秒

  constructor(
    private transport: Transport,
    private onResponse: (response: JSONRPCResponse) => void
  ) {
    // Transport 收到消息时，分发给 Request Manager
    transport.onMessage((message) => {
      if ("id" in message) {
        this.handleResponse(message as JSONRPCResponse);
      } else {
        // 通知（没有 id）
        this.handleNotification(message as JSONRPCNotification);
      }
    });
  }

  /**
   * 发送请求并等待响应
   */
  async send<T>(
    method: string,
    params?: Record<string, unknown>,
    options: { timeout?: number } = {}
  ): Promise<T> {
    const id = this.nextId++;
    const timeout = options.timeout ?? this.defaultTimeout;

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${method} timed out after ${timeout}ms`));
      }, timeout);

      // 保存待处理请求
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
        timestamp: Date.now(),
        method
      });

      // 发送请求
      this.transport.send({
        jsonrpc: "2.0",
        id,
        method,
        params
      }).catch((error) => {
        clearTimeout(timeoutId);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  /**
   * 发送通知（不需要响应）
   */
  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    await this.transport.send({
      jsonrpc: "2.0",
      method,
      params
    });
  }

  /**
   * 处理响应
   */
  private handleResponse(response: JSONRPCResponse): void {
    const id = response.id;
    const pending = this.pending.get(id);

    if (!pending) {
      console.warn(`[RequestManager] Received response for unknown request: ${id}`);
      return;
    }

    // 清除超时
    clearTimeout(pending.timeoutId);
    this.pending.delete(id);

    // 处理响应
    if (response.error) {
      pending.reject(
        new MCPError(
          response.error.code,
          response.error.message,
          response.error.data
        )
      );
    } else {
      pending.resolve(response.result);
    }

    // 触发回调
    this.onResponse(response);
  }

  /**
   * 处理通知
   */
  private handleNotification(notification: JSONRPCNotification): void {
    console.log(`[RequestManager] Notification: ${notification.method}`);
    // 通知会被单独的监听器处理
  }

  /**
   * 取消所有待处理请求
   */
  cancelAll(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(`Request cancelled: ${reason}`));
    }
    this.pending.clear();
  }

  /**
   * 获取待处理请求数量
   */
  getPendingCount(): number {
    return this.pending.size;
  }
}
```

---

## 5. 完整 Client 主类

### 5.1 主类结构

```typescript
// client.ts

export class MCPClient {
  private transport: Transport;
  private connectionManager: ConnectionManager;
  private requestManager: RequestManager;
  private toolManager: ToolManager;
  private resourceManager: ResourceManager;
  private promptManager: PromptManager;
  private serverCapabilities: ServerCapabilities | null = null;

  constructor(config: ClientConfig) {
    // 1. 创建传输层
    this.transport = this.createTransport(config.transport);

    // 2. 创建请求管理器
    this.requestManager = new RequestManager(this.transport, (response) => {
      this.handleResponse(response);
    });

    // 3. 创建连接管理器
    this.connectionManager = new ConnectionManager(this.transport);

    // 4. 监听连接状态变化
    this.connectionManager.onStateChange(
      ConnectionState.READY,
      () => this.onConnected()
    );

    // 5. 创建功能管理器
    this.toolManager = new ToolManager(this);
    this.resourceManager = new ResourceManager(this);
    this.promptManager = new PromptManager(this);
  }

  /**
   * 连接到 Server
   */
  async connect(): Promise<void> {
    await this.connectionManager.connect();
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.requestManager.cancelAll("Client disconnecting");
    await this.connectionManager.disconnect();
  }

  /**
   * 连接成功后的初始化
   */
  private async onConnected(): Promise<void> {
    // 发现可用工具
    await this.toolManager.discover();

    // 发现可用资源
    await this.resourceManager.discover();

    // 发现可用提示词
    await this.promptManager.discover();

    console.log("[Client] Initialization complete");
  }

  /**
   * 处理收到的响应
   */
  private handleResponse(response: JSONRPCResponse): void {
    if (response.error) {
      console.error(`[Client] Error response: ${response.error.message}`);
    }
  }

  /**
   * 发送请求
   */
  async request<T>(
    method: string,
    params?: Record<string, unknown>,
    options?: { timeout?: number }
  ): Promise<T> {
    if (!this.connectionManager.isReady()) {
      throw new Error("Client not ready");
    }
    return this.requestManager.send<T>(method, params, options);
  }

  /**
   * 发送通知
   */
  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    return this.requestManager.notify(method, params);
  }

  /**
   * 获取工具列表
   */
  async listTools(): Promise<Tool[]> {
    return this.toolManager.list();
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args?: Record<string, unknown>): Promise<ToolResult> {
    return this.toolManager.call(name, args);
  }

  /**
   * 获取资源列表
   */
  async listResources(): Promise<Resource[]> {
    return this.resourceManager.list();
  }

  /**
   * 读取资源
   */
  async readResource(uri: string): Promise<ResourceContent[]> {
    return this.resourceManager.read(uri);
  }

  /**
   * 获取提示词列表
   */
  async listPrompts(): Promise<Prompt[]> {
    return this.promptManager.list();
  }

  /**
   * 获取提示词内容
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<PromptMessage[]> {
    return this.promptManager.get(name, args);
  }
}
```

### 5.2 工厂方法

```typescript
// client-factory.ts

class MCPClientFactory {
  /**
   * 创建 stdio Client
   */
  static createStdioClient(
    serverCommand: string,
    serverArgs: string[] = [],
    clientOptions: ClientConfig = {}
  ): MCPClient {
    const transport = new StdioClientTransport({
      command: serverCommand,
      args: serverArgs,
      env: clientOptions.env
    });

    return new MCPClient({
      ...clientOptions,
      transport
    });
  }

  /**
   * 创建 Streamable HTTP Client
   */
  static createStreamableHTTPClient(
    serverUrl: string,
    clientOptions: ClientConfig = {}
  ): MCPClient {
    const transport = new StreamableHTTPClientTransport({
      url: serverUrl
    });

    return new MCPClient({
      ...clientOptions,
      transport
    });
  }
}

// 使用示例
async function main() {
  // stdio 方式
  const stdioClient = MCPClientFactory.createStdioClient("node", ["./server.js"]);

  // Streamable HTTP 方式
  const httpClient = MCPClientFactory.createStreamableHTTPClient("http://localhost:3000");

  await stdioClient.connect();
  const tools = await stdioClient.listTools();
  console.log("Available tools:", tools);
}
```

---

## 6. 工具发现与管理

### 6.1 Tool Manager 实现

```typescript
// tool-manager.ts

class ToolManager {
  private tools = new Map<string, Tool>();
  private client: MCPClient;

  constructor(client: MCPClient) {
    this.client = client;
  }

  /**
   * 发现工具（从 Server 获取）
   */
  async discover(): Promise<Tool[]> {
    const response = await this.client.request<{ tools: Tool[] }>("tools/list");

    // 更新本地缓存
    this.tools.clear();
    for (const tool of response.tools) {
      this.tools.set(tool.name, tool);
    }

    return response.tools;
  }

  /**
   * 获取工具列表
   */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取单个工具定义
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 调用工具
   */
  async call(name: string, args?: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    const response = await this.client.request<ToolResult>("tools/call", {
      name,
      arguments: args || {}
    });

    return response;
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}
```

---

## 7. Client 原语（Primitives）

Client 原语是 MCP 协议中由 Client 实现的能力，允许 Server 请求 Client 执行特定操作。

### 7.1 Roots（文件系统根目录）

**用途**：声明 Client 可以访问的根目录列表，Server 可以据此判断文件访问权限。

```typescript
// Client 在握手中声明 roots capability
interface ClientCapabilities {
  roots?: {
    listChanged?: boolean;  // 是否支持 roots/listChanged 通知
  };
}

// roots/list 请求
interface RootsListRequest {
  method: "roots/list";
  params: {};
}

// roots/list 响应
interface RootsListResponse {
  roots: {
    uri: string;           // 根目录 URI，如 file:///home/user/project
    name?: string;         // 可选的显示名称
  }[];
}
```

**使用场景**：
- Server 需要知道可以安全访问哪些目录
- 文件操作工具需要判断路径是否在允许范围内
- AI 助手需要知道工作区的根目录位置

```typescript
// Client 实现
class RootsManager {
  private roots: { uri: string; name?: string }[] = [];

  async listRoots(): Promise<{ roots: { uri: string; name?: string }[] }> {
    return { roots: this.roots };
  }

  setRoots(roots: { uri: string; name?: string }[]): void {
    this.roots = roots;
  }
}
```

### 7.2 Sampling（AI 采样）

**用途**：允许 Server 请求 Client 的 LLM 生成内容。Server 可以借助 AI 能力来处理复杂任务。

```typescript
// Client 声明 sampling capability
interface ClientCapabilities {
  sampling?: {};  // 支持 sampling/createMessage
}

// sampling/createMessage 请求
interface SamplingCreateMessageRequest {
  method: "sampling/createMessage";
  params: {
    messages: Message[];
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
  };
}

interface Message {
  role: "user" | "assistant";
  content: Content;
}

interface Content {
  type: "text" | "image";
  text?: string;
  data?: string;       // base64 编码的图像数据
  mimeType?: string;   // 图像 MIME 类型
}

// sampling/createMessage 响应
interface SamplingCreateMessageResponse {
  content: Content;
  model: string;       // 实际使用的模型
  stopReason?: string; // 生成停止原因
}
```

**使用场景**：
- Server 收到一段文本，需要 AI 总结或翻译
- Server 需要 AI 帮忙格式化输出
- Server 请求 LLM 生成推荐内容

```typescript
// Client 实现
class SamplingManager {
  async createMessage(
    params: SamplingCreateMessageRequest["params"]
  ): Promise<SamplingCreateMessageResponse> {
    // 调用 LLM API 生成内容
    const response = await this.llm.complete({
      messages: params.messages,
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens
    });

    return {
      content: {
        type: "text",
        text: response.text
      },
      model: response.model,
      stopReason: response.stopReason
    };
  }
}
```

### 7.3 Elicitation（征求用户输入）

**用途**：允许 Server 请求用户确认或输入。这是 Server 与用户交互的主要机制。

```typescript
// Client 声明 elicitation capability
interface ClientCapabilities {
  elicitation?: {
    inputRequest?: boolean;  // 是否支持输入请求
  };
}

// elicitation/requestInput 请求
interface ElicitationRequestInputRequest {
  method: "elicitation/requestInput";
  params: {
    message: string;                    // 显示给用户的提示信息
    requestedSchema: Schema;             // 期望的用户输入格式
    defaultValue?: unknown;              // 可选的默认值
    suppressAfter?: number;              // 多长时间后自动取消（秒）
  };
}

interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: unknown[];
  default?: unknown;
}

// elicitation/requestInput 响应
interface ElicitationRequestInputResponse {
  values: Record<string, unknown>;  // 用户输入的值
  cancelled: boolean;              // 用户是否取消
}
```

**使用场景**：
- Server 需要用户确认危险操作（如删除文件）
- Server 需要用户提供额外信息
- Server 需要用户在多个选项中做选择

```typescript
// Client 实现
class ElicitationManager {
  async requestInput(
    params: ElicitationRequestInputRequest["params"]
  ): Promise<ElicitationRequestInputResponse> {
    // 显示 UI 弹窗获取用户输入
    const result = await this.ui.showInputDialog({
      message: params.message,
      schema: params.requestedSchema,
      defaultValue: params.defaultValue,
      timeout: params.suppressAfter ? params.suppressAfter * 1000 : undefined
    });

    return {
      values: result.values,
      cancelled: result.cancelled
    };
  }
}
```

### 7.4 Client 原语与 Server 能力的对应

```
┌──────────────────────────────────────────────────────────────────┐
│                        MCP 能力对应关系                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Server 能力              │  Client 原语                          │
│  ────────────────────────┼─────────────────────────────         │
│  tools/call              │  —                                   │
│  resources/read         │  —                                   │
│  prompts/get            │  —                                   │
│  sampling/createMessage │  ← Client 提供 sampling 能力           │
│  elicitation/requestInput│ ← Client 提供 elicitation 能力       │
│  —                       │  roots/list（Client 声明）           │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. 本章小结

```
Client 架构核心要点

核心组件
├── Transport Layer：与 Server 通信
├── Protocol Layer：JSON-RPC 编解码
├── Connection Manager：连接状态、重连
├── Request Manager：请求分发、超时
├── Tool Manager：工具发现和调用
├── Resource Manager：资源读取和订阅
└── Prompt Manager：提示词获取

连接管理
├── 状态机：DISCONNECTED → CONNECTING → INITIALIZING → READY
├── 自动重连：指数退避
└── 握手：交换 capabilities

请求管理
├── 发送请求并等待匹配的响应
├── 超时控制
├── 取消请求
└── 通知分发

Client 原语
├── Roots：声明可访问的文件系统根目录
├── Sampling：Server 请求 Client 调用 LLM
└── Elicitation：Server 请求用户确认或输入

最佳实践
├── 连接管理器统一管理连接状态
├── 请求管理器处理所有请求响应
├── 功能管理器提供高层 API
└── 工厂方法简化 Client 创建
```

---

## 下一步

继续阅读：
- [02-connection-management.md](02-connection-management.md) — 连接管理详解
- [03-tool-discovery.md](03-tool-discovery.md) — 工具发现与调用
