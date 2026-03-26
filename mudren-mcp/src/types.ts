/**
 * Type definitions for the Forum MCP Server
 */

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

export enum ThreadTab {
  DEFAULT = "default",
  FEATURED = "featured",
  ZERO_COMMENT = "zeroComment",
  RECENT = "recent"
}

export interface ForumUser {
  id: number;
  name: string;
  username: string;
  avatar: string;
  bio: string | null;
  level: number;
  is_admin: boolean;
  extends: {
    company?: string;
    location?: string;
    home_url?: string;
    github?: string;
  };
  cache: {
    threads_count: number;
    comments_count: number;
    likes_count: number;
    followings_count: number;
    followers_count: number;
  };
  created_at_timeago: string;
}

export interface ForumNode {
  id: number;
  name: string;
  description: string | null;
  logo: string | null;
  threads_count: number;
  weight: number;
}

export interface ThreadPreview {
  id: number;
  title: string;
  user_id: number;
  node_id: number;
  published_at: string;
  created_at: string;
  updated_at: string;
  created_at_timeago: string;
  updated_at_timeago: string;
  has_pinned: boolean;
  has_banned: boolean;
  has_excellent: boolean;
  has_frozen: boolean;
  has_liked: boolean;
  cache: {
    views_count: number;
    comments_count: number;
    likes_count: number;
  };
  user: ForumUser;
  node: ForumNode;
}

export interface ThreadDetail extends Omit<ThreadPreview, 'node'> {
  content: {
    id: number;
    body: string;
    body_original: string;
  };
  likers: ForumUser[];
  node?: ForumNode;  // Optional - not returned when fetching by ID
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
}

export interface ThreadListResponse {
  total: number;
  count: number;
  page: number;
  perPage: number;
  threads: ThreadPreview[];
  hasMore: boolean;
  nextPage: number | null;
}
