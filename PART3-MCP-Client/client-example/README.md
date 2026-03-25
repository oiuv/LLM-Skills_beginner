# MCP 客户端测试工具

通用 MCP 客户端，支持测试任何 MCP Server 的工具、资源和提示词。

## 安装

```bash
npm install
```

## 使用方法

### 方式一：命令行模式

#### STDIO 模式（本地进程）

```bash
# 基本用法
node mcp-tester.js --stdio --command "node server.js"

# 带参数
node mcp-tester.js --stdio --command "node" --args "server.js,--port,3000"

# 带环境变量
node mcp-tester.js --stdio --command "node" --args "server.js" --env '{"API_KEY":"xxx"}'
```

#### HTTP 模式（远程服务）

```bash
# Streamable HTTP（官方推荐，默认）
node mcp-tester.js --http --url "https://api.example.com/mcp" --token "xxx"

# SSE（传统方式）
node mcp-tester.js --http --url "https://api.example.com/mcp/sse" --token "xxx" --http-type sse

# HTTP POST + SSE 格式（智谱 AI 等使用）
node mcp-tester.js --http --url "https://open.bigmodel.cn/api/mcp/xxx/mcp" --token "xxx" --http-type http
```

### 方式二：配置文件模式（推荐）

创建配置文件 `mcp-config.json`：

```json
{
  "mcpServers": {
    "minimax": {
      "type": "stdio",
      "command": "uvx",
      "args": ["minimax-mcp"],
      "env": {
        "MINIMAX_API_HOST": "https://api.minimaxi.com",
        "MINIMAX_API_KEY": "your_api_key",
        "MINIMAX_API_RESOURCE_MODE": "url"
      }
    },
    "web-reader": {
      "type": "http",
      "url": "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
      "headers": {
        "Authorization": "Bearer your_api_key"
      }
    }
  }
}
```

使用配置文件运行：

```bash
# 测试 minimax
node mcp-tester.js --config mcp-config.json --server minimax

# 测试 web-reader
node mcp-tester.js --config mcp-config.json --server web-reader
```

**配置文件优势**：
- ✅ 避免命令行转义问题
- ✅ 支持复杂的环境变量配置
- ✅ 多个 server 统一管理
- ✅ 与 Claude Code 等工具配置格式一致

## 测试示例

### 1. 测试天气 Server

```bash
# 先确保天气 Server 已构建
cd ../../PART2-MCP-Server/weather-server
npm run build

# 回到测试工具目录
cd ../../PART3-MCP-Client/client-example

# 运行测试
node mcp-tester.js --stdio --command "node" --args "../../PART2-MCP-Server/weather-server/dist/index.js"
```

### 2. 测试 SSE Server

```bash
# 启动 SSE Server（在另一个终端）
cd ../../PART1-MCP-Protocol/sse_demo
node server.js

# 运行测试
cd ../../PART3-MCP-Client/client-example
node mcp-tester.js --http --url "http://localhost:5000"
```

## 功能菜单

连接成功后，会显示主菜单：

```
============================================================
MCP 客户端测试工具
============================================================

1. 🔧 测试工具 (Tools)
2. 📄 测试资源 (Resources)
3. 💬 测试提示词 (Prompts)
4. 📊 查看 Server 信息
5. 🚪 退出

请选择: 
```

### 测试工具

- 列出所有可用工具
- 显示工具的参数 schema
- 交互式输入参数
- 显示完整的请求/响应
- 格式化显示结果

### 测试资源

- 列出所有可用资源
- 显示资源 URI 和 MIME 类型
- 读取资源内容
- 支持文本和二进制资源

### 测试提示词

- 列出所有可用提示词
- 显示提示词参数
- 获取提示词模板
- 显示消息内容

## 输出示例

### 工具调用示例

```
============================================================
🔧 测试工具 (Tools)
============================================================

发现 2 个工具:

1. get_weather
   描述: 获取指定城市的天气信息
   参数: {
     "type": "object",
     "properties": {
       "city": {
         "type": "string",
         "description": "城市名称"
       }
     },
     "required": ["city"]
   }

2. calculate
   描述: 执行数学计算
   ...

请选择要测试的工具 (输入编号, 0 返回): 1

------------------------------------------------------------
🔧 调用工具: get_weather
------------------------------------------------------------
请输入参数 (直接回车跳过可选参数):

  city (必填): 北京

📤 请求:
{
  "name": "get_weather",
  "arguments": {
    "city": "北京"
  }
}

📥 响应:
{
  "content": [
    {
      "type": "text",
      "text": "🌤️ 北京天气：晴天，25°C"
    }
  ],
  "isError": false
}

✅ 结果:
🌤️ 北京天气：晴天，25°C
```

## 命令行选项

| 选项 | 说明 | 示例 |
|------|------|------|
| `--stdio` | 使用 STDIO 模式 | `--stdio` |
| `--http` | 使用 HTTP 模式 | `--http` |
| `--command` | 启动命令（STDIO） | `--command "node"` |
| `--args` | 命令参数（逗号分隔） | `--args "server.js,--port,3000"` |
| `--url` | Server URL（HTTP） | `--url "http://localhost:3000"` |
| `--token` | 认证 Token | `--token "xxx"` |
| `--env` | 环境变量（JSON） | `--env '{"KEY":"value"}'` |
| `--help` | 显示帮助 | `--help` |

## 实际应用场景

### 场景 1：测试第三方 MCP Server

```bash
# 测试官方示例 Server
node mcp-tester.js --stdio --command "npx" --args "-y,@modelcontextprotocol/server-filesystem,/path/to/files"
```

### 场景 2：调试自己的 MCP Server

```bash
# 在开发过程中快速测试
node mcp-tester.js --stdio --command "node" --args "./src/server.ts" --env '{"DEBUG":"true"}'
```

### 场景 3：测试远程 MCP 服务

```bash
# 测试智谱 AI 的 MCP 服务
node mcp-tester.js --http --url "https://open.bigmodel.cn/api/mcp/xxx/mcp" --token "your_api_key"
```

## 学习价值

这个测试工具帮助你理解：

1. **MCP 协议细节**：查看真实的请求/响应格式
2. **工具调用流程**：理解参数传递和结果返回
3. **资源读取机制**：学习 URI 和资源内容的关系
4. **提示词模板**：了解动态提示词的生成
5. **错误处理**：观察各种错误情况的处理

## 注意事项

- 确保目标 Server 支持相应的传输模式（stdio/http）
- HTTP 模式需要 Server 支持 SSE 传输
- 某些 Server 可能需要特定的环境变量
- 工具参数需要符合 JSON schema 要求
