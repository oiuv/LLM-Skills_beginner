# 资源管理详解

> 本章目标：掌握 MCP 资源的概念、管理方式、以及订阅机制。学完本章后，你应能正确地暴露资源给 Client，并实现资源的动态更新通知。

---

## 1. 资源与工具的区别

### 1.1 核心区别

资源（Resources）和工具（Tools）都是为了给 AI 提供外部能力，但它们有本质区别：

| 特性 | Tool | Resource |
|------|------|-----------|
| **行为** | 执行动作（查询、计算、发送...） | 读取数据 |
| **副作用** | 有（可能修改外部状态） | 无（只读） |
| **返回** | 执行结果 | 文件/数据内容 |
| **类比** | 函数调用 `doSomething()` | 文件读取 `readFile()` |
| **缓存** | 不缓存，每次都执行 | 可以缓存 |

### 1.2 何时用 Tool，何时用 Resource？

**用 Tool**：
- 需要执行 API 调用
- 需要计算或处理数据
- 操作有副作用（写入、发送等）
- 每次调用结果可能不同

**用 Resource**：
- 暴露配置文件
- 提供知识库文档
- 返回静态或半静态数据
- 让 AI 能够引用和搜索内容

### 1.3 具体场景对比

```
场景：用户想看自己的个人信息

用 Tool：
  - AI 调用 get_user_info()
  - Tool 查询数据库返回用户信息
  - ✓ 适合需要实时数据的场景

用 Resource：
  - AI 调用 resources/read("user://profile")
  - 返回预先定义好的用户资料结构
  - ✓ 适合让 AI 理解用户档案的结构

场景：让 AI 分析一份文档

用 Resource：
  - AI 调用 resources/read("file:///docs/report.pdf")
  - ✓ 直接返回文档内容让 AI 处理

用 Tool：
  - AI 调用 analyze_document(fileId="xxx")
  - ✓ 如果需要文档处理逻辑（如 OCR、解析）
```

---

## 2. 资源结构

### 2.1 资源定义要素

```
┌─────────────────────────────────────────────────────────────┐
│                       Resource                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. URI（统一资源标识符）                                     │
│     └── 资源的唯一地址，格式如 file:///path                  │
│                                                              │
│  2. Metadata（元数据）                                       │
│     └── name: 资源名称                                       │
│     └── title: 人类可读的标题                               │
│     └── description: 资源描述                                │
│     └── mimeType: 数据类型                                   │
│     └── icons: 图标（emoji 或图片 URL）                      │
│     └── annotations: 标注信息                                │
│                                                              │
│  3. Content（内容）                                          │
│     └── text: 文本内容                                       │
│     └── blob: 二进制内容（base64）                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 静态资源

静态资源的内容是预先定义好的，不会在运行时变化：

```typescript
interface Resource {
  uri: string;
  name: string;
  title?: string;           // 人类可读的标题
  description?: string;
  mimeType?: string;
  icons?: Content[];        // 图标
  annotations?: {          // 标注信息
    prompt?: string;
    [key: string]: unknown;
  };
  content?: {
    text?: string;
    blob?: string;
  };
}

const configResource: Resource = {
  uri: "config://app/settings",
  name: "app_settings",
  title: "应用设置",
  description: "当前应用的配置信息",
  mimeType: "application/json",
  icons: [{ type: "text", text: "⚙️" }],
  annotations: {
    prompt: "当用户询问应用设置或偏好时引用"
  },
  content: {
    text: JSON.stringify({
      theme: "dark",
      language: "zh-CN",
      notifications: true
    })
  }
};
```

### 2.3 动态资源

动态资源的内容在每次读取时都可能变化：

```typescript
const systemInfoResource: Resource = {
  uri: "system://info",
  name: "系统信息",
  description: "当前系统运行状态",
  mimeType: "application/json",
  // 注意：这里没有 content，内容在 read 时实时生成
};

// resources/read handler
async handleRead(request: JSONRPCRequest): Promise<JSONRPCResponse> {
  const { uri } = request.params;

  if (uri === "system://info") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: os.loadavg()
          })
        }]
      }
    };
  }

  throw MCPError.resourceNotFound(uri);
}
```

---

## 3. 资源 URI 设计

### 3.1 URI 格式

MCP 资源使用 URI（统一资源标识符）来唯一标识：

```
scheme://authority/path?query#fragment
```

**MCP 常用的 scheme**：

| Scheme | 含义 | 示例 |
|--------|------|------|
| `file` | 本地文件 | `file:///data/user.json` |
| `config` | 配置资源 | `config://app/theme` |
| `system` | 系统信息 | `system://memory` |
| `git` | Git 仓库 | `git://repo/owner/name` |
| `db` | 数据库 | `db://users/123` |
| `api` | API 资源 | `api://github/user` |

### 3.2 URI 设计最佳实践

**✅ 好的 URI 设计**：

```typescript
// 清晰的层级结构
"file:///users/{userId}/profile"
"config://app/database/host"
"git://github/anthropic/modelcontextprotocol"

// 描述性强
"resource://documentation/getting-started"
"resource://knowledge-base/faq/shipping"
```

**❌ 差的 URI 设计**：

```typescript
// 含义不清
"file:///data/1"
"config://a"

// 缺少 scheme
"users/123/profile"
```

### 3.3 URI 模板

URI 模板允许 Client 使用变量来构建 URI：

```typescript
const templateResource = {
  uriTemplate: "git://repo/{owner}/{name}",
  name: "github_repo",
  title: "GitHub 仓库",
  description: "访问指定 GitHub 仓库信息",
  mimeType: "application/json",
  icons: [{ type: "text", text: "🐙" }],
  annotations: {
    prompt: "当用户询问 GitHub 仓库信息时使用"
  }
};
```

Client 获取模板后，可以这样使用：

```json
// Client 请求
{
  "method": "resources/read",
  "params": {
    "uri": "git://repo/anthropic/modelcontextprotocol"
  }
}
```

### 3.4 资源分页支持

当资源数量较多时，`resources/list` 支持分页：

```json
// 请求（带分页参数）
{
  "method": "resources/list",
  "params": {
    "cursor": "eyJpZCI6MTIzfQ==",
    "limit": 50
  }
}

// 响应
{
  "resources": [...],
  "nextCursor": "eyJpZCI6MTczfQ=="
}
```

---

## 4. 资源管理实现

### 4.1 Resources Manager

```typescript
// resources-manager.ts

interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

class ResourcesManager {
  // 静态资源注册表
  private resources = new Map<string, Resource & { content: ResourceContent }>();

  // 动态资源处理器
  private dynamicHandlers = new Map<string, (uri: string) => Promise<ResourceContent>>();

  // 资源模板
  private templates = new Map<string, ResourceTemplate>();

  // 订阅管理
  private subscriptions = new Map<string, Set<string>>(); // uri → sessionIds

  /**
   * 注册静态资源
   */
  register(resource: Resource & { content: { text?: string; blob?: string } }): void {
    this.resources.set(resource.uri, resource);
  }

  /**
   * 注册动态资源处理器
   */
  registerDynamic(
    uriPattern: string,
    handler: (uri: string) => Promise<ResourceContent>
  ): void {
    this.dynamicHandlers.set(uriPattern, handler);
  }

  /**
   * 注册 URI 模板
   */
  registerTemplate(template: ResourceTemplate): void {
    this.templates.set(template.uriTemplate, template);
  }

  /**
   * 处理 resources/list 请求
   */
  handleList(request: JSONRPCRequest): JSONRPCResponse {
    const resources = Array.from(this.resources.values()).map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    }));

    const resourceTemplates = Array.from(this.templates.values());

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        resources,
        ...(resourceTemplates.length > 0 && { resourceTemplates })
      }
    };
  }

  /**
   * 处理 resources/read 请求
   */
  async handleRead(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const { uri } = request.params;

    // 1. 先查找静态资源
    const staticResource = this.resources.get(uri);
    if (staticResource) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          contents: [staticResource.content]
        }
      };
    }

    // 2. 查找动态资源处理器
    for (const [pattern, handler] of this.dynamicHandlers) {
      if (this.matchUriPattern(uri, pattern)) {
        const content = await handler(uri);
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: { contents: [content] }
        };
      }
    }

    // 3. 都没找到
    throw MCPError.resourceNotFound(uri);
  }

  /**
   * 处理资源订阅
   */
  async handleSubscribe(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const { uri } = request.params;
    const sessionId = request.params._sessionId; // 从上下文中获取

    if (!this.subscriptions.has(uri)) {
      this.subscriptions.set(uri, new Set());
    }
    this.subscriptions.get(uri)!.add(sessionId);

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {}
    };
  }

  /**
   * 发送资源更新通知
   */
  async notifyUpdate(uri: string, newContent: ResourceContent): void {
    const subs = this.subscriptions.get(uri);
    if (!subs || subs.size === 0) return;

    // 更新缓存
    const resource = this.resources.get(uri);
    if (resource) {
      resource.content = newContent;
    }

    // 通知所有订阅者
    for (const sessionId of subs) {
      await this.sendNotification(sessionId, {
        method: "notifications/resources/updated",
        params: { uri }
      });
    }
  }

  private matchUriPattern(uri: string, pattern: string): boolean {
    // 简单的模式匹配，支持 * 通配符
    const regex = new RegExp(
      "^" + pattern.replace(/\*/g, "[^/]+") + "$"
    );
    return regex.test(uri);
  }
}
```

### 4.2 使用示例

```typescript
// 创建 Resources Manager
const resourcesManager = new ResourcesManager();

// 注册静态配置资源
resourcesManager.register({
  uri: "config://app/theme",
  name: "应用主题",
  description: "当前应用的主题配置",
  mimeType: "application/json",
  content: {
    text: JSON.stringify({ theme: "dark", primaryColor: "#007AFF" })
  }
});

// 注册用户信息资源
resourcesManager.register({
  uri: "config://user/profile",
  name: "用户资料",
  description: "当前登录用户的信息",
  mimeType: "application/json",
  content: {
    text: JSON.stringify({ name: "张三", email: "zhangsan@example.com" })
  }
});

// 注册动态系统资源
resourcesManager.registerDynamic("system://*", async (uri) => {
  const metric = uri.replace("system://", "");
  const value = await getSystemMetric(metric);
  return {
    uri,
    mimeType: "application/json",
    text: JSON.stringify({ metric, value, timestamp: Date.now() })
  };
});

// 注册 GitHub 仓库模板
resourcesManager.registerTemplate({
  uriTemplate: "git://github/{owner}/{repo}",
  name: "GitHub 仓库",
  description: "访问 GitHub 仓库信息",
  mimeType: "application/json"
});
```

---

## 5. 资源订阅机制

### 5.1 为什么需要订阅？

如果没有订阅，Client 只能：
- 定期轮询资源（浪费资源）
- 不知道资源何时变化

有了订阅机制：
- Server 在资源变化时主动通知
- Client 可以及时更新缓存
- 大幅降低无效请求

### 5.2 订阅流程

```
Client                                          Server
  │                                              │
  │ ──── resources/subscribe ──────────────────► │  订阅资源
  │                                              │
  │ ◄──── { } ────────────────────────────────── │  确认订阅成功
  │                                              │
  │              ... 资源发生变化 ...              │
  │                                              │
  │ ◄──── notifications/resources/updated ────── │  推送更新通知
  │       { "uri": "config://app/theme" }         │
  │                                              │
  │ ──── resources/read ────────────────────────► │  读取最新内容
  │                                              │
  │ ◄──── { contents: [...] } ────────────────── │  返回最新数据
  │                                              │
```

### 5.3 订阅实现

```typescript
// subscription.ts

class SubscriptionManager {
  private subscriptions = new Map<string, {
    uri: string;
    sessionId: string;
    subscribedAt: Date;
    lastNotified?: Date;
  }>();

  private subscriberNotifier: (sessionId: string, notification: JSONRPCNotification) => Promise<void>;

  constructor(notifier: (sessionId: string, notification: JSONRPCNotification) => Promise<void>) {
    this.subscriberNotifier = notifier;
  }

  /**
   * 订阅资源
   */
  async subscribe(uri: string, sessionId: string): Promise<void> {
    const key = `${sessionId}:${uri}`;

    this.subscriptions.set(key, {
      uri,
      sessionId,
      subscribedAt: new Date()
    });

    console.log(`Session ${sessionId} subscribed to ${uri}`);
  }

  /**
   * 取消订阅
   */
  async unsubscribe(uri: string, sessionId: string): Promise<void> {
    const key = `${sessionId}:${uri}`;
    this.subscriptions.delete(key);

    console.log(`Session ${sessionId} unsubscribed from ${uri}`);
  }

  /**
   * 获取资源的订阅者
   */
  getSubscribers(uri: string): string[] {
    const subscribers: string[] = [];

    for (const [key, sub] of this.subscriptions) {
      if (sub.uri === uri) {
        subscribers.push(sub.sessionId);
      }
    }

    return subscribers;
  }

  /**
   * 通知资源更新
   */
  async notifyUpdate(uri: string): Promise<void> {
    const subscribers = this.getSubscribers(uri);

    for (const sessionId of subscribers) {
      await this.subscriberNotifier(sessionId, {
        jsonrpc: "2.0",
        method: "notifications/resources/updated",
        params: { uri }
      });

      // 更新最后通知时间
      const key = `${sessionId}:${uri}`;
      const sub = this.subscriptions.get(key);
      if (sub) {
        sub.lastNotified = new Date();
      }
    }
  }

  /**
   * 清理会话的所有订阅
   */
  cleanupSession(sessionId: string): void {
    for (const [key, sub] of this.subscriptions) {
      if (sub.sessionId === sessionId) {
        this.subscriptions.delete(key);
      }
    }
  }
}
```

### 5.4 实际使用场景

**场景：配置文件更新通知**

```typescript
class ConfigFileWatcher {
  private subscriptionManager: SubscriptionManager;
  private configPath = "/app/config.json";

  constructor(subscriptionManager: SubscriptionManager) {
    this.subscriptionManager = subscriptionManager;

    // 监听文件变化
    fs.watch(this.configPath, async (eventType) => {
      if (eventType === "change") {
        // 通知所有订阅者
        await this.subscriptionManager.notifyUpdate(`file://${this.configPath}`);
      }
    });
  }
}
```

---

## 6. 资源缓存

### 6.1 为什么需要缓存？

- 减少重复的资源读取/计算
- 降低对后端系统的压力
- 提高 Client 获取资源的速度

### 6.2 缓存实现

```typescript
// resource-cache.ts

interface CacheEntry {
  content: ResourceContent;
  cachedAt: number;
  expiresAt: number;
}

class ResourceCache {
  private cache = new Map<string, CacheEntry>();
  private defaultTTL = 60000; // 默认 60 秒

  /**
   * 获取缓存
   */
  get(uri: string): ResourceContent | null {
    const entry = this.cache.get(uri);

    if (!entry) return null;

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(uri);
      return null;
    }

    return entry.content;
  }

  /**
   * 设置缓存
   */
  set(uri: string, content: ResourceContent, ttl?: number): void {
    const now = Date.now();
    this.cache.set(uri, {
      content,
      cachedAt: now,
      expiresAt: now + (ttl ?? this.defaultTTL)
    });
  }

  /**
   * 使缓存失效
   */
  invalidate(uri: string): void {
    this.cache.delete(uri);
  }

  /**
   * 按前缀使缓存失效
   */
  invalidatePrefix(prefix: string): void {
    for (const uri of this.cache.keys()) {
      if (uri.startsWith(prefix)) {
        this.cache.delete(uri);
      }
    }
  }

  /**
   * 清理所有过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    for (const [uri, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(uri);
      }
    }
  }
}
```

### 6.3 带缓存的 Resources Manager

```typescript
class CachedResourcesManager extends ResourcesManager {
  private cache = new ResourceCache();

  constructor(
    private baseManager: ResourcesManager,
    private cacheTTL = 60000
  ) {
    super();
  }

  async handleRead(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const { uri } = request.params;

    // 1. 先查缓存
    const cached = this.cache.get(uri);
    if (cached) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: { contents: [cached] }
      };
    }

    // 2. 缓存未命中，查实际资源
    const response = await this.baseManager.handleRead(request);

    // 3. 存入缓存
    if (response.result.contents[0]) {
      this.cache.set(uri, response.result.contents[0], this.cacheTTL);
    }

    return response;
  }

  /**
   * 资源更新时清除缓存
   */
  async notifyUpdate(uri: string): Promise<void> {
    this.cache.invalidate(uri);
    await super.notifyUpdate(uri);
  }
}
```

---

## 7. 完整示例

### 7.1 项目结构

```
resource-server/
├── src/
│   ├── index.ts
│   ├── resources/
│   │   ├── index.ts
│   │   ├── static-resources.ts
│   │   ├── dynamic-resources.ts
│   │   └── resource-handlers.ts
│   └── cache/
│       └── resource-cache.ts
└── package.json
```

### 7.2 静态资源配置

```typescript
// resources/static-resources.ts

import { Resource } from "../types";

export const staticResources: Resource[] = [
  {
    uri: "config://app/info",
    name: "应用信息",
    description: "应用的名称、版本等信息",
    mimeType: "application/json",
    content: {
      text: JSON.stringify({
        name: "My MCP Server",
        version: "1.0.0",
        description: "一个示例 MCP Server"
      })
    }
  },
  {
    uri: "config://app/features",
    name: "功能开关",
    description: "应用的功能开关配置",
    mimeType: "application/json",
    content: {
      text: JSON.stringify({
        enableSearch: true,
        enableExport: true,
        maxFileSize: 10485760 // 10MB
      })
    }
  },
  {
    uri: "docs://readme",
    name: "使用说明",
    description: "服务器的使用说明文档",
    mimeType: "text/markdown",
    content: {
      text: `
# MCP Server 使用指南

## 可用工具

1. **search** - 搜索内容
2. **export** - 导出数据

## 可用资源

- config://app/* - 应用配置
- docs://* - 文档资料
- system://* - 系统信息

## 资源订阅

支持订阅配置变更，资源变化时会收到通知。
      `.trim()
    }
  }
];
```

### 7.3 动态资源实现

```typescript
// resources/dynamic-resources.ts

import * as os from "os";
import * as fs from "fs";

export function registerDynamicResources(manager: ResourcesManager): void {
  // 系统信息资源
  manager.registerDynamic("system://memory", async () => {
    return {
      uri: "system://memory",
      mimeType: "application/json",
      text: JSON.stringify({
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usagePercent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
      })
    };
  });

  // CPU 信息
  manager.registerDynamic("system://cpu", async () => {
    return {
      uri: "system://cpu",
      mimeType: "application/json",
      text: JSON.stringify({
        count: os.cpus().length,
        loadavg: os.loadavg(),
        model: os.cpus()[0]?.model || "unknown"
      })
    };
  });

  // 文件监控资源（当文件变化时通知）
  const watchedFiles = new Map<string, fs.FSWatcher>();

  manager.registerDynamic("file://*", async (uri) => {
    const filePath = uri.replace("file://", "");

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      throw MCPError.resourceNotFound(uri);
    }

    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath);

    // 自动订阅文件变化
    if (!watchedFiles.has(uri)) {
      const watcher = fs.watch(filePath, () => {
        manager.notifyUpdate(uri);
      });
      watchedFiles.set(uri, watcher);
    }

    return {
      uri,
      mimeType: getMimeType(filePath),
      text: content.toString("base64") // 传输 base64 编码的内容
    };
  });
}
```

### 7.4 Server 整合

```typescript
// index.ts

import { MCPServer } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { ResourcesManager } from "./resources";
import { staticResources } from "./resources/static-resources";
import { registerDynamicResources } from "./resources/dynamic-resources";

const resourcesManager = new ResourcesManager();

// 注册静态资源
for (const resource of staticResources) {
  resourcesManager.register(resource);
}

// 注册动态资源
registerDynamicResources(resourcesManager);

// 创建 Server
const server = new MCPServer({
  name: "resource-server",
  version: "1.0.0"
}, {
  capabilities: {
    resources: {
      subscribe: true,
      listChanged: true
    }
  }
});

// 注册资源管理处理器
server.setRequestHandler("resources/list", (request) =>
  resourcesManager.handleList(request)
);

server.setRequestHandler("resources/read", async (request) =>
  resourcesManager.handleRead(request)
);

server.setRequestHandler("resources/subscribe", async (request) =>
  resourcesManager.handleSubscribe(request)
);

server.setRequestHandler("resources/unsubscribe", async (request) =>
  resourcesManager.handleUnsubscribe(request)
);

// 启动
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

---

## 8. 参数自动完成（Parameter Completion）

动态资源（Resource Templates）支持参数自动完成功能，帮助用户在输入时获得有效的建议值。

### 8.1 为什么需要参数自动完成？

当用户输入资源 URI 时，可能不知道有效的参数值：

```
用户输入: weather://forecast/{city}
                  ↑
           用户不知道可以填什么

建议: "Paris"（巴黎）、"Beijing"（北京）、"Tokyo"（东京）
```

参数自动完成可以帮助用户发现有效的值，而不需要记住确切的格式。

### 8.2 工作原理

```
┌──────────────────────────────────────────────────────────────────┐
│                    参数自动完成流程                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Client 显示资源模板 URI 输入框                                 │
│     user types: "weather://forecast/Pa"                          │
│                                                                   │
│  2. Client 向 Server 请求建议值                                   │
│     resources/complete?uriTemplate=weather://forecast/{city}      │
│     & partial={"city": "Pa"}                                     │
│                                                                   │
│  3. Server 返回匹配的建议                                          │
│     ["Paris", "Park City", "Parkersburg"]                       │
│                                                                   │
│  4. Client 显示下拉建议                                            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 8.3 实现示例

```typescript
// Server 端实现参数自动完成
server.setRequestHandler("resources/complete", async (request) => {
  const { uriTemplate, params } = request.params;

  // 根据模板和当前输入返回建议
  const suggestions = await getSuggestions(uriTemplate, params);

  return {
    completion: suggestions.map(text => ({ label: text }))
  };
});

// 建议数据源示例
async function getSuggestions(uriTemplate: string, params: Record<string, string>) {
  switch (uriTemplate) {
    case "weather://forecast/{city}":
      const partialCity = params.city || "";
      // 返回匹配的城市列表
      return [
        "Paris - 巴黎",
        "Park City - 帕克城",
        "Parkersburg - 帕克斯堡",
        "Paterson - 帕特森"
      ].filter(c => c.toLowerCase().startsWith(partialCity.toLowerCase()));

    case "flights://search/{airport}":
      const partialAirport = params.airport || "";
      // 返回匹配的机场列表
      return [
        "JFK - John F. Kennedy International Airport",
        "LAX - Los Angeles International Airport",
        "CDG - Charles de Gaulle Airport",
        "LHR - London Heathrow Airport"
      ].filter(a => a.toLowerCase().startsWith(partialAirport.toLowerCase()));

    default:
      return [];
  }
}
```

### 8.4 常见使用场景

| 场景 | 输入 | 建议示例 |
|------|------|---------|
| 城市天气 | `weather://forecast/Pa` | "Paris", "Park City" |
| 航班搜索 | `flights://search/JF` | "JFK - New York" |
| 日历事件 | `calendar://events/2024-` | "2024-01", "2024-06", "2024-12" |
| 文档搜索 | `docs://search/{query}` | 根据用户输入返回文档建议 |

---

## 9. 资源用户交互模型（User Interaction Model）

资源是由应用程序控制的，应用程序决定如何获取、处理和呈现资源给模型。

### 9.1 常见的交互模式

**1. 树状或列表视图浏览资源**

```
┌─────────────────────────────────────────┐
│  📁 资源浏览器                            │
├─────────────────────────────────────────┤
│  📂 用户资源                              │
│  ├── 📄 user://profile (用户资料)         │
│  ├── 📄 user://preferences (偏好设置)     │
│  └── 📄 user://history (历史记录)         │
│  📂 日历资源                              │
│  ├── 📅 calendar://events/2024          │
│  └── 📅 calendar://events/2025          │
│  📂 文档资源                              │
│  ├── 📃 docs://manuals/getting-started  │
│  └── 📃 docs://api/reference            │
└─────────────────────────────────────────┘
```

**2. 搜索和过滤界面**

```
┌─────────────────────────────────────────┐
│  🔍 搜索资源                              │
├─────────────────────────────────────────┤
│  [_____________] [类型 ▼] [搜索]          │
│                                         │
│  找到 3 个匹配的资源：                     │
│  • docs://api/authentication            │
│  • docs://api/rate-limiting            │
│  • docs://api/error-codes              │
└─────────────────────────────────────────┘
```

**3. 自动上下文包含**

应用程序可以根据启发式规则或 AI 选择自动将相关资源包含在上下文中：

```typescript
// 自动包含策略示例
const autoIncludeRules = [
  // 当用户询问天气时，自动包含用户偏好设置中的城市
  {
    trigger: "weather",
    include: ["user://preferences/default-city"]
  },
  // 当用户询问代码时，自动包含项目文档
  {
    trigger: "code|编程|开发",
    include: ["docs://project/architecture"]
  }
];
```

**4. 手动或批量选择**

```
┌─────────────────────────────────────────┐
│  📋 选择要包含的资源                       │
├─────────────────────────────────────────┤
│  ☑ user://profile                       │
│  ☑ calendar://events/current            │
│  ☐ docs://manuals/internal-api          │
│  ☑ user://preferences                   │
│                                         │
│  [取消]                    [确认选择]    │
└─────────────────────────────────────────┘
```

### 9.2 资源呈现给模型的方式

应用程序获取资源后，可以选择如何处理和呈现给模型：

```typescript
async function prepareContextForModel(resourceUris: string[]) {
  const context = [];

  for (const uri of resourceUris) {
    const content = await client.readResource(uri);

    // 方式 1：直接传递原始内容
    context.push({
      type: "resource",
      resource: content
    });

    // 方式 2：提取关键信息后传递
    const summary = await summarizeResource(content);
    context.push({
      type: "text",
      text: `相关资源 (${uri}): ${summary}`
    });

    // 方式 3：使用嵌入搜索获取相关片段
    const relevantChunks = await embeddingSearch(content, query);
    context.push(...relevantChunks);
  }

  return context;
}
```

### 9.3 与工具的用户交互对比

| 特性 | 工具 (Tool) | 资源 (Resource) |
|------|-------------|-----------------|
| **控制者** | Model（AI 模型） | Application（应用程序） |
| **用户交互** | 审批对话框、权限控制 | 浏览、搜索、选择 |
| **执行时机** | AI 决定 | 应用决定 |
| **反馈** | 执行结果（成功/失败） | 数据内容 |

---

## 10. 本章小结

```
资源管理核心要点

资源 vs 工具
├── Resource：只读，读取数据，无副作用
├── Tool：执行动作，有副作用
└── 选择依据：是否有副作用

资源结构
├── URI：唯一标识符
├── Metadata：名称、描述、MIME类型
└── Content：text 或 blob

订阅机制
├── Client 订阅资源
├── 资源变化时 Server 主动通知
└── Client 收到通知后重新读取

URI 设计
├── 使用有意义的 scheme
├── 层级结构清晰
├── 使用模板支持动态 URI

缓存策略
├── 减少重复读取
├── 设置 TTL 过期时间
└── 资源更新时清除缓存
```

---

## 下一步

继续阅读：
- [04-prompt-management.md](04-prompt-management.md) — 提示词模板详解
