# MCP Server 架构设计

> 本章目标：理解 MCP Server 的内部架构、各核心组件的职责、以及它们如何协作处理请求。学完本章后，你应能设计自己的 MCP Server 架构，并为后续的深入学习打下基础。

---

## 1. Server 在 MCP 架构中的位置

### 1.1 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                         MCP 系统全景                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │                      MCP Host                            │    │
│   │                                                          │    │
│   │   ┌─────────────────────────────────────────────────┐    │    │
│   │   │                 MCP Client                       │    │    │
│   │   │   - 连接管理                                     │    │    │
│   │   │   - 请求发送                                     │    │    │
│   │   │   - 响应处理                                     │    │    │
│   │   └─────────────────────────────────────────────────┘    │    │
│   └─────────────────────────────────────────────────────────┘    │
│                              │                                    │
│                              │ MCP 协议（JSON-RPC）                │
│                              ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │                      MCP Server                          │    │
│   │                                                          │    │
│   │   ┌───────────┐ ┌───────────┐ ┌───────────┐          │    │
│   │   │ Transport │ │ Protocol  │ │   Core    │          │    │
│   │   │   Layer   │ │  Handler  │ │  Logic    │          │    │
│   │   └───────────┘ └───────────┘ └───────────┘          │    │
│   │          │              │             │               │    │
│   │          └──────────────┴─────────────┘               │    │
│   │                         │                              │    │
│   │                   ┌─────┴─────┐                        │    │
│   │                   │  Feature  │                        │    │
│   │                   │  Modules  │                        │    │
│   │                   └───────────┘                        │    │
│   └─────────────────────────────────────────────────────────┘    │
│                              │                                    │
│                              ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │                    Business Logic                        │    │
│   │                                                          │    │
│   │   Weather API   │   GitHub API   │   Database   │      │    │
│   └─────────────────────────────────────────────────────────┘    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Server 的职责

MCP Server 是外部工具和 AI 模型之间的桥梁：

| 职责 | 说明 |
|------|------|
| **暴露能力** | 通过 Capability 声明自己支持哪些功能 |
| **处理请求** | 接收并处理来自 Client 的 JSON-RPC 请求 |
| **返回结果** | 将执行结果以 JSON-RPC 格式返回 |
| **主动通知** | 当资源变化时，主动推送通知 |
| **错误处理** | 正确处理错误并返回有意义的错误信息 |

### 1.3 Server vs Client vs Host

理解三者的区别：

```
┌─────────────────────────────────────────────────────────────┐
│                        概念区分                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  MCP Host                                                    │
│  ├── 定义：运行 AI 模型的应用程序                             │
│  ├── 示例：Claude Desktop、自定义的 Agent 应用                │
│  └── 职责：协调整个系统，管理多个 Client                      │
│                                                              │
│  MCP Client（嵌入在 Host 内）                                │
│  ├── 定义：Host 内负责与 Server 通信的部分                    │
│  ├── 职责：建立连接、发送请求、接收响应                        │
│  └── 特点：1 个 Host 可以有多个 Client                       │
│                                                              │
│  MCP Server（独立进程或服务）                                 │
│  ├── 定义：提供具体功能的外部服务                              │
│  ├── 职责：实现业务逻辑，响应工具调用                          │
│  └── 示例：天气 Server、文件操作 Server、GitHub Server        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Server 核心组件

### 2.1 组件总览

```
┌─────────────────────────────────────────────────────────────────┐
│                       MCP Server 内部结构                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Transport Layer                        │   │
│  │                                                          │   │
│  │   ┌─────────┐    ┌─────────────────┐    ┌─────────┐  │   │
│  │   │  stdio  │    │ StreamableHTTP  │    │ 自定义  │  │   │
│  │   │Handler  │    │    Handler      │    │ Handler │  │   │
│  │   └────┬────┘    └────────┬────────┘    └────┬────┘  │   │
│  │        │              │              │                  │   │
│  │        └──────────────┴──────────────┘                  │   │
│  │                         │                                 │   │
│  └─────────────────────────┼─────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Protocol Handler                       │   │
│  │                                                          │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐           │   │
│  │   │  JSON   │    │ Request │    │ Response│           │   │
│  │   │  Parser  │───►│ Router  │───►│ Builder │           │   │
│  │   └─────────┘    └─────────┘    └─────────┘           │   │
│  │                                                          │   │
│  └─────────────────────────┼─────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Request Handlers                       │   │
│  │                                                          │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐           │   │
│  │   │   Init   │    │  Tools  │    │Resources│           │   │
│  │   │ Handler  │    │ Handler │    │ Handler │           │   │
│  │   └─────────┘    └─────────┘    └─────────┘           │   │
│  │                                                          │   │
│  └─────────────────────────┼─────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Feature Modules                        │   │
│  │                                                          │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐           │   │
│  │   │  Tools  │    │Resources │    │ Prompts │           │   │
│  │   │ Manager │    │ Manager  │    │ Manager │           │   │
│  │   └─────────┘    └─────────┘    └─────────┘           │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 各组件职责

| 组件 | 职责 | 关键实现 |
|------|------|---------|
| **Transport Layer** | 接收/发送原始字节流 | StdioTransport、StreamableHTTPTransport |
| **Protocol Handler** | 解析/构造 JSON-RPC 消息 | JSONRPCParser、RequestRouter |
| **Request Handlers** | 处理特定类型的请求 | InitializeHandler、ToolsHandler |
| **Tools Manager** | 管理工具注册和执行 | registerTool()、callTool() |
| **Resources Manager** | 管理资源和订阅 | listResources()、subscribe() |
| **Prompts Manager** | 管理提示词模板 | listPrompts()、getPrompt() |

---

## 3. 消息处理流程

### 3.1 完整请求处理流程

```
┌──────────────────────────────────────────────────────────────────┐
│                      请求处理完整流程                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Transport 接收数据                                            │
│     ┌───────────────┐                                            │
│     │  stdin/TCP   │ ── "{"jsonrpc":"2.0","id":1,...}\n"       │
│     └───────┬───────┘                                            │
│             │                                                     │
│             ▼                                                     │
│  2. Protocol Handler 解析                                         │
│     ┌───────────────┐                                            │
│     │   JSON Parser  │ ── 解析为 JSON 对象                       │
│     └───────┬───────┘                                            │
│             │                                                     │
│             ▼                                                     │
│  3. 验证消息格式                                                  │
│     ┌───────────────┐                                            │
│     │  Validate     │ ── 检查 jsonrpc 版本、必填字段              │
│     └───────┬───────┘                                            │
│             │                                                     │
│             ├─── 无效格式 ──► 返回 Parse error / Invalid Request │
│             │                                                     │
│             ▼                                                     │
│  4. Request Router 分发                                           │
│     ┌───────────────┐                                            │
│     │    Router     │ ── 根据 method 路由到对应 Handler           │
│     └───────┬───────┘                                            │
│             │                                                     │
│     ┌───────┼───────┬───────────┐                                │
│     │       │       │           │                                │
│     ▼       ▼       ▼           ▼                                │
│   init   tools   resources   prompts                             │
│   list   call     read        get                                │
│             │                                                     │
│             ▼                                                     │
│  5. Handler 处理                                                  │
│     ┌───────────────┐                                            │
│     │    Handler    │ ──执行业务逻辑                              │
│     │               │ ──可能调用外部 API                          │
│     │               │ ──可能访问数据库                            │
│     └───────┬───────┘                                            │
│             │                                                     │
│             ▼                                                     │
│  6. 构建响应                                                      │
│     ┌───────────────┐                                            │
│     │Response Builder│ ── 构造 JSON-RPC 响应                      │
│     └───────┬───────┘                                            │
│             │                                                     │
│             ▼                                                     │
│  7. Transport 发送                                                │
│     ┌───────────────┐                                            │
│     │  stdout/TCP   │ ── {"jsonrpc":"2.0","id":1,"result":{...}}│
│     └───────────────┘                                            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 代码层面的流程

```typescript
// server.ts

class MCPServer {
  private transport: Transport;
  private protocol: ProtocolHandler;
  private toolsManager: ToolsManager;
  private resourcesManager: ResourcesManager;
  private promptsManager: PromptsManager;

  async handleConnection(): Promise<void> {
    // 1. Transport 接收消息
    this.transport.onMessage(async (rawMessage: string) => {
      try {
        // 2. Protocol Handler 解析
        const message = this.protocol.parse(rawMessage);

        // 3. 验证消息格式
        if (!this.protocol.validate(message)) {
          throw new MCPError(-32600, "Invalid Request");
        }

        // 4. Request Router 分发
        const response = await this.route(message);

        // 5. 发送响应
        if (response) {
          await this.transport.send(response);
        }
      } catch (error) {
        // 6. 错误处理
        const errorResponse = this.handleError(error, message);
        if (errorResponse) {
          await this.transport.send(errorResponse);
        }
      }
    });
  }

  private async route(message: JSONRPCMessage): Promise<JSONRPCResponse | null> {
    if (this.isNotification(message)) {
      await this.handleNotification(message);
      return null;
    }

    const request = message as JSONRPCRequest;

    switch (request.method) {
      case "initialize":
        return this.handleInitialize(request);

      case "tools/list":
        return this.toolsManager.handleList(request);

      case "tools/call":
        return await this.toolsManager.handleCall(request);

      case "resources/list":
        return this.resourcesManager.handleList(request);

      case "resources/read":
        return await this.resourcesManager.handleRead(request);

      case "prompts/list":
        return this.promptsManager.handleList(request);

      case "prompts/get":
        return await this.promptsManager.handleGet(request);

      case "ping":
        return this.handlePing(request);

      default:
        throw MCPError.methodNotFound(request.method);
    }
  }
}
```

---

## 4. 核心组件详解

### 4.1 Transport Layer

Transport Layer 负责与外部通信，是 Server 的最外层：

**职责**：
- 启动 Server 进程（stdio）或监听网络端口（Streamable HTTP）
- 接收来自 Client 的字节流
- 将字节流分割成完整的消息
- 将响应发送回 Client

**接口定义**：

```typescript
interface Transport {
  /**
   * 启动传输层
   */
  start(): Promise<void>;

  /**
   * 关闭传输层
   */
  stop(): Promise<void>;

  /**
   * 发送消息
   */
  send(message: JSONRPCMessage): Promise<void>;

  /**
   * 注册消息接收处理器
   */
  onMessage(handler: (message: string) => void): void;

  /**
   * 注册错误处理器
   */
  onError(handler: (error: Error) => void): void;
}
```

### 4.2 Protocol Handler

Protocol Handler 负责 JSON-RPC 协议层面的处理：

**职责**：
- 解析 JSON 字符串为消息对象
- 验证消息格式（版本、必填字段等）
- 处理批量请求
- 构造响应消息

**接口定义**：

```typescript
interface ProtocolHandler {
  /**
   * 解析原始 JSON 字符串
   */
  parse(raw: string): JSONRPCMessage | JSONRPCMessage[];

  /**
   * 验证消息格式
   */
  validate(message: JSONRPCMessage): boolean;

  /**
   * 构造成功响应
   */
  buildSuccess(id: number | string, result: unknown): JSONRPCSuccessResponse;

  /**
   * 构造错误响应
   */
  buildError(id: number | string, error: MCPError): JSONRPCErrorResponse;
}
```

### 4.3 Tools Manager

Tools Manager 负责管理所有工具：

**职责**：
- 维护工具注册表（name → Tool）
- 处理 `tools/list` 请求
- 处理 `tools/call` 请求
- 验证工具参数
- 执行工具并返回结果

**核心数据结构**：

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: InputSchema;
  handler: ToolHandler;
}

type ToolHandler = (arguments: Record<string, unknown>) => Promise<ToolResult>;

interface ToolResult {
  content: Content[];
  isError?: boolean;
}

class ToolsManager {
  private tools = new Map<string, Tool>();

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  async handleList(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const tools = Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { tools },
    };
  }

  async handleCall(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const { name, arguments: args } = request.params;

    const tool = this.tools.get(name);
    if (!tool) {
      throw MCPError.methodNotFound(`Tool not found: ${name}`);
    }

    // 验证参数
    this.validateArgs(args, tool.inputSchema);

    // 执行工具
    const result = await tool.handler(args);

    return {
      jsonrpc: "2.0",
      id: request.id,
      result,
    };
  }
}
```

### 4.4 Resources Manager

Resources Manager 负责管理所有资源：

**职责**：
- 维护资源注册表（uri → Resource）
- 处理 `resources/list` 请求
- 处理 `resources/read` 请求
- 管理资源订阅
- 发送资源变更通知

**核心数据结构**：

```typescript
interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  content: ResourceContent;
}

interface ResourceContent {
  text?: string;
  blob?: string;
}

class ResourcesManager {
  private resources = new Map<string, Resource>();
  private subscriptions = new Map<string, Set<string>>(); // uri → sessionIds

  registerResource(resource: Resource): void {
    this.resources.set(resource.uri, resource);
  }

  handleList(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const resources = Array.from(this.resources.values());
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { resources },
    };
  }

  async handleRead(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const { uri } = request.params;

    const resource = this.resources.get(uri);
    if (!resource) {
      throw MCPError.resourceNotFound(uri);
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        contents: [{
          uri: resource.uri,
          mimeType: resource.mimeType,
          text: resource.content.text,
          blob: resource.content.blob,
        }],
      },
    };
  }

  async subscribe(uri: string, sessionId: string): Promise<void> {
    if (!this.subscriptions.has(uri)) {
      this.subscriptions.set(uri, new Set());
    }
    this.subscriptions.get(uri)!.add(sessionId);
  }

  async notifySubscribers(uri: string, notifier: NotificationSender): Promise<void> {
    const subs = this.subscriptions.get(uri);
    if (subs) {
      for (const sessionId of subs) {
        await notifier(sessionId, {
          method: "notifications/resources/updated",
          params: { uri },
        });
      }
    }
  }
}
```

---

## 5. Server 生命周期

### 5.1 状态机

```
┌──────────────────────────────────────────────────────────────────┐
│                       Server 状态机                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  CREATED ──start()──► LISTENING ──initialize──► INITIALIZING    │
│                                ▲                     │            │
│                                │                     │            │
│                                │                     ▼            │
│                                │                READY ◄──┘       │
│                                │                  │              │
│                                │                  │              │
│                                │         no active sessions       │
│                                │                  │              │
│                                └──────────────────┘              │
│                                                                   │
│  READY ──stop()──► SHUTTING_DOWN ──► CLOSED                     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 状态详解

| 状态 | 说明 | 允许的操作 |
|------|------|-----------|
| **CREATED** | Server 已创建，未启动 | start() |
| **LISTENING** | Transport 已启动，等待连接 | handleConnection() |
| **INITIALIZING** | 正在处理 Client 的握手 | handleInitialize() |
| **READY** | 握手完成，可以处理正常请求 | 所有业务请求 |
| **SHUTTING_DOWN** | 正在关闭，停止接受新请求 | 完成当前请求后关闭 |
| **CLOSED** | 已完全关闭 | 无 |

### 5.3 生命周期代码

```typescript
// lifecycle.ts

enum ServerState {
  CREATED = "created",
  LISTENING = "listening",
  INITIALIZING = "initializing",
  READY = "ready",
  SHUTTING_DOWN = "shutting_down",
  CLOSED = "closed",
}

class ServerLifecycle {
  private state = ServerState.CREATED;
  private stateListeners = new Map<ServerState, Function[]>();

  getState(): ServerState {
    return this.state;
  }

  setState(newState: ServerState): void {
    const oldState = this.state;
    this.state = newState;

    console.log(`Server state: ${oldState} → ${newState}`);

    // 触发监听器
    const listeners = this.stateListeners.get(newState);
    listeners?.forEach((listener) => listener());
  }

  onState(state: ServerState, listener: Function): void {
    if (!this.stateListeners.has(state)) {
      this.stateListeners.set(state, []);
    }
    this.stateListeners.get(state)!.push(listener);
  }

  /**
   * 验证状态转换是否合法
   */
  canTransitionTo(newState: ServerState): boolean {
    const validTransitions: Record<ServerState, ServerState[]> = {
      [ServerState.CREATED]: [ServerState.LISTENING],
      [ServerState.LISTENING]: [ServerState.INITIALIZING],
      [ServerState.INITIALIZING]: [ServerState.READY, ServerState.CLOSED],
      [ServerState.READY]: [ServerState.SHUTTING_DOWN, ServerState.INITIALIZING],
      [ServerState.SHUTTING_DOWN]: [ServerState.CLOSED],
      [ServerState.CLOSED]: [],
    };

    return validTransitions[this.state]?.includes(newState) ?? false;
  }
}
```

### 5.4 握手与状态转换

```typescript
class MCPServer {
  private lifecycle = new ServerLifecycle();
  private clientCapabilities: ClientCapabilities | null = null;

  // 2026-07-28 版本：server/discover 替代 initialize 握手
  async handleDiscover(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    // 返回 Server 的能力和支持的版本
    const result = {
      resultType: "complete",
      supportedVersions: ["2026-07-28"],
      capabilities: this.buildCapabilities(),
      _meta: {
        "io.modelcontextprotocol/serverInfo": {
          name: this.name,
          version: this.version,
        },
      },
      ttlMs: 3600000,
      cacheScope: "public",
    };

    return {
      jsonrpc: "2.0",
      id: request.id,
      result,
    };
  }

  // 2026-07-28 版本：每请求从 _meta 中获取客户端能力
  getClientCapabilities(request: JSONRPCRequest): ClientCapabilities | null {
    const meta = request.params?._meta;
    if (meta?.["io.modelcontextprotocol/clientCapabilities"]) {
      return meta["io.modelcontextprotocol/clientCapabilities"];
    }
    return null;
  }
}
```

---

## 6. 完整 Server 架构代码

### 6.1 主类结构

```typescript
// server.ts

export class MCPServer {
  // 核心组件
  private transport: Transport;
  private protocol: ProtocolHandler;
  private lifecycle: ServerLifecycle;

  // 功能模块
  private tools: ToolsManager;
  private resources: ResourcesManager;
  private prompts: PromptsManager;

  // 配置
  private name: string;
  private version: string;

  constructor(config: ServerConfig) {
    this.name = config.name;
    this.version = config.version;

    // 初始化传输层
    this.transport = this.createTransport(config.transport);

    // 初始化协议处理器
    this.protocol = new ProtocolHandler();

    // 初始化生命周期管理器
    this.lifecycle = new ServerLifecycle();

    // 初始化功能模块
    this.tools = new ToolsManager();
    this.resources = new ResourcesManager();
    this.prompts = new PromptsManager();
  }

  /**
   * 启动 Server
   */
  async start(): Promise<void> {
    await this.transport.start();
    this.lifecycle.setState(ServerState.LISTENING);
    await this.transport.onMessage(this.handleMessage.bind(this));
    console.log(`${this.name} v${this.version} started`);
  }

  /**
   * 停止 Server
   */
  async stop(): Promise<void> {
    this.lifecycle.setState(ServerState.SHUTTING_DOWN);
    await this.transport.stop();
    this.lifecycle.setState(ServerState.CLOSED);
    console.log(`${this.name} stopped`);
  }

  /**
   * 注册工具
   */
  registerTool(tool: Tool): void {
    this.tools.register(tool);
  }

  /**
   * 注册资源
   */
  registerResource(resource: Resource): void {
    this.resources.register(resource);
  }

  /**
   * 注册提示词
   */
  registerPrompt(prompt: Prompt): void {
    this.prompts.register(prompt);
  }

  /**
   * 处理接收到的消息
   */
  private async handleMessage(rawMessage: string): Promise<void> {
    try {
      const message = this.protocol.parse(rawMessage);

      if (Array.isArray(message)) {
        // 批量请求
        const responses = await Promise.all(
          message.map((msg) => this.processMessage(msg))
        );
        const validResponses = responses.filter((r) => r !== null);
        if (validResponses.length > 0) {
          await this.transport.send(validResponses as JSONRPCResponse[]);
        }
      } else {
        const response = await this.processMessage(message);
        if (response) {
          await this.transport.send(response);
        }
      }
    } catch (error) {
      const errorResponse = this.protocol.buildError(null as any, error as Error);
      await this.transport.send(errorResponse);
    }
  }

  private async processMessage(message: JSONRPCMessage): Promise<JSONRPCResponse | null> {
    // 通知类型
    if (this.isNotification(message)) {
      await this.handleNotification(message);
      return null;
    }

    const request = message as JSONRPCRequest;

    // 路由到对应的 Handler
    switch (request.method) {
      case "initialize":
        return await this.handleInitialize(request);

      case "notifications/initialized":
        this.handleInitializedNotification(request);
        return null;

      case "ping":
        return this.handlePing(request);

      case "tools/list":
        return this.tools.handleList(request);

      case "tools/call":
        return await this.tools.handleCall(request);

      case "resources/list":
        return this.resources.handleList(request);

      case "resources/read":
        return await this.resources.handleRead(request);

      case "resources/subscribe":
        return await this.resources.handleSubscribe(request);

      case "resources/unsubscribe":
        return await this.resources.handleUnsubscribe(request);

      case "prompts/list":
        return this.prompts.handleList(request);

      case "prompts/get":
        return await this.prompts.handleGet(request);

      default:
        throw MCPError.methodNotFound(request.method);
    }
  }
}
```

---

## 7. 多服务器协作（Multi-Server Collaboration）

MCP 的真正力量在于多个服务器可以协同工作，组合各自的专业能力。

### 7.1 协作模式

```
┌──────────────────────────────────────────────────────────────────┐
│                      MCP Host                                     │
│                                                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              MCP Client                                   │   │
│   │                                                          │   │
│   │   Client A  ──►  Travel Server（航班、酒店）              │   │
│   │   Client B  ──►  Weather Server（天气）                    │   │
│   │   Client C  ──►  Calendar Server（日历、邮件）             │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2 典型场景：AI 旅行规划助手

考虑一个个性化的 AI 旅行规划应用，连接了三个服务器：

**1. Travel Server** - 处理航班、酒店和行程
**2. Weather Server** - 提供气候数据和预报
**3. Calendar/Email Server** - 管理日程和通信

### 7.3 完整协作流程

```
┌──────────────────────────────────────────────────────────────────┐
│                    多服务器协作流程                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1️⃣ 用户选择一个提示词模板                                        │
│      prompts/get("plan-vacation", {                              │
│        destination: "Barcelona",                                 │
│        departure_date: "2024-06-15",                             │
│        return_date: "2024-06-22",                                │
│        budget: 3000                                              │
│      })                                                           │
│                                                                   │
│  2️⃣ 用户选择要包含的资源                                          │
│      • calendar://my-calendar/June-2024（来自 Calendar Server）  │
│      • travel://preferences/europe（来自 Travel Server）        │
│      • travel://past-trips/Spain-2023（来自 Travel Server）     │
│                                                                   │
│  3️⃣ AI 读取所有选择的资源获取上下文                               │
│                                                                   │
│  4️⃣ AI 执行工具完成任务                                          │
│                                                                   │
│      Travel Server:                                              │
│      • searchFlights() - 查询航班                                │
│                                                                   │
│      Weather Server:                                             │
│      • checkWeather() - 获取天气预报                             │
│                                                                   │
│      Travel Server:                                              │
│      • bookHotel() - 预订酒店                                    │
│      • createCalendarEvent() - 添加日程                          │
│                                                                   │
│      Calendar Server:                                            │
│      • sendEmail() - 发送确认邮件                                │
│                                                                   │
│  5️⃣ 用户审批高风险操作（如预订）                                  │
│                                                                   │
│  6️⃣ 任务完成：通过多个 MCP 服务器，用户完成了一次旅行规划          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 7.4 多服务器实现示例

```typescript
// Host 应用程序同时管理多个服务器连接

class MCPHost {
  private clients: Map<string, MCPClient> = new Map();

  async initialize() {
    // 连接多个服务器
    this.clients.set("travel", await this.connectServer("travel-server"));
    this.clients.set("weather", await this.connectServer("weather-server"));
    this.clients.set("calendar", await this.connectServer("calendar-server"));
  }

  // 发现所有可用工具
  async discoverAllTools() {
    const allTools: Tool[] = [];

    for (const [name, client] of this.clients) {
      const tools = await client.listTools();
      // 为工具添加服务器前缀以避免冲突
      for (const tool of tools) {
        allTools.push({
          ...tool,
          name: `${name}_${tool.name}`  // e.g., "travel_searchFlights"
        });
      }
    }

    return allTools;
  }

  // 调用指定服务器的工具
  async callTool(serverName: string, toolName: string, args: unknown) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Unknown server: ${serverName}`);
    }
    return client.callTool(toolName, args);
  }
}
```

### 7.5 跨服务器资源组合

```typescript
// AI 可以组合来自多个服务器的资源和工具

// 上下文包含多个服务器的资源
const context = {
  resources: [
    // 来自 Calendar Server
    await calendarClient.readResource("calendar://my-calendar/June-2024"),
    // 来自 Travel Server
    await travelClient.readResource("travel://preferences/europe"),
    await travelClient.readResource("travel://past-trips/Spain-2023"),
  ],
  tools: [
    // 来自 Travel Server
    "travel:searchFlights",
    "travel:bookHotel",
    // 来自 Weather Server
    "weather:getForecast",
    // 来自 Calendar Server
    "calendar:createEvent",
    "calendar:sendEmail"
  ]
};
```

### 7.6 服务器发现与能力协商

```typescript
// 每个服务器声明自己的能力
const serverCapabilities = {
  travel: {
    tools: { listChanged: true },
    resources: { subscribe: true }
  },
  weather: {
    tools: {}
  },
  calendar: {
    tools: {},
    elicitation: { inputRequest: true }
  }
};

// Host 根据能力决定如何使用每个服务器
for (const [serverName, capabilities] of Object.entries(serverCapabilities)) {
  if (capabilities.elicitation?.inputRequest) {
    // 这个服务器支持用户输入请求，可以在需要时使用
    enableUserInputFor(serverName);
  }
}
```

---

## 8. 本章小结

```
Server 架构核心要点

核心组件
├── Transport Layer：与外部通信（stdio/Streamable HTTP）
├── Protocol Handler：JSON-RPC 解析和构造
├── Request Handlers：处理各类请求
├── Tools Manager：工具注册和执行
├── Resources Manager：资源和订阅管理
└── Prompts Manager：提示词模板管理

消息处理流程
├── Transport 接收数据
├── Protocol Handler 解析 JSON
├── Request Router 分发到 Handler
├── Handler 执行逻辑
├── Response Builder 构造响应
└── Transport 发送响应

状态机
├── CREATED → LISTENING → INITIALIZING → READY → SHUTTING_DOWN → CLOSED
└── 握手完成后才能处理业务请求
```

---

## 下一步

继续阅读：
- [02-tool-definition.md](02-tool-definition.md) — 工具定义的完整指南
- [03-resource-management.md](03-resource-management.md) — 资源管理详解
