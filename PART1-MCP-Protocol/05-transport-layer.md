# 传输层详解

> 本章目标：理解 MCP 的两种传输方式（stdio 和 Streamable HTTP）的原理和实现细节。学完本章后，你应能根据场景选择合适的传输方式，并实现自己的传输层。

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
│  传输层：stdio / Streamable HTTP / WebSocket / 自定义                    │
└─────────────────────────────────────────────────────────────┘
```

**分层的意义**：
- 换传输方式时（如从 stdio 改成 Streamable HTTP），不需要改上层代码
- 可以在传输层添加 TLS、压缩、重试等逻辑
- 测试时可以用 mock transport

### 1.2 MCP 支持的传输方式

| 传输方式 | 原理 | 适用场景 |
|---------|------|---------|
| **stdio** | 进程 stdin/stdout | 本地工具、CLI 工具 |
| **Streamable HTTP** | HTTP POST + 流式响应 | 远程服务 |

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

## 3. Streamable HTTP 传输详解

### 3.1 什么是 Streamable HTTP？

Streamable HTTP 是 MCP 官方推荐的远程传输方式，结合了 HTTP 请求-响应模型和流式响应能力。Server 可以通过分块传输编码（chunked transfer encoding）向 Client 推送消息。

**核心特性**：

| 特性 | 说明 |
|------|------|
| **请求-响应** | Client 通过 HTTP POST 发送请求 |
| **流式响应** | Server 通过 chunked transfer encoding 返回响应 |
| **服务器推送** | Server 可以主动推送通知到 Client |
| **会话恢复** | 支持断线重连后的会话恢复（Resumability） |
| **协议头** | 支持版本协商和元数据传递 |

### 3.2 Streamable HTTP 的工作原理

```
┌────────────────────────────────────────────────────────────────┐
│                   Streamable HTTP 传输流程                      │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Client 发送请求到 /mcp 端点                                │
│     Client ──── POST /mcp ──────────────────────────────────► │
│               Content-Type: application/json                    │
│               Accept: application/json, text/event-stream      │
│               { "jsonrpc": "2.0", "id": 1, "method": "..." }  │
│                                                                 │
│  2. Server 开始流式响应                                         │
│     ◄─── Transfer-Encoding: chunked ────────────────────────── │
│     ◄─── 0010{"jsonrpc":"2.0","id":1,...} ─────────────────── │
│     ◄─── 0011{"jsonrpc":"2.0","method":"notif",...} ────────── │
│     ◄─── 0000 (chunked terminator) ────────────────────────── │
│                                                                 │
│  3. Server 主动推送通知                                         │
│     ◄─── 0020{"jsonrpc":"2.0","method":"notifications/..."} ── │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 3.3 HTTP Header 约定（2026-07-28 版本）

> **2026-07-28 变更**：移除了 `MCP-Session-Id` 头部，MCP 变为无状态协议。添加了 `MCP-Protocol-Version` 头部。

**请求头**：

| Header | 说明 |
|--------|------|
| `Content-Type` | 必须为 `application/json` |
| `Accept` | 客户端支持的响应格式 |
| `MCP-Protocol-Version` | 协议版本（如 `2026-07-28`） |
| `Mcp-Method` | 请求方法名（标准头部） |
| `Mcp-Name` | 工具名称（调用工具时） |

**响应头**：

| Header | 说明 |
|--------|------|
| `Content-Type` | 响应内容类型 |
| `Transfer-Encoding` | `chunked`（流式响应时） |

### 3.4 流式响应格式

**单次响应**：

```
HTTP/1.1 200 OK
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"result":{"resultType":"complete","tools":[...]}}
```

**流式响应**（streaming）：

```
HTTP/1.1 200 OK
Content-Type: application/json
Transfer-Encoding: chunked

0010{"jsonrpc":"2.0","id":1,
0010"result":{"resultType":"complete","tools":[...]}}
0000
```

### 3.5 无状态模型（2026-07-28）

> **2026-07-28 变更**：移除了会话恢复机制（`Last-Event-ID`、SSE 事件 ID）。MCP 变为无状态协议，断开连接后需重新发送请求。

Streamable HTTP 是无状态的，每个请求独立处理：

```typescript
// 无状态请求示例
async function callTool(toolName: string, args: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {}
        }
      }
    }),
  });
  return response.json();
}
```
      id: 1,
    }),
  });

  if (response.ok) {
    console.log("Session resumed");
  } else {
    console.log("Session expired, creating new session");
  }
}
```

### 3.6 Streamable HTTP 的 TypeScript 实现

**服务端实现**：

```typescript
// http-server.ts

import { createServer, IncomingMessage, ServerResponse } from "http";

interface Session {
  id: string;
  response: ServerResponse;
}

export class StreamableHTTPServer {
  private sessions = new Map<string, Session>();
  private requestHandler: (message: JSONRPCMessage) => Promise<JSONRPCResponse | null>;

  constructor(requestHandler: (message: JSONRPCMessage) => Promise<JSONRPCResponse | null>) {
    this.requestHandler = requestHandler;
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // 设置 CORS 头
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, MCP-Session-Id");

    // 处理 CORS 预检
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // 只允许 POST
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }

    // 读取请求体
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString();

    let request: JSONRPCMessage;
    try {
      request = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: -32700, message: "Parse error" } }));
      return;
    }

    // 生成或获取会话 ID
    const sessionId = this.getOrCreateSessionId(req);
    const isStreaming = req.headers.accept?.includes("text/event-stream");

    if (isStreaming) {
      await this.handleStreamingRequest(req, res, sessionId, request);
    } else {
      await this.handleTraditionalRequest(req, res, request);
    }
  }

  private async handleTraditionalRequest(
    req: IncomingMessage,
    res: ServerResponse,
    request: JSONRPCMessage
  ): Promise<void> {
    const response = await this.requestHandler(request);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }

  private async handleStreamingRequest(
    req: IncomingMessage,
    res: ServerResponse,
    sessionId: string,
    request: JSONRPCMessage
  ): Promise<void> {
    // 保存 session 用于后续推送
    this.sessions.set(sessionId, { id: sessionId, response: res });

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
      "MCP-Session-Id": sessionId,
    });

    // 处理请求并分块发送响应
    const response = await this.requestHandler(request);
    if (response) {
      const responseText = JSON.stringify(response);
      res.write(responseText.length.toString(16).padStart(4, "0"));
      res.write(responseText);
    }

    // 发送 chunked terminator
    res.write("0000");
    res.end();
  }

  /**
   * 向指定 session 发送推送消息
   */
  sendNotification(sessionId: string, notification: JSONRPCNotification): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const text = JSON.stringify(notification);
      session.response.write(text.length.toString(16).padStart(4, "0"));
      session.response.write(text);
    }
  }

  private getOrCreateSessionId(req: IncomingMessage): string {
    const existingId = req.headers["mcp-session-id"];
    if (typeof existingId === "string") {
      return existingId;
    }
    return Math.random().toString(36).slice(2, 10);
  }
}
```

**客户端实现**：

```typescript
// http-client.ts

export class StreamableHTTPClient implements Transport {
  private baseUrl: string;
  private sessionId: string | null = null;
  private messageHandler: ((message: JSONRPCMessage) => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private pendingRequests = new Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async connect(): Promise<void> {
    // Streamable HTTP 不需要预连接，延迟到发送第一个请求
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const id = "id" in message ? (message as JSONRPCRequest).id : null;

    if (id !== null && id !== undefined) {
      return new Promise((resolve, reject) => {
        this.pendingRequests.set(id, { resolve, reject });

        this.sendRequest(message).catch(reject);
      });
    } else {
      // 通知不需要等待响应
      await this.sendRequest(message);
    }
  }

  private async sendRequest(message: JSONRPCMessage): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    };

    if (this.sessionId) {
      headers["MCP-Session-Id"] = this.sessionId;
    }

    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 检查是否有 session ID
    const newSessionId = response.headers.get("MCP-Session-Id");
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    // 处理流式响应
    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.includes("text/event-stream")) {
      await this.handleStreamingResponse(response);
    } else {
      const result = await response.json();
      if ("id" in result && result.id !== undefined) {
        const pending = this.pendingRequests.get(result.id);
        if (pending) {
          if (result.error) {
            pending.reject(new Error(result.error.message));
          } else {
            pending.resolve(result.result);
          }
          this.pendingRequests.delete(result.id);
        }
      }
    }
  }

  private async handleStreamingResponse(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        buffer = this.processBuffer(buffer);
      }
    } finally {
      reader.releaseLock();
    }
  }

  private processBuffer(buffer: string): string {
    // 处理 chunked 编码: size + content
    while (buffer.length >= 4) {
      const sizeHex = buffer.substring(0, 4);
      const size = parseInt(sizeHex, 16);

      if (size === 0) {
        // chunked terminator
        this.closeHandler?.();
        return "";
      }

      const totalSize = 4 + size;
      if (buffer.length < totalSize) break;

      const content = buffer.substring(4, totalSize);
      buffer = buffer.substring(totalSize);

      try {
        const message = JSON.parse(content);
        this.handleMessage(message);
      } catch {
        // 忽略解析错误
      }
    }

    return buffer;
  }

  private handleMessage(message: JSONRPCMessage): void {
    if ("id" in message) {
      const response = message as JSONRPCResponse;
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        if (response.error) {
          pending.reject(new Error(response.error.message));
        } else {
          pending.resolve(response.result);
        }
        this.pendingRequests.delete(response.id);
      }
    } else {
      this.messageHandler?.(message);
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
    this.sessionId = null;
  }
}
```

### 3.7 选择 Streamable HTTP 的场景

```
✅ 选 Streamable HTTP 如果：
├── Server 是远程服务
├── 需要被多个 Client 共用
├── Server 是长期运行的服务
├── 需要 Server 主动推送通知
└── 需要会话恢复能力

❌ 不选 Streamable HTTP 如果：
├── Server 是本地工具
├── 只需要同步请求-响应
└── 部署简单（stdio 更适合）
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

### 4.2 选择 Streamable HTTP 的场景

```
✅ 选 Streamable HTTP 如果：
├── Server 是远程服务
├── 需要被多个 Client 共用
├── Server 是长期运行的服务
├── 需要 Server 主动推送通知
└── 部署在有 HTTP 代理的环境

❌ 不选 Streamable HTTP 如果：
├── Server 是本地工具
├── 只需要同步请求-响应
├── 网络条件差（Streamable HTTP 有重连延迟）
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

**HTTP 心跳**：
```typescript
// HTTP 长连接需要保活，可以通过发送空的 chunked 块
// 或者发送一个空的 JSON-RPC 通知
res.write("0000"); // chunked terminator (空内容)
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

Streamable HTTP 传输
├── HTTP POST 发送请求
├── Server-Sent Events 接收响应
├── 适合远程服务、需要主动推送
└── 支持多 Client 共用一个 Server

选择原则
├── 本地工具 → stdio
├── 远程服务 → Streamable HTTP
└── 实时双向 → WebSocket（未来）
```

---

## 下一步

继续阅读：
- [06-error-handling.md](06-error-handling.md) — 错误码体系与调试方法
