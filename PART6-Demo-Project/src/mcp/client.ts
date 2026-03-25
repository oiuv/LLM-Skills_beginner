/**
 * MCP Client 管理器
 *
 * 管理多个 MCP Server 的连接和工具调用
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Tool {
  name: string;
  description?: string;
  inputSchema: unknown;
}

interface ToolContent {
  type: string;
  text?: string;
}

export class MCPClientManager {
  private weatherClient: Client | null = null;
  private weatherTransport: StdioClientTransport | null = null;
  
  private githubClient: Client | null = null;
  private githubTransport: StdioClientTransport | null = null;

  /**
   * 连接天气 Server
   */
  async connectWeatherServer(): Promise<void> {
    this.weatherClient = new Client(
      { name: "demo-client", version: "1.0.0" },
      { capabilities: {} }
    );

    const serverPath = path.resolve(
      __dirname,
      "../../../PART2-MCP-Server/weather-server/dist/index.js"
    );

    this.weatherTransport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
    });

    await this.weatherClient.connect(this.weatherTransport);
    console.log("✅ 已连接到天气 Server");
  }

  /**
   * 连接 GitHub Server
   */
  async connectGitHubServer(): Promise<void> {
    this.githubClient = new Client(
      { name: "demo-client", version: "1.0.0" },
      { capabilities: {} }
    );

    const serverPath = path.resolve(
      __dirname,
      "../../../PART2-MCP-Server/github-server/dist/index.js"
    );

    this.githubTransport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
    });

    await this.githubClient.connect(this.githubTransport);
    console.log("✅ 已连接到 GitHub Server");
  }

  /**
   * 调用天气工具
   */
  async callWeatherTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.weatherClient) {
      throw new Error("天气 Server 未连接");
    }

    const result = await this.weatherClient.callTool({
      name,
      arguments: args,
    });

    const content = result.content as ToolContent[];
    return content
      .filter((c) => c.type === "text")
      .map((c) => c.text || "")
      .join("\n");
  }

  /**
   * 调用 GitHub 工具
   */
  async callGitHubTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.githubClient) {
      throw new Error("GitHub Server 未连接");
    }

    const result = await this.githubClient.callTool({
      name,
      arguments: args,
    });

    const content = result.content as ToolContent[];
    return content
      .filter((c) => c.type === "text")
      .map((c) => c.text || "")
      .join("\n");
  }

  /**
   * 获取所有可用工具
   */
  async getAllTools(): Promise<Array<{ name: string; description: string; server: string }>> {
    const tools: Array<{ name: string; description: string; server: string }> = [];

    if (this.weatherClient) {
      const weatherTools = await this.weatherClient.listTools();
      tools.push(...weatherTools.tools.map((t: Tool) => ({ 
        name: t.name, 
        description: t.description || "", 
        server: "weather" 
      })));
    }

    if (this.githubClient) {
      const githubTools = await this.githubClient.listTools();
      tools.push(...githubTools.tools.map((t: Tool) => ({ 
        name: t.name, 
        description: t.description || "", 
        server: "github" 
      })));
    }

    return tools;
  }

  /**
   * 断开所有连接
   */
  async disconnect(): Promise<void> {
    if (this.weatherClient) {
      await this.weatherClient.close();
      this.weatherClient = null;
    }
    if (this.githubClient) {
      await this.githubClient.close();
      this.githubClient = null;
    }
  }
}
