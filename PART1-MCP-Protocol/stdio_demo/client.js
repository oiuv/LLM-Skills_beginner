#!/usr/bin/env node

/**
 * MCP STDIO Client
 * 
 * 使用官方 MCP SDK 实现
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class MCPStdioClient {
  constructor() {
    this.client = null;
    this.transport = null;
  }

  async connect(serverScript) {
    console.log(`🔗 启动 Server: ${serverScript}`);
    
    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverScript],
    });

    this.client = new Client(
      {
        name: "demo-stdio-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(this.transport);
    console.log("✅ 已连接到 Server\n");
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      console.log("\n👋 已断开连接");
    }
  }

  async initialize() {
    console.log("🚀 步骤 1: 初始化连接");
    console.log("-".repeat(60));
    console.log("✅ 初始化成功");
    console.log("   Client 和 Server 已通过 MCP 协议握手");
    console.log();
  }

  async listTools() {
    console.log("🚀 步骤 2: 获取工具列表");
    console.log("-".repeat(60));
    
    const response = await this.client.listTools();
    
    console.log(`✅ 发现 ${response.tools.length} 个工具:`);
    for (const tool of response.tools) {
      console.log(`   🔧 ${tool.name}: ${tool.description}`);
    }
    console.log();
    
    return response.tools;
  }

  async callTool(name, args) {
    console.log(`🚀 步骤 3: 调用工具 '${name}'`);
    console.log("-".repeat(60));
    console.log(`   参数:`, args);
    
    const result = await this.client.callTool({
      name,
      arguments: args,
    });
    
    const texts = result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text);
    
    const output = texts.join("\n");
    console.log(`✅ 结果:\n${output}\n`);
    
    return output;
  }
}

// 演示流程
async function demo() {
  console.log("=".repeat(60));
  console.log("MCP STDIO Client 演示");
  console.log("=".repeat(60));
  
  const client = new MCPStdioClient();
  
  try {
    const serverPath = path.join(__dirname, "server.js");
    await client.connect(serverPath);
    
    await client.initialize();
    
    const tools = await client.listTools();
    
    if (tools.some((t) => t.name === "get_weather")) {
      await client.callTool("get_weather", { city: "北京" });
      await client.callTool("get_weather", { city: "上海" });
    }
    
    if (tools.some((t) => t.name === "calculate")) {
      await client.callTool("calculate", { expression: "2 + 3 * 4" });
      await client.callTool("calculate", { expression: "Math.sqrt(16) + 10" });
    }
    
    console.log("=".repeat(60));
    console.log("✅ 所有操作完成！");
    
  } catch (error) {
    console.error("\n❌ 错误:", error.message);
  } finally {
    await client.disconnect();
  }
}

demo();
