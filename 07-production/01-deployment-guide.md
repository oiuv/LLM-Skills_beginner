# 生产环境部署指南

> MCP/Agent 系统的生产部署最佳实践

---

## 1. 部署架构

### 1.1 单机部署

```
┌─────────────────────────────────────────┐
│              单机部署                    │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │           Agent                 │   │
│  │  ┌─────────┐  ┌─────────────┐  │   │
│  │  │  MCP    │  │   Skills    │  │   │
│  │  │ Client  │  │   Loader    │  │   │
│  │  └────┬────┘  └─────────────┘  │   │
│  │       │                        │   │
│  │       │ stdio                  │   │
│  │       ▼                        │   │
│  │  ┌─────────┐                   │   │
│  │  │  MCP    │                   │   │
│  │  │ Server  │                   │   │
│  │  │ (本地)  │                   │   │
│  │  └─────────┘                   │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

### 1.2 分布式部署

```
┌─────────────────────────────────────────┐
│              分布式部署                  │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐    ┌─────────────┐    │
│  │   Agent 1   │    │   Agent 2   │    │
│  │  (Node 1)   │    │  (Node 2)   │    │
│  └──────┬──────┘    └──────┬──────┘    │
│         │                  │            │
│         │    HTTP/SSE      │            │
│         └────────┬─────────┘            │
│                  │                      │
│         ┌────────┴─────────┐            │
│         │   Load Balancer  │            │
│         └────────┬─────────┘            │
│                  │                      │
│         ┌────────┴─────────┐            │
│         │   MCP Server     │            │
│         │   Cluster        │            │
│         │  ┌────┐┌────┐   │            │
│         │  │ S1 ││ S2 │   │            │
│         │  └────┘└────┘   │            │
│         └──────────────────┘            │
│                                         │
└─────────────────────────────────────────┘
```

---

## 2. 容器化部署

### 2.1 Dockerfile

```dockerfile
# MCP Server Dockerfile
FROM node:20-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制代码
COPY dist/ ./dist/

# 非 root 用户
USER node

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/health-check.js

# 暴露端口（SSE 模式）
EXPOSE 3000

# 启动
CMD ["node", "dist/server.js"]
```

### 2.2 Docker Compose

```yaml
version: '3.8'

services:
  # MCP Server
  mcp-server:
    build: ./mcp-server
    container_name: mcp-server
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
      - LOG_LEVEL=info
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    networks:
      - mcp-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Agent
  agent:
    build: ./agent
    container_name: agent
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - MCP_SERVER_URL=http://mcp-server:3000
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      mcp-server:
        condition: service_healthy
    networks:
      - mcp-network

  # Redis（缓存）
  redis:
    image: redis:7-alpine
    container_name: redis
    restart: unless-stopped
    volumes:
      - redis-data:/data
    networks:
      - mcp-network

  # 监控
  prometheus:
    image: prom/prometheus
    container_name: prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    networks:
      - mcp-network

networks:
  mcp-network:
    driver: bridge

volumes:
  redis-data:
  prometheus-data:
```

---

## 3. Kubernetes 部署

### 3.1 Deployment

```yaml
# mcp-server-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-server
  labels:
    app: mcp-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-server
  template:
    metadata:
      labels:
        app: mcp-server
    spec:
      containers:
        - name: mcp-server
          image: your-registry/mcp-server:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: PORT
              value: "3000"
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
```

### 3.2 Service

```yaml
# mcp-server-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: mcp-server
spec:
  selector:
    app: mcp-server
  ports:
    - port: 3000
      targetPort: 3000
  type: ClusterIP
```

### 3.3 Ingress

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mcp-ingress
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
spec:
  tls:
    - hosts:
        - api.yourdomain.com
      secretName: tls-secret
  rules:
    - host: api.yourdomain.com
      http:
        paths:
          - path: /mcp
            pathType: Prefix
            backend:
              service:
                name: mcp-server
                port:
                  number: 3000
```

---

## 4. 环境配置

### 4.1 配置管理

```typescript
// config.ts
import { config } from "dotenv";

config();

export const appConfig = {
  // 服务器配置
  server: {
    port: parseInt(process.env.PORT || "3000"),
    host: process.env.HOST || "0.0.0.0",
    env: process.env.NODE_ENV || "development"
  },
  
  // MCP 配置
  mcp: {
    serverCommand: process.env.MCP_SERVER_COMMAND || "node",
    serverArgs: (process.env.MCP_SERVER_ARGS || "server.js").split(" "),
    timeout: parseInt(process.env.MCP_TIMEOUT || "30000"),
    maxReconnectAttempts: parseInt(process.env.MCP_MAX_RECONNECT || "3")
  },
  
  // LLM 配置
  llm: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.LLM_MODEL || "gpt-4",
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "2000"),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.7")
  },
  
  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || "info",
    format: process.env.LOG_FORMAT || "json",
    output: process.env.LOG_OUTPUT || "stdout"
  },
  
  // 监控配置
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === "true",
    prometheusPort: parseInt(process.env.PROMETHEUS_PORT || "9090"),
    metricsPath: process.env.METRICS_PATH || "/metrics"
  },
  
  // 安全配置
  security: {
    apiKey: process.env.API_KEY,
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || "60000"),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX || "100")
    }
  }
};
```

### 4.2 环境变量模板

```bash
# .env.production

# Server
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# MCP
MCP_SERVER_COMMAND=node
MCP_SERVER_ARGS=dist/server.js
MCP_TIMEOUT=30000
MCP_MAX_RECONNECT=3

# LLM
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4
LLM_MAX_TOKENS=2000
LLM_TEMPERATURE=0.7

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Monitoring
MONITORING_ENABLED=true
PROMETHEUS_PORT=9090

# Security
API_KEY=your-secret-key
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
```

---

## 5. 监控和日志

### 5.1 指标收集

```typescript
// metrics.ts
import { Registry, Counter, Histogram, Gauge } from "prom-client";

export const register = new Registry();

// 请求计数
export const requestCounter = new Counter({
  name: "mcp_requests_total",
  help: "Total number of MCP requests",
  labelNames: ["method", "status"],
  registers: [register]
});

// 请求延迟
export const requestDuration = new Histogram({
  name: "mcp_request_duration_seconds",
  help: "Duration of MCP requests in seconds",
  labelNames: ["method"],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// 活跃连接数
export const activeConnections = new Gauge({
  name: "mcp_active_connections",
  help: "Number of active MCP connections",
  registers: [register]
});

// 工具调用计数
export const toolCallCounter = new Counter({
  name: "mcp_tool_calls_total",
  help: "Total number of tool calls",
  labelNames: ["tool_name", "status"],
  registers: [register]
});

// 内存使用
export const memoryUsage = new Gauge({
  name: "mcp_memory_usage_bytes",
  help: "Memory usage in bytes",
  labelNames: ["type"],
  registers: [register]
});
```

### 5.2 结构化日志

```typescript
// logger.ts
import winston from "winston";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: "mcp-server",
    version: process.env.npm_package_version
  },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" })
  ]
});

// 使用示例
logger.info("Server started", {
  port: 3000,
  pid: process.pid
});

logger.error("Tool execution failed", {
  tool: "get_weather",
  error: error.message,
  duration: 1500
});
```

---

## 6. 安全配置

### 6.1 API 认证

```typescript
// auth.ts
import crypto from "crypto";

export class APIAuth {
  private apiKeys: Set<string>;
  
  constructor(apiKeys: string[]) {
    this.apiKeys = new Set(apiKeys);
  }
  
  validate(key: string): boolean {
    return this.apiKeys.has(key);
  }
  
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = req.headers["x-api-key"] as string;
      
      if (!key || !this.validate(key)) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid or missing API key"
        });
      }
      
      next();
    };
  }
}
```

### 6.2 速率限制

```typescript
// rate-limit.ts
import rateLimit from "express-rate-limit";

export const createRateLimiter = (options: RateLimitOptions) => {
  return rateLimit({
    windowMs: options.windowMs || 60000,
    max: options.max || 100,
    message: {
      error: "Too many requests",
      retryAfter: Math.ceil(options.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn("Rate limit exceeded", {
        ip: req.ip,
        path: req.path
      });
      res.status(429).json({
        error: "Too many requests",
        retryAfter: Math.ceil(options.windowMs / 1000)
      });
    }
  });
};
```

---

## 7. CI/CD 流水线

### 7.1 GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "20"
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Run lint
        run: npm run lint
        
      - name: Build
        run: npm run build

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
        
      - name: Login to Registry
        uses: docker/login-action@v2
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
          
      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Kubernetes
        run: |
          kubectl set image deployment/mcp-server \
            mcp-server=ghcr.io/${{ github.repository }}:${{ github.sha }}
          kubectl rollout status deployment/mcp-server
```

---

## 8. 故障排查

### 8.1 常见问题

| 问题 | 原因 | 解决方案 |
|-----|------|---------|
| 连接失败 | Server 未启动 | 检查 Server 状态 |
| 超时 | 网络延迟 | 增加超时时间 |
| 内存溢出 | 内存泄漏 | 检查代码，增加内存限制 |
| 工具调用失败 | 参数错误 | 检查参数格式 |

### 8.2 调试命令

```bash
# 查看日志
docker logs -f mcp-server

# 进入容器
docker exec -it mcp-server sh

# 查看指标
curl http://localhost:3000/metrics

# 测试连接
node scripts/test-connection.js

# 性能分析
node --prof server.js
```

---

## 9. 性能优化

### 9.1 连接池优化

```typescript
// 连接池配置
const poolConfig = {
  min: 5,
  max: 20,
  acquireTimeoutMillis: 3000,
  createTimeoutMillis: 3000,
  destroyTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  reapIntervalMillis: 1000,
  createRetryIntervalMillis: 200
};
```

### 9.2 缓存策略

```typescript
// 工具结果缓存
const cacheConfig = {
  ttl: 60000, // 1分钟
  maxSize: 1000,
  checkPeriod: 120 // 2分钟清理一次
};
```

---

## 10. 备份和恢复

### 10.1 数据备份

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# 备份配置
cp .env.production $BACKUP_DIR/

# 备份数据
tar -czf $BACKUP_DIR/data.tar.gz ./data/

# 上传到 S3
aws s3 sync $BACKUP_DIR s3://your-backup-bucket/mcp/
```

### 10.2 灾难恢复

```bash
#!/bin/bash
# restore.sh

BACKUP_DATE=$1
BACKUP_DIR="/backups/$BACKUP_DATE"

# 从 S3 下载
aws s3 sync s3://your-backup-bucket/mcp/$BACKUP_DATE $BACKUP_DIR

# 恢复配置
cp $BACKUP_DIR/.env.production .

# 恢复数据
tar -xzf $BACKUP_DIR/data.tar.gz

# 重启服务
docker-compose restart
```

---

## 总结

生产部署 checklist:

- [ ] 容器化打包
- [ ] 配置管理
- [ ] 健康检查
- [ ] 监控告警
- [ ] 日志收集
- [ ] 安全认证
- [ ] 速率限制
- [ ] CI/CD 流水线
- [ ] 备份策略
- [ ] 文档更新
