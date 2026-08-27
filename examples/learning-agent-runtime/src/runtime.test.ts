import assert from "node:assert/strict";
import test from "node:test";
import { AgentKernel } from "./agent.js";
import { LearnerModelService } from "./learning.js";
import { ScriptedModel } from "./model.js";
import { InMemoryScheduler } from "./scheduler.js";
import { SkillRegistry } from "./skills.js";
import { InMemoryThreadStore } from "./stores.js";
import { InMemoryTraceStore } from "./trace.js";
import {
  BasicPolicyEngine,
  ToolExecutor,
  ToolRegistry,
} from "./tools.js";
import type { Tool } from "./types.js";

test("Agent completes a real model-tool-model loop", async () => {
  const registry = new ToolRegistry();
  registry.register(createEchoTool());
  const traces = new InMemoryTraceStore();
  const model = new ScriptedModel([
    {
      type: "tool_calls",
      calls: [{ id: "call-1", name: "echo", arguments: { text: "你好" } }],
    },
    { type: "answer", content: "工具返回了：你好" },
  ]);
  const agent = new AgentKernel(
    model,
    registry,
    new ToolExecutor(registry, new BasicPolicyEngine(), traces),
    traces,
  );

  const outcome = await agent.run(createRequest(new Set(["echo"])));

  assert.equal(outcome.status, "completed");
  if (outcome.status === "completed") {
    assert.equal(outcome.answer, "工具返回了：你好");
  }
  assert.equal(model.requests.length, 2);
  assert.ok(
    model.requests[1]?.messages.some(
      (message) => message.role === "tool" && message.name === "echo",
    ),
  );
  assert.ok(
    traces
      .list(outcome.traceId)
      .some((event) => event.type === "tool" && event.status === "ok"),
  );
});

test("write tools wait for persisted approval", async () => {
  const registry = new ToolRegistry();
  registry.register(createWriteTool());
  const traces = new InMemoryTraceStore();
  const model = new ScriptedModel([
    {
      type: "tool_calls",
      calls: [
        {
          id: "write-1",
          name: "save_note",
          arguments: { content: "复习分数" },
        },
      ],
    },
  ]);
  const agent = new AgentKernel(
    model,
    registry,
    new ToolExecutor(registry, new BasicPolicyEngine(), traces),
    traces,
  );

  const outcome = await agent.run(createRequest(new Set(["save_note"])));

  assert.equal(outcome.status, "waiting");
  if (outcome.status === "waiting") {
    assert.equal(outcome.reason, "approval");
  }
});

test("Agent stops when the step budget is exhausted", async () => {
  const registry = new ToolRegistry();
  registry.register(createEchoTool());
  const traces = new InMemoryTraceStore();
  const repeatedCall = {
    type: "tool_calls" as const,
    calls: [{ id: "loop", name: "echo", arguments: { text: "again" } }],
  };
  const model = new ScriptedModel([repeatedCall, repeatedCall]);
  const agent = new AgentKernel(
    model,
    registry,
    new ToolExecutor(registry, new BasicPolicyEngine(), traces),
    traces,
    { maxSteps: 2, systemInstruction: "test" },
  );

  const outcome = await agent.run(createRequest(new Set(["echo"])));

  assert.equal(outcome.status, "failed");
  if (outcome.status === "failed") {
    assert.match(outcome.error, /max steps/);
  }
});

test("Scheduler deduplicates events and recovers expired leases", () => {
  const scheduler = new InMemoryScheduler();
  scheduler.registerEvent("thread-1", "update-learning-plan", "quiz.completed");
  const now = new Date("2026-01-01T00:00:00.000Z");

  assert.equal(
    scheduler.emitEvent("event-1", "quiz.completed", now).length,
    1,
  );
  assert.equal(
    scheduler.emitEvent("event-1", "quiz.completed", now).length,
    0,
  );

  const firstClaim = scheduler.claim("worker-1", now, 1_000);
  assert.ok(firstClaim);
  const recovered = scheduler.claim(
    "worker-2",
    new Date(now.getTime() + 2_000),
    1_000,
  );
  assert.equal(recovered?.id, firstClaim.id);
  assert.equal(recovered?.attempt, 2);
});

test("Learner state changes only through evidence", () => {
  const learner = new LearnerModelService();
  const state = learner.applyEvidence({
    id: "evidence-1",
    userId: "student-1",
    conceptId: "fractions",
    score: 0.8,
    occurredAt: new Date().toISOString(),
  });

  assert.equal(state.mastery, 0.8);
  assert.deepEqual(state.evidenceRefs, ["evidence-1"]);
  assert.throws(
    () =>
      learner.applyEvidence({
        id: "invalid",
        userId: "student-1",
        conceptId: "fractions",
        score: 2,
        occurredAt: new Date().toISOString(),
      }),
    /between 0 and 1/,
  );
});

test("Skill content is loaded progressively and checks dependencies", async () => {
  const skills = new SkillRegistry();
  let loadCount = 0;
  const manifest = {
    name: "diagnose-mistakes",
    version: "1.0.0",
    description: "分析学生错题",
    triggers: ["错题"],
    requiredTools: ["echo"],
    risk: "low" as const,
  };
  skills.register(manifest, async () => {
    loadCount += 1;
    return { manifest, instructions: "先收集证据，再输出诊断。" };
  });

  assert.equal(skills.find("请分析错题").length, 1);
  assert.equal(loadCount, 0);
  await assert.rejects(
    skills.load("diagnose-mistakes", new Set()),
    /Missing required tools/,
  );
  assert.equal(loadCount, 0);
  const loaded = await skills.load(
    "diagnose-mistakes",
    new Set(["echo"]),
  );
  assert.equal(loaded.manifest.name, "diagnose-mistakes");
  assert.equal(loadCount, 1);
});

test("Thread store rejects stale cross-device updates", () => {
  const threads = new InMemoryThreadStore();
  const original = threads.create("student-1", "学习分数");
  const phoneCopy = threads.get(original.id);
  const desktopCopy = threads.get(original.id);
  assert.ok(phoneCopy);
  assert.ok(desktopCopy);

  phoneCopy.currentGoal = "学习小数";
  threads.save(phoneCopy, phoneCopy.version);
  desktopCopy.currentGoal = "学习百分数";

  assert.throws(
    () => threads.save(desktopCopy, desktopCopy.version),
    /THREAD_VERSION_CONFLICT/,
  );
});

function createRequest(allowedTools: Set<string>) {
  return {
    threadId: "thread-1",
    userId: "student-1",
    observation: {
      id: "observation-1",
      modality: "text" as const,
      source: "test",
      content: "开始",
      occurredAt: new Date().toISOString(),
    },
    allowedTools,
  };
}

function createEchoTool(): Tool {
  return {
    name: "echo",
    version: "1.0.0",
    description: "返回输入文本",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    sideEffect: "none",
    validate(input: unknown): unknown {
      if (
        typeof input !== "object" ||
        input === null ||
        !("text" in input) ||
        typeof input.text !== "string"
      ) {
        throw new Error("text must be a string");
      }
      return { text: input.text };
    },
    async execute(args: unknown) {
      return { ok: true, content: (args as { text: string }).text };
    },
  };
}

function createWriteTool(): Tool {
  return {
    name: "save_note",
    version: "1.0.0",
    description: "保存学习笔记",
    inputSchema: {
      type: "object",
      properties: { content: { type: "string" } },
      required: ["content"],
    },
    sideEffect: "write",
    validate(input: unknown): unknown {
      if (
        typeof input !== "object" ||
        input === null ||
        !("content" in input) ||
        typeof input.content !== "string"
      ) {
        throw new Error("content must be a string");
      }
      return { content: input.content };
    },
    async execute() {
      return { ok: true, content: { saved: true } };
    },
  };
}

