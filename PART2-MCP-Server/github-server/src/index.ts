#!/usr/bin/env node

/**
 * GitHub MCP Server（2026-07-28 版本）
 *
 * 基于新版 MCP SDK（@modelcontextprotocol/server）实现
 * 使用 McpServer + registerTool + Zod schema
 *
 * 提供 GitHub 相关的工具：
 * - search_repos: 搜索仓库
 * - get_repo_info: 获取仓库信息
 * - list_commits: 列出提交记录
 */

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

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

// 创建 MCP Server 实例（新 API：McpServer）
const server = new McpServer({
  name: "github-server",
  version: "1.0.0",
});

// 注册工具：search_repos（新 API：registerTool + Zod schema）
server.registerTool(
  "search_repos",
  {
    title: "搜索仓库",
    description: "搜索 GitHub 仓库",
    inputSchema: z.object({
      query: z.string().describe("搜索关键词"),
      language: z.string().optional().describe("编程语言筛选（可选）"),
    }),
  },
  async ({ query, language }) => {
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
        content: [{ type: "text" as const, text: `未找到匹配 "${query}" 的仓库` }],
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

    return { content: [{ type: "text" as const, text: result }] };
  }
);

// 注册工具：get_repo_info
server.registerTool(
  "get_repo_info",
  {
    title: "仓库信息",
    description: "获取仓库详细信息",
    inputSchema: z.object({
      owner: z.string().describe("仓库所有者"),
      repo: z.string().describe("仓库名称"),
    }),
  },
  async ({ owner, repo }) => {
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

    return { content: [{ type: "text" as const, text: result }] };
  }
);

// 注册工具：list_commits
server.registerTool(
  "list_commits",
  {
    title: "提交记录",
    description: "列出仓库的最近提交记录",
    inputSchema: z.object({
      owner: z.string().describe("仓库所有者"),
      repo: z.string().describe("仓库名称"),
      limit: z.number().min(1).max(20).default(5).describe("返回的提交数量（默认5）"),
    }),
  },
  async ({ owner, repo, limit }) => {
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

    return { content: [{ type: "text" as const, text: result }] };
  }
);

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();

  console.error("🐙 GitHub MCP Server 已启动（2026-07-28 版本）");
  console.error("等待客户端连接...\n");

  await server.connect(transport);
}

main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});
