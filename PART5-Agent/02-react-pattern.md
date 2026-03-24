# ReAct 推理模式详解

> 本章目标：掌握 ReAct（Reason + Act）模式的原理和实现，理解它如何让 Agent 进行多步推理和工具调用。学完本章后，你应能实现一个基于 ReAct 的 Agent。

---

## 1. ReAct 模式原理

### 1.1 什么是 ReAct？

ReAct = **Re**asoning + **Act**ion

一种让 AI 模型在执行任务时，交替进行**推理**和**行动**的模式：

```
传统方式（一次性生成）：
User: "北京天气如何？"
AI: [直接生成答案] "北京今天晴，25°C"  ← 没有推理过程

ReAct 方式（推理+行动交替）：
Thought: 用户问北京天气，我需要先查天气
Action: tools/call(get_weather, city=北京)
Observation: 北京：晴，25°C
Thought: 拿到了天气数据，可以回答了
Response: "北京今天晴，25°C，适合户外活动"
```

### 1.2 为什么需要 ReAct？

```
问题：复杂任务需要多步推理

用户: "帮我查一下北京明天会不会下雨，如果下雨建议我带伞"

一次性回答的困难：
- 需要先查天气预报
- 需要理解数据含义
- 需要给出建议
- 多个步骤难以一次完成

ReAct 的解决方案：
1. Thought: 用户想知道明天北京是否下雨
2. Action: 调用天气工具
3. Observation: 明天有小雨
4. Thought: 确实会下雨，需要带伞
5. Response: 明天北京有小雨，建议带伞
```

### 1.3 ReAct vs 其他模式

| 模式 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| **CoT** | 思维链，逐步推理 | 推理透明 | 不能调用工具 |
| **ReAct** | 推理+行动交替 | 可与外部交互 | 循环次数有限制 |
| **Function Calling** | 直接指定工具 | 简单直接 | 需要工具列表预知 |
| **Plan-then-Execute** | 先规划后执行 | 全局最优 | 规划可能不准确 |

---

## 2. ReAct 完整流程

### 2.1 状态机

```
┌──────────────────────────────────────────────────────────────────┐
│                      ReAct 循环                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────┐                                                   │
│   │  Start  │                                                   │
│   └────┬────┘                                                   │
│        │                                                         │
│        ▼                                                         │
│   ┌─────────────┐                                               │
│   │   Thought   │ ◄── 分析当前状态，决定下一步                     │
│   │   (思考)    │                                               │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │   Action    │ ◄── 执行动作（调用工具/直接回答）               │
│   │   (行动)    │                                               │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │ Observation │ ◄── 观察行动结果                                │
│   │   (观察)    │                                               │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │  完成了吗？ │                                               │
│   └──────┬──────┘                                               │
│          │                                                       │
│     ┌────┴────┐                                                 │
│    Yes        No                                                │
│     │          │                                                 │
│     ▼          ▼                                                 │
│   ┌────┐   ┌─────────────┐                                     │
│   │End │   │  继续循环   │                                     │
│   │结束│   │  (回到Thought)│                                     │
│   └──┬─┘   └─────────────┘                                     │
│      │                                                         │
│      ▼                                                         │
│   ┌─────────────┐                                               │
│   │  Response   │ ◄── 生成最终回复                              │
│   │  (回复用户) │                                               │
│   └─────────────┘                                               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 各阶段详解

**Thought（思考）**：
- 分析当前状态
- 决定需要什么信息
- 决定下一步行动

**Action（行动）**：
- 调用工具
- 或直接生成回答

**Observation（观察）**：
- 获取行动结果
- 更新上下文

### 2.3 具体示例

```
用户输入：帮我查一下北京明天会不会下雨

=== ReAct 循环 ===

[Step 1]
Thought: 用户想知道北京明天是否下雨。我需要先调用天气工具获取预报数据。
Action: call_tool("get_weather_forecast", {"city": "北京", "days": 2})
Observation: 明天天气：小雨，温度18-22°C，降水概率80%

[Step 2]
Thought: 根据天气预报，明天确实会下雨（降水概率80%），我应该建议用户带伞。
Action: respond("明天北京有小雨，建议带伞出门！☂️ 温度18-22°C，记得添加衣物。")

=== 完成 ===
```

---

## 3. ReAct 实现

### 3.1 核心代码

```typescript
// react-agent.ts

interface ReActStep {
  thought: string;
  action: Action;
  observation?: string;
  response?: string;
}

interface Action {
  type: "tool_call" | "respond";
  tool?: string;
  params?: Record<string, unknown>;
  content?: string;
}

class ReActAgent {
  private maxIterations = 10;
  private llm: LLMInterface;
  private toolRegistry: ToolRegistry;

  constructor(llm: LLMInterface, toolRegistry: ToolRegistry) {
    this.llm = llm;
    this.toolRegistry = toolRegistry;
  }

  /**
   * 执行 ReAct 循环
   */
  async run(input: string): Promise<string> {
    // 初始化上下文
    const context: ReActContext = {
      input,
      history: [],
      currentStep: 0
    };

    // ReAct 循环
    while (context.currentStep < this.maxIterations) {
      // 1. Thought
      const thought = await this.think(context);
      context.history.push({ type: "thought", content: thought });

      // 2. 决定行动
      const action = await this.decideAction(thought, context);

      // 如果是直接回复，结束循环
      if (action.type === "respond") {
        return action.content!;
      }

      context.history.push({ type: "action", content: action });

      // 3. 执行行动
      const observation = await this.executeAction(action);

      context.history.push({ type: "observation", content: observation });

      // 4. 检查是否完成
      if (this.isComplete(observation, context)) {
        return await this.generateResponse(context);
      }

      context.currentStep++;
    }

    // 超过最大迭代次数
    throw new Error(`Max iterations (${this.maxIterations}) exceeded`);
  }

  /**
   * Thought 阶段
   */
  private async think(context: ReActContext): Promise<string> {
    const prompt = this.buildThoughtPrompt(context);
    const thought = await this.llm.complete(prompt);

    return thought;
  }

  /**
   * 决定行动
   */
  private async decideAction(thought: string, context: ReActContext): Promise<Action> {
    const prompt = this.buildActionPrompt(thought, context);
    const response = await this.llm.complete(prompt);

    return this.parseActionResponse(response);
  }

  /**
   * 执行行动
   */
  private async executeAction(action: Action): Promise<string> {
    if (action.type === "tool_call") {
      const result = await this.toolRegistry.execute(action.tool!, action.params!);
      return JSON.stringify(result);
    }

    return "";
  }

  /**
   * 检查是否完成
   */
  private isComplete(observation: string, context: ReActContext): boolean {
    // 如果观察到"完成"标记，或 LLM 判断可以结束
    const lowerObs = observation.toLowerCase();
    return lowerObs.includes("complete") ||
           lowerObs.includes("finished") ||
           lowerObs.includes("done");
  }

  /**
   * 生成最终回复
   */
  private async generateResponse(context: ReActContext): Promise<string> {
    const prompt = `
基于以下对话历史，生成对用户的最终回复：

用户输入: ${context.input}

对话历史:
${context.history.map(h => `${h.type}: ${typeof h.content === 'string' ? h.content : JSON.stringify(h.content)}`).join("\n")}

请生成简洁、自然的回复：
`;

    return await this.llm.complete(prompt);
  }

  /**
   * 构建 Thought 提示词
   */
  private buildThoughtPrompt(context: ReActContext): string {
    const history = context.history.map(h => {
      if (h.type === "thought") return `Thought: ${h.content}`;
      if (h.type === "action") return `Action: ${JSON.stringify(h.content)}`;
      if (h.type === "observation") return `Observation: ${h.content}`;
      return "";
    }).join("\n");

    return `
你是一个 AI 助手。请分析当前情况，决定下一步行动。

用户输入: ${context.input}

${history ? `对话历史:\n${history}` : ""}

请分析：
1. 用户想要什么？
2. 目前有什么信息？
3. 下一步应该做什么？

用一句话描述你的思考：
`.trim();
  }

  /**
   * 构建 Action 提示词
   */
  private buildActionPrompt(thought: string, context: ReActContext): string {
    const availableTools = this.toolRegistry.listTools();

    return `
基于你的思考，决定下一步行动。

思考: ${thought}

可用工具:
${availableTools.map(t => `- ${t.name}: ${t.description}`).join("\n")}

请用 JSON 格式返回你的行动：
{
  "type": "tool_call" | "respond",
  "tool": "工具名（如果是 tool_call）",
  "params": { "参数": "值" },
  "content": "回复内容（如果是 respond）"
}
`.trim();
  }

  /**
   * 解析行动响应
   */
  private parseActionResponse(response: string): Action {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          type: parsed.type,
          tool: parsed.tool,
          params: parsed.params,
          content: parsed.content
        };
      }
    } catch {
      // 解析失败，假设是直接回复
    }

    return { type: "respond", content: response };
  }
}
```

---

## 4. ReAct 变体

### 4.1 ReAct + CoT（结合思维链）

```typescript
// react-cot-agent.ts

/**
 * ReAct + CoT 结合的 Agent
 * 在每个 Thought 阶段进行更深入的推理
 */
class ReActCoTAgent {
  async think(context: ReActContext): Promise<string> {
    const prompt = `
你是一个 AI 助手，正在帮助用户解决问题。

用户输入: ${context.input}

对话历史:
${context.history.map(h => `${h.type}: ${typeof h.content === 'string' ? h.content : JSON.stringify(h.content)}`).join("\n")}

请进行深度推理：

1. **当前状态总结**：到目前为止，我们知道什么？
2. **目标分析**：用户最终想要什么？
3. **差距分析**：目前状态和目标之间还有什么差距？
4. **下一步行动**：为了缩小差距，下一步应该做什么？

请按以上格式分析，然后给出你的行动决定。
`.trim();

    return await this.llm.complete(prompt);
  }
}
```

### 4.2 反思增强（ReAct + Reflection）

```typescript
// react-reflection-agent.ts

/**
 * 带反思能力的 ReAct Agent
 * 执行后检查结果是否合理
 */
class ReActReflectionAgent extends ReActAgent {
  protected async executeAction(action: Action): Promise<string> {
    // 执行行动
    const result = await super.executeAction(action);

    // 反思结果
    const reflection = await this.reflect(action, result);

    if (reflection.needsRetry) {
      console.log(`反思: ${reflection.reason}`);
      // 重新执行
      return await this.executeAction(reflection.newAction);
    }

    return result;
  }

  private async reflect(action: Action, result: string): Promise<{
    needsRetry: boolean;
    reason?: string;
    newAction?: Action;
  }> {
    const prompt = `
检查以下行动结果是否合理：

行动: ${JSON.stringify(action)}
结果: ${result}

问题：
1. 结果是否成功获取了需要的信息？
2. 结果是否完整？
3. 是否需要更多信息？

如果结果不理想，说明需要如何改进：
`.trim();

    const response = await this.llm.complete(prompt);

    // 简单解析，实际应该用更好的解析方式
    if (response.includes("需要重试") || response.includes("不完整")) {
      return {
        needsRetry: true,
        reason: response,
        newAction: this.extractRetryAction(response)
      };
    }

    return { needsRetry: false };
  }
}
```

### 4.3 计划导向的 ReAct

```typescript
// plan-react-agent.ts

/**
 * 先规划再执行的 ReAct Agent
 */
class PlanReActAgent {
  /**
   * 先创建计划，再按计划执行
   */
  async run(input: string): Promise<string> {
    // 1. 创建计划
    const plan = await this.createPlan(input);
    console.log("Plan:", plan);

    // 2. 按计划执行
    const results: unknown[] = [];
    for (const step of plan.steps) {
      const result = await this.executeStep(step);
      results.push(result);

      // 3. 检查是否需要调整计划
      const adjustment = await this.checkAndAdjust(step, result, plan);
      if (adjustment.needsAdjustment) {
        console.log("Adjusting plan:", adjustment.reason);
        plan = adjustment.newPlan;
      }
    }

    // 4. 生成回复
    return await this.generateResponse(input, results);
  }

  private async createPlan(input: string): Promise<Plan> {
    const prompt = `
用户需求: ${input}

请将这个需求分解成具体的执行步骤。

返回 JSON 格式：
{
  "goal": "总体目标",
  "steps": [
    { "id": 1, "action": "工具名", "params": {...}, "purpose": "目的" },
    { "id": 2, "action": "工具名", "params": {...}, "purpose": "目的" }
  ]
}
`.trim();

    const response = await this.llm.complete(prompt);
    return JSON.parse(this.extractJSON(response));
  }

  private async executeStep(step: PlanStep): Promise<unknown> {
    return await this.toolRegistry.execute(step.action, step.params);
  }

  private async checkAndAdjust(
    step: PlanStep,
    result: unknown,
    plan: Plan
  ): Promise<{ needsAdjustment: boolean; reason?: string; newPlan?: Plan }> {
    const prompt = `
步骤 ${step.id}: 执行 ${step.action}，参数 ${JSON.stringify(step.params)}
目的: ${step.purpose}
结果: ${JSON.stringify(result)}

检查：
1. 结果是否达到了目的？
2. 是否需要调整后续步骤？
3. 是否需要添加新步骤？

如果需要调整，说明原因和建议的新计划。
`.trim();

    const response = await this.llm.complete(prompt);

    if (response.includes("需要调整")) {
      return {
        needsAdjustment: true,
        reason: response,
        newPlan: await this.createPlan(response + " 基于原始需求: " + plan.goal)
      };
    }

    return { needsAdjustment: false };
  }
}
```

---

## 5. Function Calling 模式

### 5.1 什么是 Function Calling？

Function Calling 是让 LLM 直接在响应中指定要调用的函数：

```json
{
  "type": "function_call",
  "function": "get_weather",
  "arguments": { "city": "北京" }
}
```

### 5.2 ReAct vs Function Calling

| 对比 | ReAct | Function Calling |
|------|-------|-----------------|
| **调用方式** | Thought → Action → Observation | 直接指定函数 |
| **推理过程** | 显式的 Thought 步骤 | 隐含在模型内部 |
| **灵活性** | 高（可自定义循环逻辑） | 低（受模型能力限制） |
| **可控性** | 高（每步可检查） | 中（直接执行） |
| **适用场景** | 复杂多步任务 | 简单明确的工具调用 |

### 5.3 选择建议

```
场景 1：简单问答（查天气、计算等）
→ 选择 Function Calling，简洁直接

场景 2：复杂多步任务（旅行规划、代码审查）
→ 选择 ReAct，推理过程清晰

场景 3：需要严格控制每一步
→ 选择 ReAct，可插入检查点

场景 4：模型本身支持 Function Calling
→ 可以结合两者：用 Function Calling 执行，用 ReAct 规划
```

---

## 6. 实际应用示例

### 6.1 天气查询 Agent

```typescript
// weather-react-agent.ts

class WeatherReActAgent extends ReActAgent {
  constructor(llm: LLMInterface, mcpClient: MCPClient) {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      name: "get_weather",
      description: "获取城市实时天气",
      handler: async (params: { city: string; units?: string }) => {
        return await mcpClient.callTool("get_weather", params);
      }
    });

    super(llm, toolRegistry);
  }

  protected buildActionPrompt(thought: string, context: ReActContext): string {
    return `
思考: ${thought}

可用行动：
1. call_tool("get_weather", {"city": "城市名", "units": "metric|imperial"})
2. respond("回复内容") - 当已经有足够信息回答用户时

请选择下一步行动，返回 JSON：
{
  "type": "tool_call" | "respond",
  "tool": "get_weather",
  "params": {"city": "城市名"},
  "content": "回复内容（仅 respond 时需要）"
}
`.trim();
  }
}
```

### 6.2 代码审查 Agent

```typescript
// code-review-react-agent.ts

class CodeReviewReActAgent extends ReActAgent {
  constructor(llm: LLMInterface, mcpClient: MCPClient) {
    const toolRegistry = new ToolRegistry();

    // 注册代码审查相关工具
    toolRegistry.register({
      name: "get_code_info",
      handler: async (params) => mcpClient.callTool("github.get_repo_info", params)
    });

    toolRegistry.register({
      name: "get_pull_request",
      handler: async (params) => mcpClient.callTool("github.get_pr", params)
    });

    toolRegistry.register({
      name: "get_file_content",
      handler: async (params) => mcpClient.callTool("github.get_file", params)
    });

    toolRegistry.register({
      name: "create_review_comment",
      handler: async (params) => mcpClient.callTool("github.create_comment", params)
    });

    super(llm, toolRegistry);
  }

  protected isComplete(observation: string, context: ReActContext): boolean {
    // 代码审查需要检查所有文件后才算完成
    const history = context.history.filter(h => h.type === "observation");
    const reviewedFiles = history.filter(h => h.content.includes("reviewed")).length;
    const totalFiles = this.extractFileCount(context.input);

    return reviewedFiles >= totalFiles;
  }

  private extractFileCount(input: string): number {
    // 简单实现，实际应该从 PR 信息中获取
    return input.includes("all files") ? 10 : 1;
  }
}
```

---

## 7. 最佳实践

### 7.1 提示词设计

**✅ 好的 Thought 提示词**：
```
请分析当前情况，决定下一步行动。

用户需求: {用户输入}
已知信息: {已有结果}
目标: {最终目标}

请思考：
1. 我们已经知道什么？
2. 还需要什么信息？
3. 下一步做什么最合理？
```

**❌ 不好的 Thought 提示词**：
```
下一步做什么？
```

### 7.2 迭代限制

```typescript
// 设置合理的迭代次数
const maxIterations = 10; // 简单任务 5-10 次
const maxIterations = 20; // 复杂任务 15-20 次

// 超过限制时的处理
if (context.currentStep >= maxIterations) {
  // 生成部分结果或请求用户确认
  return await this.generatePartialResponse(context);
}
```

### 7.3 错误处理

```typescript
// 工具执行失败的处理
private async executeAction(action: Action): Promise<string> {
  try {
    return await super.executeAction(action);
  } catch (error) {
    // 记录错误，继续尝试其他方式
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return JSON.stringify({
      error: true,
      message: `工具执行失败: ${errorMessage}`,
      suggestion: "可能需要尝试其他方法或简化请求"
    });
  }
}
```

---

## 8. 本章小结

```
ReAct 模式核心要点

什么是 ReAct
├── Reasoning + Action 交替
├── 每步：Thought → Action → Observation
└── 适用于需要多步推理的复杂任务

ReAct 循环
├── Thought: 分析当前状态
├── Action: 决定并执行行动
├── Observation: 观察结果
└── 检查是否完成，循环或结束

ReAct vs Function Calling
├── ReAct: 显式推理，灵活可控
├── Function Calling: 直接快速
└── 场景不同，选择不同

最佳实践
├── 清晰的 Thought 提示词
├── 合理的迭代次数限制
├── 完善的错误处理
└── 适当的完成判断逻辑
```

---

## 下一步

继续阅读：
- [03-tool-orchestration.md](03-tool-orchestration.md) — 工具编排模式
