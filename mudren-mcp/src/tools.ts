/**
 * Tool implementations for the Forum MCP Server（2026-07-28 版本）
 */

import { McpServer } from "@modelcontextprotocol/server";
import { ListThreadsSchema, GetThreadSchema } from "./schemas.js";
import { fetchThreadList, fetchThread, formatApiError } from "./client.js";
import { ResponseFormat, ThreadPreview, ThreadDetail } from "./types.js";

/**
 * Strip HTML tags from content
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Truncate text to specified length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * Format a thread preview for markdown
 */
function formatThreadPreviewMarkdown(thread: ThreadPreview): string {
  const lines = [
    `### ${thread.title}`,
    "",
    `- **ID**: \`${thread.id}\``,
    `- **Author**: ${thread.user.name} (@${thread.user.username})`,
    `- **Node**: ${thread.node.name}`,
    `- **Published**: ${thread.published_at}`,
    `- **Stats**: ${thread.cache.views_count} views, ${thread.cache.comments_count} replies, ${thread.cache.likes_count} likes`,
    ""
  ];

  if (thread.has_pinned) lines.push("- 📌 **Pinned**");
  if (thread.has_excellent) lines.push("- ⭐ **Excellent**");
  if (thread.has_frozen) lines.push("- ❄️ **Frozen**");

  return lines.join("\n");
}

/**
 * Format a thread preview for JSON
 */
function formatThreadPreviewJson(thread: ThreadPreview) {
  return {
    id: thread.id,
    title: thread.title,
    author: {
      id: thread.user.id,
      name: thread.user.name,
      username: thread.user.username,
      avatar: thread.user.avatar
    },
    node: {
      id: thread.node.id,
      name: thread.node.name
    },
    published_at: thread.published_at,
    stats: {
      views: thread.cache.views_count,
      comments: thread.cache.comments_count,
      likes: thread.cache.likes_count
    },
    flags: {
      pinned: thread.has_pinned,
      excellent: thread.has_excellent,
      frozen: thread.has_frozen
    }
  };
}

/**
 * Format thread detail for markdown
 */
function formatThreadDetailMarkdown(thread: ThreadDetail): string {
  const contentBody = stripHtml(thread.content.body);
  const lines = [
    `# ${thread.title}`,
    "",
    `**ID**: \`${thread.id}\``,
    `**Author**: ${thread.user.name} (@${thread.user.username})`,
    thread.node ? `**Node**: ${thread.node.name}` : "",
    `**Published**: ${thread.published_at}`,
    `**Updated**: ${thread.updated_at}`,
    "",
    `## Stats`,
    `- 👁️ ${thread.cache.views_count} views`,
    `- 💬 ${thread.cache.comments_count} comments`,
    `- ❤️ ${thread.cache.likes_count} likes`,
    ""
  ];

  if (thread.content.body_original) {
    lines.push(`## Content\n${contentBody}\n`);
  }

  if (thread.likers.length > 0) {
    lines.push(`## Likers (${thread.likers.length})`);
    lines.push(thread.likers.map(u => `- ${u.name} (@${u.username})`).join("\n"));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format thread detail for JSON
 */
function formatThreadDetailJson(thread: ThreadDetail) {
  return {
    id: thread.id,
    title: thread.title,
    content: {
      id: thread.content.id,
      body: stripHtml(thread.content.body),
      body_original: thread.content.body_original
    },
    author: {
      id: thread.user.id,
      name: thread.user.name,
      username: thread.user.username,
      avatar: thread.user.avatar,
      bio: thread.user.bio,
      level: thread.user.level,
      is_admin: thread.user.is_admin
    },
    node: thread.node ? {
      id: thread.node.id,
      name: thread.node.name
    } : null,
    published_at: thread.published_at,
    updated_at: thread.updated_at,
    stats: {
      views: thread.cache.views_count,
      comments: thread.cache.comments_count,
      likes: thread.cache.likes_count
    },
    likers: thread.likers.map(u => ({
      id: u.id,
      name: u.name,
      username: u.username,
      avatar: u.avatar
    }))
  };
}

/**
 * Register all forum tools
 */
export function registerTools(server: McpServer): void {
  // Tool: List threads
  server.registerTool(
    "mudren_list_threads",
    {
      title: "List Forum Threads",
      description: `List threads from the mud.ren forum with pagination and filtering.

This tool retrieves a paginated list of forum threads. You can filter by different tabs/categories to find specific types of content.

Available tabs:
- 'default': Default thread listing
- 'featured': Featured/pinned threads
- 'zeroComment': Threads with no comments
- 'recent': Recently active threads

Args:
  - tab (string): Filter tab - 'default', 'featured', 'zeroComment', or 'recent' (default: 'default')
  - page (number): Page number to retrieve (default: 1)
  - limit (number): Number of items per page, max 50 (default: 20)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format:
  {
    "total": number,      // Total thread count
    "count": number,      // Threads in this response
    "page": number,       // Current page
    "threads": [...],     // Array of thread summaries
    "hasMore": boolean,   // Whether more pages exist
    "nextPage": number    // Next page number (if hasMore)
  }

Examples:
  - Use when: "Show me recent threads on the forum"
  - Use when: "Find threads with no comments"
  - Use when: "Browse the featured/pinned threads"
  - Don't use when: You have a specific thread ID (use mudren_get_thread instead)`,
      inputSchema: ListThreadsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => {
      try {
        const { threads, total, lastPage } = await fetchThreadList(
          params.tab,
          params.page,
          params.limit
        );

        if (threads.length === 0) {
          return {
            content: [{
              type: "text",
              text: "No threads found for the specified tab and page."
            }]
          };
        }

        const hasMore = params.page < lastPage;
        const nextPage = hasMore ? params.page + 1 : null;

        const output = { total, count: threads.length, page: params.page, threads, hasMore, nextPage };

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }

        // Markdown format
        const tabNames: Record<string, string> = {
          default: "Default",
          featured: "Featured",
          zeroComment: "Zero Comment",
          recent: "Recent"
        };

        const lines = [
          `# Forum Threads - ${tabNames[params.tab] || params.tab}`,
          "",
          `Page ${params.page} of ${lastPage} (Total: ${total} threads)`,
          ""
        ];

        for (const thread of threads) {
          lines.push(formatThreadPreviewMarkdown(thread));
        }

        if (hasMore) {
          lines.push("", `*More threads available. Use page=${nextPage} to see more.*`);
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatApiError(error) }],
          isError: true
        };
      }
    }
  );

  // Tool: Get thread detail
  server.registerTool(
    "mudren_get_thread",
    {
      title: "Get Thread Detail",
      description: `Get detailed information about a specific forum thread by its ID.

This tool retrieves full details of a single thread, including the thread body content, author information, and optionally the list of users who liked the thread.

Args:
  - id (number): Thread ID to retrieve (e.g., 481)
  - include (string): Related data to include - 'user', 'likers', or 'user,likers' (default: 'user,likers')
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format:
  {
    "id": number,
    "title": string,
    "content": { "id", "body", "body_original" },
    "author": { "id", "name", "username", "avatar", ... },
    "node": { "id", "name" },
    "stats": { "views", "comments", "likes" },
    "likers": [{ "id", "name", "username", "avatar" }, ...]
  }

Examples:
  - Use when: "Show me the content of thread 481"
  - Use when: "Get full details about a specific thread"
  - Don't use when: You want to browse multiple threads (use mudren_list_threads instead)`,
      inputSchema: GetThreadSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => {
      try {
        const thread = await fetchThread(params.id, params.include);

        if (params.response_format === ResponseFormat.JSON) {
          const output = formatThreadDetailJson(thread);
          return {
            content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }

        return {
          content: [{ type: "text", text: formatThreadDetailMarkdown(thread) }],
          structuredContent: formatThreadDetailJson(thread)
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatApiError(error) }],
          isError: true
        };
      }
    }
  );
}
