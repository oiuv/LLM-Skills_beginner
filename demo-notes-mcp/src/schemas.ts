/**
 * Zod validation schemas for the Notes MCP Server
 */

import { z } from "zod";
import { ResponseFormat } from "./types.js";

// Common pagination schema
export const PaginationSchema = z.object({
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of results to return"),
  offset: z.number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
});

// Schema for creating a note
export const CreateNoteSchema = z.object({
  title: z.string()
    .min(1, "Title is required")
    .max(200, "Title must not exceed 200 characters")
    .describe("Title of the note (e.g., 'Meeting Notes', 'Shopping List')"),
  content: z.string()
    .max(10000, "Content must not exceed 10000 characters")
    .describe("Main content of the note"),
  tags: z.array(z.string().max(50)).max(10).default([])
    .describe("List of tags to organize the note (e.g., ['work', 'important'])"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

// Schema for updating a note
export const UpdateNoteSchema = z.object({
  id: z.string()
    .describe("Unique identifier of the note to update"),
  title: z.string()
    .min(1)
    .max(200)
    .optional()
    .describe("New title for the note"),
  content: z.string()
    .max(10000)
    .optional()
    .describe("New content for the note"),
  tags: z.array(z.string().max(50)).max(10).optional()
    .describe("New tags for the note"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

// Schema for getting/deleting a note
export const NoteIdSchema = z.object({
  id: z.string()
    .describe("Unique identifier of the note"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

// Schema for searching notes
export const SearchNotesSchema = z.object({
  query: z.string()
    .min(1, "Search query is required")
    .max(200, "Query must not exceed 200 characters")
    .describe("Search string to match against note titles, content, or tags"),
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of results to return"),
  offset: z.number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

// Type inference
export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;
export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;
export type NoteIdInput = z.infer<typeof NoteIdSchema>;
export type SearchNotesInput = z.infer<typeof SearchNotesSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
