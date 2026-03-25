#!/usr/bin/env node

/**
 * 天气 MCP Server
 * 
 * 提供天气查询相关的工具：
 * - get_weather: 查询当前天气
 * - get_forecast: 查询天气预报
 * - get_air_quality: 查询空气质量
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// 模拟天气数据库
const weatherDB: Record<string, WeatherData> = {
  "北京": {
    temp: 25,
    condition: "晴天",
    humidity: 45,
    windSpeed: 3,
    aqi: 65,
    aqiLevel: "良"
  },
  "上海": {
    temp: 28,
    condition: "多云",
    humidity: 65,
    windSpeed: 4,
    aqi: 55,
    aqiLevel: "良"
  },
  "广州": {
    temp: 32,
    condition: "雷阵雨",
    humidity: 80,
    windSpeed: 2,
    aqi: 45,
    aqiLevel: "优"
  },
  "深圳": {
    temp: 31,
    condition: "阴天",
    humidity: 75,
    windSpeed: 3,
    aqi: 50,
    aqiLevel: "优"
  },
  "杭州": {
    temp: 26,
    condition: "小雨",
    humidity: 70,
    windSpeed: 2,
    aqi: 60,
    aqiLevel: "良"
  }
};

interface WeatherData {
  temp: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  aqi: number;
  aqiLevel: string;
}

class WeatherServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "weather-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    // 列出可用工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "get_weather",
            description: "查询指定城市的当前天气信息，包括温度、天气状况、湿度、风速",
            inputSchema: {
              type: "object",
              properties: {
                city: {
                  type: "string",
                  description: "城市名称，如：北京、上海、广州",
                },
              },
              required: ["city"],
            },
          },
          {
            name: "get_forecast",
            description: "查询指定城市的未来3天天气预报",
            inputSchema: {
              type: "object",
              properties: {
                city: {
                  type: "string",
                  description: "城市名称",
                },
                days: {
                  type: "number",
                  description: "预报天数（1-3天）",
                  default: 3,
                },
              },
              required: ["city"],
            },
          },
          {
            name: "get_air_quality",
            description: "查询指定城市的空气质量指数（AQI）",
            inputSchema: {
              type: "object",
              properties: {
                city: {
                  type: "string",
                  description: "城市名称",
                },
              },
              required: ["city"],
            },
          },
          {
            name: "list_cities",
            description: "获取支持查询的城市列表",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ],
      };
    });

    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "get_weather":
            return await this.handleGetWeather(args as { city: string });
          case "get_forecast":
            return await this.handleGetForecast(args as { city: string; days?: number });
          case "get_air_quality":
            return await this.handleGetAirQuality(args as { city: string });
          case "list_cities":
            return await this.handleListCities();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleGetWeather(args: { city: string }) {
    const { city } = args;
    const data = weatherDB[city];

    if (!data) {
      throw new Error(`未找到城市 "${city}" 的天气数据。支持的城市：${Object.keys(weatherDB).join("、")}`);
    }

    const result = `
🌤️ ${city}当前天气
━━━━━━━━━━━━━━━━━━
🌡️ 温度: ${data.temp}°C
☁️ 天气: ${data.condition}
💧 湿度: ${data.humidity}%
🌬️ 风速: ${data.windSpeed}级
💨 空气质量: ${data.aqiLevel} (AQI ${data.aqi})
━━━━━━━━━━━━━━━━━━
💡 建议: ${this.getWeatherAdvice(data)}
    `.trim();

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  }

  private async handleGetForecast(args: { city: string; days?: number }) {
    const { city, days = 3 } = args;
    const data = weatherDB[city];

    if (!data) {
      throw new Error(`未找到城市 "${city}" 的数据`);
    }

    // 模拟未来几天的天气（基于当前天气随机变化）
    const forecasts = [];
    const conditions = ["晴天", "多云", "阴天", "小雨", "雷阵雨"];
    
    for (let i = 1; i <= Math.min(days, 3); i++) {
      const tempVariation = Math.floor(Math.random() * 6) - 3; // -3 到 +3
      const conditionIndex = Math.floor(Math.random() * conditions.length);
      
      forecasts.push({
        day: i,
        temp: data.temp + tempVariation,
        condition: conditions[conditionIndex],
      });
    }

    const result = `
📅 ${city}未来${days}天预报
━━━━━━━━━━━━━━━━━━
${forecasts.map(f => `第${f.day}天: ${f.condition} ${f.temp}°C`).join("\n")}
━━━━━━━━━━━━━━━━━━
💡 提示: 天气预报仅供参考，出行前请关注最新天气信息
    `.trim();

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  }

  private async handleGetAirQuality(args: { city: string }) {
    const { city } = args;
    const data = weatherDB[city];

    if (!data) {
      throw new Error(`未找到城市 "${city}" 的数据`);
    }

    const result = `
💨 ${city}空气质量
━━━━━━━━━━━━━━━━━━
🔢 AQI 指数: ${data.aqi}
📊 等级: ${data.aqiLevel}
━━━━━━━━━━━━━━━━━━
💡 健康建议: ${this.getAQIAdvice(data.aqi)}
    `.trim();

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  }

  private async handleListCities() {
    const cities = Object.keys(weatherDB);
    
    return {
      content: [
        {
          type: "text",
          text: `支持查询的城市（共${cities.length}个）：\n${cities.join("、")}`,
        },
      ],
    };
  }

  private getWeatherAdvice(data: WeatherData): string {
    if (data.condition.includes("雨")) {
      return "有雨，记得带伞☔，适合室内活动";
    }
    if (data.temp > 30) {
      return "天气炎热🥵，注意防晒和补水";
    }
    if (data.temp < 20) {
      return "天气较凉🧥，建议带件外套";
    }
    return "天气不错😊，适合户外活动";
  }

  private getAQIAdvice(aqi: number): string {
    if (aqi <= 50) return "空气质量优，适合户外活动";
    if (aqi <= 100) return "空气质量良，可以正常活动";
    if (aqi <= 150) return "轻度污染，敏感人群减少户外活动";
    return "中度污染，建议减少户外活动";
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    
    console.error("🌤️ 天气 MCP Server 已启动");
    console.error("等待客户端连接...\n");
    
    await this.server.connect(transport);
  }
}

// 启动服务器
const server = new WeatherServer();
server.start().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});
