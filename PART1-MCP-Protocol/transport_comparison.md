# MCP 传输模式对比：STDIO vs Streamable HTTP

> 深入理解两种传输模式的区别和适用场景

## 快速对比

| 特性 | STDIO | Streamable HTTP |
|------|-------|-----------------|
| **通信范围** | 本机进程间 | 网络（可跨机器） |
| **底层协议** | 标准输入输出 | HTTP + Chunked Transfer |
| **连接方式** | 父子进程 | HTTP 长连接 |
| **Server 推送** | ❌ 不支持 | ✅ 支持 |
| **并发能力** | 低（单连接） | 高（多连接） |
| **部署复杂度** | 低 | 中等 |
| **延迟** | 极低 | 低（网络延迟） |
| **安全性** | 高（进程边界） | 需额外配置（HTTPS/认证） |
| **会话恢复** | ❌ 不支持 | ✅ 支持 |

## 详细对比

### 1. 通信模型

#### STDIO：管道通信

```
┌─────────────┐      stdin/stdout      ┌─────────────┐
│   Client    │  ◄──────────────────►  │   Server    │
│  (父进程)   │      (匿名管道)         │  (子进程)   │
└─────────────┘                        └─────────────┘

特点：
- Client 启动 Server 作为子进程
- 通过管道（pipe）通信
- 进程终止时连接自动断开
```

#### Streamable HTTP：网络通信

```
┌─────────────┐      HTTP POST         ┌─────────────┐
│   Client    │  ───────────────────►  │   Server    │
│             │   (发送请求)            │             │
│             │ ◄──────────────────    │             │
└─────────────┘   Chunked Stream       └─────────────┘
                    (接收响应)

特点：
- Client 和 Server 是独立进程
- 通过 HTTP 协议通信
- 可以跨机器部署
- Server 可以主动推送消息
- 支持会话恢复（Resumability）
```

### 2. 消息流程对比

#### STDIO 流程

```python
# Client 代码
process = subprocess.Popen(['server.py'], stdin=PIPE, stdout=PIPE)

# 发送请求
process.stdin.write(json.dumps(request) + '\n')
process.stdin.flush()

# 接收响应
response = process.stdout.readline()
```

#### Streamable HTTP 流程

```python
import requests

# 1. 创建会话并发送请求
session_id = None

# 2. 发送 HTTP POST 请求
response = requests.post(
    '/mcp',
    json=request,
    headers={
        'Mcp-Version': '2025-11-25',
        'Mcp-Session-Id': session_id or ''
    },
    stream=True
)

# 3. 获取会话 ID
session_id = response.headers.get('Mcp-Session-Id')

# 4. 从分块响应流读取
for line in response.iter_lines():
    if line:
        message = json.loads(line)
        handle_message(message)
```

### 3. 代码复杂度对比

#### STDIO Server（简单）

```python
# 从 stdin 读取
line = sys.stdin.readline()
request = json.loads(line)

# 处理请求
result = handle_request(request)

# 向 stdout 写入
print(json.dumps(result), flush=True)
```

#### Streamable HTTP Server（较复杂）

```python
from flask import Flask, Response

app = Flask(__name__)

@app.route('/mcp', methods=['POST'])
def mcp_endpoint():
    # 2026-07-28 版本：无状态协议，从 _meta 中获取协议版本
    mcp_version = request.headers.get('MCP-Protocol-Version', '2026-07-28')

    # 处理请求（无状态，不依赖会话）
    request_data = request.get_json()
    result = handle_request(request_data)

    # 使用分块传输返回响应
    def generate():
        yield json.dumps(result).encode() + b'\n'

    return Response(
        generate(),
        mimetype='application/json',
        headers={
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'Transfer-Encoding': 'chunked'
        }
    )
```

### 4. 适用场景

#### 选择 STDIO 当：

- ✅ 本地开发测试
- ✅ 同机部署的 AI 应用
- ✅ 简单的命令行工具
- ✅ 需要进程隔离
- ✅ 对延迟要求极高
- ✅ 不需要跨网络访问

#### 选择 Streamable HTTP 当：

- ✅ 需要跨机器通信
- ✅ Web 应用集成
- ✅ 需要 Server 主动推送
- ✅ 高并发场景
- ✅ 微服务架构
- ✅ 生产环境部署

### 5. 性能对比

| 指标 | STDIO | Streamable HTTP |
|------|-------|-----------------|
| 延迟 | < 1ms | 1-10ms（本地）|
| 吞吐量 | ~1000 msg/s | ~10000 msg/s |
| 内存占用 | 低 | 中等 |
| CPU 占用 | 低 | 中等 |

### 6. 错误处理对比

#### STDIO

```python
# 检测进程是否存活
if process.poll() is not None:
    # 进程已退出
    restart_server()

# 捕获异常
try:
    response = process.stdout.readline()
except BrokenPipeError:
    # 管道断开
    handle_disconnect()
```

#### Streamable HTTP

```python
# 检测响应状态
if response.status_code != 200:
    # 连接失败
    reconnect()

# 检查协议版本（2026-07-28 版本）
if response.headers.get('MCP-Protocol-Version') != PROTOCOL_VERSION:
    raise ProtocolVersionMismatch()
```

## HTTP 头约定（2026-07-28 版本）

Streamable HTTP 使用以下 HTTP 头：

| 头名称 | 说明 | 示例 |
|--------|------|------|
| `MCP-Protocol-Version` | 协议版本 | `2026-07-28` |
| `Mcp-Method` | 请求方法名 | `tools/call` |
| `Mcp-Name` | 工具名称 | `get_weather` |
| `Transfer-Encoding` | 传输编码 | `chunked` |

> **2026-07-28 变更**：移除了 `Mcp-Session-Id` 头部，MCP 变为无状态协议。

## 学习建议

### 初学者路径

1. **先学 STDIO**
   - 简单直观，容易理解
   - 无需网络知识
   - 适合本地调试

2. **再学 Streamable HTTP**
   - 理解 HTTP 协议概念
   - 学习分块传输编码
   - 掌握异步编程

### 实践建议

1. **修改示例代码**
   - 添加新的工具方法
   - 实现错误重连
   - 添加日志记录

2. **对比测试**
   - 同时运行两种模式
   - 测试不同场景的性能
   - 观察错误处理差异

3. **扩展功能**
   - 实现资源（Resources）支持
   - 添加提示词（Prompts）
   - 实现进度通知

## 总结

| 场景 | 推荐模式 |
|------|---------|
| 本地开发 | STDIO |
| 生产部署 | Streamable HTTP |
| 命令行工具 | STDIO |
| Web 服务 | Streamable HTTP |
| 跨机器通信 | Streamable HTTP |
| 低延迟要求 | STDIO |

两种模式各有优势，理解它们的区别有助于在实际项目中做出正确选择。
