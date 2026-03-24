# 连接管理与重连机制

> 本章目标：深入理解 MCP Client 的连接管理、重连策略、以及各种边界情况的处理。学完本章后，你应能实现一个健壮的 MCP Client 连接管理系统。

---

## 1. 连接生命周期详解

### 1.1 完整连接流程

```
┌──────────────────────────────────────────────────────────────────┐
│                      完整连接流程                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. 创建 Client                                                  │
│     new MCPClient() ──► DISCONNECTED                            │
│                                                                   │
│  2. 调用 connect()                                               │
│     connect() ──► CONNECTING                                    │
│                                                                   │
│  3. Transport 建立连接                                           │
│     stdio: 启动子进程                                           │
│     SSE: 建立 HTTP 连接                                          │
│                                                                   │
│  4. 发送 initialize                                              │
│     CONNECTING ──► INITIALIZING                                  │
│     ──── initialize ───────────────────► Server                │
│                                                                   │
│  5. 接收 initialize 响应                                        │
│     ◄──── { capabilities, serverInfo } ──── Server            │
│     ──── notifications/initialized ──────► Server             │
│                                                                   │
│  6. 连接就绪                                                    │
│     INITIALIZING ──► READY                                     │
│                                                                   │
│  7. 正常通信（READY 状态）                                       │
│     ──── tools/call ────────────────────► Server               │
│     ◄──── { result } ───────────────────────────────── Server│
│                                                                   │
│  8. 断开连接（主动或被动）                                       │
│     READY ──► CLOSED/DISCONNECTED                              │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 边界情况处理

```
┌─────────────────────────────────────────────────────────────┐
│                   边界情况                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  情况 1：Server 不响应 initialize                           │
│  ──────────────────────────────────────────────────────── │
│  超过 30 秒无响应                                          │
│  ──── 返回 TimeoutError ────                             │
│  ──── 自动关闭 Transport ────                            │
│                                                              │
│  情况 2：连接建立后立即断开                                  │
│  ──────────────────────────────────────────────────────── │
│  Transport 触发 close 事件                                  │
│  ──── 进入 RECONNECTING ────                             │
│  ──── 等待重连 ────                                      │
│                                                              │
│  情况 3：Server 返回错误                                     │
│  ──────────────────────────────────────────────────────── │
│  initialize 返回 error                                       │
│  ──── 解析错误 ────                                      │
│  ──── 关闭连接 ────                                      │
│                                                              │
│  情况 4：通信过程中网络中断                                  │
│  ──────────────────────────────────────────────────────── │
│  Transport 触发 error 事件                                  │
│  ──── 进入 RECONNECTING ────                             │
│  ──── 重连成功 ────► READY                               │
│  ──── 重连失败 ────► DISCONNECTED                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 重连策略

### 2.1 指数退避

重连时使用指数退避策略，避免频繁重连：

```typescript
// reconnect-strategy.ts

interface ReconnectStrategy {
  maxAttempts: number;      // 最大重连次数
  initialDelay: number;      // 初始延迟（毫秒）
  maxDelay: number;          // 最大延迟（毫秒）
  backoffMultiplier: number; // 退避乘数
}

class ExponentialBackoff {
  private attempt = 0;
  private strategy: ReconnectStrategy;

  constructor(strategy: Partial<ReconnectStrategy> = {}) {
    this.strategy = {
      maxAttempts: strategy.maxAttempts ?? 5,
      initialDelay: strategy.initialDelay ?? 1000,
      maxDelay: strategy.maxDelay ?? 30000,
      backoffMultiplier: strategy.backoffMultiplier ?? 2,
    };
  }

  /**
   * 计算下一次重连的延迟
   */
  getNextDelay(): number | null {
    if (this.attempt >= this.strategy.maxAttempts) {
      return null; // 超过最大次数
    }

    // 指数退避：initialDelay * multiplier^attempt
    const delay = Math.min(
      this.strategy.initialDelay * Math.pow(this.strategy.backoffMultiplier, this.attempt),
      this.strategy.maxDelay
    );

    // 添加随机抖动（±25%），避免多客户端同时重连
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return delay + jitter;
  }

  /**
   * 重置重连计数器
   */
  reset(): void {
    this.attempt = 0;
  }

  /**
   * 下一次重连
   */
  next(): boolean {
    this.attempt++;
    return this.attempt < this.strategy.maxAttempts;
  }

  get attemptCount(): number {
    return this.attempt;
  }
}

// 使用示例
const backoff = new ExponentialBackoff({
  maxAttempts: 5,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2
});

while (backoff.next()) {
  const delay = backoff.getNextDelay();
  console.log(`Reconnecting in ${delay?.toFixed(0)}ms...`);
  await sleep(delay!);
}

console.log("Max attempts reached");
```

### 2.2 重连状态机

```typescript
// reconnect-state-machine.ts

enum ReconnectState {
  IDLE = "idle",
  WAITING = "waiting",
  CONNECTING = "connecting",
  SUCCESS = "success",
  FAILED = "failed",
}

class ReconnectStateMachine {
  private state = ReconnectState.IDLE;
  private backoff: ExponentialBackoff;
  private reconnectHandler: () => Promise<void>;

  constructor(
    private maxTotalAttempts: number = 10,
    initialDelay: number = 1000,
    private onReconnecting?: (attempt: number) => void
  ) {
    this.backoff = new ExponentialBackoff({
      maxAttempts: maxTotalAttempts,
      initialDelay,
    });
  }

  /**
   * 开始重连流程
   */
  async start(reconnectHandler: () => Promise<void>): Promise<void> {
    this.reconnectHandler = reconnectHandler;

    while (true) {
      const delay = this.backoff.getNextDelay();

      if (delay === null) {
        this.state = ReconnectState.FAILED;
        return; // 放弃重连
      }

      this.state = ReconnectState.WAITING;
      this.onReconnecting?.(this.backoff.attemptCount);

      // 等待延迟
      await sleep(delay);

      // 尝试重连
      this.state = ReconnectState.CONNECTING;
      try {
        await this.reconnectHandler();
        this.backoff.reset();
        this.state = ReconnectState.SUCCESS;
        return; // 重连成功
      } catch (error) {
        console.error(`Reconnect attempt ${this.backoff.attemptCount} failed:`, error);

        if (!this.backoff.next()) {
          this.state = ReconnectState.FAILED;
          return; // 放弃重连
        }
      }
    }
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = ReconnectState.IDLE;
    this.backoff.reset();
  }

  isWaiting(): boolean {
    return this.state === ReconnectState.WAITING;
  }

  isConnecting(): boolean {
    return this.state === ReconnectState.CONNECTING;
  }

  isFailed(): boolean {
    return this.state === ReconnectState.FAILED;
  }
}
```

---

## 3. 心跳机制

### 3.1 为什么需要心跳？

```
问题场景：
Client ──── Request ────────────────────────► Server
                    （Server 处理需要 5 分钟）

Client 不知道 Server 是否还活着...

解决方案：心跳
Client ──── ping ──────────────────────────► Server
          ◄──── {} ────────────────────────────────── Server

Client ──── ping ──────────────────────────► Server
          ◄──── {} ────────────────────────────────── Server

超时则判定连接已断开，触发重连
```

### 3.2 心跳实现

```typescript
// heartbeat.ts

interface HeartbeatConfig {
  interval: number;       // 心跳间隔（毫秒）
  timeout: number;        // 超时时间（毫秒）
  maxMissed: number;      // 允许的最大 missed 心跳数
}

class Heartbeat {
  private timer: NodeJS.Timeout | null = null;
  private missedCount = 0;
  private isRunning = false;

  constructor(
    private config: HeartbeatConfig,
    private sendPing: () => Promise<void>,
    private onTimeout: () => void
  ) {}

  /**
   * 启动心跳
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.missedCount = 0;
    this.scheduleNext();
  }

  /**
   * 停止心跳
   */
  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * 收到 pong，记录一次成功
   */
  recordPong(): void {
    this.missedCount = 0;
  }

  private scheduleNext(): void {
    if (!this.isRunning) return;

    this.timer = setTimeout(async () => {
      await this.tick();
    }, this.config.interval);
  }

  private async tick(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const start = Date.now();
      await this.sendPing();

      // 简单的时间测量（实际应该等待响应）
      const elapsed = Date.now() - start;

      if (elapsed > this.config.timeout) {
        this.handleMissed();
      } else {
        this.recordPong();
      }
    } catch (error) {
      this.handleMissed();
    }

    this.scheduleNext();
  }

  private handleMissed(): void {
    this.missedCount++;

    if (this.missedCount >= this.config.maxMissed) {
      console.error("[Heartbeat] Max missed heartbeats reached");
      this.stop();
      this.onTimeout();
    } else {
      console.warn(`[Heartbeat] Missed heartbeat ${this.missedCount}/${this.config.maxMissed}`);
    }
  }
}

// 使用
const heartbeat = new Heartbeat(
  {
    interval: 30000,   // 每 30 秒一次
    timeout: 10000,    // 10 秒无响应算超时
    maxMissed: 3       // 连续 3 次超时则判定断开
  },
  async () => {
    await client.request("ping");
  },
  () => {
    // 超时处理：触发重连
    connectionManager.handleConnectionLost();
  }
);

heartbeat.start();
```

---

## 4. 连接池

### 4.1 为什么需要连接池？

```
无连接池：
Client ──── Request A ────────────► Server
Client ──── Request B ────────────► Server
Client ──── Request C ────────────► Server
         （每个请求独立连接，开销大）

有连接池：
Client ──── Pool ─────────────────► Server
              │
              ├── Request A ──► 连接 1
              ├── Request B ──► 连接 2
              └── Request C ──► 连接 3
         （复用连接，减少开销）
```

### 4.2 连接池实现

```typescript
// connection-pool.ts

interface PooledConnection {
  id: number;
  client: MCPClient;
  inUse: boolean;
  lastUsed: Date;
  createdAt: Date;
}

interface ConnectionPoolConfig {
  min: number;       // 最小连接数
  max: number;       // 最大连接数
  acquireTimeout: number; // 获取连接超时
  idleTimeout: number;   // 空闲超时
}

class ConnectionPool {
  private connections: PooledConnection[] = [];
  private waiting: Array<{
    resolve: (conn: MCPClient) => void;
    reject: (error: Error) => void;
  }> = [];
  private nextId = 1;

  constructor(
    private config: ConnectionPoolConfig,
    private factory: () => Promise<MCPClient>
  ) {}

  /**
   * 初始化连接池
   */
  async initialize(): Promise<void> {
    // 创建最小数量的连接
    const promises: Promise<void>[] = [];
    for (let i = 0; i < this.config.min; i++) {
      promises.push(this.createConnection());
    }
    await Promise.all(promises);
  }

  /**
   * 获取连接
   */
  async acquire(): Promise<MCPClient> {
    // 1. 找空闲连接
    const idle = this.connections.find((c) => !c.inUse);
    if (idle) {
      idle.inUse = true;
      idle.lastUsed = new Date();
      return idle.client;
    }

    // 2. 如果未达到最大，创建新连接
    if (this.connections.length < this.config.max) {
      const conn = await this.createConnection();
      conn.inUse = true;
      conn.lastUsed = new Date();
      return conn.client;
    }

    // 3. 等待空闲连接
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // 移除等待队列中的这一项
        const index = this.waiting.findIndex((w) => w.resolve === resolve);
        if (index !== -1) {
          this.waiting.splice(index, 1);
        }
        reject(new Error("Acquire connection timeout"));
      }, this.config.acquireTimeout);

      this.waiting.push({
        resolve: (client) => {
          clearTimeout(timeout);
          resolve(client);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
  }

  /**
   * 释放连接
   */
  release(client: MCPClient): void {
    const conn = this.connections.find((c) => c.client === client);
    if (!conn) return;

    conn.inUse = false;
    conn.lastUsed = new Date();

    // 如果有等待的请求，立即分配
    if (this.waiting.length > 0) {
      const waiter = this.waiting.shift()!;
      conn.inUse = true;
      waiter.resolve(client);
    }
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    // 拒绝新的等待请求
    for (const waiter of this.waiting) {
      waiter.reject(new Error("Pool closed"));
    }
    this.waiting = [];

    // 关闭所有连接
    await Promise.all(
      this.connections.map((c) => c.client.disconnect())
    );
    this.connections = [];
  }

  /**
   * 创建新连接
   */
  private async createConnection(): Promise<PooledConnection> {
    const client = await this.factory();
    const conn: PooledConnection = {
      id: this.nextId++,
      client,
      inUse: false,
      lastUsed: new Date(),
      createdAt: new Date(),
    };
    this.connections.push(conn);
    return conn;
  }

  /**
   * 清理空闲连接
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    const toRemove: PooledConnection[] = [];

    for (const conn of this.connections) {
      if (!conn.inUse && (now - conn.lastUsed.getTime()) > this.config.idleTimeout) {
        if (this.connections.length > this.config.min) {
          toRemove.push(conn);
        }
      }
    }

    for (const conn of toRemove) {
      await conn.client.disconnect();
      const index = this.connections.indexOf(conn);
      if (index !== -1) {
        this.connections.splice(index, 1);
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    idle: number;
    inUse: number;
    waiting: number;
  } {
    return {
      total: this.connections.length,
      idle: this.connections.filter((c) => !c.inUse).length,
      inUse: this.connections.filter((c) => c.inUse).length,
      waiting: this.waiting.length,
    };
  }
}
```

### 4.3 连接池使用

```typescript
// 使用示例
async function main() {
  const pool = new ConnectionPool(
    {
      min: 2,
      max: 10,
      acquireTimeout: 10000,
      idleTimeout: 60000,
    },
    async () => {
      const client = new MCPClient();
      await client.connect();
      return client;
    }
  );

  // 初始化
  await pool.initialize();

  // 使用连接
  const client = await pool.acquire();
  try {
    const tools = await client.listTools();
    console.log("Tools:", tools);
  } finally {
    pool.release(client);
  }

  // 关闭
  await pool.close();
}
```

---

## 5. 健康检查

### 5.1 健康检查接口

```typescript
// health-check.ts

interface HealthStatus {
  healthy: boolean;
  latency?: number;
  error?: string;
  checks: {
    connection: boolean;
    authenticated: boolean;
    toolsLoaded: boolean;
  };
}

class HealthChecker {
  private lastCheck: HealthStatus | null = null;

  constructor(private client: MCPClient) {}

  /**
   * 执行健康检查
   */
  async check(): Promise<HealthStatus> {
    const checks = {
      connection: false,
      authenticated: false,
      toolsLoaded: false,
    };

    try {
      // 1. 检查连接状态
      checks.connection = await this.checkConnection();

      // 2. 检查认证状态
      checks.authenticated = await this.checkAuthentication();

      // 3. 检查工具加载
      checks.toolsLoaded = await this.checkTools();

      const healthy = checks.connection && checks.authenticated && checks.toolsLoaded;

      this.lastCheck = {
        healthy,
        checks,
      };

      return this.lastCheck;
    } catch (error) {
      this.lastCheck = {
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
        checks,
      };
      throw this.lastCheck;
    }
  }

  private async checkConnection(): Promise<boolean> {
    const start = Date.now();
    await this.client.request("ping");
    this.lastCheck!.latency = Date.now() - start;
    return true;
  }

  private async checkAuthentication(): Promise<boolean> {
    // 检查是否已初始化
    return this.client.isReady();
  }

  private async checkTools(): Promise<boolean> {
    const tools = await this.client.listTools();
    return tools.length > 0;
  }

  getLastStatus(): HealthStatus | null {
    return this.lastCheck;
  }
}

// Express/Koa 健康检查端点
async function healthCheckHandler(ctx) {
  const checker = new HealthChecker(client);

  try {
    const status = await checker.check();
    ctx.status = status.healthy ? 200 : 503;
    ctx.body = status;
  } catch (error) {
    ctx.status = 503;
    ctx.body = {
      healthy: false,
      error: error.message,
    };
  }
}
```

---

## 6. 本章小结

```
连接管理核心要点

连接生命周期
├── DISCONNECTED → CONNECTING → INITIALIZING → READY
├── 握手失败 → DISCONNECTED
└── 连接断开 → RECONNECTING 或 DISCONNECTED

重连策略
├── 指数退避：delay * multiplier^attempt
├── 添加随机抖动避免同步
└── 最大重连次数限制

心跳机制
├── 定期 ping 保持连接活跃
├── 记录 pong 响应
├── 连续超时触发重连

连接池
├── 复用连接减少开销
├── 最小/最大连接数
├── 获取连接超时
└── 空闲连接清理

健康检查
├── 连接状态
├── 认证状态
└── 资源加载状态
```

---

## 下一步

继续阅读：
- [03-tool-discovery.md](03-tool-discovery.md) — 工具发现与调用
