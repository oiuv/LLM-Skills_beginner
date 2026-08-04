/**
 * MCP Client 示例（2026-07-28 版本）
 *
 * 基于新版 MCP SDK（@modelcontextprotocol/client）实现
 *
 * 演示如何：
 * 1. 连接到 MCP Server
 * 2. 发现可用工具
 * 3. 调用工具
 * 4. 处理响应
 */

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import path from "path";

class MCPClientExample {
  private client: Client;
  private transport: StdioClientTransport | null = null;

  constructor() {
    this.client = new Client(
      { name: "example-client", version: "1.0.0" },
      { capabilities: {} }
    );
  }

  /**
   * 连接到 MCP Server
   */
  async connect(serverPath: string): Promise<void> {
    console.log(`🔗 连接到 Server: ${serverPath}`);

    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
    });

    await this.client.connect(this.transport);
    console.log("✅ 连接成功\n");
  }

  /**
   * 列出可用工具
   */
  async listTools(): Promise<void> {
    console.log("📦 可用工具列表:");
    console.log("━━━━━━━━━━━━━━━━━━");

    const response = await this.client.listTools();

    for (const tool of response.tools) {
      console.log(`\n🔧 ${tool.name}${tool.title ? ` (${tool.title})` : ""}`);
      console.log(`   ${tool.description}`);
      console.log(`   参数: ${JSON.stringify(tool.inputSchema, null, 2)}`);
    }

    console.log("\n━━━━━━━━━━━━━━━━━━\n");
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<void> {
    console.log(`🔧 调用工具: ${name}`);
    console.log(`   参数: ${JSON.stringify(args)}\n`);

    const result = await this.client.callTool({
      name,
      arguments: args,
    });

    console.log("📤 结果:");
    if (Array.isArray(result.content)) {
      for (const content of result.content as Array<{ type: string; text?: string }>) {
        if (content.type === "text" && content.text) {
          console.log(content.text);
        }
      }
    }
    console.log();
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    await this.client.close();
    console.log("👋 已断开连接");
  }
}

// 使用示例
async function main() {
  const client = new MCPClientExample();

  try {
    // 连接到天气 Server
    const weatherServerPath = path.resolve(
      "../../PART2-MCP-Server/weather-server/dist/index.js"
    );

    await client.connect(weatherServerPath);
    await client.listTools();

    // 调用天气查询
    await client.callTool("get_weather", { city: "北京" });
    await client.callTool("get_forecast", { city: "上海", days: 3 });

  } catch (error) {
    console.error("❌ 错误:", error);
  } finally {
    await client.disconnect();
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { MCPClientExample };
