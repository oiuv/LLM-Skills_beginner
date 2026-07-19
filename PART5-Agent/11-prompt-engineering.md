# Prompt Engineering for Agents

> 本章目标：掌握 Agent 场景下的 Prompt 设计方法——System Prompt 架构、工具描述优化、Few-shot 策略、以及 Prompt 对 Agent 行为的影响机制。学完本章后，你应能设计高质量的 Agent Prompt 体系。

---

## 1. Agent Prompt 和普通 Prompt 有什么不同？

### 1.1 普通 Chatbot 的 Prompt

```
普通对话的 Prompt 结构：

System: "你是一个 helpful 的助手"
User:   "北京天气怎么样？"
Assistant: "北京今天晴，25°C"

特点：
├── 一轮对话，System Prompt 简单
├── 不涉及工具调用
├── 不需要结构化输出
└── 优化目标：回答质量
```

### 1.2 Agent 的 Prompt 结构

```
Agent 的 Prompt 要复杂得多：

System Prompt
├── 角色定义：你是谁、能做什么
├── 行为约束：不能做什么、边界在哪
├── 工具描述：可用工具的功能、参数、返回值
├── 推理策略：遇到问题怎么思考
├── 输出格式：JSON、Markdown、特定结构
└── 示例：Few-shot demonstrations

工具描述（Function Definitions）
├── 工具名称
├── 功能描述（影响 LLM 是否选择这个工具）
├── 参数定义（影响 LLM 传什么参数）
└── 返回值描述（影响 LLM 如何理解结果）

对话历史
├── User messages
├── Assistant messages（包含 tool_calls）
└── Tool results

优化目标：
├── 工具选择准确率（该用哪个工具）
├── 参数提取准确率（参数对不对）
├── 推理路径合理性（思考过程对不对）
├── 输出格式合规性（输出能解析吗）
└── 边界情况处理（异常时怎么办）
```

---

## 2. System Prompt 架构设计

### 2.1 四层结构

```
一个好的 Agent System Prompt 应该有四层：

┌──────────────────────────────────────────┐
│  Layer 1: Identity（身份层）              │
│  "你是 XX 助手，负责 YY"                  │
│  → 定义角色和职责范围                      │
├──────────────────────────────────────────┤
│  Layer 2: Behavior（行为层）              │
│  "遇到 ZZ 时应该这样做"                    │
│  → 定义推理策略和决策规则                   │
├──────────────────────────────────────────┤
│  Layer 3: Constraints（约束层）           │
│  "绝对不能做 AA"                          │
│  → 定义安全边界和红线                      │
├──────────────────────────────────────────┤
│  Layer 4: Format（格式层）                │
│  "以 BB 格式输出"                          │
│  → 定义输出结构，方便程序解析               │
└──────────────────────────────────────────┘
```

### 2.2 每层的写法示例

```typescript
// Layer 1: Identity — 越具体越好
const identity = `
你是一个代码审查助手，专注于 TypeScript/Node.js 项目。
你的职责是：分析代码质量、发现潜在 bug、提出改进建议。
你不是一个通用聊天助手，不要回答与代码无关的问题。
`;

// Layer 2: Behavior — 告诉 Agent 怎么思考
const behavior = `
审查流程：
1. 先理解代码的整体结构和意图
2. 逐个文件检查，关注：类型安全、错误处理、边界条件
3. 按严重程度分类：🔴 严重 > 🟡 警告 > 🔵 建议
4. 给出具体的修改建议，不要只说"有问题"

如果代码没有明显问题，也要给出优化建议，不要只说"代码很好"。
`;

// Layer 3: Constraints — 红线
const constraints = `
限制：
- 不要修改代码，只分析和建议
- 不要执行代码，只读取和分析
- 不要访问代码仓库之外的文件
- 如果代码包含敏感信息（API Key、密码），提醒用户但不要在输出中暴露
`;

// Layer 4: Format — 结构化输出
const format = `
输出格式：
{
  "summary": "一句话总结代码质量",
  "issues": [
    {
      "severity": "critical|warning|info",
      "file": "文件路径",
      "line": 行号,
      "description": "问题描述",
      "suggestion": "修改建议"
    }
  ],
  "score": 0-100
}
`;

const systemPrompt = `${identity}\n${behavior}\n${constraints}\n${format}`;
```

### 2.3 常见错误

```
❌ 错误一：太模糊
"你是一个助手，帮助用户完成任务"
→ LLM 不知道什么任务、怎么帮、边界在哪

✅ 改进：
"你是一个项目管理助手，帮助用户创建任务、更新进度、生成周报。
你不负责代码编写或部署操作。"

---

❌ 错误二：太冗长
3000 字的 System Prompt，塞满了各种边缘情况的处理规则
→ LLM 会"忘记"后面的指令，或者混淆规则

✅ 改进：
核心规则 < 500 字，边缘情况用 Few-shot 示例代替大段文字

---

❌ 错误三：指令矛盾
"要详细分析" + "回答要简洁"
→ LLM 两头为难，输出质量下降

✅ 改进：
"分析时关注关键问题（不超过 5 个），每个问题用 1-2 句话描述"
```

---

## 3. 工具描述优化

### 3.1 工具描述直接影响 LLM 的行为

```
工具描述的重要性经常被低估。

同一个工具，描述不同，LLM 的调用方式完全不同：

描述 A：
{
  "name": "search",
  "description": "搜索信息",
  "parameters": { "query": "string" }
}

描述 B：
{
  "name": "search",
  "description": "在知识库中搜索与查询相关的文档片段。返回最相关的前 5 条结果，每条包含文档标题、相关度评分和内容摘要。当用户询问事实性问题时使用此工具。",
  "parameters": {
    "query": {
      "type": "string",
      "description": "搜索关键词，建议使用 2-5 个核心词，避免完整句子"
    },
    "top_k": {
      "type": "number",
      "description": "返回结果数量，默认 5，最大 20",
      "default": 5
    }
  }
}

效果对比：
├── 描述 A：LLM 可能传入完整句子作为 query，不知道有 top_k 参数
└── 描述 B：LLM 会提取关键词搜索，知道可以调整返回数量
```

### 3.2 工具描述的最佳实践

```
1. 描述"什么时候用"而不只是"做什么"
   ❌ "查询数据库"
   ✅ "当用户询问具体数据（如销售数字、用户数量）时查询数据库"

2. 描述返回值
   ❌ （不描述返回值）
   ✅ "返回 JSON 对象，包含 results 数组和 total_count"

3. 参数描述要具体
   ❌ "date: 日期"
   ✅ "date: 日期，格式 YYYY-MM-DD，默认今天"

4. 说明限制和注意事项
   ❌ （不提限制）
   ✅ "此 API 每分钟限 60 次调用，超出会返回 429 错误"

5. 避免工具名冲突
   ❌ search_db, search_web, search_file（LLM 容易混淆）
   ✅ database_query, web_search, file_lookup（名称有区分度）
```

### 3.3 工具数量的影响

```
工具数量 vs LLM 选择准确率：

工具数    准确率（大致）    建议
1-5      95%+            理想范围
6-10     85-95%          可以接受
11-20    70-85%          需要更好的描述
20+      < 70%           考虑分组/层级

当工具超过 15 个时的优化策略：

策略一：工具分组
├── 先让 LLM 选择"工具组"（如"数据查询"、"文件操作"）
├── 再在组内选择具体工具
└── 两步选择比一步选 20 个准确

策略二：动态工具加载
├── 根据上下文只加载相关工具
├── 代码审查时只加载"代码分析"工具，不加载"邮件"工具
└── 减少 LLM 的选择范围

策略三：工具描述中加"使用场景"
├── "当用户问 X 时使用这个工具"
├── "当用户问 Y 时不要使用这个工具，改用 Z"
└── 帮 LLM 做排除法
```

---

## 4. Few-shot 策略

### 4.1 为什么 Agent 需要 Few-shot？

```
Zero-shot（不给示例）：
System: "你是代码审查助手"
User: "审查这段代码"
→ LLM 的输出格式、深度、风格完全随机

Few-shot（给示例）：
System: "你是代码审查助手"
User: "审查这段代码"
Assistant: "### 代码审查报告\n\n**总结**：代码基本可用，有 2 个潜在问题...\n\n#### 问题 1: 🔴 空值检查缺失..."
User: "审查这段新代码"
→ LLM 会模仿示例的格式、深度、风格
```

### 4.2 Agent Few-shot 的特殊性

```
普通 Few-shot：
Q: "1+1=?"
A: "2"
→ 只需要输入输出对

Agent Few-shot 需要展示完整的"思考-行动-观察"过程：

示例：
User: "帮我查一下北京的天气"

Assistant: [思考] 用户想知道天气，需要调用天气工具。
[行动] 调用 get_weather(city="北京")
[观察] {"temp": 25, "condition": "晴", "humidity": 40%}
[回答] "北京今天晴，气温 25°C，湿度 40%。"

这样 LLM 学到的不只是"怎么回答"，而是"怎么推理和行动"。
```

### 4.3 Few-shot 的选择策略

```
好的示例应该覆盖：

1. 典型场景（最常见的用法）
   └── 用户问正常问题 → 正常调工具 → 正常回答

2. 边界情况（容易出错的场景）
   └── 用户问模糊问题 → Agent 先澄清再行动

3. 错误恢复（工具调用失败时）
   └── 工具返回错误 → Agent 换个方式尝试

4. 拒绝请求（超出能力范围时）
   └── 用户问无关问题 → Agent 礼貌拒绝

示例数量建议：
├── 1-2 个：最基本的格式引导
├── 3-5 个：覆盖主要场景（推荐）
└── 5+ 个：复杂系统，但注意 token 消耗
```

---

## 5. Prompt 对 Agent 行为的具体影响

### 5.1 工具选择偏好

```
同样的问题，不同的 Prompt 会导致不同的工具选择：

Prompt A："优先使用搜索工具获取信息"
→ User: "Python 怎么读文件" → Agent 搜索网页

Prompt B："优先使用已有知识回答，只在不确定时搜索"
→ User: "Python 怎么读文件" → Agent 直接回答（不搜索）

Prompt C："对于编程问题，先查文档再回答"
→ User: "Python 怎么读文件" → Agent 查官方文档

这三种都"合理"，但行为完全不同。
你需要根据业务场景选择合适的偏好策略。
```

### 5.2 推理深度

```
Prompt 中的推理指令直接影响 Agent 的"思考深度"：

浅层推理：
"回答用户的问题"
→ Agent 可能直接给结论，跳过中间推理

中层推理：
"先分析问题，再给出答案"
→ Agent 会说"让我想想..."然后给答案

深层推理：
"按以下步骤推理：
1. 理解用户的真实意图（不只是字面意思）
2. 列出相关信息和约束
3. 评估可能的方案
4. 选择最优方案并解释原因"
→ Agent 会进行结构化的多步推理
```

### 5.3 输出风格

```
风格指令对 Agent 输出的影响：

"简洁回答"
→ 一两句话结束

"详细分析"
→ 长篇大论

"用 bullet points"
→ 结构化列表

"先说结论，再解释"
→ 结论先行

"像一个资深工程师和同事对话"
→ 专业但不刻板

"像给小学生讲解"
→ 通俗易懂
```

---

## 6. Prompt 调试方法论

### 6.1 问题诊断流程

```
Agent 行为不对时的排查顺序：

Step 1: 是 Prompt 问题还是模型问题？
├── 用同一个 Prompt 换个模型试试
├── 如果还是错 → Prompt 问题
└── 如果变对了 → 模型能力问题

Step 2: 是哪一层 Prompt 的问题？
├── 工具选错了 → 工具描述问题
├── 参数传错了 → 参数 description 问题
├── 推理过程有问题 → Behavior 层问题
├── 输出格式不对 → Format 层问题
└── 做了不该做的事 → Constraints 层问题

Step 3: 用 Few-shot 能修复吗？
├── 能 → 加示例（最可靠的修复方式）
└── 不能 → 可能需要重新设计 Prompt 结构
```

### 6.2 Prompt 版本管理

```
Agent Prompt 应该像代码一样版本管理：

prompts/
├── v1.0-system-prompt.md     ← 初始版本
├── v1.1-fix-tool-selection.md ← 修复工具选择问题
├── v1.2-add-few-shot.md       ← 添加 Few-shot 示例
├── v2.0-restructure.md        ← 重构 Prompt 架构
└── current.md                  ← 当前使用的版本

每次修改 Prompt 后：
1. 记录改了什么、为什么改
2. 用测试用例验证效果
3. 对比修改前后的关键指标（工具选择准确率、回答质量）
```

### 6.3 A/B 测试 Prompt

```typescript
// Prompt A/B 测试框架
interface PromptVariant {
  name: string;
  systemPrompt: string;
  tools: ToolDefinition[];
}

async function abTest(
  variants: PromptVariant[],
  testCases: TestCase[],
  judge: (response: string, expected: string) => number
): Promise<Map<string, number>> {

  const scores = new Map<string, number>();

  for (const variant of variants) {
    let totalScore = 0;

    for (const testCase of testCases) {
      const response = await runAgent(variant, testCase.input);
      const score = judge(response, testCase.expected);
      totalScore += score;
    }

    scores.set(variant.name, totalScore / testCases.length);
  }

  // 输出对比结果
  for (const [name, score] of scores) {
    console.log(`${name}: ${score.toFixed(2)}`);
  }

  return scores;
}

// 使用
const variants = [
  { name: "v1 简洁版", systemPrompt: "...", tools: [...] },
  { name: "v2 详细版", systemPrompt: "...", tools: [...] },
  { name: "v3 Few-shot", systemPrompt: "...", tools: [...] },
];

const testCases = [
  { input: "查询北京天气", expected: "调用天气工具" },
  { input: "今天星期几", expected: "直接回答，不调工具" },
  // ...
];

abTest(variants, testCases, judgeFunction);
```

---

## 7. 实战：设计一个完整的 Agent Prompt

```
场景：项目管理 Agent

完整 System Prompt：
"""
# 身份
你是 ProjectBot，一个项目管理助手。你帮助团队管理任务、跟踪进度、生成报告。

# 可用工具
你可以使用以下工具：
- task_create: 创建新任务
- task_update: 更新任务状态
- task_search: 搜索任务
- report_generate: 生成进度报告
- calendar_check: 查看日历

# 行为规则

## 创建任务时
1. 如果用户没指定截止日期，询问："这个任务有截止日期吗？"
2. 如果用户没指定负责人，询问："这个任务分配给谁？"
3. 优先级默认为 medium，除非用户明确指定

## 搜索任务时
1. 用关键词搜索，不要用完整句子
2. 如果没找到结果，建议用户换个关键词

## 生成报告时
1. 先确认报告的时间范围
2. 报告包含：任务完成数、进行中、逾期、阻塞项
3. 用 Markdown 格式输出

## 拒绝请求
以下情况请拒绝：
- 删除任务（需要通过 Web 界面操作）
- 修改他人的任务（需要本人确认）
- 查询敏感信息（如薪资）

# 输出格式
创建/更新任务时返回 JSON：
{"status": "success", "task_id": "...", "message": "..."}

回答问题时用自然语言，简洁友好。
"""
```

---

## 小结

| 要点 | 内容 |
|------|------|
| **四层结构** | Identity（身份）、Behavior（行为）、Constraints（约束）、Format（格式） |
| **工具描述** | 描述"什么时候用"而不只是"做什么"，说明返回值和限制 |
| **工具数量** | 5 个以内最佳，超过 15 个考虑分组或动态加载 |
| **Few-shot** | 展示完整的思考-行动-观察过程，覆盖典型+边界+错误恢复场景 |
| **调试方法** | 先确认是 Prompt 还是模型问题，再定位到具体层 |
| **版本管理** | 像代码一样管理 Prompt 版本，每次修改都验证效果 |
