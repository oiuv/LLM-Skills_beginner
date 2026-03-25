#!/usr/bin/env node

/**
 * 天气 + GitHub 助手 CLI
 * 
 * 使用示例:
 *   npm run dev -- weather 北京
 *   npm run dev -- github search react
 *   npm run dev -- agent "帮我查一下北京的天气，然后搜索一下 React 相关的 GitHub 仓库"
 */

import { Command } from "commander";
import chalk from "chalk";
import { DemoAgent } from "./agent/index.js";
import { MCPClientManager } from "./mcp/client.js";

const program = new Command();

program
  .name("weather-github-assistant")
  .description("天气 + GitHub 助手")
  .version("1.0.0");

// 天气查询命令
program
  .command("weather")
  .description("查询天气")
  .argument("<city>", "城市名称")
  .option("-f, --forecast", "显示预报")
  .action(async (city, options) => {
    const client = new MCPClientManager();
    
    try {
      await client.connectWeatherServer();
      
      if (options.forecast) {
        const result = await client.callWeatherTool("get_forecast", { city, days: 3 });
        console.log(result);
      } else {
        const result = await client.callWeatherTool("get_weather", { city });
        console.log(result);
      }
    } catch (error) {
      console.error(chalk.red("错误:"), error);
    } finally {
      await client.disconnect();
    }
  });

// GitHub 查询命令
program
  .command("github")
  .description("GitHub 操作")
  .argument("<action>", "操作: search, info, commits")
  .argument("[query]", "查询参数")
  .action(async (action, query) => {
    const client = new MCPClientManager();
    
    try {
      await client.connectGitHubServer();
      
      switch (action) {
        case "search":
          const result = await client.callGitHubTool("search_repos", { query });
          console.log(result);
          break;
        case "info":
          const [owner, repo] = query.split("/");
          const info = await client.callGitHubTool("get_repo_info", { owner, repo });
          console.log(info);
          break;
        default:
          console.log(chalk.yellow("未知操作，可用: search, info, commits"));
      }
    } catch (error) {
      console.error(chalk.red("错误:"), error);
    } finally {
      await client.disconnect();
    }
  });

// Agent 模式
program
  .command("agent")
  .description("使用 Agent 模式（智能理解意图）")
  .argument("<query>", "自然语言查询")
  .action(async (query) => {
    const agent = new DemoAgent();
    
    try {
      await agent.initialize();
      const result = await agent.execute(query);
      console.log(chalk.green("\n🤖 Agent 回复:"));
      console.log(result);
    } catch (error) {
      console.error(chalk.red("错误:"), error);
    } finally {
      await agent.shutdown();
    }
  });

// 默认显示帮助
if (process.argv.length === 2) {
  program.help();
}

program.parse();
