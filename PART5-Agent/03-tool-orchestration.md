# 工具编排模式

> 本章目标：掌握多种工具编排模式（串行、并行、链式），理解如何在 Agent 中组合使用多个工具。学完本章后，你应能根据场景选择合适的编排策略。

---

## 1. 为什么要工具编排？

### 1.1 单工具 vs 多工具

```
单工具场景：
User: "北京天气如何？"
Agent → get_weather(city=北京) → 回复

多工具场景：
User: "帮我查一下北京今天天气，然后告诉我要不要带伞"
Agent → 
  1. get_weather(city=北京) → 天气数据
  2. analyze(天气数据) → 是否需要伞
  3. 回复用户

更复杂场景：
User: "帮我规划一个北京三日游，包括天气、酒店、景点门票"
Agent →
  1. get_weather(city=北京, days=3)
  2. search_hotels(location=北京, budget=xxx)
  3. get_attractions(city=北京)
  4. book_tickets(attractions=[...])
  5. generate_itinerary(所有数据)
```

### 1.2 编排策略选择

```
┌─────────────────────────────────────────────────────────────┐
│                    编排策略选择指南                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  工具之间有依赖？                                             │
│  ├── 是：下一个依赖上一个结果                                  │
│  │   └── 选择：串行 或 链式                                  │
│  │                                                           │
│  └── 否：工具之间相互独立                                    │
│      └── 选择：并行                                          │
│                                                              │
│  需要全局最优？                                               │
│  ├── 是：规划优先                                            │
│  │   └── 选择：Plan-then-Execute                            │
│  │                                                           │
│  └── 否：根据实际情况灵活选择                                  │
│      └── 选择：ReAct                                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 串行编排

### 2.1 原理

```
┌──────────────────────────────────────────────────────────────────┐
│                      串行编排                                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Step 1 ──► Step 2 ──► Step 3 ──► ... ──► Step N              │
│      │           │           │                    │              │
│      ▼           ▼           ▼                    ▼              │
│   Result 1   Result 2   Result 3              Result N           │
│                                                                   │
│   特点：每一步依赖上一步的结果                                     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 代码实现

```typescript
// serial-orchestrator.ts

interface OrchestratorStep {
  name: string;
  tool: string;
  params?: Record<string, unknown>;
  extractKey?: string; // 从结果中提取的字段
}

class SerialOrchestrator {
  constructor(private toolExecutor: ToolExecutor) {}

  /**
   * 串行执行多个步骤
   */
  async execute(
    steps: OrchestratorStep[],
    initialContext: Record<string, unknown> = {}
  ): Promise<ExecutionResult> {
    const results: Record<string, unknown> = { ...initialContext };
    const executionLog: StepResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // 解析参数（可能引用之前的结果）
      const resolvedParams = this.resolveParams(step.params || {}, results);

      console.log(`[Step ${i + 1}] Executing: ${step.name}`);
      const startTime = Date.now();

      try {
        const result = await this.toolExecutor.execute(step.tool, resolvedParams);
        const duration = Date.now() - startTime;

        // 提取需要保存的结果
        if (step.extractKey && result.success) {
          const extracted = this.extractValue(result.data, step.extractKey);
          results[step.name] = extracted;
        } else {
          results[step.name] = result;
        }

        executionLog.push({
          step: i + 1,
          name: step.name,
          success: true,
          duration,
          result: result.data
        });

      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        executionLog.push({
          step: i + 1,
          name: step.name,
          success: false,
          duration,
          error: errorMessage
        });

        // 串行执行失败即停止
        return {
          success: false,
          completedSteps: i,
          totalSteps: steps.length,
          results,
          log: executionLog,
          error: errorMessage
        };
      }
    }

    return {
      success: true,
      completedSteps: steps.length,
      totalSteps: steps.length,
      results,
      log: executionLog
    };
  }

  /**
   * 解析参数（替换变量引用）
   */
  private resolveParams(
    params: Record<string, unknown>,
    context: Record<string, unknown>
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && value.startsWith("$")) {
        // 引用之前的结果，如 $step1.result
        const ref = value.slice(1);
        resolved[key] = this.getNestedValue(context, ref);
      } else if (typeof value === "object" && value !== null) {
        resolved[key] = this.resolveParams(value as Record<string, unknown>, context);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  private extractValue(data: unknown, path: string): unknown {
    return this.getNestedValue(data, path);
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
```

### 2.3 使用示例

```typescript
// 示例：天气查询并给出建议
async function weatherWithAdvice(city: string) {
  const orchestrator = new SerialOrchestrator(toolExecutor);

  const result = await orchestrator.execute([
    {
      name: "get_weather",
      tool: "weather.get_current",
      params: { city: city }
    },
    {
      name: "analyze_weather",
      tool: "analyze.weather",
      params: { data: "$get_weather.result" }
    },
    {
      name: "generate_advice",
      tool: "advice.generate",
      params: {
        weather: "$analyze_weather.result",
        city: city
      }
    }
  ]);

  return result.results.generate_advice;
}
```

---

## 3. 并行编排

### 3.1 原理

```
┌──────────────────────────────────────────────────────────────────┐
│                      并行编排                                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Step 1 ──► Result 1                                           │
│   Step 2 ──► Result 2    同时执行                                │
│   Step 3 ──► Result 3                                           │
│       ...                                                         │
│   Step N ──► Result N                                           │
│                                                                   │
│   特点：步骤之间相互独立，可同时执行                                 │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 代码实现

```typescript
// parallel-orchestrator.ts

class ParallelOrchestrator {
  constructor(
    private toolExecutor: ToolExecutor,
    private maxConcurrency: number = 5
  ) {}

  /**
   * 并行执行多个步骤
   */
  async execute(
    steps: OrchestratorStep[]
  ): Promise<ParallelExecutionResult> {
    const results: Map<string, unknown> = new Map();
    const errors: Map<string, string> = new Map();

    // 使用信号量控制并发
    const semaphore = new Semaphore(this.maxConcurrency);

    // 创建所有任务
    const tasks = steps.map((step) =>
      semaphore.acquire().then(async () => {
        try {
          const result = await this.executeStep(step);
          results.set(step.name, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          errors.set(step.name, message);
        } finally {
          semaphore.release();
        }
      })
    );

    // 等待所有任务完成
    await Promise.all(tasks);

    return {
      success: errors.size === 0,
      results: Object.fromEntries(results),
      errors: Object.fromEntries(errors),
      summary: {
        total: steps.length,
        succeeded: results.size,
        failed: errors.size
      }
    };
  }

  private async executeStep(step: OrchestratorStep): Promise<unknown> {
    const result = await this.toolExecutor.execute(step.tool, step.params || {});

    if (!result.success) {
      throw new Error(`Tool ${step.tool} failed: ${result.error}`);
    }

    return step.extractKey
      ? this.extractValue(result.data, step.extractKey)
      : result.data;
  }

  private extractValue(data: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = data;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}

// 信号量实现
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.permits++;

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.permits--;
      next();
    }
  }
}
```

### 3.3 使用示例

```typescript
// 示例：同时获取多个城市的天气
async function multiCityWeather(cities: string[]) {
  const orchestrator = new ParallelOrchestrator(toolExecutor, 3);

  const steps = cities.map((city) => ({
    name: `weather_${city}`,
    tool: "weather.get_current",
    params: { city: city }
  }));

  const result = await orchestrator.execute(steps);

  // 返回所有城市的天气
  return Object.entries(result.results).map(([name, data]) => ({
    city: name.replace("weather_", ""),
    data
  }));
}
```

---

## 4. 链式编排

### 4.1 原理

```
┌──────────────────────────────────────────────────────────────────┐
│                      链式编排（Fan-out/Fan-in）                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│                        ┌──► Step 2A ──┐                         │
│                        │              │                           │
│   Step 1 ─────────────┼──► Step 2B ──┼──► Step N               │
│                       │              │                           │
│                        └──► Step 2C ──┘                         │
│                                                                   │
│   特点：先分发（fan-out），再汇总（fan-in）                       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 代码实现

```typescript
// chain-orchestrator.ts

interface ChainStage {
  name: string;
  parallel: OrchestratorStep[]; // 该阶段并行执行的步骤
}

class ChainOrchestrator {
  constructor(private toolExecutor: ToolExecutor) {}

  /**
   * 链式执行多个阶段
   * 每个阶段内部并行执行，阶段之间串行执行
   */
  async execute(
    stages: ChainStage[],
    initialContext: Record<string, unknown> = {}
  ): Promise<ChainExecutionResult> {
    const context = { ...initialContext };
    const stageResults: Map<string, Map<string, unknown>> = new Map();

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      console.log(`[Stage ${i + 1}] ${stage.name}`);

      const stageStartTime = Date.now();

      // 该阶段的步骤并行执行
      const parallelResults = await this.executeParallelStage(
        stage.parallel,
        context
      );

      // 合并结果到上下文
      stageResults.set(stage.name, parallelResults.results);
      context[stage.name] = parallelResults.results;

      const stageDuration = Date.now() - stageStartTime;
      console.log(`[Stage ${i + 1}] Completed in ${stageDuration}ms`);

      // 如果该阶段有失败的步骤，根据策略决定是否继续
      if (parallelResults.failedSteps > 0) {
        console.warn(`${parallelResults.failedSteps} steps failed in stage ${stage.name}`);
      }
    }

    return {
      success: true,
      context,
      stageResults: Object.fromEntries(stageResults)
    };
  }

  private async executeParallelStage(
    steps: OrchestratorStep[],
    context: Record<string, unknown>
  ): Promise<{
    results: Record<string, unknown>;
    failedSteps: number;
  }> {
    const results: Record<string, unknown> = {};
    let failedSteps = 0;

    const tasks = steps.map(async (step) => {
      try {
        const resolvedParams = this.resolveParams(step.params || {}, context);
        const result = await this.toolExecutor.execute(step.tool, resolvedParams);

        if (result.success) {
          results[step.name] = step.extractKey
            ? this.extractValue(result.data, step.extractKey)
            : result.data;
        } else {
          results[step.name] = { error: result.error };
          failedSteps++;
        }
      } catch (error) {
        results[step.name] = { error: error instanceof Error ? error.message : "Unknown" };
        failedSteps++;
      }
    });

    await Promise.all(tasks);

    return { results, failedSteps };
  }

  private resolveParams(
    params: Record<string, unknown>,
    context: Record<string, unknown>
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && value.startsWith("$")) {
        const ref = value.slice(1);
        resolved[key] = this.getNestedValue(context, ref);
      } else if (typeof value === "object" && value !== null) {
        resolved[key] = this.resolveParams(value as Record<string, unknown>, context);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
```

### 4.3 使用示例

```typescript
// 示例：旅行规划
async function planTrip(destination: string, dates: string[]) {
  const orchestrator = new ChainOrchestrator(toolExecutor);

  const result = await orchestrator.execute([
    {
      name: "collect_info",
      parallel: [
        { name: "weather", tool: "weather.get_forecast", params: { city: destination, days: dates.length } },
        { name: "hotels", tool: "hotel.search", params: { location: destination, checkin: dates[0], checkout: dates[dates.length - 1] } },
        { name: "attractions", tool: "attractions.list", params: { city: destination } }
      ]
    },
    {
      name: "select_options",
      parallel: [
        { name: "best_days", tool: "analyze.best_days", params: { weather: "$collect_info.weather" } },
        { name: "recommended_hotels", tool: "analyze.top_hotels", params: { hotels: "$collect_info.hotels", limit: 3 } },
        { name: "must_see", tool: "analyze.must_see", params: { attractions: "$collect_info.attractions" } }
      ]
    },
    {
      name: "generate_itinerary",
      parallel: [
        { name: "itinerary", tool: "itinerary.generate", params: {
          days: "$select_options.best_days",
          hotels: "$select_options.recommended_hotels",
          attractions: "$select_options.must_see"
        }}
      ]
    }
  ]);

  return result.context.generate_itinerary;
}
```

---

## 5. 条件编排

### 5.1 原理

```
┌──────────────────────────────────────────────────────────────────┐
│                      条件编排                                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Step 1 ──► Result ──► ┌─► Step 2A (if condition A)           │
│                            │                                     │
│                            ├─► Step 2B (if condition B)           │
│                            │                                     │
│                            └─► Step 2C (if condition C)          │
│                                                                   │
│   特点：根据结果决定下一步                                         │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 代码实现

```typescript
// conditional-orchestrator.ts

interface ConditionalStep {
  name: string;
  tool: string;
  params?: Record<string, unknown>;
  condition?: {
    field: string;      // 检查的字段
    operator: "exists" | "equals" | "contains" | "gt" | "lt";
    value?: unknown;
  };
}

class ConditionalOrchestrator {
  constructor(private toolExecutor: ToolExecutor) {}

  async execute(
    steps: ConditionalStep[],
    initialContext: Record<string, unknown> = {}
  ): Promise<ConditionalExecutionResult> {
    const context = { ...initialContext };
    const executionPath: string[] = [];
    const results: Record<string, unknown> = {};

    for (const step of steps) {
      // 检查条件
      if (step.condition) {
        const shouldExecute = this.evaluateCondition(
          step.condition,
          context
        );

        if (!shouldExecute) {
          console.log(`[Conditional] Skipping ${step.name}: condition not met`);
          continue;
        }
      }

      // 执行步骤
      console.log(`[Conditional] Executing: ${step.name}`);
      const resolvedParams = this.resolveParams(step.params || {}, context);
      const result = await this.toolExecutor.execute(step.tool, resolvedParams);

      executionPath.push(step.name);
      results[step.name] = result.data;
      context[step.name] = result.data;

      if (!result.success) {
        return {
          success: false,
          completedStep: step.name,
          executionPath,
          results,
          error: result.error
        };
      }
    }

    return {
      success: true,
      executionPath,
      results
    };
  }

  private evaluateCondition(
    condition: ConditionalStep["condition"],
    context: Record<string, unknown>
  ): boolean {
    if (!condition) return true;

    const value = this.getNestedValue(context, condition.field);

    switch (condition.operator) {
      case "exists":
        return value !== undefined && value !== null;

      case "equals":
        return value === condition.value;

      case "contains":
        return typeof value === "string" && value.includes(condition.value as string);

      case "gt":
        return typeof value === "number" && value > (condition.value as number);

      case "lt":
        return typeof value === "number" && value < (condition.value as number);

      default:
        return true;
    }
  }

  private resolveParams(
    params: Record<string, unknown>,
    context: Record<string, unknown>
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && value.startsWith("$")) {
        const ref = value.slice(1);
        resolved[key] = this.getNestedValue(context, ref);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
```

### 5.3 使用示例

```typescript
// 示例：根据天气决定活动
async function planDayBasedOnWeather(city: string) {
  const orchestrator = new ConditionalOrchestrator(toolExecutor);

  const result = await orchestrator.execute([
    {
      name: "weather",
      tool: "weather.get_current",
      params: { city: city }
    },
    {
      name: "outdoor_activity",
      tool: "activity.search",
      params: { type: "outdoor", location: city },
      condition: {
        field: "weather.condition",
        operator: "equals",
        value: "sunny"
      }
    },
    {
      name: "indoor_activity",
      tool: "activity.search",
      params: { type: "indoor", location: city },
      condition: {
        field: "weather.condition",
        operator: "contains",
        value: "雨"
      }
    }
  ]);

  return result.results;
}
```

---

## 6. 重试与容错

### 6.1 重试策略

```typescript
// retry-orchestrator.ts

interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

class RetryableOrchestrator {
  constructor(
    private toolExecutor: ToolExecutor,
    private defaultRetryConfig: RetryConfig = {
      maxAttempts: 3,
      initialDelay: 1000,
      backoffMultiplier: 2
    }
  ) {}

  async executeWithRetry(
    step: OrchestratorStep,
    config?: Partial<RetryConfig>
  ): Promise<StepResult> {
    const retryConfig = { ...this.defaultRetryConfig, ...config };
    let lastError: Error;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        const result = await this.toolExecutor.execute(step.tool, step.params || {});

        if (result.success) {
          return {
            step: step.name,
            success: true,
            data: result.data,
            attempts: attempt
          };
        }

        // 检查是否是可重试的错误
        if (retryConfig.retryableErrors) {
          const shouldRetry = retryConfig.retryableErrors.some(
            (e) => result.error?.includes(e)
          );
          if (!shouldRetry) {
            throw new Error(result.error);
          }
        }

        lastError = new Error(result.error);
      } catch (error) {
        lastError = error as Error;
      }

      // 如果不是最后一次尝试，等待后重试
      if (attempt < retryConfig.maxAttempts) {
        const delay = retryConfig.initialDelay *
          Math.pow(retryConfig.backoffMultiplier, attempt - 1);
        console.log(`Retry ${attempt} failed, waiting ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    return {
      step: step.name,
      success: false,
      error: lastError.message,
      attempts: retryConfig.maxAttempts
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

---

## 7. 完整编排器

### 7.1 统一编排器

```typescript
// unified-orchestrator.ts

type OrchestrationStrategy = "serial" | "parallel" | "chain" | "conditional";

class UnifiedOrchestrator {
  constructor(
    private toolExecutor: ToolExecutor,
    private maxConcurrency: number = 5
  ) {}

  /**
   * 根据策略自动选择编排方式
   */
  async execute(
    steps: OrchestratorStep[],
    strategy: OrchestrationStrategy,
    options: OrchestrationOptions = {}
  ): Promise<ExecutionResult> {
    switch (strategy) {
      case "serial":
        return new SerialOrchestrator(this.toolExecutor).execute(steps, options.context);

      case "parallel":
        return new ParallelOrchestrator(this.toolExecutor, this.maxConcurrency).execute(steps);

      case "chain":
        // 需要分组为 stages
        const stages = this.groupIntoStages(steps);
        return new ChainOrchestrator(this.toolExecutor).execute(stages, options.context || {});

      case "conditional":
        return new ConditionalOrchestrator(this.toolExecutor).execute(
          steps as ConditionalStep[],
          options.context
        );

      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  /**
   * 智能选择策略
   */
  selectStrategy(steps: OrchestratorStep[]): OrchestrationStrategy {
    if (steps.length === 1) {
      return "serial";
    }

    // 检查是否有依赖关系
    const hasDependencies = steps.some((step) => {
      const paramsStr = JSON.stringify(step.params);
      return paramsStr.includes("$");
    });

    if (hasDependencies) {
      // 有依赖，检查是否需要条件判断
      const hasConditions = (steps as ConditionalStep[]).some(
        (step) => step.condition
      );
      return hasConditions ? "conditional" : "serial";
    }

    // 无依赖，选择并行（如果步骤较多）或串行
    return steps.length > 3 ? "parallel" : "serial";
  }

  private groupIntoStages(steps: OrchestratorStep[]): ChainStage[] {
    // 简单实现：所有步骤作为第一阶段
    return [{ name: "default", parallel: steps }];
  }
}
```

---

## 8. 本章小结

```
工具编排核心要点

编排策略选择
├── 串行：步骤有依赖，下一步需要上一步结果
├── 并行：步骤相互独立，可同时执行
├── 链式：先分发后汇总（fan-out/fan-in）
└── 条件：根据结果决定下一步

串行编排
├── 步骤依次执行
├── 失败即停止
└── 参数可引用之前结果

并行编排
├── 同时执行多个独立步骤
├── 信号量控制并发数
└── 汇总所有结果

链式编排
├── 分阶段
├── 每阶段内部并行
└── 阶段之间串行

条件编排
├── 根据条件决定是否执行
├── 支持 exists/equals/contains/gt/lt
└── 灵活控制执行路径

最佳实践
├── 根据依赖关系选择策略
├── 设置合理的并发限制
├── 添加重试和容错机制
└── 记录执行路径便于调试
```

---

## 下一步

继续阅读：
- [04-memory-system.md](04-memory-system.md) — Agent 记忆系统
