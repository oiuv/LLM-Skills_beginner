# Skills 规范详解

> 面向开发者的 Skills 开发标准与实现指南

---

## 1. Skills 架构设计

### 1.1 核心概念

**Skill** 是一个封装了特定领域能力的模块化单元，包含：
- 领域知识（如何完成任务）
- 工具声明（需要什么工具）
- 工作流定义（执行步骤）
- 约束条件（门控规则）

### 1.2 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Skill 架构                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    SKILL.md                              │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  YAML Frontmatter（元数据）                       │   │   │
│  │  │  - name: skill 标识符                             │   │   │
│  │  │  - description: 功能描述                          │   │   │
│  │  │  - version: 版本号                                │   │   │
│  │  │  - tools: 依赖的工具列表                           │   │   │
│  │  │  - gate: 门控条件                                 │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                              │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  Markdown Content（内容）                         │   │   │
│  │  │  - 简介（Introduction）                           │   │   │
│  │  │  - 工作流程（Workflow）                           │   │   │
│  │  │  - 工具使用说明（Tool Usage）                      │   │   │
│  │  │  - 示例（Examples）                               │   │   │
│  │  │  - 输出格式（Output Format）                       │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Skill Loader                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │   Parser    │  │  Validator  │  │   Injector  │     │   │
│  │  │  (解析)      │  │  (校验)      │  │  (注入)      │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Agent Context                          │   │
│  │         (注入到系统提示词中)                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. SKILL.md 规范

### 2.1 文件格式

SKILL.md 采用 **YAML Frontmatter + Markdown** 格式：

```markdown
---
# YAML Frontmatter（元数据区）
name: skill-name
description: Skill 功能描述
version: "1.0.0"
tools:
  - tool.name
---

# Markdown Content（内容区）

## 简介

Skill 的详细介绍...

## 工作流程

1. 步骤一
2. 步骤二
3. 步骤三
```

### 2.2 YAML Frontmatter 规范

#### 完整字段定义

```yaml
---
# 必填字段
name: string                    # Skill 唯一标识符（snake_case）
description: string             # 简短描述（一句话）

# 可选字段
version: string                 # 版本号（语义化版本）
author: string                  # 作者
license: string                 # 许可证
tags: string[]                  # 标签列表
category: string                # 分类

# 工具依赖
tools:                          # 依赖的 MCP 工具列表
  - tool.name                   # 工具名称
  - another.tool

# 门控条件
gate:                           # 启用条件
  env:                          # 环境变量要求
    - API_KEY                   # 需要的环境变量名
    - DATABASE_URL
  binary:                       # 二进制依赖
    - node                      # 需要的可执行文件
    - python
  config:                       # 配置要求
    - key: value               # 需要的配置项

# 资源依赖
resources:                      # 依赖的资源
  - uri: "file:///path/to/resource"
    required: true

# 提示词依赖
prompts:                        # 依赖的提示词
  - name: prompt-name

# 扩展字段（自定义）
custom:                         # 自定义元数据
  priority: high
  cost_estimate: "~0.01$/call"
---
```

#### 字段详细说明

**name**
- 类型: `string`
- 必填: 是
- 格式: `snake_case`
- 示例: `weather-query`, `code-review`, `data-analysis`
- 约束: 唯一标识符，不能包含空格和特殊字符

**description**
- 类型: `string`
- 必填: 是
- 长度: 建议 50-200 字符
- 示例: "查询全球城市实时天气信息，包括温度、湿度、风速等"

**version**
- 类型: `string`
- 必填: 否（默认 "1.0.0"）
- 格式: 语义化版本 `MAJOR.MINOR.PATCH`
- 示例: "1.2.3"

**tools**
- 类型: `string[]`
- 必填: 否
- 格式: 工具名称列表
- 示例:
  ```yaml
  tools:
    - weather.get
    - weather.get_forecast
    - location.search
  ```

**gate**
- 类型: `object`
- 必填: 否
- 子字段:
  - `env`: 环境变量数组
  - `binary`: 可执行文件数组
  - `config`: 配置键值对

### 2.3 Markdown Content 规范

#### 标准章节

```markdown
## 简介

详细描述 Skill 的功能、适用场景、限制条件等。

## 工作流程

描述完成任务的步骤：

1. **步骤名称**
   - 详细说明
   - 注意事项

2. **步骤名称**
   - 详细说明

## 工具使用

### tool.name

**用途**: 描述工具用途

**参数**:
- `param1` (type): 参数说明
- `param2` (type): 参数说明

**示例**:
```json
{
  "param1": "value1",
  "param2": "value2"
}
```

## 示例

### 示例 1: 场景描述

**输入**: 用户请求

**处理**: Agent 执行步骤

**输出**: 预期结果

## 输出格式

描述期望的输出格式：

```
📊 结果标题
━━━━━━━━━━━━━━━━━━
字段 1: 值
字段 2: 值
━━━━━━━━━━━━━━━━━━
```

## 注意事项

- 注意点 1
- 注意点 2
- 限制条件
```

---

## 3. Skill 解析器实现

### 3.1 解析器架构

```typescript
// Skill 解析器
class SkillParser {
  parse(content: string): Skill {
    // 1. 分离 Frontmatter 和 Content
    const { frontmatter, markdown } = this.splitContent(content);
    
    // 2. 解析 YAML
    const metadata = this.parseYAML(frontmatter);
    
    // 3. 解析 Markdown
    const sections = this.parseMarkdown(markdown);
    
    // 4. 构建 Skill 对象
    return {
      name: metadata.name,
      description: metadata.description,
      version: metadata.version || "1.0.0",
      metadata,
      content: sections,
      prompt: this.buildPrompt(metadata, sections)
    };
  }
  
  private splitContent(content: string): { frontmatter: string; markdown: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      throw new Error("Invalid SKILL.md format: missing frontmatter");
    }
    return {
      frontmatter: match[1],
      markdown: match[2]
    };
  }
  
  private parseYAML(yaml: string): SkillMetadata {
    // 使用 YAML 解析库
    return yaml.parse(yaml);
  }
  
  private parseMarkdown(markdown: string): SkillSections {
    const sections: SkillSections = {};
    const regex = /##\s+(.+?)\n([\s\S]*?)(?=##\s|$)/g;
    let match;
    
    while ((match = regex.exec(markdown)) !== null) {
      const title = match[1].trim();
      const content = match[2].trim();
      sections[title] = content;
    }
    
    return sections;
  }
  
  private buildPrompt(metadata: SkillMetadata, sections: SkillSections): string {
    let prompt = `# ${metadata.name}\n\n`;
    prompt += `## 描述\n${metadata.description}\n\n`;
    
    if (metadata.tools?.length) {
      prompt += `## 可用工具\n`;
      metadata.tools.forEach(tool => {
        prompt += `- ${tool}\n`;
      });
      prompt += `\n`;
    }
    
    if (sections["工作流程"]) {
      prompt += `## 工作流程\n${sections["工作流程"]}\n\n`;
    }
    
    if (sections["输出格式"]) {
      prompt += `## 输出格式\n${sections["输出格式"]}\n\n`;
    }
    
    return prompt;
  }
}

// Skill 类型定义
interface Skill {
  name: string;
  description: string;
  version: string;
  metadata: SkillMetadata;
  content: SkillSections;
  prompt: string;
}

interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  license?: string;
  tags?: string[];
  category?: string;
  tools?: string[];
  gate?: GateConfig;
  resources?: ResourceConfig[];
  prompts?: string[];
  custom?: Record<string, unknown>;
}

interface SkillSections {
  [key: string]: string;
}

interface GateConfig {
  env?: string[];
  binary?: string[];
  config?: Record<string, unknown>;
}

interface ResourceConfig {
  uri: string;
  required?: boolean;
}
```

### 3.2 校验器实现

```typescript
// Skill 校验器
class SkillValidator {
  private errors: ValidationError[] = [];
  
  validate(skill: Skill): ValidationResult {
    this.errors = [];
    
    // 校验必填字段
    this.validateRequired(skill);
    
    // 校验名称格式
    this.validateName(skill.name);
    
    // 校验版本格式
    this.validateVersion(skill.version);
    
    // 校验工具声明
    this.validateTools(skill.metadata.tools);
    
    // 校验门控条件
    this.validateGate(skill.metadata.gate);
    
    return {
      valid: this.errors.length === 0,
      errors: this.errors
    };
  }
  
  private validateRequired(skill: Skill): void {
    if (!skill.name) {
      this.errors.push({ field: "name", message: "Name is required" });
    }
    if (!skill.description) {
      this.errors.push({ field: "description", message: "Description is required" });
    }
  }
  
  private validateName(name: string): void {
    // snake_case 格式
    const snakeCaseRegex = /^[a-z][a-z0-9_]*$/;
    if (!snakeCaseRegex.test(name)) {
      this.errors.push({
        field: "name",
        message: "Name must be in snake_case format"
      });
    }
  }
  
  private validateVersion(version: string): void {
    // 语义化版本
    const semverRegex = /^\d+\.\d+\.\d+$/;
    if (!semverRegex.test(version)) {
      this.errors.push({
        field: "version",
        message: "Version must follow semantic versioning (e.g., 1.0.0)"
      });
    }
  }
  
  private validateTools(tools: string[] | undefined): void {
    if (!tools) return;
    
    tools.forEach((tool, index) => {
      if (!tool.includes(".")) {
        this.errors.push({
          field: `tools[${index}]`,
          message: `Tool "${tool}" should be in "namespace.name" format`
        });
      }
    });
  }
  
  private validateGate(gate: GateConfig | undefined): void {
    if (!gate) return;
    
    // 校验环境变量格式
    gate.env?.forEach((env, index) => {
      if (!/^[A-Z_][A-Z0-9_]*$/.test(env)) {
        this.errors.push({
          field: `gate.env[${index}]`,
          message: `Environment variable "${env}" should be in UPPER_SNAKE_CASE`
        });
      }
    });
  }
}

interface ValidationError {
  field: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
```

---

## 4. 门控条件（Gate）实现

### 4.1 门控检查器

```typescript
// 门控检查器
class GateChecker {
  async check(gate: GateConfig): Promise<GateCheckResult> {
    const checks: GateCheck[] = [];
    
    // 检查环境变量
    if (gate.env) {
      for (const env of gate.env) {
        checks.push({
          type: "env",
          name: env,
          passed: !!process.env[env],
          message: process.env[env] ? undefined : `Environment variable ${env} not set`
        });
      }
    }
    
    // 检查二进制
    if (gate.binary) {
      for (const binary of gate.binary) {
        const exists = await this.checkBinary(binary);
        checks.push({
          type: "binary",
          name: binary,
          passed: exists,
          message: exists ? undefined : `Binary ${binary} not found in PATH`
        });
      }
    }
    
    // 检查配置
    if (gate.config) {
      for (const [key, value] of Object.entries(gate.config)) {
        const configValue = this.getConfig(key);
        const passed = configValue === value;
        checks.push({
          type: "config",
          name: key,
          passed,
          message: passed ? undefined : `Config ${key} expected ${value}, got ${configValue}`
        });
      }
    }
    
    const allPassed = checks.every(c => c.passed);
    
    return {
      passed: allPassed,
      checks,
      message: allPassed ? undefined : `Gate check failed: ${checks.filter(c => !c.passed).map(c => c.message).join(", ")}`
    };
  }
  
  private async checkBinary(binary: string): Promise<boolean> {
    return new Promise((resolve) => {
      const { exec } = require("child_process");
      exec(`which ${binary}`, (error: Error | null) => {
        resolve(!error);
      });
    });
  }
  
  private getConfig(key: string): unknown {
    // 从配置存储中获取
    return global.config?.[key];
  }
}

interface GateCheck {
  type: "env" | "binary" | "config";
  name: string;
  passed: boolean;
  message?: string;
}

interface GateCheckResult {
  passed: boolean;
  checks: GateCheck[];
  message?: string;
}
```

---

## 5. Skill 加载器实现

### 5.1 完整加载器

```typescript
// Skill 加载器
class SkillLoader {
  private parser = new SkillParser();
  private validator = new SkillValidator();
  private gateChecker = new GateChecker();
  private loadedSkills = new Map<string, Skill>();
  
  // 从文件加载
  async loadFromFile(filePath: string): Promise<Skill> {
    const content = await fs.readFile(filePath, "utf8");
    return this.loadFromString(content);
  }
  
  // 从字符串加载
  async loadFromString(content: string): Promise<Skill> {
    // 1. 解析
    const skill = this.parser.parse(content);
    
    // 2. 校验
    const validation = this.validator.validate(skill);
    if (!validation.valid) {
      throw new Error(`Skill validation failed: ${validation.errors.map(e => `${e.field}: ${e.message}`).join(", ")}`);
    }
    
    // 3. 门控检查
    if (skill.metadata.gate) {
      const gateResult = await this.gateChecker.check(skill.metadata.gate);
      if (!gateResult.passed) {
        throw new Error(`Gate check failed: ${gateResult.message}`);
      }
    }
    
    // 4. 存储
    this.loadedSkills.set(skill.name, skill);
    
    return skill;
  }
  
  // 从目录加载所有 Skills
  async loadFromDirectory(dirPath: string): Promise<Skill[]> {
    const skills: Skill[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(dirPath, entry.name, "SKILL.md");
        try {
          const skill = await this.loadFromFile(skillPath);
          skills.push(skill);
        } catch (error) {
          console.warn(`Failed to load skill from ${skillPath}:`, error);
        }
      }
    }
    
    return skills;
  }
  
  // 获取已加载的 Skill
  getSkill(name: string): Skill | undefined {
    return this.loadedSkills.get(name);
  }
  
  // 获取所有已加载 Skills
  getAllSkills(): Skill[] {
    return Array.from(this.loadedSkills.values());
  }
  
  // 卸载 Skill
  unload(name: string): boolean {
    return this.loadedSkills.delete(name);
  }
  
  // 重新加载
  async reload(name: string): Promise<Skill> {
    const skill = this.loadedSkills.get(name);
    if (!skill) {
      throw new Error(`Skill ${name} not loaded`);
    }
    
    // 这里需要存储原始文件路径
    // 简化实现，实际应该存储路径
    this.loadedSkills.delete(name);
    return this.loadFromString(skill.rawContent!);
  }
}
```

---

## 6. Skill 注入到 Agent

### 6.1 提示词构建

```typescript
// Skill 提示词构建器
class SkillPromptBuilder {
  build(skill: Skill, options: BuildOptions = {}): string {
    const parts: string[] = [];
    
    // 头部
    parts.push(this.buildHeader(skill));
    
    // 工具声明
    if (skill.metadata.tools?.length) {
      parts.push(this.buildToolsSection(skill.metadata.tools));
    }
    
    // 工作流程
    if (skill.content["工作流程"]) {
      parts.push(this.buildWorkflowSection(skill.content["工作流程"]));
    }
    
    // 示例
    if (skill.content["示例"]) {
      parts.push(this.buildExamplesSection(skill.content["示例"]));
    }
    
    // 输出格式
    if (skill.content["输出格式"]) {
      parts.push(this.buildOutputFormatSection(skill.content["输出格式"]));
    }
    
    // 约束条件
    if (skill.content["注意事项"]) {
      parts.push(this.buildConstraintsSection(skill.content["注意事项"]));
    }
    
    return parts.join("\n\n");
  }
  
  private buildHeader(skill: Skill): string {
    return `# ${skill.name} (v${skill.version})

## 描述
${skill.description}

## 作者
${skill.metadata.author || "Unknown"}
`;
  }
  
  private buildToolsSection(tools: string[]): string {
    return `## 可用工具
${tools.map(tool => `- ${tool}`).join("\n")}

当需要使用这些工具时，请按照工具定义调用。`;
  }
  
  private buildWorkflowSection(workflow: string): string {
    return `## 工作流程
请严格按照以下步骤执行：

${workflow}`;
  }
  
  private buildExamplesSection(examples: string): string {
    return `## 示例
参考以下示例理解如何使用：

${examples}`;
  }
  
  private buildOutputFormatSection(format: string): string {
    return `## 输出格式要求
必须按照以下格式输出：

${format}`;
  }
  
  private buildConstraintsSection(constraints: string): string {
    return `## 约束条件
${constraints}`;
  }
}

interface BuildOptions {
  includeExamples?: boolean;
  includeConstraints?: boolean;
}
```

### 6.2 注入到系统提示词

```typescript
// Agent 系统提示词管理
class SystemPromptManager {
  private skills: Skill[] = [];
  private promptBuilder = new SkillPromptBuilder();
  private basePrompt: string;
  
  constructor(basePrompt: string) {
    this.basePrompt = basePrompt;
  }
  
  addSkill(skill: Skill): void {
    this.skills.push(skill);
  }
  
  removeSkill(name: string): void {
    this.skills = this.skills.filter(s => s.name !== name);
  }
  
  buildSystemPrompt(): string {
    const parts: string[] = [];
    
    // 基础提示词
    parts.push(this.basePrompt);
    
    // 技能提示词
    for (const skill of this.skills) {
      parts.push("---");
      parts.push(this.promptBuilder.build(skill));
    }
    
    return parts.join("\n\n");
  }
  
  // 获取工具定义（用于 function calling）
  getToolDefinitions(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    
    for (const skill of this.skills) {
      if (skill.metadata.tools) {
        // 这里需要从工具注册表获取详细定义
        for (const toolName of skill.metadata.tools) {
          const definition = this.getToolDefinition(toolName);
          if (definition) {
            tools.push(definition);
          }
        }
      }
    }
    
    return tools;
  }
  
  private getToolDefinition(toolName: string): ToolDefinition | undefined {
    // 从工具注册表获取
    return global.toolRegistry?.get(toolName);
  }
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: object;
}
```

---

## 7. 完整示例

### 7.1 天气查询 Skill

```markdown
---
name: weather-assistant
description: 专业的天气查询助手，提供全球城市实时天气、预报和出行建议
version: "1.2.0"
author: "Weather Team"
tools:
  - weather.get_current
  - weather.get_forecast
  - weather.get_air_quality
gate:
  env:
    - WEATHER_API_KEY
  binary:
    - curl
tags:
  - weather
  - travel
  - lifestyle
category: "实用工具"
---

## 简介

本 Skill 帮助用户查询天气信息，包括：
- 实时天气（温度、湿度、风速、天气状况）
- 未来 7 天天气预报
- 空气质量指数（AQI）
- 根据天气提供出行建议

## 工作流程

1. **理解用户需求**
   - 确定查询的城市
   - 确定查询类型（实时/预报/空气质量）
   - 确定日期范围（如果是预报）

2. **调用天气工具**
   - 使用 `weather.get_current` 查询实时天气
   - 使用 `weather.get_forecast` 查询预报
   - 使用 `weather.get_air_quality` 查询空气质量

3. **整合信息**
   - 汇总所有天气数据
   - 分析天气趋势
   - 生成出行建议

4. **格式化输出**
   - 按照指定格式输出
   - 突出重要信息
   - 提供实用建议

## 工具使用

### weather.get_current

查询城市实时天气。

**参数**:
- `city` (string, 必填): 城市名称，如 "北京"、"Shanghai"
- `units` (string, 可选): 单位制，"metric"(摄氏) 或 "imperial"(华氏)，默认 "metric"

**返回**:
- `temperature`: 温度
- `humidity`: 湿度百分比
- `wind_speed`: 风速
- `condition`: 天气状况
- `updated_at`: 更新时间

### weather.get_forecast

查询城市天气预报。

**参数**:
- `city` (string, 必填): 城市名称
- `days` (number, 可选): 预报天数 (1-7)，默认 3

**返回**:
- 每日天气数组

### weather.get_air_quality

查询城市空气质量。

**参数**:
- `city` (string, 必填): 城市名称

**返回**:
- `aqi`: AQI 指数
- `level`: 等级（优/良/轻度污染/...）
- `pm25`: PM2.5 浓度
- `pm10`: PM10 浓度

## 示例

### 示例 1: 查询实时天气

**用户**: "北京今天天气怎么样？"

**处理**:
1. 识别城市：北京
2. 调用 `weather.get_current({"city": "北京"})`
3. 获取结果并格式化

**输出**:
```
🌤️ 北京实时天气
━━━━━━━━━━━━━━━━━━
🌡️ 温度: 25°C
☁️ 天气: 多云
💧 湿度: 45%
🌬️ 风速: 3级
💨 空气质量: 良 (AQI 65)
━━━━━━━━━━━━━━━━━━
💡 建议: 天气舒适，适合户外活动，建议携带薄外套。
```

### 示例 2: 查询天气预报

**用户**: "上海未来三天天气如何？"

**处理**:
1. 识别城市：上海
2. 调用 `weather.get_forecast({"city": "上海", "days": 3})`
3. 整合三日数据

**输出**:
```
🌤️ 上海未来三天预报
━━━━━━━━━━━━━━━━━━
📅 今天: 多云 24-28°C
📅 明天: 小雨 22-26°C
📅 后天: 阴天 23-27°C
━━━━━━━━━━━━━━━━━━
💡 建议: 明天有雨，记得带伞。后天适合户外活动。
```

## 输出格式

标准输出格式：

```
🌤️ {城市}天气信息
━━━━━━━━━━━━━━━━━━
🌡️ 温度: {温度}°C
☁️ 天气: {状况}
💧 湿度: {湿度}%
🌬️ 风速: {风速}
💨 空气质量: {等级} (AQI {指数})
━━━━━━━━━━━━━━━━━━
💡 建议: {根据天气的出行建议}
```

## 注意事项

1. **城市名称**
   - 支持中文和英文
   - 支持国内城市和部分国际城市
   - 不支持县级市

2. **数据更新**
   - 实时天气每 30 分钟更新
   - 预报数据每天更新 2 次
   - 空气质量每小时更新

3. **限制**
   - 每分钟最多 60 次查询
   - 预报最多支持 7 天
   - 部分偏远城市可能无数据

4. **错误处理**
   - 城市不存在时提示用户
   - API 失败时重试一次
   - 数据缺失时标注"暂无数据"
```

---

## 8. 最佳实践

### DO（推荐做法）

- ✅ 使用清晰的命名（snake_case）
- ✅ 提供详细的工具使用说明
- ✅ 包含多个实用示例
- ✅ 定义明确的输出格式
- ✅ 添加门控条件检查依赖
- ✅ 使用语义化版本
- ✅ 添加标签便于分类
- ✅ 编写完整的注意事项

### DON'T（避免做法）

- ❌ 使用模糊的技能名称
- ❌ 缺少工具参数说明
- ❌ 示例过于简单或不实用
- ❌ 输出格式不统一
- ❌ 忽略错误处理
- ❌ 版本号随意递增
- ❌ 缺少约束条件说明

---

## 9. 工具推荐

### Skill 开发工具

```bash
# Skill 校验工具
npm install -g skill-validator

# 校验 SKILL.md
skill-validator check ./my-skill/SKILL.md

# 格式化 SKILL.md
skill-validator format ./my-skill/SKILL.md

# 测试 Skill 加载
skill-validator test ./my-skill/
```

### VS Code 扩展

- **Skill Editor**: 语法高亮和校验
- **YAML**: Frontmatter 支持
- **Markdown**: 内容编辑

---

## 下一步

继续阅读：
- [02-advanced-features.md](02-advanced-features.md) - 高级特性（版本管理、依赖解析）
- [03-skill-marketplace.md](03-skill-marketplace.md) - 技能市场设计
