#!/usr/bin/env node
/**
 * Demo Notes MCP Server（2026-07-28 版本）
 *
 * A demonstration MCP server for note management.
 * This server provides tools to create, read, update, delete, and search notes.
 *
 * Run with: npm start
 * Development: npm run dev
 */

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerTools } from "./tools.js";

// Create MCP server instance
const server = new McpServer({
  name: "demo-notes-mcp",
  version: "1.0.0"
});

// Register all tools
registerTools(server);

// Main function using stdio transport
async function main() {
  console.error("Notes MCP Server starting...");

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Notes MCP Server running via stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
