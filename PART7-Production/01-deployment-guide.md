# 生产环境部署指南

> 本章目标：掌握 MCP/Agent 系统的生产环境部署，包括容器化、监控、安全配置和 CI/CD。

---

## 1. 部署架构

### 1.1 单机部署

```
┌──────────────────────────────────────────────────────────────────┐
│                      单机部署架构                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                      Docker                                  │   │
│   │                                                          │   │
│   │   ┌───────────────────────────────────────────────┐   │   │
│   │   │              Agent Container                    │   │   │
│   │   │  ┌─────────────────────────────────────────┐ │   │   │
│   │   │  │  Agent + MCP Client                      │ │   │   │
│   │   │  │  - Memory System                        │ │   │   │
│   │   │  │  - ReAct Executor                       │ │   │   │
│   │   │  └─────────────────────────────────────────┘ │   │   │
│   │   └───────────────────────────────────────────────┘   │   │
│   │                            │                             │   │
│   │                            │ stdio                       │   │
│   │                            ▼                             │   │
│   │   ┌────────────┐  ┌────────────┐                   │   │
│   │   │  Weather   │  │   GitHub   │                   │   │
│   │   │  Container │  │  Container │                   │   │
│   │   └────────────┘  └────────────┘                   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 分布式部署

```
┌──────────────────────────────────────────────────────────────────┐
│                      分布式部署架构                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────────┐        ┌─────────────┐                       │
│   │   Client 1  │        │   Client 2  │                       │
│   └──────┬──────┘        └──────┬──────┘                       │
│          │ HTTP                │ HTTP                          │
│          └────────┬───────────────┘                              │
│                   ▼                                               │
│          ┌─────────────────────┐                                  │
│          │   Load Balancer     │                                  │
│          │   (Nginx/HAProxy)   │                                  │
│          └──────────┬──────────┘                                  │
│                     │                                               │
│     ┌───────────────┼───────────────┐                            │
│     ▼               ▼               ▼                            │
│ ┌─────────┐   ┌─────────┐   ┌─────────┐                         │
│ │ Agent 1 │   │ Agent 2 │   │ Agent 3 │                         │
│ └────┬────┘   └────┬────┘   └────┬────┘                         │
│      │ HTTP         │ HTTP         │ HTTP                         │
│      └──────────────┴──────────────┘                              │
│                         │                                          │
│                    ┌─────┴─────┐                                   │
│                    │  Message  │                                   │
│                    │   Queue   │                                   │
│                    │  (Redis)  │                                   │
│                    └─────┬─────┘                                   │
│           ┌─────────────┼─────────────┐                            │
│           ▼             ▼             ▼                            │
│      ┌────────┐   ┌────────┐   ┌────────┐                        │
│      │Weather │   │ GitHub │   │  File  │                        │
│      │Server  │   │ Server │   │ Server │                        │
│      └────────┘   └────────┘   └────────┘                        │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. 容器化部署

### 2.1 Dockerfile

```dockerfile
# Agent Dockerfile
FROM node:20-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制代码
COPY dist/ ./dist/

# 非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/health-check.js

# 启动
CMD ["node", "dist/index.js"]
```

### 2.2 Docker Compose

```yaml
version: '3.8'

services:
  # Agent 服务
  agent:
    build: ./agent
    container_name: agent
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - MCP_SERVER_URL=http://weather-server:3001
      - REDIS_URL=redis://redis:6379
      - LOG_LEVEL=info
    ports:
      - "3000:3000"
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - agent-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Weather MCP Server
  weather-server:
    build: ./servers/weather-server
    container_name: weather-server
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - WEATHER_API_KEY=${WEATHER_API_KEY}
    networks:
      - agent-network
    healthcheck:
      test: ["CMD", "node", "-e", "console.log('ok')"]
      interval: 30s
      timeout: 5s
      retries: 3

  # GitHub MCP Server
  github-server:
    build: ./servers/github-server
    container_name: github-server
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - GITHUB_TOKEN=${GITHUB_TOKEN}
    networks:
      - agent-network

  # Redis (消息队列/缓存)
  redis:
    image: redis:7-alpine
    container_name: redis
    restart: unless-stopped
    volumes:
      - redis-data:/data
    networks:
      - agent-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

networks:
  agent-network:
    driver: bridge

volumes:
  redis-data:
```

---

## 3. 健康检查

### 3.1 健康检查端点

```typescript
// health-check.ts

interface HealthStatus {
  status: "healthy" | "unhealthy" | "degraded";
  version: string;
  uptime: number;
  checks: {
    mcpClient: boolean;
    redis: boolean;
    memory: MemoryStatus;
  };
  timestamp: string;
}

interface MemoryStatus {
  used: number;
  total: number;
  percentage: number;
}

app.get("/health", async (req, res) => {
  const checks = {
    mcpClient: await checkMCPConnection(),
    redis: await checkRedisConnection(),
    memory: getMemoryStatus()
  };

  const allHealthy = Object.values(checks).every(v => 
    typeof v === "boolean" ? v : v.percentage < 90
  );

  const status: HealthStatus = {
    status: allHealthy ? "healthy" : "unhealthy",
    version: process.env.npm_package_version || "1.0.0",
    uptime: process.uptime(),
    checks,
    timestamp: new Date().toISOString()
  };

  res.status(allHealthy ? 200 : 503).json(status);
});

app.get("/ready", async (req, res) => {
  const ready = await checkReadiness();
  res.status(ready ? 200 : 503).json({ ready });
});
```

---

## 4. 监控配置

### 4.1 Prometheus 指标

```typescript
// metrics.ts

import { Registry, Counter, Histogram, Gauge } from "prom-client";

const register = new Registry();

// 请求计数
const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status"],
  registers: [register]
});

// 请求延迟
const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration",
  labelNames: ["method", "path"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// MCP 调用计数
const mcpCallsTotal = new Counter({
  name: "mcp_calls_total",
  help: "Total MCP tool calls",
  labelNames: ["server", "tool", "status"],
  registers: [register]
});

// MCP 调用延迟
const mcpCallDuration = new Histogram({
  name: "mcp_call_duration_seconds",
  help: "MCP tool call duration",
  labelNames: ["server", "tool"],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

// 活跃会话数
const activeSessions = new Gauge({
  name: "agent_active_sessions",
  help: "Number of active sessions",
  registers: [register]
});

// 内存使用
const memoryUsage = new Gauge({
  name: "memory_usage_bytes",
  help: "Memory usage in bytes",
  labelNames: ["type"],
  registers: [register]
});

export {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  mcpCallsTotal,
  mcpCallDuration,
  activeSessions,
  memoryUsage
};
```

### 4.2 Prometheus 配置

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'agent'
    static_configs:
      - targets: ['agent:3000']
    metrics_path: '/metrics'

  - job_name: 'mcp-servers'
    static_configs:
      - targets: ['weather-server:3001', 'github-server:3002']
    metrics_path: '/metrics'
```

---

## 5. 安全配置

### 5.1 API 认证

```typescript
// auth.ts

import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

interface AuthConfig {
  apiKey?: string;
  jwt?: {
    secret: string;
    expiresIn: string;
  };
}

function createAuthMiddleware(config: AuthConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // 检查 API Key
    if (config.apiKey) {
      const apiKey = req.headers["x-api-key"];
      if (apiKey !== config.apiKey) {
        return res.status(401).json({ error: "Invalid API key" });
      }
    }

    // 检查 JWT
    if (config.jwt) {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing token" });
      }

      const token = authHeader.slice(7);
      try {
        const payload = jwt.verify(token, config.jwt.secret);
        (req as any).user = payload;
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }
    }

    next();
  };
}
```

### 5.2 速率限制

```typescript
// rate-limit.ts

import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 60 * 1000,  // 1 分钟
  max: 100,              // 100 请求/分钟
  message: {
    error: "Too many requests",
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 应用到所有路由
app.use("/api/", limiter);

// 特定路由更严格的限制
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,  // 10 请求/分钟
  message: {
    error: "Rate limit exceeded for this endpoint",
    retryAfter: 60
  }
});

app.use("/api/chat", strictLimiter);
```

---

## 6. CI/CD 配置

### 6.1 GitHub Actions

```yaml
# .github/workflows/deploy.yml

name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Run linter
        run: npm run lint

      - name: Build
        run: npm run build

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Agent
        uses: docker/build-push-action@v5
        with:
          context: ./agent
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/agent:latest
            ghcr.io/${{ github.repository }}/agent:${{ github.sha }}

      - name: Build and push Weather Server
        uses: docker/build-push-action@v5
        with:
          context: ./servers/weather-server
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/weather-server:latest

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            cd /app
            docker-compose pull
            docker-compose up -d
            docker-compose exec -T agent npm run migrate
```

---

## 7. 环境配置

### 7.1 环境变量

```bash
# .env.production

# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Authentication
JWT_SECRET=your-secret-key
API_KEY=your-api-key

# External Services
WEATHER_API_KEY=your-weather-api-key
GITHUB_TOKEN=your-github-token

# Redis
REDIS_URL=redis://redis:6379

# Monitoring
PROMETHEUS_ENABLED=true
```

### 7.2 配置验证

```typescript
// config-validator.ts

const requiredEnvVars = [
  "NODE_ENV",
  "JWT_SECRET",
  "REDIS_URL"
];

function validateConfig(): void {
  const missing = requiredEnvVars.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (process.env.NODE_ENV === "production" && !process.env.API_KEY) {
    console.warn("WARNING: API_KEY not set in production!");
  }
}

validateConfig();
```

---

## 8. 本章小结

```
生产部署核心要点

部署架构
├── 单机部署：简单，测试/小规模
└── 分布式部署：扩展性好，生产环境推荐

容器化
├── Dockerfile：构建镜像
└── Docker Compose：多容器编排

健康检查
├── /health：整体状态
└── /ready：就绪检查

监控指标
├── 请求计数和延迟
├── MCP 调用统计
└── 内存和会话数

安全配置
├── API 认证（JWT/API Key）
└── 速率限制

CI/CD
├── GitHub Actions 自动测试
├── Docker 镜像构建
└── 自动部署到服务器
```

---

## 全部内容总结

学完本教程后，你已掌握：

```
✅ MCP 协议原理（PART1）
   - JSON-RPC 2.0 规范
   - 消息类型和 Capability 机制
   - 传输层实现

✅ MCP Server 开发（PART2）
   - Server 架构设计
   - 工具、资源、提示词定义
   - 会话生命周期管理

✅ MCP Client 开发（PART3）
   - Client 架构和连接管理
   - 工具发现和调用

✅ Skills 系统（PART4）
   - SKILL.md 格式规范
   - Skill 解析器实现

✅ Agent 实现（PART5）
   - Agent 架构
   - ReAct 推理模式
   - 工具编排
   - 记忆系统

✅ 完整项目（PART6）
   - Weather + GitHub MCP Servers
   - ReAct Agent 实现
   - CLI 交互

✅ 生产部署（PART7）
   - 容器化
   - 监控和安全
   - CI/CD 配置
```

---

_Last updated: 2024-03-25_
