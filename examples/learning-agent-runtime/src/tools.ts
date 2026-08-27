import type {
  PolicyDecision,
  ProposedToolCall,
  Tool,
  ToolContext,
  ToolDescriptor,
  ToolResult,
} from "./types.js";
import { InMemoryTraceStore } from "./trace.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error("Duplicate tool: " + tool.name);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  describe(allowedTools: Set<string>): ToolDescriptor[] {
    return [...this.tools.values()]
      .filter((tool) => allowedTools.has(tool.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
  }
}

export interface PolicyEngine {
  decide(tool: Tool, call: ProposedToolCall, context: ToolContext): PolicyDecision;
}

export class BasicPolicyEngine implements PolicyEngine {
  constructor(
    private readonly deniedTools = new Set<string>(),
    private readonly approvalForWrites = true,
  ) {}

  decide(tool: Tool): PolicyDecision {
    if (this.deniedTools.has(tool.name)) {
      return { effect: "deny", reason: "Tool is denied by policy" };
    }
    if (this.approvalForWrites && tool.sideEffect === "write") {
      return {
        effect: "require_approval",
        summary: "允许工具 " + tool.name + " 写入数据",
      };
    }
    return { effect: "allow" };
  }
}

export class ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly policy: PolicyEngine,
    private readonly traces: InMemoryTraceStore,
  ) {}

  async execute(
    call: ProposedToolCall,
    context: ToolContext,
    allowedTools: Set<string>,
    approvedCallIds: Set<string>,
  ): Promise<ToolResult> {
    const tool = this.registry.get(call.name);
    if (!tool || !allowedTools.has(call.name)) {
      return failure("TOOL_NOT_ALLOWED", "Tool is missing or not allowed", false);
    }

    let args: unknown;
    try {
      args = tool.validate(call.arguments);
    } catch (error) {
      return failure(
        "VALIDATION_ERROR",
        error instanceof Error ? error.message : "Invalid tool arguments",
        false,
      );
    }

    const policy = this.policy.decide(tool, call, context);
    this.traces.append({
      traceId: context.traceId,
      type: "policy",
      name: tool.name,
      status: policy.effect === "deny" ? "error" : "ok",
      attributes: { effect: policy.effect },
    });

    if (policy.effect === "deny") {
      return failure("PERMISSION_DENIED", policy.reason, false);
    }
    if (
      policy.effect === "require_approval" &&
      !approvedCallIds.has(call.id)
    ) {
      return failure("APPROVAL_REQUIRED", policy.summary, false);
    }
    if (context.signal.aborted) {
      return failure("CANCELLED", "Tool call cancelled", false);
    }

    this.traces.append({
      traceId: context.traceId,
      type: "tool",
      name: tool.name,
      status: "started",
      attributes: { callId: call.id, version: tool.version },
    });

    try {
      const result = await tool.execute(args, context);
      this.traces.append({
        traceId: context.traceId,
        type: "tool",
        name: tool.name,
        status: result.ok ? "ok" : "error",
        attributes: { callId: call.id },
      });
      return result;
    } catch (error) {
      this.traces.append({
        traceId: context.traceId,
        type: "tool",
        name: tool.name,
        status: "error",
        attributes: { callId: call.id },
      });
      return failure(
        "TOOL_EXECUTION_FAILED",
        error instanceof Error ? error.message : "Tool execution failed",
        true,
      );
    }
  }
}

function failure(
  code: string,
  message: string,
  retryable: boolean,
): ToolResult {
  return { ok: false, content: null, error: { code, message, retryable } };
}

