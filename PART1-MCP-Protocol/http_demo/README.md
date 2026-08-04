# Streamable HTTP 传输模式演示（2026-07-28 版本）

> 通过 HTTP + Chunked Transfer Encoding 进行网络通信

## 什么是 Streamable HTTP 模式？

Streamable HTTP 是 MCP 官方推荐的远程传输模式，适用于**跨机器通信**和**生产环境部署**。

```
┌─────────────┐      HTTP POST        ┌─────────────┐
│   Client    │  ─────────────────►  │   Server    │
│             │   (发送请求)          │             │
│             │ ◄──────────────────  │             │
└─────────────┘   Chunked Stream     └─────────────┘
                      (接收响应)
```

## 工作原理

1. **Client 发送 HTTP POST 请求**到 Server 的 `/mcp` 端点
2. **Server 通过 Chunked Transfer Encoding** 分块返回响应
3. **双向通信**: 支持请求-响应模式和服务器推送
4. **消息格式**: JSON-RPC 2.0，通过 HTTP 分块传输
5. **无状态**: 每个请求通过 `_meta` 携带协议版本和能力（2026-07-28 变更）

## 适用场景

- ✅ 跨机器通信
- ✅ Web 应用集成
- ✅ 需要 Server 主动推送的场景
- ✅ 高并发场景
- ✅ 微服务架构
- ✅ 生产环境部署

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

### HTTP 头约定（2026-07-28 版本）

```
MCP-Protocol-Version: 2026-07-28   # 协议版本
Mcp-Method: tools/call              # 请求方法名
Mcp-Name: get_weather               # 工具名称（调用工具时）
```

> **2026-07-28 变更**：移除了 `Mcp-Session-Id` 头部，MCP 变为无状态协议。

### 端点设计

```
POST /mcp            # Client 发送请求（也用于接收响应）
GET  /health         # 健康检查
```

### Streamable HTTP vs STDIO

| 特性 | STDIO | Streamable HTTP |
|------|-------|-----------------|
| 通信范围 | 本机进程 | 网络（可跨机器） |
| 协议 | 标准输入输出 | HTTP + Chunked Transfer |
| Server 推送 | ❌ 不支持 | ✅ 支持 |
| 并发 | 低 | 高 |
| 部署复杂度 | 低 | 中等 |
| 适用场景 | 本地工具 | Web 服务/生产环境 |

### 分块传输格式

```
HTTP/1.1 200 OK
Content-Type: application/json
Transfer-Encoding: chunked

{"jsonrpc":"2.0","id":1,"result":{"resultType":"complete","tools":[]}}

0
```

## 优点 vs 缺点

| 优点 | 缺点 |
|------|------|
| 支持跨机器通信 | 需要网络配置 |
| Server 可主动推送 | 需要处理连接管理 |
| 适合 Web 集成 | 有网络延迟 |
| 支持高并发 | 需要额外安全考虑 |
| 官方推荐 | — |
