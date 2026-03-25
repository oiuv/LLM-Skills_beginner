# 会话生命周期管理

> 本章目标：理解 MCP Server 的会话概念、生命周期状态管理、以及多会话并发处理。学完本章后，你应能正确实现会话管理，支持多个 Client 同时连接。

---

## 1. 会话的概念

### 1.1 什么是会话？

在 MCP 中，**会话（Session）** 是 Client 与 Server 之间的一次完整通信过程：

```
Session（会话）
├── 连接建立（握手）
├── 正常通信（工具调用、资源读取等）
└── 连接关闭

一个 Server 可以同时维护多个会话
```

### 1.2 为什么需要会话管理？

```
单会话场景（简单）：
Client ────────────────────► Server
         共享状态

多会话场景（复杂）：
Client A ────────────────────► Server
                                 │
Client B ────────────────────► Server  ◄── 每个 Client 有独立状态
                                 │
Client C ────────────────────► Server  ◄── 需要正确隔离
```

**需要会话管理的场景**：
- Streamable HTTP 传输：多个 Client 通过同一个 HTTP 连接
- Server 需要跟踪每个 Client 的状态（如订阅、缓存）
- 需要为不同 Client 提供差异化服务

---

## 2. 会话生命周期

### 2.1 状态机

```
┌──────────────────────────────────────────────────────────────────┐
│                      会话状态机                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  CREATED ──connect()──► PENDING ──initialize──► READY           │
│                                   │                     │          │
│                                   │                     │          │
│                                   ▼                     ▼          │
│                              CLOSED ◄────────── WORKING         │
│                                   │                     │          │
│                                   │                     │          │
│                                   └────── timeout ──────┘          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 各状态详解

| 状态 | 说明 | 允许的操作 |
|------|------|-----------|
| **CREATED** | 会话已创建，未建立连接 | connect() |
| **PENDING** | 连接已建立，等待握手完成 | handleInitialize() |
| **READY** | 握手完成，可以处理业务请求 | 所有业务操作 |
| **WORKING** | 正在处理请求 | 继续处理、完成后回 READY |
| **CLOSED** | 会话已关闭 | 无 |

### 2.3 状态转换代码

```typescript
// session-state.ts

enum SessionState {
  CREATED = "created",
  PENDING = "pending",
  READY = "ready",
  WORKING = "working",
  CLOSED = "closed",
}

class Session {
  private state: SessionState = SessionState.CREATED;
  private stateListeners = new Map<SessionState, Function[]>();

  constructor(
    public readonly id: string,
    public readonly createdAt: Date = new Date()
  ) {}

  getState(): SessionState {
    return this.state;
  }

  transition(newState: SessionState): void {
    if (!this.isValidTransition(newState)) {
      throw new Error(`Invalid state transition: ${this.state} → ${newState}`);
    }

    const oldState = this.state;
    this.state = newState;

    console.log(`[Session ${this.id}] State: ${oldState} → ${newState}`);

    // 触发监听器
    const listeners = this.stateListeners.get(newState);
    listeners?.forEach((listener) => listener(oldState, newState));
  }

  private isValidTransition(newState: SessionState): boolean {
    const validTransitions: Record<SessionState, SessionState[]> = {
      [SessionState.CREATED]: [SessionState.PENDING, SessionState.CLOSED],
      [SessionState.PENDING]: [SessionState.READY, SessionState.CLOSED],
      [SessionState.READY]: [SessionState.WORKING, SessionState.CLOSED],
      [SessionState.WORKING]: [SessionState.READY, SessionState.CLOSED],
      [SessionState.CLOSED]: [],
    };

    return validTransitions[this.state]?.includes(newState) ?? false;
  }

  onTransition(state: SessionState, listener: Function): void {
    if (!this.stateListeners.has(state)) {
      this.stateListeners.set(state, []);
    }
    this.stateListeners.get(state)!.push(listener);
  }
}
```

---

## 3. Session Manager

### 3.1 核心功能

```typescript
// session-manager.ts

class SessionManager {
  private sessions = new Map<string, Session>();
  private defaultTimeout = 300000; // 5 分钟无活动超时

  /**
   * 创建新会话
   */
  createSession(sessionId?: string): Session {
    const id = sessionId || this.generateSessionId();
    const session = new Session(id);

    this.sessions.set(id, session);

    console.log(`[SessionManager] Created session: ${id}`);

    return session;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 获取或创建会话
   */
  getOrCreateSession(sessionId: string): Session {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createSession(sessionId);
    }
    return session;
  }

  /**
   * 关闭会话
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.transition(SessionState.CLOSED);
      this.sessions.delete(sessionId);

      console.log(`[SessionManager] Closed session: ${sessionId}`);
    }
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.getState() !== SessionState.CLOSED
    );
  }

  /**
   * 获取活跃会话数量
   */
  getActiveCount(): number {
    return this.getActiveSessions().length;
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
```

### 3.2 完整会话管理实现

```typescript
// session-context.ts

interface SessionContext {
  session: Session;
  clientCapabilities?: ClientCapabilities;
  serverCapabilities?: ServerCapabilities;
  subscriptions: Set<string>;           // 资源订阅
  requestCount: number;                 // 请求计数
  lastActivityAt: Date;                 // 最后活动时间
  metadata: Map<string, unknown>;        // 自定义元数据
}

class SessionContextManager {
  private contexts = new Map<string, SessionContext>();

  constructor(private sessionManager: SessionManager) {}

  /**
   * 创建会话上下文
   */
  createContext(sessionId: string): SessionContext {
    const session = this.sessionManager.getOrCreateSession(sessionId);

    const context: SessionContext = {
      session,
      subscriptions: new Set(),
      requestCount: 0,
      lastActivityAt: new Date(),
      metadata: new Map(),
    };

    this.contexts.set(sessionId, context);
    return context;
  }

  /**
   * 获取上下文
   */
  getContext(sessionId: string): SessionContext | undefined {
    return this.contexts.get(sessionId);
  }

  /**
   * 获取或创建上下文
   */
  getOrCreateContext(sessionId: string): SessionContext {
    return this.contexts.get(sessionId) || this.createContext(sessionId);
  }

  /**
   * 更新活动状态
   */
  touch(sessionId: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.lastActivityAt = new Date();
      context.requestCount++;
    }
  }

  /**
   * 添加资源订阅
   */
  addSubscription(sessionId: string, uri: string): void {
    const context = this.contexts.get(sessionId);
    context?.subscriptions.add(uri);
  }

  /**
   * 移除资源订阅
   */
  removeSubscription(sessionId: string, uri: string): void {
    const context = this.contexts.get(sessionId);
    context?.subscriptions.delete(uri);
  }

  /**
   * 获取会话的所有订阅
   */
  getSubscriptions(sessionId: string): string[] {
    const context = this.contexts.get(sessionId);
    return Array.from(context?.subscriptions || []);
  }

  /**
   * 清理会话上下文
   */
  cleanupSession(sessionId: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      // 取消所有订阅
      context.subscriptions.clear();
      // 清除元数据
      context.metadata.clear();
      // 从管理器移除
      this.contexts.delete(sessionId);
    }
  }
}
```

---

## 4. 多会话处理

### 4.1 Streamable HTTP 多会话实现

```typescript
// multi-session-server.ts

class MultiSessionServer {
  private sessionManager = new SessionManager();
  private contextManager: SessionContextManager;
  private sessions = new Map<string, ServerResponse>(); // sessionId → HTTP response

  constructor() {
    this.contextManager = new SessionContextManager(this.sessionManager);
  }

  /**
   * 处理新的 Streamable HTTP 连接
   */
  async handleHTTPConnection(req: IncomingMessage, res: ServerResponse): Promise<string> {
    // 创建新会话
    const session = this.sessionManager.createSession();
    const sessionId = session.id;

    // 保存 HTTP response
    this.sessions.set(sessionId, res);

    // 创建会话上下文
    this.contextManager.createContext(sessionId);

    // 设置 Streamable HTTP headers
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // 发送 endpoint
    this.sendToSession(sessionId, {
      method: "endpoint",
      params: { endpoint: `/mcp/${sessionId}` }
    });

    // 监听连接关闭
    req.on("close", () => {
      this.handleSessionClose(sessionId);
    });

    return sessionId;
  }

  /**
   * 处理 MCP 请求
   */
  async handleMCPRequest(
    sessionId: string,
    request: JSONRPCRequest
  ): Promise<void> {
    const context = this.contextManager.getOrCreateContext(sessionId);

    // 更新活动时间
    this.contextManager.touch(sessionId);

    // 更新 Client capabilities（握手时）
    if (request.method === "initialize") {
      context.clientCapabilities = request.params.capabilities;
    }

    // 处理请求
    const response = await this.processRequest(request, context);

    // 发送响应
    if (response) {
      this.sendToSession(sessionId, response);
    }
  }

  /**
   * 发送消息到指定会话
   */
  private sendToSession(sessionId: string, message: unknown): void {
    const res = this.sessions.get(sessionId);
    if (res) {
      res.write(JSON.stringify(message) + "\n");
    }
  }

  /**
   * 处理会话关闭
   */
  private handleSessionClose(sessionId: string): void {
    // 清理资源订阅
    const subscriptions = this.contextManager.getSubscriptions(sessionId);
    for (const uri of subscriptions) {
      // 通知资源管理器取消订阅
      this.resourceManager.unsubscribe(uri, sessionId);
    }

    // 清理上下文
    this.contextManager.cleanupSession(sessionId);

    // 关闭会话
    this.sessionManager.closeSession(sessionId);

    // 移除 HTTP response
    this.sessions.delete(sessionId);

    console.log(`[Server] Session ${sessionId} closed`);
  }

  /**
   * 向指定会话发送通知（如资源更新）
   */
  async notifySession(sessionId: string, notification: JSONRPCNotification): Promise<void> {
    const context = this.contextManager.getContext(sessionId);
    if (context && context.session.getState() !== SessionState.CLOSED) {
      this.sendToSession(sessionId, notification);
    }
  }
}
```

### 4.2 广播消息

```typescript
/**
 * 向所有活跃会话广播消息
 */
async broadcast(server: MultiSessionServer, notification: JSONRPCNotification): Promise<void> {
  const activeSessions = server.sessionManager.getActiveSessions();

  await Promise.all(
    activeSessions.map((session) =>
      server.notifySession(session.id, notification)
    )
  );

  console.log(`[Server] Broadcast to ${activeSessions.length} sessions`);
}

/**
 * 向指定条件的会话广播
 */
async broadcastIf(
  server: MultiSessionServer,
  notification: JSONRPCNotification,
  predicate: (context: SessionContext) => boolean
): Promise<void> {
  const activeSessions = server.sessionManager.getActiveSessions();

  for (const session of activeSessions) {
    const context = server.contextManager.getContext(session.id);
    if (context && predicate(context)) {
      await server.notifySession(session.id, notification);
    }
  }
}

// 使用示例：只通知订阅了某个资源的会话
await broadcastIf(
  server,
  { jsonrpc: "2.0", method: "notifications/resources/updated", params: { uri: "..." } },
  (ctx) => ctx.subscriptions.has("...")
);
```

---

## 5. 会话超时管理

### 5.1 空闲超时

```typescript
// idle-timeout.ts

class IdleTimeoutManager {
  private timeouts = new Map<string, NodeJS.Timeout>();
  private defaultIdleTimeout = 300000; // 5 分钟

  constructor(
    private sessionManager: SessionManager,
    private onTimeout: (sessionId: string) => void
  ) {}

  /**
   * 启动空闲超时
   */
  startIdleTimer(sessionId: string, timeout?: number): void {
    // 清除之前的定时器
    this.cancelTimer(sessionId);

    const timer = setTimeout(() => {
      const session = this.sessionManager.getSession(sessionId);
      if (session && session.getState() !== SessionState.CLOSED) {
        console.log(`[TimeoutManager] Session ${sessionId} idle timeout`);
        this.onTimeout(sessionId);
      }
    }, timeout || this.defaultIdleTimeout);

    this.timeouts.set(sessionId, timer);
  }

  /**
   * 取消空闲超时
   */
  cancelTimer(sessionId: string): void {
    const existing = this.timeouts.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      this.timeouts.delete(sessionId);
    }
  }

  /**
   * 重置超时（延长）
   */
  resetTimer(sessionId: string, timeout?: number): void {
    this.startIdleTimer(sessionId, timeout);
  }

  /**
   * 清理所有定时器
   */
  clearAll(): void {
    for (const timer of this.timeouts.values()) {
      clearTimeout(timer);
    }
    this.timeouts.clear();
  }
}

// 使用
const timeoutManager = new IdleTimeoutManager(
  sessionManager,
  (sessionId) => {
    // 超时处理：关闭会话
    multiSessionServer.closeSession(sessionId);
  }
);

// 每次收到请求时重置超时
function createRequestHandler() {
  return async (sessionId: string, request: JSONRPCRequest) => {
    // 重置超时
    timeoutManager.resetTimer(sessionId);

    // 处理请求...
  };
}
```

---

## 6. 完整 Server 示例

### 6.1 主类结构

```typescript
// complete-server.ts

export class MCPServer {
  private transport: Transport;
  private protocol: ProtocolHandler;
  private sessionManager: SessionManager;
  private contextManager: SessionContextManager;
  private toolsManager: ToolsManager;
  private resourcesManager: ResourcesManager;
  private promptsManager: PromptsManager;
  private timeoutManager: IdleTimeoutManager;

  constructor(config: ServerConfig) {
    // 初始化各组件
    this.transport = this.createTransport(config.transport);
    this.protocol = new ProtocolHandler();
    this.sessionManager = new SessionManager();
    this.contextManager = new SessionContextManager(this.sessionManager);
    this.toolsManager = new ToolsManager();
    this.resourcesManager = new ResourcesManager();
    this.promptsManager = new PromptsManager();

    this.timeoutManager = new IdleTimeoutManager(
      this.sessionManager,
      (sessionId) => this.handleSessionTimeout(sessionId)
    );
  }

  /**
   * 处理连接
   */
  async handleConnection(sessionId: string): Promise<void> {
    const context = this.contextManager.createContext(sessionId);

    // 启动空闲超时
    this.timeoutManager.startIdleTimer(sessionId);

    console.log(`[Server] Session ${sessionId} connected`);
  }

  /**
   * 处理请求
   */
  async handleRequest(sessionId: string, rawMessage: string): Promise<void> {
    // 重置空闲超时
    this.timeoutManager.resetTimer(sessionId);

    // 更新上下文
    this.contextManager.touch(sessionId);

    // 解析消息
    const message = this.protocol.parse(rawMessage);

    // 处理消息
    const response = await this.processMessage(sessionId, message);

    // 发送响应
    if (response) {
      await this.transport.send(response, sessionId);
    }
  }

  /**
   * 处理会话超时
   */
  private async handleSessionTimeout(sessionId: string): Promise<void> {
    console.log(`[Server] Session ${sessionId} timed out`);

    // 发送超时通知
    await this.transport.send(
      {
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Session timed out due to inactivity"
        }
      },
      sessionId
    );

    // 关闭会话
    await this.closeSession(sessionId);
  }

  /**
   * 关闭会话
   */
  async closeSession(sessionId: string): Promise<void> {
    // 清理订阅
    const subscriptions = this.contextManager.getSubscriptions(sessionId);
    for (const uri of subscriptions) {
      await this.resourcesManager.unsubscribe(uri, sessionId);
    }

    // 清理上下文
    this.contextManager.cleanupSession(sessionId);

    // 关闭会话
    this.sessionManager.closeSession(sessionId);

    // 取消超时
    this.timeoutManager.cancelTimer(sessionId);

    console.log(`[Server] Session ${sessionId} closed`);
  }
}
```

---

## 7. 本章小结

```
会话生命周期核心要点

会话概念
├── Client 与 Server 之间的一次完整通信过程
├── 包含连接建立、正常通信、连接关闭
├── 一个 Server 可以同时维护多个会话

状态机
├── CREATED → PENDING → READY → WORKING → CLOSED
└── 握手完成前不能处理业务请求

Session Manager
├── 创建/获取/关闭会话
├── 跟踪所有活跃会话
└── 生成唯一会话 ID

Session Context
├── 存储会话相关状态
├── 资源订阅、请求计数、元数据
└── 每个会话独立

多会话处理
├── Streamable HTTP 多会话通过 sessionId 隔离
├── 广播消息给所有/部分会话
└── 会话关闭时清理资源

超时管理
├── 空闲超时：长时间无活动自动关闭
└── 超时时通知 Client 并清理资源
```

---

## PART2-MCP-Server 完整总结

```
PART2-MCP-Server 完整内容
├── 01-server-architecture    架构设计、组件协作
├── 02-tool-definition         工具定义、inputSchema 设计
├── 03-resource-management     资源管理、订阅机制、缓存
├── 04-prompt-management       提示词模板、生成器
└── 05-session-lifecycle       会话管理、多会话处理、超时
```

---

## 下一步

继续阅读：
- [PART3-MCP-Client/01-client-architecture.md](../PART3-MCP-Client/01-client-architecture.md) — Client 架构设计
