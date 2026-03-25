#!/usr/bin/env node

/**
 * MCP STDIO Server
 * 
 * 使用官方 MCP SDK 的 McpServer 类
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 模拟天气数据
const weatherDB = {
  "北京": { temp: 25, condition: "晴天", humidity: 45 },
  "上海": { temp: 28, condition: "多云", humidity: 65 },
  "广州": { temp: 32, condition: "雷阵雨", humidity: 80 },
};

// 创建 Server
const server = new McpServer({
  name: "demo-stdio-server",
  version: "1.0.0",
});

// 注册天气查询工具
server.tool(
  "get_weather",
  "获取指定城市的天气信息",
  {
    city: z.string().describe("城市名称，如：北京、上海、广州"),
  },
  async ({ city }) => {
    console.error(`🔧 调用工具: get_weather, 城市: ${city}`);
    
    const data = weatherDB[city] || { temp: 20, condition: "未知", humidity: 50 };
    
    return {
      content: [
        {
          type: "text",
          text: `🌤️ ${city}天气：${data.condition}，${data.temp}°C，湿度${data.humidity}%`,
        },
      ],
    };
  }
);

// 注册计算工具
server.tool(
  "calculate",
  "执行数学计算",
  {
    expression: z.string().describe("数学表达式，如：2 + 3 * 4"),
  },
  async ({ expression }) => {
    console.error(`🔧 调用工具: calculate, 表达式: ${expression}`);
    
    try {
      // 注意：实际应用中需要安全检查表达式
      const result = eval(expression);
      
      return {
        content: [
          {
            type: "text",
            text: `🧮 ${expression} = ${result}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ 计算错误: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 启动 Server
async function main() {
  console.error("🚀 MCP STDIO Server 已启动");
  console.error("等待客户端连接...\n");
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("✅ Server 已连接，开始处理请求");
}

main().catch((error) => {
  console.error("❌ Server 错误:", error);
  process.exit(1);
});
