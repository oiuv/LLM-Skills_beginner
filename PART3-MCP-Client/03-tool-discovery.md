# 工具发现与调用

> 本章目标：掌握 MCP Client 如何发现 Server 的工具、如何调用工具、以及如何处理调用结果。学完本章后，你应能实现一个完整的工具发现和调用系统。

---

## 1. 工具发现流程

### 1.1 发现时机

```
┌─────────────────────────────────────────────────────────────┐
│                    工具发现时机                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 连接成功后自动发现                                       │
│     connect() ──► handshake ──► tools/list ──► 缓存工具  │
│                                                              │
│  2. 收到 list_changed 通知后刷新                             │
│     Server ─── notifications/tools/list_changed ──► 重新发现│
│                                                              │
│  3. 手动刷新                                                 │
│     client.refreshTools() ──► tools/list ──► 更新缓存       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 工具缓存

```typescript
// tool-cache.ts

interface Tool {
  name: string;
  description: string;
  inputSchema: InputSchema;
}

interface ToolCache {
  tools: Map<string, Tool>;
  lastUpdated: Date | null;
  version?: string;
}

class ToolCacheManager {
  private cache: ToolCache = {
    tools: new Map(),
    lastUpdated: null,
  };

  /**
   * 更新缓存
   */
  update(tools: Tool[]): void {
    this.cache.tools.clear();
    this.cache.lastUpdated = new Date();

    for (const tool of tools) {
      this.cache.tools.set(tool.name, tool);
    }
  }

  /**
   * 获取工具
   */
  get(name: string): Tool | undefined {
    return this.cache.tools.get(name);
  }

  /**
   * 获取所有工具
   */
  getAll(): Tool[] {
    return Array.from(this.cache.tools.values());
  }

  /**
   * 检查缓存是否为空
   */
  isEmpty(): boolean {
    return this.cache.tools.size === 0;
  }

  /**
   * 获取缓存信息
   */
  getInfo(): { count: number; lastUpdated: Date | null } {
    return {
      count: this.cache.tools.size,
      lastUpdated: this.cache.lastUpdated,
    };
  }
}
```

---

## 2. 工具调用详解

### 2.1 调用流程

```
┌──────────────────────────────────────────────────────────────────┐
│                      工具调用完整流程                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Client 发送请求                                              │
│     Client ──── tools/call ─────────────────────────────────► │
│                 {                                               │
│                   "name": "get_weather",                       │
│                   "arguments": { "city": "北京" }              │
│                 }                                                │
│                                                                   │
│  2. Server 处理请求                                              │
│     Server ─── 验证参数 ───► 执行 handler ───► 返回结果         │
│                                                                   │
│  3. Client 接收响应                                              │
│     ◄────── { ──────────────────────────────────────────── │
│               "content": [                                     │
│                 { "type": "text", "text": "北京：晴，25°C" }  │
│               ]                                                 │
│             }                                                    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 工具调用代码

```typescript
// tool-caller.ts

interface ToolCallOptions {
  timeout?: number;
  retry?: number;
}

interface ToolResult {
  content: Content[];
  isError?: boolean;
}

interface Content {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

class ToolCaller {
  constructor(
    private client: MCPClient,
    private cacheManager: ToolCacheManager
  ) {}

  /**
   * 调用工具
   */
  async call(
    name: string,
    args?: Record<string, unknown>,
    options: ToolCallOptions = {}
  ): Promise<ToolResult> {
    // 1. 检查工具是否存在
    const tool = this.cacheManager.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    // 2. 验证参数
    this.validateArgs(tool, args);

    // 3. 调用（可重试）
    const maxRetries = options.retry ?? 0;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeCall(name, args, options.timeout);
        return result;
      } catch (error) {
        lastError = error as Error;

        // 判断是否应该重试
        if (!this.shouldRetry(error, attempt, maxRetries)) {
          throw error;
        }

        console.log(`Retrying tool call (attempt ${attempt + 1}/${maxRetries})...`);
        await this.delay(1000 * Math.pow(2, attempt)); // 指数退避
      }
    }

    throw lastError!;
  }

  private async executeCall(
    name: string,
    args: Record<string, unknown> | undefined,
    timeout?: number
  ): Promise<ToolResult> {
    return this.client.request<ToolResult>("tools/call", {
      name,
      arguments: args || {},
    }, { timeout });
  }

  /**
   * 验证参数
   */
  private validateArgs(tool: Tool, args: Record<string, unknown> | undefined): void {
    const { required = [] } = tool.inputSchema;

    // 检查必需参数
    for (const field of required) {
      if (args === undefined || !(field in args)) {
        throw new Error(`Missing required argument: ${field}`);
      }
    }
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: Error, attempt: number, maxRetries: number): boolean {
    if (attempt >= maxRetries) return false;

    // 网络错误、超时错误可以重试
    if (error.message.includes("timeout") || error.message.includes("ECONNRESET")) {
      return true;
    }

    // 其他错误不重试
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

---

## 3. 批量调用

### 3.1 并行调用

```typescript
// parallel-tool-caller.ts

interface BatchCallResult {
  name: string;
  success: boolean;
  result?: ToolResult;
  error?: Error;
}

class ParallelToolCaller {
  constructor(private toolCaller: ToolCaller) {}

  /**
   * 并行调用多个工具
   */
  async callAll(
    calls: Array<{ name: string; args?: Record<string, unknown> }>,
    options: { concurrency?: number } = {}
  ): Promise<BatchCallResult[]> {
    const concurrency = options.concurrency ?? 5;

    // 使用信号量控制并发
    const semaphore = new Semaphore(concurrency);

    const promises = calls.map((call) =>
      semaphore.acquire().then(async () => {
        try {
          const result = await this.toolCaller.call(call.name, call.args);
          return {
            name: call.name,
            success: true,
            result,
          } as BatchCallResult;
        } catch (error) {
          return {
            name: call.name,
            success: false,
            error: error as Error,
          } as BatchCallResult;
        } finally {
          semaphore.release();
        }
      })
    );

    return Promise.all(promises);
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

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.permits++;

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.permits--;
      next();
    }
  }
}
```

### 3.2 链式调用

```typescript
// chained-tool-caller.ts

interface ChainedCall {
  name: string;
  args?: Record<string, unknown>;
  // 从上一步结果中提取参数
  extractFrom?: {
    step: number;           // 参考第几步的结果（从 0 开始）
    path: string;           // JSON path，如 "result.0.text"
  };
}

class ChainedToolCaller {
  constructor(private toolCaller: ToolCaller) {}

  /**
   * 链式调用多个工具
   * 前一步的结果可以传递给后一步
   */
  async callChain(
    calls: ChainedCall[]
  ): Promise<Array<{ step: number; result: ToolResult | Error }>> {
    const results: Array<{ step: number; result: ToolResult | Error }> = [];
    const context: Record<string, unknown> = {};

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      let args = call.args || {};

      // 如果需要从上下文提取参数
      if (call.extractFrom) {
        const prevResult = results[call.extractFrom.step];
        if (prevResult && "result" in prevResult) {
          const extracted = this.extractValue(
            prevResult.result,
            call.extractFrom.path
          );
          args = { ...args, ...extracted };
        }
      }

      try {
        const result = await this.toolCaller.call(call.name, args);
        results.push({ step: i, result });

        // 将结果存入上下文
        context[`step_${i}`] = result;
      } catch (error) {
        results.push({ step: i, result: error as Error });
        // 链式调用中任何一步失败都停止
        break;
      }
    }

    return results;
  }

  private extractValue(obj: unknown, path: string): Record<string, unknown> {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return {};
      }

      // 处理数组索引
      const match = part.match(/^(\w+)\[(\d+)\]$/);
      if (match) {
        current = (current as Record<string, unknown>)[match[1]];
        if (Array.isArray(current)) {
          current = current[parseInt(match[2])];
        }
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return typeof current === "object" ? current as Record<string, unknown> : {};
  }
}

// 使用示例
const chainCaller = new ChainedToolCaller(toolCaller);

const results = await chainCaller.callChain([
  { name: "get_location" },                                          // 第 0 步
  { name: "get_weather", args: { units: "metric" }, extractFrom: { step: 0, path: "result.content[0].text" } },  // 第 1 步
  { name: "send_notification", args: { message: "天气已更新" }, extractFrom: { step: 1, path: "result" } }  // 第 2 步
]);
```

---

## 4. 工具调用结果处理

### 4.1 结果类型处理

```typescript
// result-handler.ts

type ResultHandler = (content: Content) => Promise<string>;

const defaultHandlers: Record<string, ResultHandler> = {
  text: async (content: Content) => {
    return content.text || "";
  },

  image: async (content: Content) => {
    // 下载或处理图片
    const data = content.data; // base64
    const mimeType = content.mimeType || "image/png";
    // 可以保存到文件、返回 URL 等
    return `[Image: ${mimeType}, ${data.length} bytes]`;
  },

  resource: async (content: Content) => {
    // 处理资源引用
    const resource = content.resource;
    if (resource?.text) return resource.text;
    if (resource?.uri) return `[Resource: ${resource.uri}]`;
    return "[Empty Resource]";
  },
};

class ResultHandler {
  constructor(private handlers: Record<string, ResultHandler> = defaultHandlers) {}

  /**
   * 处理工具调用结果
   */
  async handle(result: ToolResult): Promise<string> {
    if (result.isError) {
      return this.handleError(result);
    }

    const outputs: string[] = [];

    for (const content of result.content) {
      const handler = this.handlers[content.type];
      if (handler) {
        outputs.push(await handler(content));
      } else {
        outputs.push(`[Unknown content type: ${content.type}]`);
      }
    }

    return outputs.join("\n");
  }

  private handleError(result: ToolResult): string {
    // 工具返回了错误结果
    const errorText = result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    return `Error: ${errorText}`;
  }
}

// 使用
const handler = new ResultHandler();

for (const call of calls) {
  const result = await toolCaller.call(call.name, call.args);
  const text = await handler.handle(result);
  console.log(`${call.name} result:`, text);
}
```

### 4.2 流式结果处理

```typescript
// streaming-result.ts

class StreamingToolCaller {
  constructor(private client: MCPClient) {}

  /**
   * 调用工具并流式处理进度
   */
  async *callWithProgress(
    name: string,
    args?: Record<string, unknown>
  ): AsyncGenerator<{
    type: "start" | "progress" | "complete" | "error";
    data?: unknown;
  }> {
    yield { type: "start", data: { name, args } };

    try {
      // 发送请求
      const result = await this.client.request<ToolResult>("tools/call", {
        name,
        arguments: args || {},
      });

      yield { type: "progress", data: result };

      // 处理结果
      for (const content of result.content) {
        if (content.type === "text") {
          yield { type: "progress", data: { text: content.text } };
        }
      }

      yield { type: "complete", data: result };
    } catch (error) {
      yield { type: "error", data: error };
    }
  }
}

// 使用
const streamer = new StreamingToolCaller(client);

for await (const event of streamer.callWithProgress("process_file", { path: "/data.csv" })) {
  switch (event.type) {
    case "start":
      console.log("开始处理...");
      break;
    case "progress":
      console.log("进度:", event.data);
      break;
    case "complete":
      console.log("处理完成:", event.data);
      break;
    case "error":
      console.error("处理失败:", event.data);
      break;
  }
}
```

---

## 5. 完整工具管理器

### 5.1 统一接口

```typescript
// tool-manager.ts

interface ToolInfo {
  name: string;
  description: string;
  inputSchema: InputSchema;
}

interface ToolManagerConfig {
  autoRefresh?: boolean;     // 自动刷新
  refreshInterval?: number;  // 刷新间隔
  cacheEnabled?: boolean;   // 启用缓存
}

class ToolManager {
  private cache: ToolCacheManager;
  private caller: ToolCaller;
  private parallelCaller: ParallelToolCaller;
  private config: ToolManagerConfig;

  constructor(client: MCPClient, config: ToolManagerConfig = {}) {
    this.config = {
      autoRefresh: config.autoRefresh ?? false,
      refreshInterval: config.refreshInterval ?? 300000,
      cacheEnabled: config.cacheEnabled ?? true,
    };

    this.cache = new ToolCacheManager();
    this.caller = new ToolCaller(client, this.cache);
    this.parallelCaller = new ParallelToolCaller(this.caller);
  }

  /**
   * 发现工具（从 Server 获取）
   */
  async discover(): Promise<Tool[]> {
    const response = await this.client.request<{ tools: Tool[] }>("tools/list");
    this.cache.update(response.tools);
    return response.tools;
  }

  /**
   * 获取所有工具
   */
  getTools(): Tool[] {
    return this.cache.getAll();
  }

  /**
   * 获取单个工具
   */
  getTool(name: string): Tool | undefined {
    return this.cache.get(name);
  }

  /**
   * 调用单个工具
   */
  async call(
    name: string,
    args?: Record<string, unknown>,
    options?: ToolCallOptions
  ): Promise<ToolResult> {
    return this.caller.call(name, args, options);
  }

  /**
   * 并行调用多个工具
   */
  async callAll(
    calls: Array<{ name: string; args?: Record<string, unknown> }>,
    options?: { concurrency?: number }
  ): Promise<BatchCallResult[]> {
    return this.parallelCaller.callAll(calls, options);
  }

  /**
   * 链式调用
   */
  async callChain(calls: ChainedCall[]): Promise<Array<{ step: number; result: ToolResult | Error }>> {
    const chainCaller = new ChainedToolCaller(this.caller);
    return chainCaller.callChain(calls);
  }

  /**
   * 刷新工具列表
   */
  async refresh(): Promise<Tool[]> {
    return this.discover();
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    return this.cache.get(name) !== undefined;
  }

  /**
   * 获取缓存信息
   */
  getCacheInfo(): { count: number; lastUpdated: Date | null } {
    return this.cache.getInfo();
  }
}
```

---

## 6. 本章小结

```
工具发现与调用核心要点

工具发现
├── 连接成功后自动发现
├── 监听 list_changed 通知刷新
└── 手动调用 refresh()

工具缓存
├── Map<string, Tool> 存储
├── lastUpdated 跟踪更新时间
└── isEmpty() 判断是否需要发现

工具调用
├── 验证参数
├── 发送 tools/call 请求
└── 处理响应结果

批量调用
├── 并行调用（信号量控制并发）
└── 链式调用（结果传递）

结果处理
├── text / image / resource 类型处理
├── 错误结果处理
└── 流式结果处理
```

---

## PART3 总结

```
PART3-MCP-Client 完整内容
├── 01-client-architecture    Client 架构、组件协作
├── 02-connection-management   连接管理、重连、心跳、连接池
└── 03-tool-discovery          工具发现、调用、批量调用
```

---

## 下一步

继续阅读：
- [PART4-Skills-System/01-skills-specification.md](../PART4-Skills-System/01-skills-specification.md) — Skills 规范详解
