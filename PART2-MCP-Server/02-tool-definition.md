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

### 2.1 工具的三个要素

每个工具由三部分组成：

```
┌─────────────────────────────────────────────────────────────┐
│                       Tool                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Name（名称）                                             │
│     └── 唯一标识符，snake_case 格式                          │
│                                                              │
│  2. Description（描述）                                     │
│     └── 告诉 AI 这个工具做什么、何时使用                      │
│                                                              │
│  3. Input Schema（输入模式）                                 │
│     └── 定义工具需要什么参数                                 │
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
  description: "查询城市实时天气，包括温度、湿度、风速等。注意：不支持县级市查询。",
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
  handler: async (args) => {
    const { city, units = "metric" } = args;
    const weather = await fetchWeather(city, units);
    return {
      content: [{
        type: "text",
        text: formatWeather(weather)
      }]
    };
  }
};
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
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;      // base64 for image
  mimeType?: string;  // for image
  resource?: ResourceContent; // for resource
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

### 5.4 返回错误结果

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

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

### 8.4 日志记录

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

## 9. 本章小结

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
