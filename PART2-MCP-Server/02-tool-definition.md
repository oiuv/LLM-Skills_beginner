# 工具定义详解

> 本章目标：掌握 MCP 工具的定义方式、inputSchema 的设计模式、以及工具执行的最佳实践。学完本章后，你应能定义任何复杂度的工具，并正确处理工具执行中的各种情况。

---

## 1. 工具在 MCP 中的地位

### 1.1 工具是 MCP 的核心

工具（Tools）是 MCP 最核心的能力，它让 AI 模型能够执行外部操作：

```
没有工具：
User: "北京天气怎么样？"
AI: "我无法获取实时天气信息..."

有工具：
User: "北京天气怎么样？"
AI ──tools/call──► Weather Server ──► API ──► 返回天气
AI: "北京今天晴，25°C，适合户外活动"
```

### 1.2 工具 vs 其他能力

| 能力 | 行为 | 副作用 | 类比 |
|------|------|--------|------|
| **Tools** | 执行动作 | 有 | 函数调用 |
| **Resources** | 读取数据 | 无 | 文件读取 |
| **Prompts** | 生成文本 | 无 | 模板渲染 |

---

## 2. 工具定义结构

### 2.1 工具的核心要素

每个工具由以下部分组成：

```
┌─────────────────────────────────────────────────────────────┐
│                       Tool                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Name（名称）                                             │
│     └── 唯一标识符，snake_case 格式                          │
│                                                              │
│  2. Title（标题）                                           │
│     └── 人类可读的简短标题，用于 UI 显示                     │
│                                                              │
│  3. Description（描述）                                     │
│     └── 告诉 AI 这个工具做什么、何时使用                      │
│                                                              │
│  4. Input Schema（输入模式）                                 │
│     └── 定义工具需要什么参数                                 │
│                                                              │
│  5. Icons（图标）                                           │
│     └── 工具的可视化图标（emoji 或图片 URL）                  │
│                                                              │
│  6. Output Schema（输出模式）                                │
│     └── 定义工具返回数据的结构（可选）                        │
│                                                              │
│  7. Annotations（标注）                                      │
│     └── 工具的元数据标注                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 最小工具定义

```typescript
const tool: Tool = {
  name: "hello",
  description: "说 hello",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  },
  handler: async (args) => {
    return { content: [{ type: "text", text: "Hello!" }] };
  }
};
```

### 2.3 完整工具定义示例

```typescript
const getWeatherTool: Tool = {
  name: "get_weather",
  title: "查询天气",
  description: "查询城市实时天气，包括温度、湿度、风速等。注意：不支持县级市查询。",
  icons: [
    { type: "image", data: "base64...", mimeType: "image/png" },
    { type: "text", text: "🌤️" }
  ],
  inputSchema: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "城市名称，支持中文或英文，如 '北京'、'Shanghai'"
      },
      units: {
        type: "string",
        enum: ["metric", "imperial"],
        description: "温度单位：metric(摄氏度) 或 imperial(华氏度)",
        default: "metric"
      }
    },
    required: ["city"]
  },
  outputSchema: {
    type: "object",
    properties: {
      temperature: { type: "number" },
      condition: { type: "string" },
      humidity: { type: "number" }
    }
  },
  annotations: {
    prompt: "当用户询问天气时使用",
    commit: "feat(weather): 添加天气查询功能",
    impact: "medium",
    default: false
  },
  handler: async (args) => {
    const { city, units = "metric" } = args;
    const weather = await fetchWeather(city, units);
    return {
      content: [{
        type: "text",
        text: formatWeather(weather)
      }],
      _meta: {
        contentType: "application/json"
      }
    };
  }
};
```

---

### 2.4 Title（标题）

`title` 是一个人类可读的简短标题，用于 UI 显示：

```typescript
const tool = {
  name: "get_weather",
  title: "查询天气",  // 简短标题
  description: "查询城市实时天气..."
};
```

**注意**：`title` 与 `name` 的区别：
- `name`：机器可读的唯一标识符（snake_case）
- `title`：人类可读的显示名称

### 2.5 Icons（图标）

`icons` 字段用于指定工具的可视化图标：

```typescript
const tool = {
  name: "get_weather",
  description: "查询城市实时天气...",
  icons: [
    // 图片图标（base64 或 URL）
    {
      type: "image",
      data: "base64 encoded image data",
      mimeType: "image/png"
    },
    // 或 emoji 图标
    {
      type: "text",
      text: "🌤️"
    }
  ]
};
```

### 2.6 Output Schema（输出模式）

`outputSchema` 定义工具返回数据的结构，有助于 Client 正确解析结果：

```typescript
const tool = {
  name: "get_weather",
  description: "查询城市实时天气...",
  inputSchema: { /* ... */ },
  outputSchema: {
    type: "object",
    properties: {
      temperature: {
        type: "number",
        description: "温度（摄氏度）"
      },
      condition: {
        type: "string",
        description: "天气状况，如 '晴'、'多云'、'雨'"
      },
      humidity: {
        type: "number",
        description: "湿度（百分比）"
      },
      windSpeed: {
        type: "number",
        description: "风速（米/秒）"
      }
    },
    required: ["temperature", "condition"]
  }
};
```

### 2.7 Annotations（标注）

`annotations` 提供工具的元数据标注：

```typescript
const tool = {
  name: "get_weather",
  description: "查询城市实时天气...",
  annotations: {
    // 提示 AI 何时使用这个工具
    prompt: "当用户询问天气或气温时使用",

    // 关联的代码提交
    commit: "feat(weather): 添加天气查询功能",

    // 影响程度：low, medium, high
    impact: "medium",

    // 是否为默认工具
    default: false,

    // 认证要求
    requiresAuth: true
  }
};
```

**annotations 字段详解**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `prompt` | string | 提示 AI 何时使用 |
| `commit` | string | 关联的 git commit |
| `impact` | string | 影响程度：low/medium/high |
| `default` | boolean | 是否为默认工具 |
| `requiresAuth` | boolean | 是否需要认证 |

### 2.8 tools/list 分页支持

`tools/list` 响应支持分页，当工具数量较多时：

```typescript
// tools/list 响应（带分页）
{
  "tools": [...],
  "nextCursor": "eyJpZCI6MTIzfQ=="
}

// 带有 cursor 的请求
{
  "method": "tools/list",
  "params": {
    "cursor": "eyJpZCI6MTIzfQ=="
  }
}
```

---

## 3. inputSchema 详解

### 3.1 什么是 JSON Schema？

inputSchema 使用 [JSON Schema](https://json-schema.org/) 规范来定义参数结构。

**为什么用 JSON Schema？**
- 标准化：业界通用的 Schema 规范
- 可验证：自动验证参数是否合法
- 自描述：包含类型、描述、约束等信息

### 3.2 基本类型

```typescript
inputSchema: {
  type: "object",
  properties: {
    // 字符串
    name: { type: "string" },

    // 数字
    age: { type: "number" },

    // 布尔
    enabled: { type: "boolean" },

    // 数组
    tags: { type: "array" },

    // 对象
    address: { type: "object" }
  }
}
```

### 3.3 字符串类型详细定义

```typescript
properties: {
  // 基础字符串
  name: {
    type: "string",
    description: "用户名称"
  },

  // 有格式校验的字符串
  email: {
    type: "string",
    format: "email",
    description: "邮箱地址"
  },

  // 有枚举值的字符串
  status: {
    type: "string",
    enum: ["active", "inactive", "pending"],
    description: "用户状态"
  },

  // 有默认值的字符串
  language: {
    type: "string",
    default: "zh-CN",
    description: "语言设置"
  },

  // 最小/最大长度
  username: {
    type: "string",
    minLength: 3,
    maxLength: 20,
    description: "用户名（3-20字符）"
  },

  // 正则匹配
  phone: {
    type: "string",
    pattern: "^1[3-9]\\d{9}$",
    description: "中国手机号"
  }
}
```

### 3.4 数字类型详细定义

```typescript
properties: {
  // 基础数字
  age: { type: "number" },

  // 整数
  quantity: {
    type: "number",
    multipleOf: 1,  // 必须是整数
    minimum: 1,
    maximum: 100,
    description: "数量（1-100）"
  },

  // 浮点数
  price: {
    type: "number",
    minimum: 0,
    exclusiveMinimum: true,  // 必须 > 0，不是 >= 0
    description: "价格（必须大于0）"
  },

  // 默认值
  timeout: {
    type: "number",
    default: 30000,
    description: "超时时间（毫秒）"
  }
}
```

### 3.5 数组类型详细定义

```typescript
properties: {
  // 简单数组
  tags: {
    type: "array",
    items: { type: "string" },
    description: "标签列表"
  },

  // 指定最小/最大元素数
  emails: {
    type: "array",
    items: { type: "string", format: "email" },
    minItems: 1,
    maxItems: 10,
    description: "邮箱列表（1-10个）"
  },

  // 枚举数组
  colors: {
    type: "array",
    items: {
      type: "string",
      enum: ["red", "green", "blue"]
    },
    uniqueItems: true,
    description: "颜色列表（不重复）"
  }
}
```

### 3.6 对象类型详细定义

```typescript
properties: {
  // 简单对象
  user: {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" }
    }
  },

  // 嵌套对象
  address: {
    type: "object",
    properties: {
      street: { type: "string" },
      city: { type: "string" },
      country: { type: "string", default: "China" }
    },
    required: ["city"]
  },

  // 任意额外属性
  metadata: {
    type: "object",
    additionalProperties: true,
    description: "额外元数据"
  }
}
```

### 3.7 required 字段

```typescript
inputSchema: {
  type: "object",
  properties: {
    name: { type: "string" },
    email: { type: "string" },
    age: { type: "number" }
  },
  required: ["name", "email"]  // name 和 email 是必需的，age 是可选的
}
```

**required 规则**：
- 是一个字符串数组
- 数组中的每个字符串必须是 `properties` 中定义的键
- 缺失 required 中的字段会导致参数验证失败

---

## 4. inputSchema 设计模式

### 4.1 模式 1：简单参数

当工具只需要几个简单参数时：

```typescript
const calculatorTool = {
  name: "calculate",
  description: "执行数学计算，支持加减乘除",
  inputSchema: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "数学表达式，如 '2 + 3 * 4'"
      }
    },
    required: ["expression"]
  },
  handler: async ({ expression }) => {
    const result = eval(expression); // 注意：实际代码应使用安全的表达式解析器
    return { content: [{ type: "text", text: `结果: ${result}` }] };
  }
};
```

### 4.2 模式 2：多参数

当工具需要多个相关参数时：

```typescript
const sendEmailTool = {
  name: "send_email",
  description: "发送电子邮件",
  inputSchema: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: "收件人邮箱"
      },
      subject: {
        type: "string",
        maxLength: 200,
        description: "邮件主题（最多200字符）"
      },
      body: {
        type: "string",
        description: "邮件正文"
      },
      cc: {
        type: "array",
        items: { type: "string" },
        description: "抄送邮箱列表"
      },
      priority: {
        type: "string",
        enum: ["low", "normal", "high"],
        default: "normal",
        description: "邮件优先级"
      }
    },
    required: ["to", "subject", "body"]
  },
  handler: async (args) => {
    await emailService.send(args);
    return { content: [{ type: "text", text: "邮件已发送" }] };
  }
};
```

### 4.3 模式 3：分页参数

当工具返回列表数据时：

```typescript
const listFilesTool = {
  name: "list_files",
  description: "列出目录中的文件",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "目录路径"
      },
      page: {
        type: "number",
        default: 1,
        minimum: 1,
        description: "页码（从1开始）"
      },
      pageSize: {
        type: "number",
        default: 20,
        minimum: 1,
        maximum: 100,
        description: "每页数量（1-100）"
      },
      filter: {
        type: "string",
        description: "文件名过滤（支持通配符 *）"
      }
    },
    required: ["path"]
  },
  handler: async ({ path, page = 1, pageSize = 20, filter }) => {
    const files = await fileSystem.list(path, { filter });
    const paginated = files.slice((page - 1) * pageSize, page * pageSize);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total: files.length,
          page,
          pageSize,
          items: paginated
        })
      }]
    };
  }
};
```

### 4.4 模式 4：复合参数

当参数之间有逻辑关系时：

```typescript
const searchTool = {
  name: "search",
  description: "搜索内容，支持多种搜索方式",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词"
      },
      // 搜索方式：只能选择一种
      mode: {
        type: "string",
        enum: ["fuzzy", "exact", "regex"],
        description: "搜索模式"
      },
      // 当 mode 为 exact 时的参数
      caseSensitive: {
        type: "boolean",
        default: false,
        description: "是否区分大小写"
      },
      // 当 mode 为 regex 时的参数
      pattern: {
        type: "string",
        description: "正则表达式（仅 mode=regex 时有效）"
      }
    },
    required: ["query"]
  },
  handler: async (args) => {
    let results;
    switch (args.mode) {
      case "exact":
        results = await searchExact(args.query, args.caseSensitive);
        break;
      case "regex":
        results = await searchRegex(args.query, args.pattern);
        break;
      default:
        results = await searchFuzzy(args.query);
    }
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
};
```

---

## 5. 工具 Handler 实现

### 5.1 Handler 签名

```typescript
type ToolHandler = (arguments: Record<string, unknown>) => Promise<ToolResult>;

interface ToolResult {
  content: Content[];
  isError?: boolean;
}

interface Content {
  // 文本内容
  type: "text" | "image" | "audio" | "resource" | "resourceLink" | "structuredContent";
  text?: string;
  data?: string;           // base64 for image/audio
  mimeType?: string;       // for image/audio
  resource?: ResourceContent;   // for resource
  resourceLink?: {
    url: string;
    description?: string;
  };  // for resourceLink
  structuredContent?: unknown;  // for structuredContent
}
```

### 5.2 返回文本结果

```typescript
handler: async (args) => {
  const { city } = args;

  // 业务逻辑
  const weather = await weatherApi.get(city);

  // 返回文本
  return {
    content: [{
      type: "text",
      text: `🌤️ ${city}天气\n温度: ${weather.temp}°C\n湿度: ${weather.humidity}%`
    }]
  };
}
```

### 5.3 返回图片结果

```typescript
handler: async (args) => {
  const { chartType, data } = args;

  // 生成图表
  const imageBuffer = await chartGenerator.create(chartType, data);

  // 返回图片（base64 编码）
  return {
    content: [{
      type: "image",
      data: imageBuffer.toString("base64"),
      mimeType: "image/png"
    }]
  };
}
```

### 5.4 返回音频结果

```typescript
handler: async (args) => {
  const { text } = args;

  // 文字转语音
  const audioBuffer = await ttsService.synthesize(text);

  // 返回音频（base64 编码）
  return {
    content: [{
      type: "audio",
      data: audioBuffer.toString("base64"),
      mimeType: "audio/mp3"
    }]
  };
}
```

### 5.5 返回结构化内容

```typescript
handler: async (args) => {
  const { city } = args;

  // 获取天气数据
  const weather = await weatherApi.get(city);

  // 返回结构化数据（JSON）
  return {
    content: [{
      type: "structuredContent",
      structuredContent: {
        temperature: weather.temp,
        condition: weather.condition,
        humidity: weather.humidity,
        windSpeed: weather.windSpeed,
        aqi: weather.aqi,
        updatedAt: weather.updatedAt
      }
    }]
  };
}
```

### 5.6 返回错误结果

```typescript
handler: async (args) => {
  const { city } = args;

  try {
    const weather = await weatherApi.get(city);
    return {
      content: [{
        type: "text",
        text: formatWeather(weather)
      }]
    };
  } catch (error) {
    // 返回错误结果（isError = true）
    // 这告诉 AI 这个调用虽然失败了，但是是预期的错误
    return {
      content: [{
        type: "text",
        text: `查询失败: ${error.message}`
      }],
      isError: true
    };
  }
}
```

### 5.5 异步 Handler

```typescript
handler: async (args) => {
  const { url } = args;

  // 模拟长时间操作
  const result = await new Promise((resolve) => {
    setTimeout(() => {
      resolve({ url, status: "completed" });
    }, 5000);
  });

  return {
    content: [{
      type: "text",
      text: `任务完成: ${JSON.stringify(result)}`
    }]
  };
}
```

---

## 6. 参数验证

### 6.1 为什么需要验证？

即使 inputSchema 定义了参数规范，Handler 收到的参数仍可能无效：
- 客户端没有遵循 Schema
- 网络传输导致数据损坏
- 业务逻辑需要额外的约束

### 6.2 手动验证

```typescript
handler: async (args) => {
  const { city, days } = args;

  // 手动验证
  if (typeof city !== "string" || city.trim() === "") {
    throw MCPError.invalidParams("city must be a non-empty string");
  }

  if (typeof days !== "number" || days < 1 || days > 7) {
    throw MCPError.invalidParams("days must be between 1 and 7");
  }

  // 业务逻辑
  const forecast = await weatherApi.getForecast(city, days);
  return { content: [{ type: "text", text: formatForecast(forecast) }] };
}
```

### 6.3 使用 ajv 自动验证

```typescript
import Ajv from "ajv";

const ajv = new Ajv();
const validate = ajv.compile(inputSchema);

handler: async (args) => {
  // 自动验证
  const valid = validate(args);
  if (!valid) {
    const errors = validate.errors?.map(e => `${e.instancePath} ${e.message}`).join(", ");
    throw MCPError.invalidParams(`Validation failed: ${errors}`);
  }

  // 业务逻辑
  ...
}
```

### 6.4 验证工具注册

```typescript
class ToolsManager {
  registerTool(tool: Tool, options: { validateArgs = true } = {}): void {
    // 编译验证函数
    if (options.validateArgs && tool.inputSchema) {
      const validate = ajv.compile(tool.inputSchema);
      const originalHandler = tool.handler;

      // 包装 handler，自动验证参数
      tool.handler = async (args) => {
        const valid = validate(args);
        if (!valid) {
          throw MCPError.invalidParams(
            `Invalid arguments: ${validate.errors?.map(e => `${e.instancePath} ${e.message}`).join(", ")}`
          );
        }
        return originalHandler(args);
      };
    }

    this.tools.set(tool.name, tool);
  }
}
```

---

## 7. 完整示例：天气 MCP Server

### 7.1 项目结构

```
weather-server/
├── src/
│   ├── index.ts           # 入口
│   ├── server.ts          # Server 主类
│   ├── tools/
│   │   ├── index.ts       # 工具注册
│   │   ├── get-weather.ts # 查天气工具
│   │   └── get-forecast.ts# 查预报工具
│   ├── transports/
│   │   └── stdio.ts      # stdio 传输
│   └── utils/
│       └── weather-api.ts # 天气 API
├── package.json
└── tsconfig.json
```

### 7.2 工具定义

```typescript
// src/tools/get-weather.ts

export const getWeatherTool: Tool = {
  name: "get_weather",
  description: "查询城市实时天气。返回温度、湿度、风速、空气质量等信息。",
  inputSchema: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "城市名称（中文或英文），如 '北京'、'Shanghai'"
      },
      units: {
        type: "string",
        enum: ["metric", "imperial"],
        default: "metric",
        description: "温度单位：metric=摄氏度，imperial=华氏度"
      }
    },
    required: ["city"]
  },
  handler: async (args, context) => {
    const { city, units = "metric" } = args;

    // 调用天气 API
    const weather = await weatherApi.getCurrentWeather(city, units);

    // 格式化输出
    const tempUnit = units === "metric" ? "°C" : "°F";
    const text = [
      `🌤️ ${city} 实时天气`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `温度: ${weather.temp}${tempUnit}`,
      `天气: ${weather.condition}`,
      `湿度: ${weather.humidity}%`,
      `风速: ${weather.windSpeed}${units === "metric" ? "m/s" : "mph"}`,
      `空气质量: ${weather.aqi}`,
      `更新时间: ${weather.updatedAt}`
    ].join("\n");

    return {
      content: [{ type: "text", text }]
    };
  }
};
```

### 7.3 Server 主类

```typescript
// src/server.ts

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { MCPServer } from "./server.js";

const server = new MCPServer({
  name: "weather-server",
  version: "1.0.0"
});

// 注册工具
server.registerTool(getWeatherTool);
server.registerTool(getForecastTool);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Weather server started");
}

main().catch(console.error);
```

---

## 8. 最佳实践

### 8.1 Description 写作指南

**✅ 好的 Description**：
- 说明工具的用途
- 说明何时应该使用
- 说明返回什么类型的数据
- 说明已知的限制

```typescript
// 好例子
description: `
  查询城市实时天气信息。

  适用场景：
  - 用户问"北京今天天气怎么样"
  - 用户问"明天要不要带伞"

  返回数据：
  - 温度、湿度、风速、空气质量
  - 更新时间为服务器时间

  注意：
  - 不支持县级市查询
  - 国外城市可能数据不完整
`
```

**❌ 差的 Description**：
- 太简单，没有说明用途
- 没有说明限制条件
- 误导性的描述

### 8.2 参数命名

**✅ 使用清晰的参数名**：

```typescript
properties: {
  cityName: { type: "string" },      // ✅ 清晰
  userEmailAddress: { type: "string" }, // ✅ 清晰
  maxResults: { type: "number" }      // ✅ 清晰
}
```

**❌ 避免模糊的命名**：

```typescript
properties: {
  val: { type: "string" },           // ❌ 不知道是什么
  data: { type: "object" },          // ❌ 太笼统
  temp: { type: "number" }           // ❌ 可能是温度也可能是临时值
}
```

### 8.3 错误处理

```typescript
handler: async (args) => {
  try {
    // 验证参数
    validateArgs(args);

    // 执行逻辑
    const result = await doSomething(args);

    // 返回成功结果
    return { content: [{ type: "text", text: result }] };
  } catch (error) {
    // 区分业务错误和系统错误
    if (error instanceof BusinessError) {
      // 业务错误返回给 AI 处理
      return {
        content: [{ type: "text", text: error.message }],
        isError: true
      };
    }

    // 系统错误记录并返回通用错误
    console.error("System error:", error);
    throw MCPError.serverError("Internal error");
  }
}
```

### 8.4 安全考虑

**工具调用前的确认**：

对于可能产生副作用或涉及敏感操作的工具，应该在执行前向用户确认：

```typescript
const dangerousTool: Tool = {
  name: "delete_file",
  description: "删除指定路径的文件（不可恢复）",
  annotations: {
    impact: "high",
    prompt: "当用户明确要求删除文件时使用"
  },
  handler: async (args) => {
    const { filePath } = args;

    // 检查文件是否存在
    if (!await fileSystem.exists(filePath)) {
      throw MCPError.resourceNotFound(filePath);
    }

    // 检查是否为敏感路径
    const sensitivePaths = ["/etc", "/system", "/home"];
    if (sensitivePaths.some(p => filePath.startsWith(p))) {
      throw MCPError.permissionDenied("Cannot delete system files");
    }

    // 执行删除
    await fileSystem.delete(filePath);

    return {
      content: [{ type: "text", text: `已删除文件: ${filePath}` }]
    };
  }
};
```

**敏感数据的处理**：

```typescript
handler: async (args) => {
  const { userId } = args;

  // 获取用户数据
  const user = await db.getUser(userId);

  // 过滤敏感字段
  const safeUserData = {
    id: user.id,
    name: user.name,
    email: user.email
    // 不返回 password、creditCard 等敏感信息
  };

  return {
    content: [{
      type: "structuredContent",
      structuredContent: safeUserData
    }]
  };
}
```

### 8.5 日志记录

```typescript
handler: async (args) => {
  const startTime = Date.now();
  const requestId = generateId();

  console.log(`[${requestId}] Tool called: get_weather`, {
    args,
    timestamp: new Date().toISOString()
  });

  try {
    const result = await weatherApi.get(args.city);
    const duration = Date.now() - startTime;

    console.log(`[${requestId}] Success: ${duration}ms`);

    return { content: [{ type: "text", text: result }] };
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`[${requestId}] Error: ${error.message}`, {
      duration,
      stack: error.stack
    });

    throw error;
  }
}
```

---

## 9. 用户交互模型（User Interaction Model）

MCP 强调人类在 AI 执行操作过程中的控制权。工具执行涉及外部操作和潜在风险，因此 MCP 设计了多种机制让用户保持对 AI 行为的掌控。

### 9.1 信任与安全机制

为了确保用户对模型执行的操作保持控制，应用程序可以实现以下用户控制机制：

**1. UI 中显示可用工具**

应用程序可以在界面中展示所有可用的工具，让用户决定在特定交互中是否启用某个工具：

```
┌─────────────────────────────────────────┐
│  🤖 AI 助手                              │
├─────────────────────────────────────────┤
│  可用工具：                              │
│  ☑️ 天气查询    ☑️ 发送邮件              │
│  ☑️ 日历管理    ☐ 文件删除               │
│  ☑️ 代码搜索    ☐ 数据库操作              │
└─────────────────────────────────────────┘
```

**2. 执行前的审批对话框**

对于可能产生副作用或涉及敏感操作的工具，在执行前向用户确认：

```
┌─────────────────────────────────────────┐
│  ⚠️ 工具执行确认                          │
├─────────────────────────────────────────┤
│  即将执行：delete_file                    │
│                                         │
│  参数：                                  │
│  - filePath: /Users/admin/temp/test.txt │
│                                         │
│  ⚠️ 此操作不可恢复！                       │
│                                         │
│  [取消]                    [确认删除]     │
└─────────────────────────────────────────┘
```

**3. 预批准安全操作的权限设置**

对于常见的、安全的操作，用户可以预先授权：

```typescript
// 用户可以预先批准某些低风险操作
const preApprovedTools = [
  "search_weather",
  "get_current_time",
  "calculate"
];

// 高风险操作需要每次确认
const highRiskTools = [
  "delete_file",
  "send_email",
  "database_write"
];
```

**4. 活动日志**

显示所有工具执行及其结果，让用户了解 AI 做了什么：

```
┌─────────────────────────────────────────┐
│  📋 工具执行日志                          │
├─────────────────────────────────────────┤
│  09:30:15  get_weather    ✅ 成功        │
│  09:31:42  send_email     ✅ 成功        │
│  09:35:01  delete_file    ⚠️ 用户取消    │
│  09:36:22  search_code    ✅ 成功        │
└─────────────────────────────────────────┘
```

### 9.2 工具与用户控制的关系

```
┌──────────────────────────────────────────────────────────────────┐
│                      工具控制层级                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Model（AI 模型）                                                  │
│  ├── 可以主动发现和调用工具                                         │
│  ├── 根据上下文判断何时使用工具                                      │
│  └── 但必须经过用户授权才能执行敏感操作                              │
│                                                                   │
│  User（用户）                                                      │
│  ├── 控制哪些工具可用                                               │
│  ├── 审批高风险操作                                                 │
│  └── 查看工具执行日志                                               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 9.3 Elicitation 机制

当工具需要用户输入或确认时，Server 可以通过 Elicitation 请求用户输入：

```typescript
// Server 请求用户输入
{
  "method": "elicitation/requestInput",
  "params": {
    "message": "确定要删除这个文件吗？此操作不可恢复。",
    "requestedSchema": {
      "type": "object",
      "properties": {
        "confirmed": {
          "type": "boolean",
          "description": "确认删除"
        }
      }
    }
  }
}
```

### 9.4 开发者实现建议

作为 MCP Server 开发者，应该：

1. **通过 annotations 标记工具风险等级**

```typescript
const tool = {
  name: "delete_file",
  annotations: {
    impact: "high",  // 标记为高风险操作
    prompt: "仅在用户明确要求时使用"
  }
};
```

2. **返回有意义的错误信息**

```typescript
handler: async (args) => {
  if (!await hasPermission(args.userId, 'delete_file')) {
    // 返回用户可理解的错误，不要暴露内部细节
    return {
      content: [{
        type: "text",
        text: "您没有权限执行此操作，请联系管理员。"
      }],
      isError: true
    };
  }
};
```

3. **支持操作取消**

```typescript
handler: async (args, context) => {
  // 定期检查是否已取消
  for (const item of largeDataset) {
    if (context.cancelled) {
      return {
        content: [{ type: "text", text: "操作已取消" }],
        isError: true
      };
    }
    await processItem(item);
  }
};
```

---

## 10. 本章小结

```
工具定义核心要点

工具三要素
├── name: 唯一标识符
├── description: 功能描述（告诉 AI 何时使用）
└── inputSchema: 参数定义（JSON Schema）

inputSchema 设计
├── 使用 JSON Schema 标准
├── 定义清晰的参数类型和描述
├── 使用 required 标记必需参数
└── 使用 default 提供默认值

Handler 实现
├── 返回 ToolResult
├── content 数组支持多种类型
├── isError 标记预期错误
└── 正确处理异常

最佳实践
├── 写详细的 description
├── 使用清晰的参数名
├── 参数验证
└── 日志记录
```

---

## 下一步

继续阅读：
- [03-resource-management.md](03-resource-management.md) — 资源管理详解
