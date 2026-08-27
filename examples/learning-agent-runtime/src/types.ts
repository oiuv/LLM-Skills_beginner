export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ProposedToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export type ModelDecision =
  | { type: "answer"; content: string }
  | { type: "tool_calls"; calls: ProposedToolCall[] }
  | { type: "request_input"; question: string };

export interface ModelRequest {
  messages: ModelMessage[];
  tools: ToolDescriptor[];
  signal?: AbortSignal;
}

export interface ModelProvider {
  decide(request: ModelRequest): Promise<ModelDecision>;
}

export interface Observation {
  id: string;
  modality: "text" | "audio" | "image" | "screen" | "tool_result" | "event";
  source: string;
  content: unknown;
  occurredAt: string;
}

export interface AgentRunRequest {
  threadId: string;
  userId: string;
  observation: Observation;
  allowedTools: Set<string>;
  approvedCallIds?: Set<string>;
  signal?: AbortSignal;
}

export type RunOutcome =
  | {
      status: "completed";
      traceId: string;
      answer: string;
      artifactIds: string[];
    }
  | {
      status: "waiting";
      traceId: string;
      reason: "user_input" | "approval";
      prompt: string;
    }
  | { status: "cancelled"; traceId: string }
  | { status: "failed"; traceId: string; error: string };

export interface ToolContext {
  userId: string;
  threadId: string;
  traceId: string;
  signal: AbortSignal;
}

export interface ToolError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ToolResult {
  ok: boolean;
  content: unknown;
  error?: ToolError;
  artifactIds?: string[];
}

export interface Tool<TArgs = unknown> {
  name: string;
  version: string;
  description: string;
  inputSchema: Record<string, unknown>;
  sideEffect: "none" | "read" | "write" | "external";
  validate(input: unknown): TArgs;
  execute(args: TArgs, context: ToolContext): Promise<ToolResult>;
}

export type PolicyDecision =
  | { effect: "allow" }
  | { effect: "deny"; reason: string }
  | { effect: "require_approval"; summary: string };

export interface TraceEvent {
  id: string;
  traceId: string;
  parentId?: string;
  type: "run" | "model" | "tool" | "policy" | "memory" | "task" | "artifact";
  name: string;
  status: "started" | "ok" | "error" | "cancelled";
  at: string;
  attributes: Record<string, string | number | boolean>;
}

