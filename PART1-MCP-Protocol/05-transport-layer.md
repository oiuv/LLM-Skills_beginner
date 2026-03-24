# 传输层详解

> 本章目标：理解 MCP 的两种传输方式（stdio 和 SSE）的原理和实现细节。学完本章后，你应能根据场景选择合适的传输方式，并实现自己的传输层。

---

## 1. 为什么传输层要独立？

### 1.1 分层的好处

传输层负责把 JSON-RPC 消息从 A 点传到 B 点：

```
┌─────────────────────────────────────────────────────────────┐
│  应用层：tools/call, resources/read                        │
├─────────────────────────────────────────────────────────────┤
│  协议层：JSON-RPC 2.0 消息（{"jsonrpc":"2.0","id":1,...}）  │
├─────────────────────────────────────────────────────────────┤
│  传输层：stdio / SSE / WebSocket / 自定义                    │
└─────────────────────────────────────────────────────────────┘
```

**分层的意义**：
- 换传输方式时（如从 stdio 改成 SSE），不需要改上层代码
- 可以在传输层添加 TLS、压缩、重试等逻辑
- 测试时可以用 mock transport

### 1.2 MCP 支持的传输方式

| 传输方式 | 原理 | 适用场景 |
|---------|------|---------|
| **stdio** | 进程 stdin/stdout | 本地工具、CLI 工具 |
| **SSE** | HTTP POST + Server-Sent Events | 远程服务 |
| **WebSocket** | 双向流 | 实时通信（未来可能支持） |

MCP 官方规范只要求实现 stdio，其他都是可选的。

---

## 2. stdio 传输详解

### 2.1 stdio 的工作原理

stdio 是 Unix 系统的标准输入输出机制。MCP 用它来实现进程间通信：

```
┌─────────────────┐              ┌─────────────────┐
│                 │              │                 │
│   MCP Client    │ ═══════════► │   MCP Server    │
│   (父进程)      │    stdin     │   (子进程)      │
│                 │ ◄═══════════ │                 │
│                 │    stdout    │                 │
│                 │              │                 │
└─────────────────┘              └─────────────────┘
                 ◄═══════════
                    stderr
                  (错误日志)
```

**具体机制**：
- Client 启动 Server 作为子进程
- Client 通过 Server 的 stdin 发送请求
- Server 通过 stdout 返回响应
- stderr 用于日志输出（不走协议）

### 2.2 消息帧格式

stdio 传输的消息格式非常简单：**每行一个 JSON 对象**。

```
Client ──► Server:
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n

Server ──► Client:
{"jsonrpc":"2.0","id":1,"result":{"capabilities":{}}}\n
```

**为什么用行分隔？**
- stdin/stdout 是字节流，没有消息边界
- 用换行符分隔是最简单的方式
- 每个 JSON 对象本身就是一行（不跨行）

### 2.3 启动 Server 的方式

**方式 1：通过命令和参数**

```typescript
// Node.js 子进程
const { spawn } = require("child_process");

const server = spawn("node", ["./server.js"], {
  stdio: ["pipe", "pipe", "pipe"], // stdin, stdout, stderr
});

// 发送请求
server.stdin.write(JSON.stringify(request) + "\n");

// 接收响应
server.stdout.on("data", (data) => {
  const messages = data.toString().split("\n").filter(Boolean);
  for (const msg of messages) {
    const response = JSON.parse(msg);
    // 处理响应
  }
});
```

**方式 2：通过环境变量传递信息**

```typescript
// Server 端读取环境变量
const serverPath = process.env.MCP_SERVER_PATH;
const serverArgs = JSON.parse(process.env.MCP_SERVER_ARGS || "[]");

// 启动
const server = spawn(serverPath, serverArgs, {
  stdio: ["pipe", "pipe", "pipe"],
});
```

### 2.4 stdio 传输的 TypeScript 实现

**Transport 接口定义**：

```typescript
// transport.ts

/**
 * 传输层抽象接口
 */
interface Transport {
  /**
   * 连接传输层
   */
  connect(): Promise<void>;

  /**
   * 关闭传输层
   */
  close(): Promise<void>;

  /**
   * 发送消息
   */
  send(message: JSONRPCMessage): Promise<void>;

  /**
   * 注册消息处理器
   */
  onMessage(handler: (message: JSONRPCMessage) => void): void;

  /**
   * 注册错误处理器
   */
  onError(handler: (error: Error) => void): void;

  /**
   * 注册关闭处理器
   */
  onClose(handler: () => void): void;
}
```

**stdio 传输实现**：

```typescript
// stdio-transport.ts

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";

export class StdioTransport extends EventEmitter implements Transport {
  private process: ChildProcess | null = null;
  private messageHandler: ((message: JSONRPCMessage) => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private buffer = "";

  constructor(
    private command: string,
    private args: string[] = [],
    private env: Record<string, string> = {}
  ) {
    super();
  }

  /**
   * 启动 Server 进程
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 启动子进程
        this.process = spawn(this.command, this.args, {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, ...this.env },
        });

        const { stdin, stdout, stderr } = this.process;

        if (!stdin || !stdout) {
          reject(new Error("Failed to create stdio streams"));
          return;
        }

        // 处理 stdout（接收消息）
        stdout.on("data", (chunk: Buffer) => {
          this.handleData(chunk.toString());
        });

        // 处理 stderr（日志/错误）
        stderr.on("data", (chunk: Buffer) => {
          console.error("[Server]", chunk.toString());
        });

        // 处理进程错误
        this.process.on("error", (error) => {
          this.errorHandler?.(error);
        });

        // 处理进程关闭
        this.process.on("close", (code) => {
          this.closeHandler?.();
          if (code !== 0 && code !== null) {
            console.warn(`Server process exited with code ${code}`);
          }
        });

        // 进程启动成功
        stdin.on("open", () => {
          resolve();
        });

        // 超时处理
        setTimeout(() => {
          reject(new Error("Connection timeout"));
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 处理接收到的数据
   * 可能一次收到多个 JSON 对象（合并在一次 data 事件中）
   */
  private handleData(data: string): void {
    this.buffer += data;

    // 按换行符分割
    const lines = this.buffer.split("\n");
    // 最后一个可能是不完整的，放入 buffer
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.messageHandler?.(message);
        } catch (error) {
          console.error("Failed to parse JSON:", line);
        }
      }
    }
  }

  /**
   * 发送消息（加上换行符）
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error("Not connected");
    }

    const line = JSON.stringify(message) + "\n";
    return new Promise((resolve, reject) => {
      const canContinue = this.process!.stdin!.write(line, (error) => {
        if (error) reject(error);
        else resolve();
      });
      if (!canContinue) {
        // 缓冲区满了，等待 drain 事件
        this.process!.stdin!.once("drain", resolve);
      }
    });
  }

  /**
   * 注册消息处理器
   */
  onMessage(handler: (message: JSONRPCMessage) => void): void {
    this.messageHandler = handler;
  }

  /**
   * 注册错误处理器
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  /**
   * 注册关闭处理器
   */
  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
```

### 2.5 stdio 的优缺点

| 优点 | 缺点 |
|------|------|
| ✅ 实现简单 | ❌ 只能本地使用，不能跨网络 |
| ✅ 安全（无网络攻击面） | ❌ 只能 1 对 1 连接 |
| ✅ 低延迟 | ❌ Server 必须是进程（不能是服务） |
| ✅ 适合 CLI 工具 | ❌ 进程启动有开销 |

### 2.6 stdio 使用场景

```
适合用 stdio：
├── 本地文件操作工具
├── 本地数据库访问工具
├── CLI 工具封装（如 git、docker）
├── 需要隔离运行的工具（沙箱）

不适合用 stdio：
├── 需要被多个 Client 共用的服务
├── 需要跨机器访问的服务
├── 需要长连接的服务
└── 需要 WebSocket 的实时场景
```

---

## 3. SSE 传输详解

### 3.1 SSE 是什么？

SSE（Server-Sent Events）是一种基于 HTTP 的服务端推送技术。Server 可以通过 SSE 向 Client 推送消息，而 Client 通过 HTTP POST 发送请求。

**与 WebSocket 的区别**：

| | SSE | WebSocket |
|--|-----|-----------|
| 方向 | 单向（Server → Client） | 双向 |
| 连接 | HTTP/1.1 | 独立协议 |
| 重连 | 自动 | 手动处理 |
| 兼容性 | 较好 | 较好（但需要特殊处理） |
| MCP 支持 | ✅ 官方支持 | 待定 |

### 3.2 SSE 的工作原理

```
┌────────────────────────────────────────────────────────────────┐
│                       SSE 传输流程                              │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Client 建立 SSE 连接                                        │
│     Client ──── GET /sse ────────────────────────────────────► │
│                                                    Server       │
│                ◄─────── SSE Stream (Content-Type: text/event)  │
│                                                                 │
│  2. Server 返回一个 endpoint URL                               │
│     { "endpoint": "/mcp/23f8a2b3" }                            │
│                                                                 │
│  3. Client 通过 endpoint 发送请求                              │
│     Client ──── POST /mcp/23f8a2b3 ──────────────────────────► │
│               { "jsonrpc": "2.0", "id": 1, "method": "..." }  │
│                                                                 │
│  4. Server 通过 SSE 推送响应                                    │
│                ◄─────── event: message ──────────────────────── │
│                     data: {"id":1,"result":{...}}             │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 3.3 SSE 消息格式

**SSE 帧格式**：

```
event: message
data: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}

event: message
data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"..."}]}}

event: notification
data: {"jsonrpc":"2.0","method":"notifications/tools/list_changed"}
```

**SSE 事件类型**：

| 事件类型 | 说明 |
|---------|------|
| `message` | JSON-RPC 响应或通知 |
| `endpoint` | 新建 endpoint（用于多路复用） |
| `error` | 错误事件 |
| `close` | 连接关闭 |

### 3.4 SSE 传输的 TypeScript 实现

**服务端 SSE 处理**：

```typescript
// sse-server.ts

import { createServer, IncomingMessage, ServerResponse } from "http";

interface Session {
  id: string;
  response: ServerResponse;
}

export class SSEServer {
  private sessions = new Map<string, Session>();
  private requestHandler: (message: JSONRPCMessage) => Promise<JSONRPCResponse | null>;
  private server = createServer();

  constructor(requestHandler: (message: JSONRPCMessage) => Promise<JSONRPCResponse | null>) {
    this.requestHandler = requestHandler;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.server.on("request", async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);

      // SSE 连接端点
      if (url.pathname === "/sse") {
        await this.handleSSE(req, res);
        return;
      }

      // MCP 请求端点
      if (url.pathname.startsWith("/mcp/")) {
        await this.handleMCP(req, res, url.pathname.slice(5));
        return;
      }

      // 健康检查
      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      res.writeHead(404);
      res.end();
    });
  }

  /**
   * 处理 SSE 连接
   */
  private async handleSSE(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = this.generateSessionId();

    // 保存 session
    this.sessions.set(sessionId, { id: sessionId, response: res });

    // 设置 SSE 头
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // 发送 endpoint
    this.sendEvent(res, "endpoint", { endpoint: `/mcp/${sessionId}` });

    // 心跳保活
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30000);

    // 清理
    req.on("close", () => {
      clearInterval(heartbeat);
      this.sessions.delete(sessionId);
    });
  }

  /**
   * 处理 MCP 请求
   */
  private async handleMCP(req: IncomingMessage, res: ServerResponse, sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    // 读取请求体
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString();

    let request: JSONRPCRequest;
    try {
      request = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    // 处理请求
    const response = await this.requestHandler(request);

    // 通过 SSE 发送响应
    if (response) {
      this.sendEvent(session.response, "message", response);
    }

    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  }

  /**
   * 发送 SSE 事件
   */
  private sendEvent(response: ServerResponse, event: string, data: unknown): void {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * 向指定 session 发送消息（Server 主动推送）
   */
  sendToSession(sessionId: string, message: JSONRPCMessage): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sendEvent(session.response, "message", message);
    }
  }

  /**
   * 广播消息到所有 session
   */
  broadcast(message: JSONRPCMessage): void {
    for (const session of this.sessions.values()) {
      this.sendEvent(session.response, "message", message);
    }
  }

  private generateSessionId(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  listen(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        console.log(`SSE server listening on port ${port}`);
        resolve();
      });
    });
  }
}
```

**客户端 SSE 处理**：

```typescript
// sse-client.ts

import { EventSource, eventsourceloader } from "eventsource";

export class SSEClient implements Transport {
  private eventSource: EventSource | null = null;
  private endpoint: string = "";
  private sessionId: string = "";
  private messageHandler: ((message: JSONRPCMessage) => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private pendingRequests = new Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();
  private requestId = 0;

  constructor(private serverUrl: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 建立 SSE 连接
      this.eventSource = new EventSource(`${this.serverUrl}/sse`);

      this.eventSource.onerror = (error) => {
        this.errorHandler?.(new Error("SSE connection error"));
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.closeHandler?.();
        }
      };

      // 监听 endpoint 事件
      this.eventSource.addEventListener("endpoint", (event) => {
        const data = JSON.parse(event.data);
        this.endpoint = data.endpoint;
        this.sessionId = this.endpoint.split("/").pop() || "";
        resolve();
      });

      // 监听 message 事件
      this.eventSource.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      });

      // 超时
      setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 10000);
    });
  }

  /**
   * 处理收到的 JSON-RPC 消息
   */
  private handleMessage(message: JSONRPCMessage): void {
    // 有 id 的响应
    if ("id" in message && (message as JSONRPCResponse).result !== undefined) {
      const response = message as JSONRPCResponse;
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        pending.resolve(response.result);
        this.pendingRequests.delete(response.id);
      }
      return;
    }

    // 错误响应
    if ("id" in message && (message as JSONRPCResponse).error) {
      const response = message as JSONRPCResponse;
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        pending.reject(new Error(response.error?.message));
        this.pendingRequests.delete(response.id);
      }
      return;
    }

    // 通知（没有 id）
    this.messageHandler?.(message);
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.endpoint) {
      throw new Error("Not connected");
    }

    const id = ++this.requestId;

    // 如果是请求，保存回调
    if ("id" in message) {
      const request = message as JSONRPCRequest;
      const originalId = request.id;
      request.id = id;

      return new Promise((resolve, reject) => {
        this.pendingRequests.set(id, { resolve, reject });

        fetch(`${this.serverUrl}${this.endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        }).then((res) => {
          if (!res.ok) {
            reject(new Error(`HTTP ${res.status}`));
          }
          resolve();
        }).catch(reject);
      });
    } else {
      // 通知不需要等待响应
      await fetch(`${this.serverUrl}${this.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
    }
  }

  onMessage(handler: (message: JSONRPCMessage) => void): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  async close(): Promise<void> {
    this.eventSource?.close();
    this.eventSource = null;
  }
}
```

---

## 4. 传输层选择指南

### 4.1 选择 stdio 的场景

```
✅ 选 stdio 如果：
├── Server 是本地工具（文件操作、数据库等）
├── 不需要跨网络访问
├── 安全性要求高（不想暴露网络端口）
├── Server 是短期进程（每次调用启动一次）
└── 部署简单（不需要配置网络）

❌ 不选 stdio 如果：
├── Server 是长期运行的服务
├── 需要被多个 Client 同时连接
├── 需要跨机器部署
└── 需要 WebSocket 等高级特性
```

### 4.2 选择 SSE 的场景

```
✅ 选 SSE 如果：
├── Server 是远程服务
├── 需要被多个 Client 共用
├── Server 是长期运行的服务
├── 需要 Server 主动推送通知
└── 部署在有 HTTP 代理的环境

❌ 不选 SSE 如果：
├── Server 是本地工具
├── 只需要同步请求-响应
├── 网络条件差（SSE 有重连延迟）
└── 需要双向通信（WebSocket 更合适）
```

---

## 5. 传输层的高级特性

### 5.1 心跳保活

长时间空闲的连接可能被网络设备关闭，需要心跳保活：

**stdio 心跳**：
```typescript
// 通过 stderr 发送心跳（不经过协议）
process.stderr.write(": heartbeat\n");
```

**SSE 心跳**：
```typescript
// SSE 规范支持空行心跳
res.write(": heartbeat\n\n");
```

### 5.2 重连机制

**客户端重连逻辑**：

```typescript
class ReconnectingTransport implements Transport {
  private baseTransport: Transport;
  private maxRetries = 5;
  private retryDelay = 1000;

  async connect(): Promise<void> {
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        await this.baseTransport.connect();
        return;
      } catch (error) {
        retries++;
        if (retries >= this.maxRetries) throw error;

        // 指数退避
        const delay = this.retryDelay * Math.pow(2, retries - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
}
```

### 5.3 超时控制

```typescript
class TimeoutTransport implements Transport {
  constructor(
    private baseTransport: Transport,
    private defaultTimeout = 30000
  ) {}

  async send(message: JSONRPCMessage): Promise<void> {
    if ("id" in message) {
      const timeout = (message as JSONRPCRequest).params?._timeout ?? this.defaultTimeout;
      return Promise.race([
        this.baseTransport.send(message),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout)),
      ]);
    }
    return this.baseTransport.send(message);
  }
}
```

---

## 6. 本章小结

```
传输层核心要点

stdio 传输
├── 通过进程 stdin/stdout 通信
├── 每行一个 JSON 对象
├── 适合本地工具、CLI 工具
└── 安全、低延迟、但不能跨网络

SSE 传输
├── HTTP POST 发送请求
├── Server-Sent Events 接收响应
├── 适合远程服务、需要主动推送
└── 支持多 Client 共用一个 Server

选择原则
├── 本地工具 → stdio
├── 远程服务 → SSE
└── 实时双向 → WebSocket（未来）
```

---

## 下一步

继续阅读：
- [06-error-handling.md](06-error-handling.md) — 错误码体系与调试方法
