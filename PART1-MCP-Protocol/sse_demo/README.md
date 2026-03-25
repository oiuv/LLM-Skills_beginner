# SSE 传输模式演示

> 通过 HTTP + Server-Sent Events 进行网络通信

## 什么是 SSE 模式？

SSE（Server-Sent Events）是 MCP 的网络传输模式，适用于**跨机器通信**和**Web 场景**。

```
┌─────────────┐      HTTP POST       ┌─────────────┐
│   Client    │  ─────────────────►  │   Server    │
│             │   (发送请求)          │             │
│             │ ◄──────────────────  │             │
└─────────────┘      SSE Stream      └─────────────┘
                     (接收响应)
```

## 工作原理

1. **Client 发送 HTTP POST 请求**到 Server 的 `/message` 端点
2. **Server 通过 SSE 流**返回响应
3. **双向通信**: Client 可以主动发送，Server 可以主动推送
4. **消息格式**: JSON-RPC 2.0，通过 SSE `data:` 字段传输

## 适用场景

- ✅ 跨机器通信
- ✅ Web 应用集成
- ✅ 需要 Server 主动推送的场景
- ✅ 高并发场景
- ✅ 微服务架构

## 运行演示

```bash
# 1. 安装依赖
pip install flask flask-cors requests

# 2. 启动 Server
python server.py

# 3. 在另一个终端运行 Client
python client.py
```

## 核心概念

### SSE 消息格式

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}

data: {"jsonrpc":"2.0","method":"notifications/message","params":{}}
```

### 端点设计

```
POST /message          # Client 发送请求
GET  /sse              # Client 连接 SSE 流（接收响应）
GET  /health           # 健康检查
```

### 与 STDIO 的区别

| 特性 | STDIO | SSE |
|------|-------|-----|
| 通信范围 | 本机进程 | 网络（可跨机器） |
| 协议 | 标准输入输出 | HTTP + SSE |
| Server 推送 | ❌ 不支持 | ✅ 支持 |
| 并发 | 低 | 高 |
| 部署复杂度 | 低 | 中等 |
| 适用场景 | 本地工具 | Web 服务 |

## 优点 vs 缺点

| 优点 | 缺点 |
|------|------|
| 支持跨机器通信 | 需要网络配置 |
| Server 可主动推送 | 需要处理连接管理 |
| 适合 Web 集成 | 有网络延迟 |
| 支持高并发 | 需要额外安全考虑 |
