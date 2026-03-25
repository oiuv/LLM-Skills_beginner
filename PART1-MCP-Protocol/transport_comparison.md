# MCP 传输模式对比：STDIO vs SSE

> 深入理解两种传输模式的区别和适用场景

## 快速对比

| 特性 | STDIO | SSE |
|------|-------|-----|
| **通信范围** | 本机进程间 | 网络（可跨机器） |
| **底层协议** | 标准输入输出 | HTTP + Server-Sent Events |
| **连接方式** | 父子进程 | HTTP 长连接 |
| **Server 推送** | ❌ 不支持 | ✅ 支持 |
| **并发能力** | 低（单连接） | 高（多连接） |
| **部署复杂度** | 低 | 中等 |
| **延迟** | 极低 | 低（网络延迟） |
| **安全性** | 高（进程边界） | 需额外配置（HTTPS/认证） |

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

#### SSE：网络通信

```
┌─────────────┐      HTTP POST         ┌─────────────┐
│   Client    │  ───────────────────►  │   Server    │
│             │                        │             │
│             │  ◄──────────────────   │             │
└─────────────┘      SSE Stream        └─────────────┘

特点：
- Client 和 Server 是独立进程
- 通过 HTTP 协议通信
- 可以跨机器部署
- Server 可以主动推送消息
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

#### SSE 流程

```python
# 1. 建立 SSE 连接（接收消息）
response = requests.get('/sse', stream=True)

# 2. 发送请求
requests.post('/message', json=request, headers={'Session-Id': session_id})

# 3. 从 SSE 流接收响应
for line in response.iter_lines():
    message = parse_sse_line(line)
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

#### SSE Server（较复杂）

```python
from flask import Flask, Response

app = Flask(__name__)

@app.route('/sse')
def sse():
    def generate():
        while True:
            msg = get_message()
            yield f"data: {json.dumps(msg)}\n\n"
    return Response(generate(), mimetype='text/event-stream')

@app.route('/message', methods=['POST'])
def message():
    request = request.get_json()
    # 异步处理，通过 SSE 返回结果
    return {'status': 'ok'}
```

### 4. 适用场景

#### 选择 STDIO 当：

- ✅ 本地开发测试
- ✅ 同机部署的 AI 应用
- ✅ 简单的命令行工具
- ✅ 需要进程隔离
- ✅ 对延迟要求极高

#### 选择 SSE 当：

- ✅ 需要跨机器通信
- ✅ Web 应用集成
- ✅ 需要 Server 主动推送
- ✅ 高并发场景
- ✅ 微服务架构

### 5. 性能对比

| 指标 | STDIO | SSE |
|------|-------|-----|
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

#### SSE

```python
# 检测连接状态
if response.status_code != 200:
    # 连接失败
    reconnect()

# 心跳检测
if time.time() - last_ping > timeout:
    # 连接超时
    reconnect()
```

## 学习建议

### 初学者路径

1. **先学 STDIO**
   - 简单直观，容易理解
   - 无需网络知识
   - 适合本地调试

2. **再学 SSE**
   - 理解网络通信概念
   - 学习 HTTP 和 SSE 协议
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
| 生产部署 | SSE |
| 命令行工具 | STDIO |
| Web 服务 | SSE |
| 跨机器通信 | SSE |
| 低延迟要求 | STDIO |

两种模式各有优势，理解它们的区别有助于在实际项目中做出正确选择。
