/**
 * Type definitions for the Notes MCP Server
 */

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface NoteListResponse {
  total: number;
  count: number;
  offset: number;
  notes: Note[];
  hasMore: boolean;
  nextOffset: number | null;
}

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}
