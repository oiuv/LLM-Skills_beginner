/**
 * Tool implementations for the Notes MCP Server（2026-07-28 版本）
 */

import { Note, ResponseFormat } from "./types.js";
import {
  CreateNoteSchema,
  UpdateNoteSchema,
  NoteIdSchema,
  SearchNotesSchema,
  PaginationSchema
} from "./schemas.js";
import { storage } from "./storage.js";
import { McpServer } from "@modelcontextprotocol/server";

/**
 * Format a note for markdown output
 */
function formatNoteMarkdown(note: Note): string {
  const lines = [
    `## ${note.title}`,
    "",
    `**ID**: \`${note.id}\``,
    `**Created**: ${new Date(note.createdAt).toLocaleString()}`,
    `**Updated**: ${new Date(note.updatedAt).toLocaleString()}`,
    ""
  ];

  if (note.tags.length > 0) {
    lines.push(`**Tags**: ${note.tags.map(t => `\`${t}\``).join(", ")}`);
    lines.push("");
  }

  lines.push("### Content");
  lines.push(note.content);

  return lines.join("\n");
}

/**
 * Format a note list for markdown output
 */
function formatNoteListMarkdown(notes: Note[], total: number, offset: number, limit: number): string {
  const lines = [
    "# Notes List",
    "",
    `Showing ${notes.length} of ${total} notes (offset: ${offset})`,
    ""
  ];

  if (notes.length === 0) {
    return lines.join("\n") + "No notes found.";
  }

  for (const note of notes) {
    lines.push(`### ${note.title}`);
    lines.push(`- **ID**: \`${note.id}\``);
    lines.push(`- **Tags**: ${note.tags.join(", ") || "none"}`);
    lines.push(`- **Updated**: ${new Date(note.updatedAt).toLocaleString()}`);
    lines.push(`- ${note.content.substring(0, 100)}${note.content.length > 100 ? "..." : ""}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Register all note tools to the MCP server
 */
export function registerTools(server: McpServer): void {
  // Tool: Create a new note
  server.registerTool(
    "notes_create",
    {
      title: "Create Note",
      description: `Create a new note in the notes system.

This tool creates a new note with the given title, content, and optional tags. The note will be assigned a unique ID and timestamped.

Args:
  - title (string): Title of the note (1-200 characters, required)
  - content (string): Main content of the note (max 10000 characters)
  - tags (string[]): Optional list of tags to organize the note
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format: { id, title, content, tags, createdAt, updatedAt }
  For Markdown: Formatted note display

Examples:
  - Use when: "Create a note titled 'Ideas' with content about new project"
  - Use when: "Save this meeting summary with tags 'meeting' and 'q1'"
  - Don't use when: You want to search or list notes`,
      inputSchema: CreateNoteSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params) => {
      const note = storage.create(params.title, params.content, params.tags);

      if (params.response_format === ResponseFormat.JSON) {
        return {
          content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
          structuredContent: note
        };
      }

      return {
        content: [{
          type: "text",
          text: `# Note Created\n\n${formatNoteMarkdown(note)}`
        }],
        structuredContent: note
      };
    }
  );

  // Tool: Get a note by ID
  server.registerTool(
    "notes_get",
    {
      title: "Get Note",
      description: `Retrieve a specific note by its unique ID.

This tool fetches a single note using its identifier. Use this after searching or listing to get full details of a specific note.

Args:
  - id (string): Unique identifier of the note (e.g., 'note_1')
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format: { id, title, content, tags, createdAt, updatedAt }
  For Markdown: Formatted note display

Examples:
  - Use when: "Show me the full content of note_1"
  - Use when: "Get details of the note I just created"
  - Don't use when: You want to search notes by keyword (use notes_search instead)`,
      inputSchema: NoteIdSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params) => {
      const note = storage.get(params.id);

      if (!note) {
        return {
          content: [{
            type: "text",
            text: `Error: Note with ID '${params.id}' not found. Use notes_list to see available notes.`
          }],
          isError: true
        };
      }

      if (params.response_format === ResponseFormat.JSON) {
        return {
          content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
          structuredContent: note
        };
      }

      return {
        content: [{ type: "text", text: formatNoteMarkdown(note) }],
        structuredContent: note
      };
    }
  );

  // Tool: Update a note
  server.registerTool(
    "notes_update",
    {
      title: "Update Note",
      description: `Update an existing note's title, content, or tags.

This tool modifies an existing note. Only provided fields will be updated; omitted fields retain their current values.

Args:
  - id (string): Unique identifier of the note to update
  - title (string, optional): New title for the note
  - content (string, optional): New content for the note
  - tags (string[], optional): New tags for the note
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format: { id, title, content, tags, createdAt, updatedAt }
  For Markdown: Formatted note display showing updated note

Examples:
  - Use when: "Update note_1 to add more content"
  - Use when: "Change the title of my shopping list note"
  - Don't use when: You want to create a new note (use notes_create instead)`,
      inputSchema: UpdateNoteSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params) => {
      const updates: { title?: string; content?: string; tags?: string[] } = {};
      if (params.title !== undefined) updates.title = params.title;
      if (params.content !== undefined) updates.content = params.content;
      if (params.tags !== undefined) updates.tags = params.tags;

      const note = storage.update(params.id, updates);

      if (!note) {
        return {
          content: [{
            type: "text",
            text: `Error: Note with ID '${params.id}' not found. Use notes_list to see available notes.`
          }],
          isError: true
        };
      }

      if (params.response_format === ResponseFormat.JSON) {
        return {
          content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
          structuredContent: note
        };
      }

      return {
        content: [{
          type: "text",
          text: `# Note Updated\n\n${formatNoteMarkdown(note)}`
        }],
        structuredContent: note
      };
    }
  );

  // Tool: Delete a note
  server.registerTool(
    "notes_delete",
    {
      title: "Delete Note",
      description: `Delete a note permanently by its ID.

This tool removes a note from the system. This action cannot be undone.

Args:
  - id (string): Unique identifier of the note to delete
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON/Markdown: Confirmation message with deleted note ID

Examples:
  - Use when: "Delete note_1 as it's no longer needed"
  - Don't use when: You want to update a note (use notes_update instead)`,
      inputSchema: NoteIdSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params) => {
      const deleted = storage.delete(params.id);

      if (!deleted) {
        return {
          content: [{
            type: "text",
            text: `Error: Note with ID '${params.id}' not found. Use notes_list to see available notes.`
          }],
          isError: true
        };
      }

      return {
        content: [{
          type: "text",
          text: params.response_format === ResponseFormat.JSON
            ? JSON.stringify({ success: true, deletedId: params.id })
            : `# Note Deleted\n\nSuccessfully deleted note \`${params.id}\``
        }]
      };
    }
  );

  // Tool: List all notes
  server.registerTool(
    "notes_list",
    {
      title: "List Notes",
      description: `List all notes with pagination support.

This tool returns a paginated list of all notes, sorted by creation date (newest first).

Args:
  - limit (number): Maximum results to return (1-100, default: 20)
  - offset (number): Number of results to skip (default: 0)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format: { total, count, offset, notes[], hasMore, nextOffset }
  For Markdown: Formatted list of notes with summaries

Examples:
  - Use when: "Show me all my notes"
  - Use when: "Get the first page of notes"
  - Don't use when: You want to search by keyword (use notes_search instead)`,
      inputSchema: PaginationSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params) => {
      const { notes, total } = storage.list(params.limit, params.offset);
      const hasMore = total > params.offset + notes.length;
      const nextOffset = hasMore ? params.offset + notes.length : null;

      const output = { total, count: notes.length, offset: params.offset, notes, hasMore, nextOffset };

      if (params.response_format === ResponseFormat.JSON) {
        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      }

      return {
        content: [{
          type: "text",
          text: formatNoteListMarkdown(notes, total, params.offset, params.limit) +
            (hasMore ? `\n\n*More notes available. Use offset=${nextOffset} to see more.*` : "")
        }],
        structuredContent: output
      };
    }
  );

  // Tool: Search notes
  server.registerTool(
    "notes_search",
    {
      title: "Search Notes",
      description: `Search notes by keyword in title, content, or tags.

This tool performs a case-insensitive search across note titles, content, and tags. Results are sorted by most recently updated.

Args:
  - query (string): Search string (1-200 characters, required)
  - limit (number): Maximum results to return (1-100, default: 20)
  - offset (number): Number of results to skip (default: 0)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format: { total, count, offset, notes[], hasMore, nextOffset }
  For Markdown: Formatted list of matching notes with highlights

Examples:
  - Use when: "Find notes about meetings"
  - Use when: "Search for 'shopping' to find my shopping lists"
  - Don't use when: You want to see all notes (use notes_list instead)`,
      inputSchema: SearchNotesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params) => {
      const { notes, total } = storage.search(params.query, params.limit, params.offset);
      const hasMore = total > params.offset + notes.length;
      const nextOffset = hasMore ? params.offset + notes.length : null;

      const output = { total, count: notes.length, offset: params.offset, notes, hasMore, nextOffset };

      if (params.response_format === ResponseFormat.JSON) {
        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      }

      let text = notes.length > 0
        ? formatNoteListMarkdown(notes, total, params.offset, params.limit)
        : `# Search Results\n\nNo notes found matching "${params.query}"`;

      if (hasMore) {
        text += `\n\n*More results available. Use offset=${nextOffset} to see more.*`;
      }

      return {
        content: [{ type: "text", text }],
        structuredContent: output
      };
    }
  );
}
