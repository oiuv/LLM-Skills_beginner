# Capability 能力协商机制

> 本章目标：理解 MCP 的 Capability 协商机制，这是 MCP 可扩展性的核心设计。学完本章后，你应能正确声明和检查 Capability，并根据 Capability 决定是否调用某些功能。

---

## 1. 为什么需要 Capability？

### 1.1 问题的引出

假设你写了一个 MCP Client，连接到一个天气 Server：

```
Client                                          Server
  │                                              │
  │ ──── initialize ──────────────────────────► │
  │                                              │
  │ ◄─── { tools: { subscribe: true } } ───── │  ← Server 说它支持订阅
  │                                              │
```

**等等**：`subscribe` 是什么字段？Client 怎么知道 Server 支持哪些功能？

如果没有 Capability 机制：
- Client 可能尝试调用 Server 不支持的方法 → 报错
- Server 可能收到未知方法的调用 → 不知道怎么处理

### 1.2 Capability 的解决方案

Capability 是 Server 在握手时**主动声明**自己支持哪些功能：

```typescript
// Server 声明
{
  "capabilities": {
    "tools": {},           // 支持工具
    "resources": {
      "subscribe": true    // 支持资源订阅
    },
    "prompts": {}         // 支持提示词
  }
}
```

Client 收到后就知道：
- ✅ 可以调用 `tools/call`（因为 `capabilities.tools` 存在）
- ✅ 可以订阅资源（因为 `capabilities.resources.subscribe = true`）
- ❌ 不能调用 `resources/subscribe`（因为 `capabilities.resources.subscribe` 是 `undefined`）

### 1.3 Capability 的设计原则

| 原则 | 说明 |
|------|------|
| **显式声明** | 没有声明的能力，默认不支持 |
| **向后兼容** | 新版本添加能力，不影响旧版本 Client |
| **双向协商** | Client 声明自己的能力，Server 也声明自己的能力 |

---

## 2. 握手时的 Capability 交换

### 2.1 完整握手流程

```
Client                                                      Server
  │                                                           │
  │ ──── initialize ───────────────────────────────────────► │
  │     capabilities: {                                       │
  │       roots: { listChanged: true },                      │  ← Client 声明
  │       sampling: {}                                       │
  │     }                                                     │
  │     protocolVersion: "2024-11-05"                        │
  │     clientInfo: { name: "my-agent", version: "1.0.0" }   │
  │                                                           │
  │ ◄─── initialize result ───────────────────────────────── │
  │     capabilities: {                                      │  ← Server 声明
  │       tools: {},                                          │
  │       resources: { subscribe: true }                     │
  │     }                                                     │
  │     protocolVersion: "2024-11-05"                        │
  │     serverInfo: { name: "weather-server", version: "1.0.0" }
  │                                                           │
  │ ──── notifications/initialized ────────────────────────► │  ← 握手完成
  │                                                           │
```

### 2.2 交换 Capability 的意义

**Client 声明 Capability 的场景**：

| Capability | 说明 |
|-----------|------|
| `roots.listChanged` | Client 支持接收根目录变更通知 |
| `sampling` | Client 支持 Server 请求 LLM 采样 |

**Server 声明 Capability 的场景**：

| Capability | 说明 |
|-----------|------|
| `tools` | Server 提供工具能力 |
| `tools.listChanged` | Server 支持工具列表变更通知 |
| `resources.subscribe` | Server 支持资源订阅 |
| `resources.listChanged` | Server 支持资源列表变更通知 |
| `prompts` | Server 提供提示词能力 |
| `prompts.listChanged` | Server 支持提示词列表变更通知 |

### 2.3 为什么双方都要声明 Capability？

**场景 1：采样功能**

Server 说"我想让 AI 帮我生成一段文字"，但 Client 说"我不支持采样"，那 Server 就不应该调用 `sampling/createMessage`。

```
Server: "我支持 sampling"
Client: "我不支持 sampling"
结果：Server 不能请求采样
```

**场景 2：根目录功能**

Client 说"我想让你知道我的文件根目录在哪里"，Server 说"我不支持 roots.listChanged"，那 Client 就不会监听根目录变更通知。

```
Client: "我会告诉你根目录变化"
Server: "我没有 roots.listChanged"
结果：Client 不会监听根目录变更
```

---

## 3. Client Capabilities 详解

### 3.1 ClientCapabilities 结构

```typescript
interface ClientCapabilities {
  /**
   * 文件系统根目录支持
   */
  roots?: {
    /**
     * 是否支持接收根目录变更通知
     * 如果为 true，Server 会发送 notifications/roots/list_changed
     */
    listChanged?: boolean;
  };

  /**
   * 采样支持
   * 如果存在此字段，表示 Client 支持 Server 请求 LLM 采样
   */
  sampling?: {};
}
```

### 3.2 roots 详解

**roots 是什么**：文件系统的根目录列表。

**为什么需要**：让 Server 知道可以访问哪些文件路径。

```typescript
// Client 声明 roots
{
  "capabilities": {
    "roots": {
      "listChanged": true
    }
  }
}

// Server 收到后，会先发送当前的根目录
// 之后如果根目录变化，Server 会发送 notifications/roots/list_changed
{
  "method": "notifications/roots/list_changed"
}
```

**使用场景**：
- 文件系统 MCP Server 需要知道去哪里找文件
- IDE 插件 MCP Server 需要知道项目根目录

### 3.3 sampling 详解

**sampling 是什么**：Server 反向请求 AI 生成内容的能力。

**为什么需要**：某些 Server 收到数据后，需要 AI 帮忙处理（如总结、翻译）。

```typescript
// Client 声明支持采样
{
  "capabilities": {
    "sampling": {}
  }
}

// Server 收到后，可以请求 Client 让 LLM 生成内容
{
  "method": "sampling/createMessage",
  "params": {
    "messages": [...],
    "systemPrompt": "你是一个翻译助手",
    "maxTokens": 1000
  }
}
```

---

## 4. Server Capabilities 详解

### 4.1 ServerCapabilities 结构

```typescript
interface ServerCapabilities {
  /**
   * 工具能力
   * 如果存在此字段，表示 Server 提供工具
   */
  tools?: {
    /**
     * 是否支持工具列表变更通知
     */
    listChanged?: boolean;
  };

  /**
   * 资源能力
   */
  resources?: {
    /**
     * 是否支持资源订阅
     */
    subscribe?: boolean;

    /**
     * 是否支持资源列表变更通知
     */
    listChanged?: boolean;
  };

  /**
   * 提示词能力
   */
  prompts?: {
    /**
     * 是否支持提示词列表变更通知
     */
    listChanged?: boolean;
  };

  /**
   * 采样能力
   * 如果存在此字段，表示 Server 可以请求采样
   */
  sampling?: {};
}
```

### 4.2 tools 详解

```typescript
// Server 声明提供工具
{
  "capabilities": {
    "tools": {}
    // 或带 listChanged
    "tools": {
      "listChanged": true
    }
  }
}
```

**工具能力的影响**：

| 字段 | 影响 |
|------|------|
| `tools`（存在） | Client 可以调用 `tools/list` 和 `tools/call` |
| `tools.listChanged` | Server 可能发送 `notifications/tools/list_changed` |

### 4.3 resources 详解

```typescript
// Server 声明提供资源
{
  "capabilities": {
    "resources": {
      "subscribe": true,   // 支持订阅
      "listChanged": true // 支持列表变更通知
    }
  }
}
```

**资源能力的影响**：

| 字段 | 影响 |
|------|------|
| `resources`（存在） | Client 可以调用 `resources/list` 和 `resources/read` |
| `resources.subscribe` | Client 可以调用 `resources/subscribe` 和 `resources/unsubscribe` |
| `resources.listChanged` | Server 可能发送 `notifications/resources/list_changed` |

### 4.4 prompts 详解

```typescript
// Server 声明提供提示词
{
  "capabilities": {
    "prompts": {
      "listChanged": true
    }
  }
}
```

**提示词能力的影响**：

| 字段 | 影响 |
|------|------|
| `prompts`（存在） | Client 可以调用 `prompts/list` 和 `prompts/get` |
| `prompts.listChanged` | Server 可能发送 `notifications/prompts/list_changed` |

### 4.5 完整的 Server Capabilities 示例

```json
{
  "capabilities": {
    "tools": {
      "listChanged": true
    },
    "resources": {
      "subscribe": true,
      "listChanged": true
    },
    "prompts": {
      "listChanged": true
    }
  }
}
```

这个 Server：
- ✅ 提供工具（支持列表变更通知）
- ✅ 提供资源（支持订阅和列表变更通知）
- ✅ 提供提示词（支持列表变更通知）
- ❌ 不支持采样
- ❌ 不需要 roots

---

## 5. Capability 检查的实现

### 5.1 Client 端检查

```typescript
// capability-checker.ts

class CapabilityChecker {
  private serverCapabilities: ServerCapabilities = {};

  /**
   * 从 Server 握手响应中提取 Capability
   */
  setServerCapabilities(capabilities: ServerCapabilities): void {
    this.serverCapabilities = capabilities;
  }

  /**
   * 检查 Server 是否支持某个能力
   */
  hasToolCapability(): boolean {
    return this.serverCapabilities.tools !== undefined;
  }

  hasResourceCapability(): boolean {
    return this.serverCapabilities.resources !== undefined;
  }

  hasPromptCapability(): boolean {
    return this.serverCapabilities.prompts !== undefined;
  }

  /**
   * 检查是否支持资源订阅
   */
  supportsResourceSubscribe(): boolean {
    return this.serverCapabilities.resources?.subscribe === true;
  }

  /**
   * 检查是否支持工具列表变更通知
   */
  supportsToolListChanged(): boolean {
    return this.serverCapabilities.tools?.listChanged === true;
  }

  /**
   * 检查是否支持采样
   */
  supportsSampling(): boolean {
    return this.serverCapabilities.sampling !== undefined;
  }

  /**
   * 检查 Client 是否支持采样请求
   */
  clientSupportsSampling(clientCapabilities: ClientCapabilities): boolean {
    return clientCapabilities.sampling !== undefined;
  }
}
```

### 5.2 安全的调用模式

```typescript
// safe-caller.ts

class SafeMCPClient {
  private checker = new CapabilityChecker();

  async callTool(name: string, args: object): Promise<ToolResult> {
    // 1. 先检查是否有工具能力
    if (!this.checker.hasToolCapability()) {
      throw new Error("Server does not support tools");
    }

    // 2. 调用工具
    const result = await this.tools.call(name, args);
    return result;
  }

  async subscribeToResource(uri: string): Promise<void> {
    // 1. 先检查是否支持订阅
    if (!this.checker.supportsResourceSubscribe()) {
      throw new Error("Server does not support resource subscription");
    }

    // 2. 订阅资源
    await this.resources.subscribe(uri);
  }
}
```

### 5.3 Server 端 Capability 声明

```typescript
// server-capabilities.ts

/**
 * 根据 Server 配置构建 Capability
 */
function buildServerCapabilities(config: ServerConfig): ServerCapabilities {
  const capabilities: ServerCapabilities = {};

  // 总是提供工具能力
  if (config.tools?.length > 0) {
    capabilities.tools = {
      listChanged: config.notifyToolChanges ?? false,
    };
  }

  // 如果有资源，提供资源能力
  if (config.resources?.length > 0) {
    capabilities.resources = {
      subscribe: config.enableSubscribe ?? false,
      listChanged: config.notifyResourceChanges ?? false,
    };
  }

  // 如果有提示词，提供提示词能力
  if (config.prompts?.length > 0) {
    capabilities.prompts = {
      listChanged: config.notifyPromptChanges ?? false,
    };
  }

  // 只有明确启用时才提供采样能力
  if (config.enableSampling) {
    capabilities.sampling = {};
  }

  return capabilities;
}
```

---

## 6. 能力协商的版本兼容

### 6.1 版本协商规则

```typescript
// version-negotiation.ts

/**
 * 协议版本协商算法
 */
function negotiateVersion(
  clientVersion: string,
  serverVersion: string
): string | null {
  // 1. 完全相同，直接使用
  if (clientVersion === serverVersion) {
    return clientVersion;
  }

  // 2. 解析版本号
  const client = parseVersion(clientVersion);
  const server = parseVersion(serverVersion);

  // 3. 主版本不同，不兼容
  if (client.major !== server.major) {
    return null;
  }

  // 4. 主版本相同，使用较低的次版本（向后兼容）
  const minMinor = Math.min(client.minor, server.minor);
  return `${client.major}.${minMinor}.0`;
}

function parseVersion(version: string): { major: number; minor: number; patch: number } {
  const [major, minor, patch] = version.split(".").map(Number);
  return { major, minor, patch };
}
```

**版本兼容性规则**：

| 变更类型 | 兼容性 | 说明 |
|---------|--------|------|
| 主版本变更 | ❌ 不兼容 | 破坏性变更 |
| 次版本变更 | ✅ 兼容 | 新增能力，旧 Client 不受影响 |
| 补丁版本变更 | ✅ 兼容 | Bug 修复 |

### 6.2 向后兼容的实际例子

**场景**：Client 是 1.0.0，Server 是 1.1.0

```
Client: "我用的是 1.0.0"
Server: "我用 1.1.0，但我可以在 1.0.0 模式下工作"
协商结果：使用 1.0.0
```

**场景**：Client 是 1.1.0，Server 是 1.0.0

```
Client: "我用的是 1.1.0"
Server: "我用 1.0.0"
协商结果：使用 1.0.0（Client 使用 1.0.0 兼容模式）
```

**场景**：Client 是 2.0.0，Server 是 1.0.0

```
Client: "我用的是 2.0.0"
Server: "我用 1.0.0"
协商结果：失败（主版本不兼容）
```

### 6.3 能力降级处理

当版本不匹配时，Client 应该：

```typescript
// graceful-degradation.ts

async function connectWithGracefulDegradation(
  clientVersion: string,
  serverVersion: string
): Promise<Connection> {
  // 1. 尝试版本协商
  const agreedVersion = negotiateVersion(clientVersion, serverVersion);

  if (agreedVersion === null) {
    throw new Error(`Version mismatch: client ${clientVersion}, server ${serverVersion}`);
  }

  // 2. 如果版本不同，发出警告
  if (agreedVersion !== clientVersion) {
    console.warn(`Version downgrade: ${clientVersion} → ${agreedVersion}`);
  }

  // 3. 根据协商后的版本，确定可用能力
  const capabilities = await performHandshake(agreedVersion);

  // 4. 返回带有能力限制的连接
  return new Connection({
    version: agreedVersion,
    capabilities,
    // 过滤掉不支持的能力
    availableMethods: filterAvailableMethods(capabilities),
  });
}
```

---

## 7. 能力变更通知

### 7.1 为什么要通知能力变更？

工具、资源、提示词可能动态变化（如 Server 热更新配置），Client 需要知道变化并更新本地缓存。

```
没有通知：Client 不知道工具列表变了，可能调用已不存在的工具
有通知：Server 主动推送变化，Client 重新获取列表
```

### 7.2 工具列表变更通知

```json
// Server 发送
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/list_changed"
}
```

**Client 收到后应该**：
1. 重新调用 `tools/list`
2. 更新本地工具缓存
3. 如果 LLM 正在使用旧列表，可能需要重新规划

### 7.3 资源列表/内容变更通知

```json
// Server 发送
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/list_changed"
}
```

```json
// Server 发送（订阅的资源有更新）
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "uri": "file:///data/user.json"
  }
}
```

### 7.4 完整的事件处理实现

```typescript
// event-handler.ts

class MCPServerEventHandler {
  private client: MCPClient;

  constructor(client: MCPClient) {
    this.client = client;
    this.setupNotificationHandlers();
  }

  private setupNotificationHandlers(): void {
    // 工具列表变更
    this.client.on("notifications/tools/list_changed", async () => {
      console.log("Tools changed, refreshing...");
      await this.client.refreshToolsList();
    });

    // 资源列表变更
    this.client.on("notifications/resources/list_changed", async () => {
      console.log("Resources changed, refreshing...");
      await this.client.refreshResourcesList();
    });

    // 特定资源更新（需要先订阅）
    this.client.on("notifications/resources/updated", async (params) => {
      console.log(`Resource ${params.uri} updated`);
      // 决定是否重新读取
    });
  }

  /**
   * 订阅所有可能变更的资源
   */
  async subscribeToAllResources(): Promise<void> {
    const resources = await this.client.listResources();

    for (const resource of resources) {
      // 检查是否支持订阅
      if (this.client.supportsResourceSubscribe()) {
        await this.client.subscribeResource(resource.uri);
      }
    }
  }
}
```

---

## 8. 最佳实践

### 8.1 Server 端最佳实践

**✅ 正确声明 Capability**

```typescript
// 正确：只声明你真正支持的能力
{
  "capabilities": {
    "tools": {},  // 正确：你提供工具
    // 不声明 sampling，如果你不支持的话
  }
}
```

**✅ 如果能力会变化，声明 listChanged**

```typescript
{
  "capabilities": {
    "tools": {
      "listChanged": true  // 如果工具列表会动态变化
    }
  }
}
```

**✅ 向后兼容**

```typescript
// 当添加新能力时，确保旧版本 Client 仍然能工作
{
  "capabilities": {
    "tools": {},
    "newFeature": {},  // 新能力，旧 Client 忽略它
  }
}
```

### 8.2 Client 端最佳实践

**✅ 总是检查 Capability**

```typescript
// 错误：直接调用
await client.callTool("subscribe", {...});

// 正确：先检查
if (client.supportsResourceSubscribe()) {
  await client.subscribeResource(uri);
} else {
  // 降级处理或提示用户
}
```

**✅ 监听变更通知**

```typescript
// 设置监听
client.on("notifications/tools/list_changed", async () => {
  await client.refreshToolsList();
});
```

**✅ 缓存 + 失效机制**

```typescript
class ToolCache {
  private cache = new Map<string, Tool>();
  private dirty = false;

  async getTool(name: string): Promise<Tool | null> {
    if (this.dirty) {
      await this.refresh();
    }
    return this.cache.get(name) ?? null;
  }

  invalidate(): void {
    this.dirty = true;
  }

  private async refresh(): Promise<void> {
    const tools = await client.listTools();
    this.cache.clear();
    for (const tool of tools) {
      this.cache.set(tool.name, tool);
    }
    this.dirty = false;
  }
}
```

---

## 9. 本章小结

```
Capability 核心要点

握手时交换
├── Client 声明自己的能力（roots、sampling）
└── Server 声明自己的能力（tools、resources、prompts）

Server Capabilities
├── tools: 提供工具能力
│   └── listChanged: 支持工具列表变更通知
├── resources: 提供资源能力
│   ├── subscribe: 支持资源订阅
│   └── listChanged: 支持资源列表变更通知
└── prompts: 提供提示词能力
    └── listChanged: 支持提示词列表变更通知

Client Capabilities
├── roots.listChanged: 支持根目录变更通知
└── sampling: 支持采样请求

使用原则
├── 没有声明的能力 = 不支持
├── 总是先检查再调用
└── 监听变更通知并更新缓存
```

---

## 下一步

继续阅读：
- [05-transport-layer.md](05-transport-layer.md) — stdio 和 SSE 传输层实现
- [06-error-handling.md](06-error-handling.md) — 错误码体系与调试方法
