/**
 * Zod validation schemas for the Forum MCP Server
 */

import { z } from "zod";
import { ResponseFormat, ThreadTab } from "./types.js";

// Pagination schema
export const PaginationSchema = z.object({
  page: z.coerce.number()
    .int()
    .min(1)
    .default(1)
    .describe("Page number to retrieve"),
  limit: z.coerce.number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Number of items per page (max 50)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

// List threads schema
export const ListThreadsSchema = z.object({
  tab: z.nativeEnum(ThreadTab)
    .default(ThreadTab.DEFAULT)
    .describe("Tab/category to filter threads: 'default', 'featured', 'zeroComment', 'recent'"),
  page: z.coerce.number()
    .int()
    .min(1)
    .default(1)
    .describe("Page number to retrieve"),
  limit: z.coerce.number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Number of items per page (max 50)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

// Get thread schema
export const GetThreadSchema = z.object({
  id: z.coerce.number()
    .int()
    .positive()
    .describe("Thread ID to retrieve (e.g., 481)"),
  include: z.enum(["user", "likers", "user,likers"])
    .optional()
    .default("user,likers")
    .describe("Related data to include: 'user', 'likers', or 'user,likers'"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

// Type inference
export type ListThreadsInput = z.infer<typeof ListThreadsSchema>;
export type GetThreadInput = z.infer<typeof GetThreadSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
