#!/usr/bin/env node

/**
 * MCP 客户端测试工具
 *
 * 通用 MCP 客户端，支持测试任何 MCP Server 的工具、资源和提示词
 *
 * 使用方法:
 *   命令行模式: node mcp-tester.js --stdio --command "node server.js"
 *   配置文件模式: node mcp-tester.js --config mcp-config.json --server zread
 *
 * 配置文件格式:
 *   {
 *     "mcpServers": {
 *       "zread": {
 *         "type": "streamable-http",
 *         "url": "https://api.example.com/mcp",
 *         "headers": { "Authorization": "Bearer xxx" }
 *       },
 *       "local": {
 *         "type": "stdio",
 *         "command": "node",
 *         "args": ["server.js"],
 *         "env": { "API_KEY": "xxx" }
 *       }
 *     }
 *   }
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import readline from "readline";
import fs from "fs";
import path from "path";

// HTTP 传输（处理 SSE 格式的响应）
// 用于那些返回 SSE 格式但使用 HTTP POST 的服务
class HTTPClientTransport {
  constructor(url, options = {}) {
    this.url = new URL(url);
    this.headers = options.headers || {};
    this.sessionId = null;
  }

  // Transport 接口要求的回调
  onclose = null;
  onerror = null;
  onmessage = null;

  async start() {
    // HTTP 传输不需要特殊的初始化
    return;
  }

  async send(message) {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      ...this.headers,
    };

    // 如果有 session ID，添加到请求头
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 保存 session ID（如果服务器返回）
      const sessionId = response.headers.get("Mcp-Session-Id");
      if (sessionId) {
        this.sessionId = sessionId;
      }

      const text = await response.text();
      
      // 解析响应
      let result;
      
      // 尝试解析 SSE 格式（data: {...}）
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr) {
            result = JSON.parse(jsonStr);
            break;
          }
        }
      }
      
      // 如果不是 SSE 格式，尝试直接解析 JSON
      if (!result) {
        result = JSON.parse(text);
      }

      // 通过 onmessage 回调返回结果
      if (this.onmessage) {
        this.onmessage(result);
      }
    } catch (error) {
      if (this.onerror) {
        this.onerror(error);
      }
      throw error;
    }
  }

  async close() {
    this.sessionId = null;
    if (this.onclose) {
      this.onclose();
    }
  }
}

// 创建 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 提问函数
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

class MCPTester {
  constructor() {
    this.client = null;
    this.transport = null;
    this.serverInfo = null;
    this.capabilities = {};
  }

  // 连接到 STDIO Server
  async connectStdio(command, args = [], env = {}) {
    console.log(`🔗 连接 STDIO Server: ${command} ${args.join(" ")}`);

    this.transport = new StdioClientTransport({
      command,
      args,
      env: { ...process.env, ...env },
    });

    this.client = new Client(
      {
        name: "mcp-tester",
        version: "1.0.0",
      },
      {
        capabilities: {
          sampling: {},
        },
      }
    );

    await this.client.connect(this.transport);
    await this.fetchServerInfo();
    console.log("✅ 已连接到 Server\n");
  }

  // 连接到 HTTP/SSE/StreamableHTTP Server
  async connectHttp(url, token = null, httpType = "streamable-http") {
    console.log(`🔗 连接 HTTP Server: ${url}`);
    console.log(`   传输类型: ${httpType}`);

    // 构建 headers
    const headers = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // 选择传输方式
    switch (httpType) {
      case "streamable-http":
        // 新版推荐：Streamable HTTP（双向流式）
        this.transport = new StreamableHTTPClientTransport(new URL(url), { headers });
        break;
      case "sse":
        // 传统 SSE（Server-Sent Events）
        this.transport = new SSEClientTransport(new URL(url), { headers });
        break;
      case "http":
        // HTTP POST + SSE 格式响应（某些服务如智谱 AI 使用）
        this.transport = new HTTPClientTransport(url, { headers });
        break;
      default:
        throw new Error(`未知的 HTTP 类型: ${httpType}。支持的类型: streamable-http, sse, http`);
    }

    this.client = new Client(
      {
        name: "mcp-tester",
        version: "1.0.0",
      },
      {
        capabilities: {
          sampling: {},
        },
      }
    );

    await this.client.connect(this.transport);
    await this.fetchServerInfo();
    console.log("✅ 已连接到 Server\n");
  }

  // 获取 Server 信息
  async fetchServerInfo() {
    // 从初始化结果获取信息
    // 注意：SDK 在 connect 时已经完成了初始化
    this.serverInfo = {
      name: "unknown",
      version: "unknown",
    };
  }

  // 断开连接
  async disconnect() {
    if (this.client) {
      await this.client.close();
      console.log("\n👋 已断开连接");
    }
    rl.close();
  }

  // 测试工具
  async testTools() {
    console.log("\n" + "=".repeat(60));
    console.log("🔧 测试工具 (Tools)");
    console.log("=".repeat(60));

    try {
      const response = await this.client.listTools();
      const tools = response.tools || [];

      if (tools.length === 0) {
        console.log("❌ Server 没有提供任何工具");
        return;
      }

      console.log(`\n发现 ${tools.length} 个工具:\n`);
      tools.forEach((tool, index) => {
        console.log(`${index + 1}. ${tool.name}`);
        console.log(`   描述: ${tool.description || "无"}`);
        console.log(`   参数: ${JSON.stringify(tool.inputSchema, null, 2)}`);
        console.log();
      });

      // 选择工具测试
      const choice = await question("请选择要测试的工具 (输入编号, 0 返回): ");
      const toolIndex = parseInt(choice) - 1;

      if (toolIndex === -1) return;
      if (toolIndex < 0 || toolIndex >= tools.length) {
        console.log("❌ 无效的选择");
        return;
      }

      const selectedTool = tools[toolIndex];
      await this.callTool(selectedTool);
    } catch (error) {
      console.error("❌ 获取工具列表失败:", error.message);
    }
  }

  // 调用工具
  async callTool(tool) {
    console.log("\n" + "-".repeat(60));
    console.log(`🔧 调用工具: ${tool.name}`);
    console.log("-".repeat(60));

    // 构建参数
    const args = {};
    const schema = tool.inputSchema || {};
    const properties = schema.properties || {};
    const required = schema.required || [];

    console.log("请输入参数 (直接回车跳过可选参数):\n");

    for (const [key, prop] of Object.entries(properties)) {
      const isRequired = required.includes(key);
      const prompt = `  ${key}${isRequired ? " (必填)" : " (可选)"}: `;
      const value = await question(prompt);

      if (value || isRequired) {
        // 根据 schema 类型转换
        if (prop.type === "number") {
          args[key] = parseFloat(value);
        } else if (prop.type === "boolean") {
          args[key] = value.toLowerCase() === "true";
        } else if (prop.type === "array") {
          try {
            args[key] = JSON.parse(value);
          } catch {
            args[key] = value.split(",").map((s) => s.trim());
          }
        } else if (prop.type === "object") {
          try {
            args[key] = JSON.parse(value);
          } catch {
            args[key] = value;
          }
        } else {
          args[key] = value;
        }
      }
    }

    console.log("\n📤 请求:");
    console.log(JSON.stringify({ name: tool.name, arguments: args }, null, 2));

    try {
      const result = await this.client.callTool({
        name: tool.name,
        arguments: args,
      });

      console.log("\n📥 响应:");
      console.log(JSON.stringify(result, null, 2));

      // 显示文本内容
      const texts = result.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text);

      if (texts && texts.length > 0) {
        console.log("\n✅ 结果:");
        texts.forEach((text) => console.log(text));
      }

      if (result.isError) {
        console.log("\n⚠️ 工具返回错误");
      }
    } catch (error) {
      console.error("\n❌ 调用失败:", error.message);
    }
  }

  // 测试资源
  async testResources() {
    console.log("\n" + "=".repeat(60));
    console.log("📄 测试资源 (Resources)");
    console.log("=".repeat(60));

    try {
      const response = await this.client.listResources();
      const resources = response.resources || [];

      if (resources.length === 0) {
        console.log("❌ Server 没有提供任何资源");
        return;
      }

      console.log(`\n发现 ${resources.length} 个资源:\n`);
      resources.forEach((resource, index) => {
        console.log(`${index + 1}. ${resource.name || resource.uri}`);
        console.log(`   URI: ${resource.uri}`);
        console.log(`   描述: ${resource.description || "无"}`);
        console.log(`   MIME: ${resource.mimeType || "无"}`);
        console.log();
      });

      // 选择资源读取
      const choice = await question("请选择要读取的资源 (输入编号, 0 返回): ");
      const resourceIndex = parseInt(choice) - 1;

      if (resourceIndex === -1) return;
      if (resourceIndex < 0 || resourceIndex >= resources.length) {
        console.log("❌ 无效的选择");
        return;
      }

      const selectedResource = resources[resourceIndex];
      await this.readResource(selectedResource.uri);
    } catch (error) {
      console.error("❌ 获取资源列表失败:", error.message);
    }
  }

  // 读取资源
  async readResource(uri) {
    console.log("\n" + "-".repeat(60));
    console.log(`📄 读取资源: ${uri}`);
    console.log("-".repeat(60));

    console.log("\n📤 请求:");
    console.log(JSON.stringify({ uri }, null, 2));

    try {
      const result = await this.client.readResource({ uri });

      console.log("\n📥 响应:");
      console.log(JSON.stringify(result, null, 2));

      // 显示内容
      if (result.contents && result.contents.length > 0) {
        console.log("\n✅ 内容:");
        result.contents.forEach((content) => {
          if (content.text) {
            console.log(content.text);
          } else if (content.blob) {
            console.log(`[Binary data: ${content.blob.length} bytes]`);
          }
        });
      }
    } catch (error) {
      console.error("\n❌ 读取失败:", error.message);
    }
  }

  // 测试提示词
  async testPrompts() {
    console.log("\n" + "=".repeat(60));
    console.log("💬 测试提示词 (Prompts)");
    console.log("=".repeat(60));

    try {
      const response = await this.client.listPrompts();
      const prompts = response.prompts || [];

      if (prompts.length === 0) {
        console.log("❌ Server 没有提供任何提示词");
        return;
      }

      console.log(`\n发现 ${prompts.length} 个提示词:\n`);
      prompts.forEach((prompt, index) => {
        console.log(`${index + 1}. ${prompt.name}`);
        console.log(`   描述: ${prompt.description || "无"}`);
        if (prompt.arguments && prompt.arguments.length > 0) {
          console.log(`   参数:`);
          prompt.arguments.forEach((arg) => {
            console.log(`     - ${arg.name}${arg.required ? " (必填)" : ""}: ${arg.description || "无"}`);
          });
        }
        console.log();
      });

      // 选择提示词
      const choice = await question("请选择要获取的提示词 (输入编号, 0 返回): ");
      const promptIndex = parseInt(choice) - 1;

      if (promptIndex === -1) return;
      if (promptIndex < 0 || promptIndex >= prompts.length) {
        console.log("❌ 无效的选择");
        return;
      }

      const selectedPrompt = prompts[promptIndex];
      await this.getPrompt(selectedPrompt);
    } catch (error) {
      console.error("❌ 获取提示词列表失败:", error.message);
    }
  }

  // 获取提示词
  async getPrompt(prompt) {
    console.log("\n" + "-".repeat(60));
    console.log(`💬 获取提示词: ${prompt.name}`);
    console.log("-".repeat(60));

    // 构建参数
    const args = {};
    if (prompt.arguments) {
      console.log("请输入参数:\n");
      for (const arg of prompt.arguments) {
        const prompt_text = `  ${arg.name}${arg.required ? " (必填)" : " (可选)"}: `;
        const value = await question(prompt_text);
        if (value || arg.required) {
          args[arg.name] = value;
        }
      }
    }

    console.log("\n📤 请求:");
    console.log(JSON.stringify({ name: prompt.name, arguments: args }, null, 2));

    try {
      const result = await this.client.getPrompt({
        name: prompt.name,
        arguments: args,
      });

      console.log("\n📥 响应:");
      console.log(JSON.stringify(result, null, 2));

      // 显示消息
      if (result.messages && result.messages.length > 0) {
        console.log("\n✅ 提示词内容:");
        result.messages.forEach((msg, index) => {
          console.log(`\n[${index + 1}] ${msg.role}:`);
          if (msg.content.type === "text") {
            console.log(msg.content.text);
          } else if (msg.content.type === "image") {
            console.log(`[Image: ${msg.content.mimeType}]`);
          }
        });
      }
    } catch (error) {
      console.error("\n❌ 获取失败:", error.message);
    }
  }

  // 显示 Server 信息
  async showServerInfo() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 Server 信息");
    console.log("=".repeat(60));
    console.log(`名称: ${this.serverInfo?.name || "unknown"}`);
    console.log(`版本: ${this.serverInfo?.version || "unknown"}`);
    console.log(`协议版本: 2025-11-25`);
    console.log();

    // 获取能力信息
    try {
      const tools = await this.client.listTools();
      console.log(`🔧 工具数量: ${tools.tools?.length || 0}`);
    } catch {
      console.log(`🔧 工具: 不支持`);
    }

    try {
      const resources = await this.client.listResources();
      console.log(`📄 资源数量: ${resources.resources?.length || 0}`);
    } catch {
      console.log(`📄 资源: 不支持`);
    }

    try {
      const prompts = await this.client.listPrompts();
      console.log(`💬 提示词数量: ${prompts.prompts?.length || 0}`);
    } catch {
      console.log(`💬 提示词: 不支持`);
    }
  }

  // 主菜单
  async mainMenu() {
    while (true) {
      console.log("\n" + "=".repeat(60));
      console.log("MCP 客户端测试工具");
      console.log("=".repeat(60));
      console.log();
      console.log("1. 🔧 测试工具 (Tools)");
      console.log("2. 📄 测试资源 (Resources)");
      console.log("3. 💬 测试提示词 (Prompts)");
      console.log("4. 📊 查看 Server 信息");
      console.log("5. 🚪 退出");
      console.log();

      const choice = await question("请选择: ");

      switch (choice.trim()) {
        case "1":
          await this.testTools();
          break;
        case "2":
          await this.testResources();
          break;
        case "3":
          await this.testPrompts();
          break;
        case "4":
          await this.showServerInfo();
          break;
        case "5":
          return;
        default:
          console.log("❌ 无效的选择");
      }
    }
  }
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: null, // 'stdio' | 'http'
    command: null,
    args: [],
    url: null,
    token: null,
    env: {},
    httpType: "streamable-http", // 默认使用 streamable-http (官方推荐)
    config: null, // 配置文件路径
    server: null, // 配置文件中的 server 名称
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--stdio":
        options.mode = "stdio";
        break;
      case "--http":
        options.mode = "http";
        break;
      case "--http-type":
        options.httpType = args[++i]; // streamable-http | sse | http
        break;
      case "--command":
        options.command = args[++i];
        break;
      case "--args":
        options.args = args[++i].split(",");
        break;
      case "--url":
        options.url = args[++i];
        break;
      case "--token":
        options.token = args[++i];
        break;
      case "--env":
        try {
          options.env = JSON.parse(args[++i]);
        } catch {
          console.error("❌ 环境变量格式错误，应为 JSON");
          process.exit(1);
        }
        break;
      case "--config":
        options.config = args[++i];
        break;
      case "--server":
        options.server = args[++i];
        break;
      case "--help":
      case "-h":
        showHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

// 显示帮助
function showHelp() {
  console.log(`
MCP 客户端测试工具

使用方法:
  STDIO 模式: node mcp-tester.js --stdio --command "node server.js"
  HTTP 模式:  node mcp-tester.js --http --url "http://localhost:3000"

选项:
  --stdio              使用 STDIO 传输模式
  --command <cmd>      STDIO 模式的启动命令
  --args <args>        STDIO 模式的参数（逗号分隔）
  --http               使用 HTTP 传输模式
  --url <url>          HTTP 模式的 URL
  --token <token>      HTTP 模式的认证 Token
  --http-type <type>   HTTP 传输类型: streamable-http(默认) | sse | http
  --env <json>         环境变量（JSON 格式）
  --help, -h           显示帮助

HTTP 传输类型说明:
  streamable-http  官方推荐，双向流式（默认）
  sse              Server-Sent Events，传统方式
  http             HTTP POST + SSE 格式响应（智谱 AI 等使用）

配置文件模式:
  node mcp-tester.js --config mcp-config.json --server zread

配置文件格式:
  {
    "mcpServers": {
      "zread": {
        "type": "streamable-http",
        "url": "https://api.example.com/mcp",
        "headers": { "Authorization": "Bearer xxx" }
      },
      "local": {
        "type": "stdio",
        "command": "node",
        "args": ["server.js"],
        "env": { "API_KEY": "xxx" }
      }
    }
  }

示例:
  # 测试 context7-mcp (npx 方式)
  node mcp-tester.js --stdio --command "npx" --args "@upstash/context7-mcp"

  # 测试 windows-mcp (uvx 方式)
  node mcp-tester.js --stdio --command "uvx" --args "windows-mcp"

  # 测试 Streamable HTTP（官方推荐）
  node mcp-tester.js --http --url "https://api.example.com/mcp" --token "xxx"

  # 测试 context7.com 在线服务
  node mcp-tester.js --http --url "https://mcp.context7.com/mcp"

  # 测试智谱 AI（streamable-http 出错时的备选模式）
  node mcp-tester.js --http --url "https://open.bigmodel.cn/api/mcp/xxx/mcp" --token "xxx" --http-type http

  # 测试带环境变量的 Server
  node mcp-tester.js --stdio --command "node" --args "server.js" --env '{"API_KEY":"xxx"}'

  # 使用配置文件
  node mcp-tester.js --config mcp-config.json --server zread
`);
}

// 从配置文件加载配置
function loadConfigFromFile(configPath, serverName) {
  try {
    const fullPath = path.resolve(configPath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const config = JSON.parse(content);
    
    if (!config.mcpServers || !config.mcpServers[serverName]) {
      console.error(`❌ 配置文件中找不到 server: ${serverName}`);
      console.error(`   可用的 servers: ${Object.keys(config.mcpServers || {}).join(', ')}`);
      process.exit(1);
    }
    
    const serverConfig = config.mcpServers[serverName];
    const options = {
      mode: null,
      command: null,
      args: [],
      url: null,
      token: null,
      env: {},
      httpType: "streamable-http",
    };
    
    // 根据 type 解析配置
    const type = serverConfig.type || 'stdio';
    
    if (type === 'stdio') {
      options.mode = 'stdio';
      options.command = serverConfig.command;
      options.args = serverConfig.args || [];
      options.env = serverConfig.env || {};
    } else if (type === 'streamable-http' || type === 'http' || type === 'sse') {
      options.mode = 'http';
      // 支持 url 或 httpUrl 字段
      options.url = serverConfig.url || serverConfig.httpUrl;
      options.httpType = type === 'http' ? 'http' : type;

      if (!options.url) {
        console.error(`❌ HTTP 模式需要 url 或 httpUrl 字段`);
        process.exit(1);
      }

      // 从 headers 中提取 token
      if (serverConfig.headers?.Authorization) {
        const auth = serverConfig.headers.Authorization;
        if (auth.startsWith('Bearer ')) {
          options.token = auth.slice(7);
        } else {
          options.token = auth;
        }
      }
    } else {
      console.error(`❌ 不支持的 type: ${type}`);
      process.exit(1);
    }
    
    return options;
  } catch (error) {
    console.error(`❌ 读取配置文件失败: ${error.message}`);
    process.exit(1);
  }
}

// 主函数
async function main() {
  const options = parseArgs();

  // 如果指定了配置文件，从配置文件加载
  let finalOptions = options;
  if (options.config) {
    if (!options.server) {
      console.error("❌ 使用 --config 时必须指定 --server");
      console.error("示例: node mcp-tester.js --config mcp.json --server zread");
      process.exit(1);
    }
    finalOptions = loadConfigFromFile(options.config, options.server);
  }

  if (!finalOptions.mode) {
    console.error("❌ 请指定传输模式: --stdio 或 --http");
    console.error("使用 --help 查看帮助");
    process.exit(1);
  }

  const tester = new MCPTester();

  try {
    if (finalOptions.mode === "stdio") {
      if (!finalOptions.command) {
        console.error("❌ STDIO 模式需要 command 参数");
        process.exit(1);
      }
      await tester.connectStdio(finalOptions.command, finalOptions.args, finalOptions.env);
    } else if (finalOptions.mode === "http") {
      if (!finalOptions.url) {
        console.error("❌ HTTP 模式需要 url 参数");
        process.exit(1);
      }
      await tester.connectHttp(finalOptions.url, finalOptions.token, finalOptions.httpType);
    }

    await tester.mainMenu();
  } catch (error) {
    console.error("\n❌ 连接错误:", error.message);

    // 针对智谱 AI 服务器的特别提示
    if (finalOptions.mode === "http" && finalOptions.httpType === "streamable-http") {
      console.error("\n💡 提示：如果连接智谱 AI (bigmodel.cn) 的 MCP 服务器失败，");
      console.error("   请尝试使用 http 模式（简化版 streamable-http）：");
      console.error(`   node mcp-tester.js --http --url "${finalOptions.url}" --token "your_token" --http-type http`);
    }

    console.error(error.stack);
  } finally {
    await tester.disconnect();
  }
}

main();
