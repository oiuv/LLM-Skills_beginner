#!/usr/bin/env node

/**
 * GitHub MCP Server
 * 
 * 提供 GitHub 相关的工具：
 * - search_repos: 搜索仓库
 * - get_repo_info: 获取仓库信息
 * - list_commits: 列出提交记录
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// 模拟 GitHub 数据
const mockRepos: Record<string, RepoData> = {
  "facebook/react": {
    name: "react",
    owner: "facebook",
    stars: 220000,
    forks: 45000,
    language: "TypeScript",
    description: "A declarative, efficient, and flexible JavaScript library for building user interfaces.",
    lastCommit: "2024-03-20",
    commits: [
      { hash: "abc123", message: "Fix: resolve memory leak in useEffect", date: "2024-03-20" },
      { hash: "def456", message: "Feat: add new hook useForm", date: "2024-03-19" },
      { hash: "ghi789", message: "Docs: update README", date: "2024-03-18" },
    ]
  },
  "microsoft/vscode": {
    name: "vscode",
    owner: "microsoft",
    stars: 150000,
    forks: 25000,
    language: "TypeScript",
    description: "Visual Studio Code",
    lastCommit: "2024-03-21",
    commits: [
      { hash: "jkl012", message: "Fix: terminal rendering issue", date: "2024-03-21" },
      { hash: "mno345", message: "Feat: add AI assistant integration", date: "2024-03-20" },
    ]
  },
  "openai/whisper": {
    name: "whisper",
    owner: "openai",
    stars: 60000,
    forks: 8000,
    language: "Python",
    description: "Robust Speech Recognition via Large-Scale Weak Supervision",
    lastCommit: "2024-03-15",
    commits: [
      { hash: "pqr678", message: "Update: model weights", date: "2024-03-15" },
    ]
  }
};

interface RepoData {
  name: string;
  owner: string;
  stars: number;
  forks: number;
  language: string;
  description: string;
  lastCommit: string;
  commits: Array<{
    hash: string;
    message: string;
    date: string;
  }>;
}

class GitHubServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "github-server",
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
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_repos",
            description: "搜索 GitHub 仓库",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "搜索关键词",
                },
                language: {
                  type: "string",
                  description: "编程语言筛选（可选）",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "get_repo_info",
            description: "获取仓库详细信息",
            inputSchema: {
              type: "object",
              properties: {
                owner: {
                  type: "string",
                  description: "仓库所有者",
                },
                repo: {
                  type: "string",
                  description: "仓库名称",
                },
              },
              required: ["owner", "repo"],
            },
          },
          {
            name: "list_commits",
            description: "列出仓库的最近提交记录",
            inputSchema: {
              type: "object",
              properties: {
                owner: {
                  type: "string",
                  description: "仓库所有者",
                },
                repo: {
                  type: "string",
                  description: "仓库名称",
                },
                limit: {
                  type: "number",
                  description: "返回的提交数量（默认5）",
                  default: 5,
                },
              },
              required: ["owner", "repo"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "search_repos":
            return await this.handleSearchRepos(args as { query: string; language?: string });
          case "get_repo_info":
            return await this.handleGetRepoInfo(args as { owner: string; repo: string });
          case "list_commits":
            return await this.handleListCommits(args as { owner: string; repo: string; limit?: number });
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${errorMessage}` }],
          isError: true,
        };
      }
    });
  }

  private async handleSearchRepos(args: { query: string; language?: string }) {
    const { query, language } = args;
    
    // 模拟搜索
    const results = Object.entries(mockRepos)
      .filter(([key, repo]) => {
        const matchQuery = key.includes(query.toLowerCase()) || 
                          repo.description.toLowerCase().includes(query.toLowerCase());
        const matchLanguage = language ? repo.language.toLowerCase() === language.toLowerCase() : true;
        return matchQuery && matchLanguage;
      })
      .map(([key, repo]) => ({
        fullName: key,
        ...repo
      }));

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: `未找到匹配 "${query}" 的仓库` }],
      };
    }

    const result = `
🔍 GitHub 搜索结果: "${query}"
━━━━━━━━━━━━━━━━━━
找到 ${results.length} 个仓库:

${results.map(r => `
📦 ${r.fullName}
⭐ Stars: ${r.stars.toLocaleString()} | 🍴 Forks: ${r.forks.toLocaleString()}
📝 ${r.language}
📄 ${r.description}
`).join("\n")}
━━━━━━━━━━━━━━━━━━
    `.trim();

    return { content: [{ type: "text", text: result }] };
  }

  private async handleGetRepoInfo(args: { owner: string; repo: string }) {
    const { owner, repo } = args;
    const key = `${owner}/${repo}`;
    const data = mockRepos[key];

    if (!data) {
      throw new Error(`未找到仓库: ${key}`);
    }

    const result = `
📦 ${key}
━━━━━━━━━━━━━━━━━━
📝 ${data.description}
⭐ Stars: ${data.stars.toLocaleString()}
🍴 Forks: ${data.forks.toLocaleString()}
🔤 主要语言: ${data.language}
📅 最后提交: ${data.lastCommit}
━━━━━━━━━━━━━━━━━━
    `.trim();

    return { content: [{ type: "text", text: result }] };
  }

  private async handleListCommits(args: { owner: string; repo: string; limit?: number }) {
    const { owner, repo, limit = 5 } = args;
    const key = `${owner}/${repo}`;
    const data = mockRepos[key];

    if (!data) {
      throw new Error(`未找到仓库: ${key}`);
    }

    const commits = data.commits.slice(0, limit);

    const result = `
📜 ${key} 最近提交
━━━━━━━━━━━━━━━━━━
${commits.map(c => `
🔹 ${c.hash.substring(0, 7)} - ${c.message}
   📅 ${c.date}
`).join("\n")}
━━━━━━━━━━━━━━━━━━
    `.trim();

    return { content: [{ type: "text", text: result }] };
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    console.error("🐙 GitHub MCP Server 已启动");
    await this.server.connect(transport);
  }
}

const server = new GitHubServer();
server.start().catch(console.error);
