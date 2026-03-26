/**
 * API client for mud.ren forum
 */

import axios, { AxiosError } from "axios";
import https from "node:https";
import { PaginatedResponse, ThreadPreview, ThreadDetail } from "./types.js";

const API_BASE_URL = "https://api.mud.ren";

// HTTPS agent that bypasses SSL verification (for demo with self-signed certs)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// Singleton axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Accept": "application/json",
    "Content-Type": "application/json"
  },
  httpsAgent
});

/**
 * Fetch paginated thread list
 */
export async function fetchThreadList(
  tab: string,
  page: number,
  limit: number
): Promise<{ threads: ThreadPreview[]; total: number; lastPage: number }> {
  const response = await apiClient.get<PaginatedResponse<ThreadPreview>>("/threads", {
    params: {
      include: "node",
      tab,
      page,
      per_page: limit
    }
  });

  const { data, meta } = response.data;

  return {
    threads: data,
    total: meta.total,
    lastPage: meta.last_page
  };
}

/**
 * Fetch single thread by ID
 */
export async function fetchThread(
  id: number,
  include: string = "user,likers"
): Promise<ThreadDetail> {
  const response = await apiClient.get<ThreadDetail>(`/threads/${id}`, {
    params: { include }
  });

  return response.data;
}

/**
 * Format error message
 */
export function formatApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      switch (error.response.status) {
        case 404:
          return "Error: Thread not found. Please check the thread ID is correct.";
        case 429:
          return "Error: Rate limit exceeded. Please wait before making more requests.";
        case 500:
          return "Error: Internal server error. Please try again later.";
        default:
          return `Error: API request failed with status ${error.response.status}`;
      }
    } else if (error.code === "ECONNABORTED") {
      return "Error: Request timed out. Please try again.";
    } else if (error.code === "ERR_NETWORK") {
      return "Error: Network connection failed. Please check your internet connection.";
    }
  }
  return `Error: Unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`;
}
