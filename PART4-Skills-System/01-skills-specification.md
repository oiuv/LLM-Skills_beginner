# Skills 规范详解

> 本章目标：理解 Skills 的设计理念、SKILL.md 格式规范、以及 Skills 在 Agent 系统中的作用。学完本章后，你应能阅读和编写符合规范的 Skill 定义。

---

## 1. Skills 的设计理念

### 1.1 为什么需要 Skills？

```
问题：AI 模型如何知道"怎么做"？

传统方式：
User: "帮我写代码审查"
AI: "好的，请提供代码"  ← AI 不知道怎么审查

Skill 方式：
User: "帮我写代码审查"
AI: 加载 code_review Skill
     → 知道审查流程
     → 知道用哪些工具
     → 知道输出格式
AI: "好的，请提供代码路径"
```

**Skill 的本质**：把"领域知识 + 操作流程 + 工具依赖"封装成可复用的单元。

### 1.2 Skill vs Tool vs Prompt

| 概念 | 粒度 | 内容 | 使用方式 |
|------|------|------|---------|
| **Tool** | 原子操作 | 一个函数 | 单独调用 |
| **Skill** | 完整任务 | 工作流 + 工具 + 约束 | 整体加载 |
| **Prompt** | 文本片段 | 模板文本 | 变量替换 |

```
Tool: "查天气"
Skill: 
  - 工具: weather.get
  - 工作流: 1.确定城市 2.调用工具 3.格式化输出
  - 约束: 不支持县级市，数据更新有延迟
```

### 1.3 Skill 的结构

```
┌─────────────────────────────────────────────────────────────┐
│                       Skill                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 元数据（YAML Frontmatter）                             │
│     - name: 唯一标识符                                      │
│     - description: 功能描述                                 │
│     - tools: 依赖的工具列表                                 │
│     - gate: 启用条件（环境变量等）                          │
│                                                              │
│  2. 工作流（Markdown Content）                               │
│     - 简介：功能介绍                                        │
│     - 工作流程：执行步骤                                     │
│     - 工具使用：具体工具的用法                              │
│     - 示例：使用示例                                        │
│     - 输出格式：期望的输出格式                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. SKILL.md 格式规范

### 2.1 文件格式

SKILL.md 使用 **YAML Frontmatter + Markdown** 格式：

```markdown
---
# YAML 元数据区
name: skill-name
description: 功能描述
version: "1.0.0"
---

# Markdown 内容区

## 简介

详细介绍...
```

### 2.2 YAML Frontmatter 完整字段

```yaml
---
# 必填字段
name: skill-name                           # 唯一标识符（snake_case）
description: 功能描述                        # 一句话描述

# 可选字段
version: "1.0.0"                          # 语义化版本
author: "作者名"                           # 作者
license: "MIT"                            # 许可证
tags: ["tag1", "tag2"]                    # 标签列表
category: "category-name"                 # 分类

# 工具依赖
tools:
  - tool.name                            # 工具名称
  - another.tool

# 启用条件
gate:
  env:                                   # 需要的环境变量
    - API_KEY
    - DATABASE_URL
  binary:                               # 需要的可执行文件
    - node
    - python
  config:                               # 需要的配置
    - key: value

# 资源依赖
resources:
  - uri: "file:///path/to/resource"
    required: true

# 提示词依赖
prompts:
  - prompt-name
---

## 内容区
...
```

---

## 3. YAML Frontmatter 详解

### 3.1 name 字段

**必填**。Skill 的唯一标识符。

```yaml
# 正确格式
name: weather_assistant
name: code_review
name: data_analyzer

# 错误格式
name: Weather Assistant    # 不能有空格
name: weather-assistant    # 应该用下划线
name: weatherAssistant     # 应该用 snake_case
```

### 3.2 description 字段

**必填**。简短的功能描述，供 Agent 理解何时使用此 Skill。

```yaml
# 好例子
description: "查询全球城市实时天气，提供温度、湿度、风速等信息"
description: "对代码仓库进行审查，检查潜在 bug、代码规范和性能问题"
description: "分析 CSV/JSON 数据文件，生成统计报告和可视化建议"

# 不好的例子
description: "天气"                           # 太简单
description: "这是一个天气查询工具，可以查询天气"  # 冗余
```

### 3.3 tools 字段

Skill 依赖的 MCP 工具列表。

```yaml
tools:
  # 简单写法
  - weather.get_current
  - weather.get_forecast

  # 带命名空间
  - github.get_repo
  - github.create_issue

  # 带版本（可选）
  - database.query@v1
```

**注意**：这里只是声明依赖，不包括工具的具体调用参数。

### 3.4 gate 字段

启用 Skill 的条件。不满足条件时，Skill 不会加载。

```yaml
gate:
  # 需要特定环境变量
  env:
    - WEATHER_API_KEY

  # 需要可执行文件
  binary:
    - git
    - python

  # 需要配置项
  config:
    - database.enabled: true
```

**使用场景**：
- API Key 检查（防止未配置就使用）
- 二进制依赖检查（确保命令可用）
- 配置检查（确保功能已启用）

---

## 4. Markdown Content 详解

### 4.1 标准章节

```markdown
## 简介

详细描述 Skill 的功能、适用场景、限制条件。

## 工作流程

描述完成任务的步骤流程。

## 工具使用

描述具体工具的用法和参数。

## 示例

展示 Skill 的使用示例。

## 输出格式

描述期望的输出格式。

## 注意事项

使用限制、已知问题等。
```

### 4.2 简介写法

```markdown
## 简介

本 Skill 帮助用户查询天气信息，适用于以下场景：

- 用户问"北京今天天气怎么样"
- 用户问"明天去上海要带伞吗"
- 用户问"这周会下雨吗"

### 功能范围

- ✅ 支持全球主要城市
- ✅ 提供温度、湿度、风速、AQI
- ✅ 未来 7 天预报
- ❌ 不支持县级市
- ❌ 不保证 100% 准确
```

### 4.3 工作流程写法

```markdown
## 工作流程

### 步骤 1：理解用户需求

1. 识别查询的城市
2. 识别查询类型：
   - 实时天气 → 使用 `get_current_weather`
   - 天气预报 → 使用 `get_forecast`
   - 空气质量 → 使用 `get_air_quality`

### 步骤 2：调用工具

根据需求调用相应工具，传入城市参数。

### 步骤 3：整合结果

将多个工具的结果整合成完整的天气报告。

### 步骤 4：格式化输出

按照输出格式生成最终回复。
```

### 4.4 工具使用写法

```markdown
## 工具使用

### weather.get_current

**用途**：获取城市的实时天气信息

**参数**：
- `city` (string, 必填): 城市名称，支持中文或英文
- `units` (string, 可选): 温度单位
  - `metric`: 摄氏度（默认）
  - `imperial`: 华氏度

**返回**：
- `temperature`: 温度
- `humidity`: 湿度百分比
- `condition`: 天气状况（晴/多云/雨/雪等）
- `wind_speed`: 风速

**示例调用**：
```json
{
  "city": "北京",
  "units": "metric"
}
```

### weather.get_forecast

**用途**：获取天气预报

**参数**：
- `city` (string, 必填): 城市名称
- `days` (number, 可选): 天数 1-7，默认 3

**返回**：每日天气数组，包含日期、温度、天气状况
```

### 4.5 输出格式写法

```markdown
## 输出格式

天气信息使用以下格式输出：

```
🌤️ {城市}天气
━━━━━━━━━━━━━━━━━━━━━━
🌡️ 温度: {温度}°C
☁️ 天气: {状况}
💧 湿度: {湿度}%
🌬️ 风速: {风速}m/s
━━━━━━━━━━━━━━━━━━━━━━
💡 建议: {根据天气的出行建议}
```

**示例输出**：
```
🌤️ 北京天气
━━━━━━━━━━━━━━━━━━━━━━
🌡️ 温度: 25°C
☁️ 天气: 多云
💧 湿度: 45%
🌬️ 风速: 3m/s
━━━━━━━━━━━━━━━━━━━━━━
💡 建议: 天气舒适，适合户外活动
```
```

---

## 5. 完整 Skill 示例

### 5.1 天气查询 Skill

```markdown
---
name: weather_assistant
description: 查询全球城市实时天气和预报，提供温度、湿度、风速、AQI 等信息
version: "1.2.0"
author: "Weather Team"
tags:
  - weather
  - travel
  - lifestyle
category: "实用工具"
tools:
  - weather.get_current
  - weather.get_forecast
  - weather.get_air_quality
gate:
  env:
    - WEATHER_API_KEY
---

## 简介

本 Skill 帮助用户查询天气信息，适用于：

- 出行前的天气确认
- 穿衣建议
- 户外活动安排

### 功能范围

- ✅ 实时天气（温度、湿度、风速）
- ✅ 天气预报（未来 7 天）
- ✅ 空气质量（AQI、PM2.5）
- ✅ 出行建议

### 限制

- ❌ 不支持县级市
- ❌ 部分偏远地区数据可能不准确
- ⚠️ 免费 API 每日限额 100 次

## 工作流程

1. **理解需求**
   - 确定查询的城市
   - 确定查询类型（实时/预报/空气）

2. **调用工具**
   - 实时：`weather.get_current`
   - 预报：`weather.get_forecast`
   - 空气：`weather.get_air_quality`

3. **整合信息**
   - 汇总各项数据
   - 生成出行建议

4. **格式化输出**
   - 按指定格式输出
   - 突出重要信息

## 工具使用

### weather.get_current

查询实时天气。

**参数**：
- `city` (string): 城市名
- `units` (string): metric/imperial

**返回**：温度、湿度、风速、天气状况

### weather.get_forecast

查询天气预报。

**参数**：
- `city` (string): 城市名
- `days` (number): 1-7 天

### weather.get_air_quality

查询空气质量。

**参数**：
- `city` (string): 城市名

**返回**：AQI、PM2.5、PM10、首要污染物

## 示例

### 示例 1：查询实时天气

**用户**：北京今天天气怎么样？

**处理**：
1. 调用 `weather.get_current({"city": "北京"})`
2. 整合数据
3. 按格式输出

**输出**：
```
🌤️ 北京实时天气
━━━━━━━━━━━━━━━━━━━━━━
🌡️ 温度: 25°C
☁️ 天气: 多云
💧 湿度: 45%
🌬️ 风速: 3m/s
💨 空气质量: 良 (AQI 65)
━━━━━━━━━━━━━━━━━━━━━━
💡 建议: 天气舒适，适合户外活动
```

### 示例 2：查询天气预报

**用户**：上海未来三天天气如何？

**处理**：
1. 调用 `weather.get_forecast({"city": "上海", "days": 3})`
2. 整理三日预报
3. 输出

**输出**：
```
🌤️ 上海未来三天预报
━━━━━━━━━━━━━━━━━━━━━━
📅 今天: 多云 24-28°C
📅 明天: 小雨 22-26°C
📅 后天: 阴天 23-27°C
━━━━━━━━━━━━━━━━━━━━━━
💡 建议: 明天有雨，记得带伞
```

## 输出格式

```
🌤️ {城市}{类型}
━━━━━━━━━━━━━━━━━━━━━━
[天气信息...]
━━━━━━━━━━━━━━━━━━━━━━
💡 建议: {出行建议}
```

## 注意事项

1. **城市名称**：支持中文（"北京"）和英文（"Beijing"）
2. **API 限制**：免费版每日 100 次调用
3. **数据延迟**：实时天气约 30 分钟延迟
4. **错误处理**：城市不存在时提示用户
```

---

## 6. 代码审查 Skill

```markdown
---
name: code_reviewer
description: 对代码仓库进行审查，检查代码规范、潜在 bug、性能问题和安全漏洞
version: "2.0.0"
author: "DevTools Team"
tags:
  - code-review
  - quality
  - security
category: "开发工具"
tools:
  - github.get_repo_info
  - github.list_pull_requests
  - github.get_file_content
  - github.create_review_comment
gate:
  binary:
    - git
  env:
    - GITHUB_TOKEN
---

## 简介

本 Skill 提供专业的代码审查能力，帮助：

- 发现潜在 bug
- 检查代码规范
- 发现性能问题
- 发现安全漏洞

### 审查范围

- ✅ 代码规范（命名、格式）
- ✅ 逻辑错误
- ✅ 空指针/边界检查
- ✅ SQL 注入、XSS 等安全问题
- ✅ 重复代码
- ⚠️ 业务逻辑（需要上下文）

## 工作流程

### 步骤 1：获取仓库信息

1. 获取仓库基本信息
2. 获取最近的 PR 列表
3. 确定审查范围

### 步骤 2：获取代码

1. 获取 PR 修改的文件列表
2. 获取每个文件的 diff
3. 分析代码变更

### 步骤 3：执行审查

按照检查清单逐项审查：

1. **基础检查**
   - 文件是否完整
   - 语法是否正确

2. **规范检查**
   - 命名是否符合规范
   - 是否有 TODO/FIXME

3. **安全检查**
   - 是否有硬编码密码
   - 是否有注入风险

4. **性能检查**
   - 是否有 N+1 查询
   - 是否有大循环

### 步骤 4：生成报告

按照输出格式生成审查报告。

## 工具使用

### github.get_repo_info

获取仓库基本信息。

### github.list_pull_requests

列出 PR 列表。

### github.get_file_content

获取文件内容（用于审查）。

### github.create_review_comment

在 PR 上创建审查评论。

## 输出格式

审查报告格式：

```
# 代码审查报告

## 基本信息
- 仓库: {owner}/{repo}
- PR: #{number}
- 审查时间: {timestamp}

## 发现问题

### 🔴 严重问题
| 文件 | 行号 | 问题 | 建议 |
|------|------|------|------|
| src/a.py | 23 | 空指针风险 | 添加 None 检查 |

### 🟡 中等问题
...

### 🟢 建议
...

## 总体评分
{score}/10

## 总结
{summary}
```

## 注意事项

1. **权限**：需要 GITHUB_TOKEN 有 read 权限
2. **范围**：只审查 PR 中改动的文件
3. **误报**：AI 审查可能有误报，需人工确认
4. **限制**：不审查二进制文件、大型文件（>1MB）
```

---

## 7. 最佳实践

### 7.1 命名规范

**✅ 好的命名**：
```yaml
name: weather_assistant
name: code_reviewer
name: data_analyzer
name: github_helper
```

**❌ 不好的命名**：
```yaml
name: weather              # 太模糊
name: code                 # 太短
name: my_weather_tool_v2   # 包含版本号
```

### 7.2 描述规范

**✅ 好的描述**：
- 一句话说明功能
- 包含主要使用场景
- 包含限制条件

**❌ 不好的描述**：
- 太简单："天气查询"
- 太冗长："这是一个非常强大的天气查询工具，可以查询全球任意城市的天气..."
- 没有说明限制

### 7.3 工作流程规范

**✅ 好的工作流程**：
- 步骤清晰，每个步骤有明确目标
- 说明判断逻辑（如何决定下一步）
- 说明错误处理

**❌ 不好的工作流程**：
- 太笼统："调用工具然后返回结果"
- 缺少判断逻辑
- 没有错误处理

---

## 8. 本章小结

```
Skills 规范核心要点

SKILL.md 格式
├── YAML Frontmatter（元数据）
│   ├── name: 唯一标识符（必填）
│   ├── description: 功能描述（必填）
│   ├── tools: 依赖工具列表
│   ├── gate: 启用条件
│   └── version/author/tags 等
└── Markdown Content（内容）
    ├── 简介：功能详细介绍
    ├── 工作流程：执行步骤
    ├── 工具使用：工具用法
    ├── 示例：使用示例
    └── 输出格式：期望格式

设计原则
├── name: snake_case，简洁有意义
├── description: 一句话 + 使用场景
├── 工作流程: 清晰步骤 + 判断逻辑
├── 工具使用: 详细参数说明
└── 输出格式: 标准化结构
```

---

## 下一步

继续阅读：
- [02-skill-parser.md](02-skill-parser.md) — Skill 解析器实现
