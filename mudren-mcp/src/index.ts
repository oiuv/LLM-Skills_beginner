#!/usr/bin/env node
/**
 * Mudren MCP Server for mud.ren
 *
 * A MCP server that provides tools to interact with the mud.ren forum API.
 * Uses stdio transport for local/npx usage.
 *
 * Usage:
 *   npm start
 *   npx mudren-mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

// Create MCP server instance
const server = new McpServer({
  name: "mudren-mcp",
  version: "1.0.0"
});

// Register all tools
registerTools(server);

// Main function using stdio transport
async function main() {
  console.error("Mudren MCP Server starting via stdio...");

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Mudren MCP Server running via stdio (ready for npx/local use)");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
