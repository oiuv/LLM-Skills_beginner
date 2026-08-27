import { AgentKernel } from "./agent.js";
import { ScriptedModel } from "./model.js";
import { InMemoryThreadStore } from "./stores.js";
import { InMemoryTraceStore } from "./trace.js";
import {
  BasicPolicyEngine,
  ToolExecutor,
  ToolRegistry,
} from "./tools.js";
import type { Tool } from "./types.js";

const traces = new InMemoryTraceStore();
const registry = new ToolRegistry();
const threads = new InMemoryThreadStore();

const lookupConcept: Tool = {
  name: "lookup_concept",
  version: "1.0.0",
  description: "查询一个学习概念的简明解释",
  inputSchema: {
    type: "object",
    properties: { topic: { type: "string" } },
    required: ["topic"],
    additionalProperties: false,
  },
  sideEffect: "read",
  validate(input: unknown): unknown {
    if (
      typeof input !== "object" ||
      input === null ||
      !("topic" in input) ||
      typeof input.topic !== "string" ||
      input.topic.trim() === ""
    ) {
      throw new Error("topic must be a non-empty string");
    }
    return { topic: input.topic };
  },
  async execute(args: unknown) {
    const { topic } = args as { topic: string };
    return {
      ok: true,
      content: {
        topic,
        explanation:
          topic === "分数"
            ? "分数表示整体被平均分后取其中若干份。"
            : "这是 " + topic + " 的示例解释。",
      },
    };
  },
};

registry.register(lookupConcept);

const model = new ScriptedModel([
  {
    type: "tool_calls",
    calls: [
      {
        id: "call-1",
        name: "lookup_concept",
        arguments: { topic: "分数" },
      },
    ],
  },
  {
    type: "answer",
    content: "分数表示把整体平均分成若干份后取其中几份。",
  },
]);

const executor = new ToolExecutor(
  registry,
  new BasicPolicyEngine(),
  traces,
);
const agent = new AgentKernel(model, registry, executor, traces);
const thread = threads.create("student-1", "理解分数");

const outcome = await agent.run({
  threadId: thread.id,
  userId: thread.userId,
  observation: {
    id: "observation-1",
    modality: "text",
    source: "cli",
    content: "什么是分数？",
    occurredAt: new Date().toISOString(),
  },
  allowedTools: new Set(["lookup_concept"]),
});

console.log(JSON.stringify(outcome, null, 2));
console.log("Trace events:", traces.list(outcome.traceId).length);

