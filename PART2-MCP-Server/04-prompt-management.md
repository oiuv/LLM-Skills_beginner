# 提示词管理详解

> 本章目标：掌握 MCP 提示词模板的概念、使用场景和实现方式。学完本章后，你应能设计和使用提示词模板来提高 AI 的输出质量。

---

## 1. 提示词模板的概念

### 1.1 什么是提示词模板？

提示词模板（Prompts）是预定义的提示词结构，允许动态填充变量：

```
┌─────────────────────────────────────────────────────────────┐
│                     Prompt Template                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  模板：                                                       │
│  "请审查这个 {language} 仓库：{repo}\n\n重点检查：\n{checklist}"
│                                                              │
│  填充后：                                                     │
│  "请审查这个 Python 仓库：foo/bar\n\n重点检查：\n1. 代码规范\n2. 潜在 bug"
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 为什么需要提示词模板？

**不用模板的问题**：

```typescript
// 每次都传递完整的提示词
const response = await llm.complete(`
  请审查这个 ${language} 仓库：${repo}
  重点检查：
  1. 代码规范
  2. 潜在 bug
  3. 性能问题
`);
```

问题：
- 提示词可能很长，消耗大量 tokens
- 结构不统一，不同开发者写出来的风格不同
- 难以维护，如果要改检查项，需要改所有调用的地方

**用模板的好处**：

```typescript
// 加载模板，填充变量
const prompt = await server.getPrompt("code_review", {
  language: "Python",
  repo: "foo/bar"
});

// 返回的是完整的消息数组，可直接用于 LLM 调用
```

好处：
- 模板统一管理，修改一次，所有调用都生效
- AI 每次收到的提示结构一致
- 减少 Client 端的提示词工程负担

### 1.3 提示词模板 vs System Prompt

| 特性 | Prompt Template | System Prompt |
|------|----------------|---------------|
| **用途** | 动态生成提示 | 固定的基础配置 |
| **生命周期** | 按需加载 | 整个会话期间有效 |
| **变量** | 支持参数填充 | 不支持或支持有限 |
| **使用频率** | 特定任务时调用 | 始终生效 |
| **示例** | "代码审查模板" | "你是一个有帮助的助手" |

---

## 2. 提示词模板结构

### 2.1 模板定义三要素

```
┌─────────────────────────────────────────────────────────────┐
│                      Prompt Template                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Name（名称）                                             │
│     └── 唯一标识符，Client 用它来获取模板                     │
│                                                              │
│  2. Description（描述）                                      │
│     └── 说明模板的用途和何时使用                              │
│                                                              │
│  3. Arguments（参数）                                         │
│     └── 定义需要哪些变量                                      │
│     └── 每个参数有名称、描述、是否必需                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 完整模板定义

```typescript
interface PromptTemplate {
  name: string;
  description: string;
  arguments?: PromptArgument[];
}

interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

// 模板内容是动态生成的，不存储在定义中
```

### 2.3 模板内容生成

```typescript
// prompts-manager.ts

const codeReviewTemplate: PromptTemplate = {
  name: "code_review",
  description: "代码审查模板，用于审查代码仓库中的问题",
  arguments: [
    {
      name: "repo",
      description: "仓库路径，如 'owner/repo'",
      required: true
    },
    {
      name: "language",
      description: "主要编程语言",
      required: false
    },
    {
      name: "focus",
      description: "审查重点，用逗号分隔",
      required: false
    }
  ]
};

// 当 Client 调用 prompts/get 时，生成完整内容
async function handleGetPrompt(
  name: string,
  args: Record<string, string>
): Promise<{ messages: Message[] }> {

  if (name === "code_review") {
    const { repo, language, focus } = args;

    const defaultFocus = ["代码规范", "潜在 bug", "性能问题"].join("\n");
    const focusList = focus ? focus.split(",").map(s => `- ${s.trim()}`).join("\n") : defaultFocus;

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `请审查这个${language || ""}仓库：${repo}

重点检查：
${focusList}

请给出详细的审查报告，包括：
1. 发现的问题
2. 改进建议
3. 代码评分（1-10）`
          }
        }
      ]
    };
  }

  throw MCPError.methodNotFound(`Unknown prompt: ${name}`);
}
```

---

## 3. prompts/list 与 prompts/get

### 3.1 prompts/list

列出所有可用的提示词模板：

**请求**：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "prompts/list",
  "params": {}
}
```

**响应**：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "prompts": [
      {
        "name": "code_review",
        "description": "代码审查模板",
        "arguments": [
          { "name": "repo", "description": "仓库路径", "required": true },
          { "name": "language", "description": "编程语言", "required": false }
        ]
      },
      {
        "name": "translate",
        "description": "翻译模板",
        "arguments": [
          { "name": "text", "description": "待翻译文本", "required": true },
          { "name": "targetLang", "description": "目标语言", "required": true }
        ]
      }
    ]
  }
}
```

### 3.2 prompts/get

获取具体模板的内容（填充变量后）：

**请求**：
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "prompts/get",
  "params": {
    "name": "code_review",
    "arguments": {
      "repo": "foo/bar",
      "language": "Python"
    }
  }
}
```

**响应**：
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "messages": [
      {
        "role": "user",
        "content": {
          "type": "text",
          "text": "请审查这个 Python 仓库：foo/bar\n\n重点检查：\n1. 代码规范\n2. 潜在 bug\n3. 性能问题"
        }
      }
    ]
  }
}
```

---

## 4. Prompts Manager 实现

### 4.1 核心结构

```typescript
// prompts-manager.ts

interface PromptTemplate {
  name: string;
  description: string;
  arguments?: PromptArgument[];
}

interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: {
    type: "text";
    text: string;
  };
}

class PromptsManager {
  private prompts = new Map<string, PromptTemplate>();
  private generators = new Map<string, (args: Record<string, string>) => Promise<Message[]>>();

  /**
   * 注册模板定义
   */
  registerPrompt(template: PromptTemplate, generator: (args: Record<string, string>) => Promise<Message[]>): void {
    this.prompts.set(template.name, template);
    this.generators.set(template.name, generator);
  }

  /**
   * 处理 prompts/list 请求
   */
  handleList(request: JSONRPCRequest): JSONRPCResponse {
    const prompts = Array.from(this.prompts.values());

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { prompts }
    };
  }

  /**
   * 处理 prompts/get 请求
   */
  async handleGet(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const { name, arguments: args = {} } = request.params;

    const template = this.prompts.get(name);
    if (!template) {
      throw MCPError.methodNotFound(`Prompt not found: ${name}`);
    }

    // 验证必需参数
    for (const arg of template.arguments || []) {
      if (arg.required && !(arg.name in args)) {
        throw MCPError.invalidParams(`Missing required argument: ${arg.name}`);
      }
    }

    // 生成提示词内容
    const generator = this.generators.get(name);
    if (!generator) {
      throw new Error(`No generator for prompt: ${name}`);
    }

    const messages = await generator(args);

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { messages }
    };
  }
}
```

### 4.2 实际使用示例

```typescript
// prompts.ts

const promptsManager = new PromptsManager();

// 注册代码审查模板
promptsManager.registerPrompt(
  {
    name: "code_review",
    description: "代码审查模板，根据仓库和语言生成审查提示",
    arguments: [
      { name: "repo", description: "仓库路径 (owner/repo)", required: true },
      { name: "language", description: "主要编程语言", required: false },
      { name: "focus", description: "审查重点，用|分隔", required: false }
    ]
  },
  async (args) => {
    const defaultFocus = ["代码规范", "潜在 bug", "性能问题", "安全性"].join(" | ");
    const focus = args.focus || defaultFocus;

    return [{
      role: "user",
      content: {
        type: "text",
        text: `你是一个专业的代码审查员。请审查以下代码仓库：

**仓库**: ${args.repo}
**语言**: ${args.language || "未指定"}
**审查重点**: ${focus}

请按照以下格式输出审查结果：

## 概览
[简要描述仓库的整体情况]

## 发现的问题
### 🔴 严重问题
1. [问题描述]
   - 位置: [文件/行号]
   - 建议: [如何修复]

### 🟡 中等问题
...

### 🟢 建议改进
...

## 总体评分
[1-10分，并说明理由]

## 总结
[对项目的总体评价]`
      }
    }];
  }
);

// 注册翻译模板
promptsManager.registerPrompt(
  {
    name: "translate",
    description: "翻译模板，将文本翻译成指定语言",
    arguments: [
      { name: "text", description: "待翻译的文本", required: true },
      { name: "targetLang", description: "目标语言（如 中文、English）", required: true },
      { name: "sourceLang", description: "源语言（默认自动检测）", required: false }
    ]
  },
  async (args) => {
    const systemPrompt = args.sourceLang
      ? `你是一个翻译专家，将${args.sourceLang}翻译成${args.targetLang}。`
      : `你是一个翻译专家，自动识别语言并翻译成${args.targetLang}。`;

    return [
      {
        role: "system",
        content: { type: "text", text: systemPrompt }
      },
      {
        role: "user",
        content: { type: "text", text: args.text }
      }
    ];
  }
);

// 注册周报生成模板
promptsManager.registerPrompt(
  {
    name: "weekly_report",
    description: "周报生成模板，根据工作内容生成周报",
    arguments: [
      { name: "name", description: "姓名", required: true },
      { name: "week", description: "周次（如 2024-W01）", required: true },
      { name: "workItems", description: "工作内容（多行）", required: true },
      { name: "blockers", description: "阻碍事项（如无可不填）", required: false }
    ]
  },
  async (args) => {
    return [{
      role: "user",
      content: {
        type: "text",
        text: `请为以下信息生成一份周报：

**姓名**: ${args.name}
**周次**: ${args.week}

**本周工作**:
${args.workItems}

**阻碍事项**:
${args.blockers || "无"}

周报格式要求：
1. 结构清晰，分点列出
2. 工作成果量化（如果可能）
3. 下周计划明确
4. 控制在 500 字以内`
      }
    }];
  }
);
```

---

## 5. 模板设计最佳实践

### 5.1 模板结构设计

**✅ 好的模板结构**：

```typescript
// 清晰的分区
const template = `
## 任务
[明确说明要做什么]

## 输入
[说明提供的数据/参数]

## 约束
[时间限制、质量要求等]

## 输出格式
[期望的返回格式]

## 示例
[如果有的话，提供示例]
`.trim();
```

**❌ 避免的模板结构**：

```typescript
// 过于模糊
const template = `请帮助完成 {task}`;

// 结构混乱
const template = `帮我{task1}然后{task2}，另外还有{task3}，谢谢！`;
```

### 5.2 变量命名

**✅ 清晰的变量名**：

```typescript
arguments: [
  { name: "repositoryUrl", description: "Git 仓库地址" },
  { name: "targetLanguage", description: "翻译目标语言" },
  { name: "maxWordCount", description: "最大词数限制" }
]
```

**❌ 模糊的变量名**：

```typescript
arguments: [
  { name: "url", description: "URL" },      // 什么 URL？
  { name: "lang", description: "语言" },    // 源还是目标？
  { name: "max", description: "最大值" }    // 什么最大值？
]
```

### 5.3 默认值处理

```typescript
// 提供合理的默认值
const generator = async (args) => {
  const {
    language = "中文",        // 默认中文
    style = "professional",  // 默认专业风格
    length = "medium"        // 默认中等长度
  } = args;

  return [{
    role: "user",
    content: {
      type: "text",
      text: generateContent({ language, style, length })
    }
  }];
};
```

### 5.4 参数验证

```typescript
// 验证参数合理性
const generator = async (args) => {
  // 验证数字范围
  if (args.maxWordCount && (args.maxWordCount < 10 || args.maxWordCount > 5000)) {
    throw MCPError.invalidParams("maxWordCount must be between 10 and 5000");
  }

  // 验证枚举值
  const validStyles = ["professional", "casual", "technical"];
  if (args.style && !validStyles.includes(args.style)) {
    throw MCPError.invalidParams(`style must be one of: ${validStyles.join(", ")}`);
  }

  // 生成内容...
};
```

---

## 6. 提示词模板的使用场景

### 6.1 代码审查

```typescript
// Client 使用
const result = await client.getPrompt("code_review", {
  repo: "anthropic/mcp-sdk",
  language: "TypeScript",
  focus: "类型安全|错误处理"
});

// result.messages 可以直接传给 LLM
await llm.complete(result.messages);
```

### 6.2 文档生成

```typescript
// 周报生成
const result = await client.getPrompt("weekly_report", {
  name: "张三",
  week: "2024-W12",
  workItems: `
1. 完成用户模块开发
2. 修复登录 bug
3. 评审代码
`,
  blockers: "测试环境不稳定"
});

// LLM 生成周报
const report = await llm.complete(result.messages);
```

### 6.3 数据转换

```typescript
// CSV 转 JSON
promptsManager.registerPrompt(
  {
    name: "csv_to_json",
    description: "将 CSV 数据转换为 JSON",
    arguments: [
      { name: "csv", description: "CSV 格式数据", required: true },
      { name: "hasHeader", description: "是否有表头行", required: false }
    ]
  },
  async (args) => [{
    role: "user",
    content: {
      type: "text",
      text: `将以下 CSV 转换为 JSON 数组${args.hasHeader !== "false" ? "（第一行作为键名）" : ""}：

${args.csv}

只返回 JSON，不要其他解释。`
    }
  }]
);
```

---

## 7. 模板版本管理

### 7.1 为什么需要版本管理？

```typescript
// 场景：需要改进模板，但不想破坏现有使用方式

// 方案 1：版本号
promptsManager.registerPrompt(
  {
    name: "code_review",
    description: "代码审查模板 (v2)",
    arguments: [...]
  },
  generatorV2
);

// 使用
client.getPrompt("code_review@v2", args);

// 方案 2：维护多个版本
promptsManager.registerPrompt(
  { name: "code_review", version: "1", ... },
  generatorV1
);
promptsManager.registerPrompt(
  { name: "code_review", version: "2", ... },
  generatorV2
);
```

### 7.2 渐进式迁移

```typescript
// 新模板可以用新名称
promptsManager.registerPrompt(
  { name: "code_review_v2", ... },
  generatorV2
);

// 旧模板标记为 deprecated
promptsManager.registerPrompt(
  {
    name: "code_review",
    description: "⚠️ 已废弃，请使用 code_review_v2",
    deprecated: true,
    arguments: [...]
  },
  generatorV1
);

// Client 可以看到 deprecated 标记
const { prompts } = await client.listPrompts();
const deprecated = prompts.filter(p => p.deprecated);
```

---

## 8. 本章小结

```
提示词模板核心要点

为什么需要模板
├── 统一管理提示词结构
├── 减少 Client 端的提示词工程
├── 便于维护和修改

模板结构
├── name: 唯一标识符
├── description: 用途说明
└── arguments: 参数定义

使用流程
├── prompts/list → 获取可用模板列表
└── prompts/get → 获取填充后的提示词内容

最佳实践
├── 模板结构清晰，分区明确
├── 变量命名有意义
├── 提供合理的默认值
└── 参数验证

常见场景
├── 代码审查
├── 文档生成
├── 数据转换
└── 周报生成
```

---

## PART2 章节总结

学完 PART2 后，你应该掌握：

```
PART2-MCP-Server
├── 01-server-architecture    Server 内部结构和组件协作
├── 02-tool-definition        工具定义、inputSchema 设计模式
├── 03-resource-management     资源管理、订阅机制、缓存策略
└── 04-prompt-management      提示词模板、生成器实现
```

---

## 下一步

继续阅读：
- [05-session-lifecycle.md](05-session-lifecycle.md) — 会话状态管理
