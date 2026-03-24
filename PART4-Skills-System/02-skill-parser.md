# Skill 解析器实现

> 本章目标：理解 SKILL.md 的解析原理，实现一个完整的 Skill 解析器。学完本章后，你应能实现自己的 Skill 加载和解析系统。

---

## 1. 解析器架构

### 1.1 解析流程

```
┌─────────────────────────────────────────────────────────────┐
│                    Skill 解析流程                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 读取文件                                                 │
│     SKILL.md 文件 ──► 原始文本                               │
│                                                              │
│  2. 分离 Frontmatter 和 Content                              │
│     原始文本 ──► Frontmatter + Content                        │
│                                                              │
│  3. 解析 Frontmatter（YAML）                                 │
│     YAML 文本 ──► 元数据对象                                  │
│                                                              │
│  4. 解析 Content（Markdown）                                  │
│     Markdown ──► 章节结构                                     │
│                                                              │
│  5. 构建 Skill 对象                                          │
│     元数据 + 章节 ──► Skill 对象                             │
│                                                              │
│  6. 校验 Skill                                               │
│     校验必填字段、格式、依赖                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心类型定义

```typescript
// types.ts

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

interface SkillSection {
  title: string;
  level: number;  // 1 = ##, 2 = ###, etc.
  content: string;
}

interface Skill {
  metadata: SkillMetadata;
  sections: Map<string, SkillSection>;
  rawContent: string;      // 原始 Markdown 内容
  filePath?: string;
}

interface ParsedSkill extends Skill {
  prompt: string;          // 注入 Agent 用的提示词
  validationErrors: string[];
}
```

---

## 2. 完整解析器实现

### 2.1 主解析器类

```typescript
// parser.ts

import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";

class SkillParser {
  private yamlParser = new YamlParser();
  private markdownParser = new MarkdownParser();
  private validator = new SkillValidator();

  /**
   * 从文件解析 Skill
   */
  parseFile(filePath: string): ParsedSkill {
    const content = fs.readFileSync(filePath, "utf-8");
    return this.parseString(content, filePath);
  }

  /**
   * 从字符串解析 Skill
   */
  parseString(content: string, filePath?: string): ParsedSkill {
    // 1. 分离 Frontmatter 和 Content
    const { frontmatter, markdown } = this.splitContent(content);

    // 2. 解析 YAML 元数据
    const metadata = this.yamlParser.parse(frontmatter);

    // 3. 解析 Markdown 章节
    const sections = this.markdownParser.parse(markdown);

    // 4. 构建 Skill 对象
    const skill: Skill = {
      metadata,
      sections,
      rawContent: markdown,
      filePath,
    };

    // 5. 校验 Skill
    const errors = this.validator.validate(skill);

    // 6. 构建注入用提示词
    const prompt = this.buildPrompt(skill);

    return {
      ...skill,
      prompt,
      validationErrors: errors,
    };
  }

  /**
   * 分离 Frontmatter 和 Content
   */
  private splitContent(content: string): { frontmatter: string; markdown: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!match) {
      throw new Error("Invalid SKILL.md format: missing frontmatter separator '---'");
    }

    return {
      frontmatter: match[1],
      markdown: match[2],
    };
  }

  /**
   * 构建注入 Agent 的提示词
   */
  private buildPrompt(skill: Skill): string {
    const parts: string[] = [];

    // 标题和描述
    parts.push(`# ${skill.metadata.name}`);
    parts.push(`\n${skill.metadata.description}\n`);

    // 版本信息
    if (skill.metadata.version) {
      parts.push(`Version: ${skill.metadata.version}`);
    }

    // 可用工具
    if (skill.metadata.tools && skill.metadata.tools.length > 0) {
      parts.push("\n## Available Tools");
      for (const tool of skill.metadata.tools) {
        parts.push(`- ${tool}`);
      }
    }

    // 各章节内容
    const sectionOrder = ["简介", "工作流程", "工具使用", "示例", "输出格式", "注意事项"];

    for (const title of sectionOrder) {
      const section = skill.sections.get(title);
      if (section) {
        parts.push(`\n## ${title}`);
        parts.push(section.content);
      }
    }

    return parts.join("\n");
  }
}
```

### 2.2 YAML 解析器

```typescript
// yaml-parser.ts

class YamlParser {
  /**
   * 解析 YAML 字符串
   */
  parse(yamlContent: string): SkillMetadata {
    try {
      const data = yaml.load(yamlContent) as Record<string, unknown>;

      // 提取字段
      const metadata: SkillMetadata = {
        name: this.requiredString(data, "name"),
        description: this.requiredString(data, "description"),
        version: this.optionalString(data, "version"),
        author: this.optionalString(data, "author"),
        license: this.optionalString(data, "license"),
        tags: this.optionalStringArray(data, "tags"),
        category: this.optionalString(data, "category"),
        tools: this.optionalStringArray(data, "tools"),
        gate: this.parseGate(data),
        resources: this.parseResources(data),
        prompts: this.optionalStringArray(data, "prompts"),
      };

      return metadata;
    } catch (error) {
      if (error instanceof yaml.YAMLException) {
        throw new Error(`YAML parse error: ${error.message}`);
      }
      throw error;
    }
  }

  private requiredString(data: Record<string, unknown>, key: string): string {
    const value = data[key];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Missing or invalid required field: ${key}`);
    }
    return value.trim();
  }

  private optionalString(data: Record<string, unknown>, key: string): string | undefined {
    const value = data[key];
    return typeof value === "string" ? value.trim() : undefined;
  }

  private optionalStringArray(data: Record<string, unknown>, key: string): string[] | undefined {
    const value = data[key];
    if (Array.isArray(value)) {
      return value.filter((v) => typeof v === "string").map((v) => v.trim());
    }
    return undefined;
  }

  private parseGate(data: Record<string, unknown>): GateConfig | undefined {
    const gate = data.gate;
    if (typeof gate !== "object" || gate === null) {
      return undefined;
    }

    const gateData = gate as Record<string, unknown>;

    return {
      env: this.optionalStringArray(gateData, "env"),
      binary: this.optionalStringArray(gateData, "binary"),
      config: gateData.config as Record<string, unknown>,
    };
  }

  private parseResources(data: Record<string, unknown>): ResourceConfig[] | undefined {
    const resources = data.resources;
    if (!Array.isArray(resources)) {
      return undefined;
    }

    return resources
      .filter((r) => typeof r === "object" && r !== null)
      .map((r) => {
        const resource = r as Record<string, unknown>;
        return {
          uri: this.requiredString(resource, "uri"),
          required: resource.required === true,
        };
      });
  }
}
```

### 2.3 Markdown 解析器

```typescript
// markdown-parser.ts

interface ParsedSection {
  title: string;
  level: number;
  content: string;
}

class MarkdownParser {
  /**
   * 解析 Markdown 内容，提取章节结构
   */
  parse(markdown: string): Map<string, SkillSection> {
    const sections = new Map<string, SkillSection>();

    // 按标题分割
    const parts = markdown.split(/(?=^#{1,3}\s)/gm);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // 匹配标题行
      const match = trimmed.match(/^(#{1,3})\s+(.+)\n([\s\S]*)$/);

      if (match) {
        const level = match[1].length;
        const title = match[2].trim();
        const content = match[3].trim();

        sections.set(title, {
          title,
          level,
          content,
        });
      } else {
        // 没有标题的内容作为无标题部分
        sections.set("_preface", {
          title: "_preface",
          level: 0,
          content: trimmed,
        });
      }
    }

    return sections;
  }

  /**
   * 提取代码块
   */
  extractCodeBlocks(content: string): Array<{ language: string; code: string }> {
    const blocks: Array<{ language: string; code: string }> = [];
    const regex = /```(\w*)\n([\s\S]*?)```/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      blocks.push({
        language: match[1] || "text",
        code: match[2],
      });
    }

    return blocks;
  }

  /**
   * 提取表格
   */
  extractTables(content: string): Array<Array<string[]>> {
    const tables: Array<Array<string[]>> = [];
    const lines = content.split("\n");

    let currentTable: string[] = [];
    let inTable = false;

    for (const line of lines) {
      if (line.includes("|")) {
        inTable = true;
        currentTable.push(line);
      } else if (inTable) {
        // 表格结束
        if (currentTable.length > 0) {
          tables.push(this.parseTable(currentTable));
          currentTable = [];
        }
        inTable = false;
      }
    }

    // 处理最后一张表格
    if (currentTable.length > 0) {
      tables.push(this.parseTable(currentTable));
    }

    return tables;
  }

  private parseTable(lines: string[]): string[][] {
    const rows: string[][] = [];
    const separator = /\|[-:\s]+\|/;

    for (const line of lines) {
      // 跳过分隔行
      if (separator.test(line)) continue;

      const row = line
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell !== "");

      if (row.length > 0) {
        rows.push(row);
      }
    }

    return rows;
  }
}
```

---

## 3. 校验器实现

### 3.1 校验器类

```typescript
// validator.ts

class SkillValidator {
  /**
   * 校验 Skill，返回错误列表
   */
  validate(skill: Skill): string[] {
    const errors: string[] = [];

    // 校验必填字段
    errors.push(...this.validateRequiredFields(skill.metadata));

    // 校验 name 格式
    errors.push(...this.validateName(skill.metadata.name));

    // 校验 version 格式
    if (skill.metadata.version) {
      errors.push(...this.validateVersion(skill.metadata.version));
    }

    // 校验 tools 格式
    if (skill.metadata.tools) {
      errors.push(...this.validateTools(skill.metadata.tools));
    }

    // 校验 gate 配置
    if (skill.metadata.gate) {
      errors.push(...this.validateGate(skill.metadata.gate));
    }

    // 校验章节
    errors.push(...this.validateSections(skill.sections));

    return errors;
  }

  private validateRequiredFields(metadata: SkillMetadata): string[] {
    const errors: string[] = [];

    if (!metadata.name) {
      errors.push("Missing required field: name");
    }
    if (!metadata.description) {
      errors.push("Missing required field: description");
    }

    return errors;
  }

  private validateName(name: string): string[] {
    const errors: string[] = [];

    // 必须是小写字母、数字、下划线
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      errors.push(
        `Invalid name format '${name}': must be snake_case starting with letter`
      );
    }

    return errors;
  }

  private validateVersion(version: string): string[] {
    const errors: string[] = [];

    // 语义化版本格式
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      errors.push(`Invalid version format '${version}': must be semver (e.g., 1.0.0)`);
    }

    return errors;
  }

  private validateTools(tools: string[]): string[] {
    const errors: string[] = [];

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];

      // 应该包含命名空间
      if (!tool.includes(".")) {
        errors.push(`Tool '${tool}' should include namespace (e.g., weather.get)`);
      }

      // 不应该有空格
      if (/\s/.test(tool)) {
        errors.push(`Tool '${tool}' contains whitespace`);
      }
    }

    return errors;
  }

  private validateGate(gate: GateConfig): string[] {
    const errors: string[] = [];

    // 校验环境变量名
    if (gate.env) {
      for (const env of gate.env) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(env)) {
          errors.push(
            `Invalid environment variable name '${env}': should be UPPER_SNAKE_CASE`
          );
        }
      }
    }

    // 校验二进制名称
    if (gate.binary) {
      for (const bin of gate.binary) {
        if (!/^[a-z0-9-]+$/.test(bin)) {
          errors.push(
            `Invalid binary name '${bin}': should be lowercase with hyphens`
          );
        }
      }
    }

    return errors;
  }

  private validateSections(sections: Map<string, SkillSection>): string[] {
    const errors: string[] = [];

    // 建议包含的章节
    const recommendedSections = ["简介", "工作流程", "输出格式"];
    const existingSections = Array.from(sections.keys());

    for (const recommended of recommendedSections) {
      if (!existingSections.includes(recommended)) {
        errors.push(`Missing recommended section: ${recommended}`);
      }
    }

    return errors;
  }
}
```

---

## 4. 完整解析示例

### 4.1 解析 Weather Skill

```typescript
// example-parse.ts

async function main() {
  const parser = new SkillParser();

  // 从文件解析
  const skill = parser.parseFile("./skills/weather-assistant/SKILL.md");

  console.log("=== Skill Metadata ===");
  console.log(`Name: ${skill.metadata.name}`);
  console.log(`Description: ${skill.metadata.description}`);
  console.log(`Version: ${skill.metadata.version}`);
  console.log(`Tools: ${skill.metadata.tools?.join(", ")}`);

  console.log("\n=== Sections ===");
  for (const [title, section] of skill.sections) {
    console.log(`- ${title} (level ${section.level}): ${section.content.slice(0, 50)}...`);
  }

  console.log("\n=== Validation Errors ===");
  if (skill.validationErrors.length === 0) {
    console.log("No errors!");
  } else {
    skill.validationErrors.forEach((err) => console.log(`- ${err}`));
  }

  console.log("\n=== Generated Prompt ===");
  console.log(skill.prompt.slice(0, 500) + "...");
}

main().catch(console.error);
```

### 4.2 解析多个 Skills

```typescript
// parser.ts

class SkillLoader {
  private parser = new SkillParser();
  private loadedSkills = new Map<string, ParsedSkill>();

  /**
   * 从目录加载所有 Skills
   */
  async loadFromDirectory(dirPath: string): Promise<Skill[]> {
    const skills: Skill[] = [];

    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = path.join(dirPath, entry.name, "SKILL.md");

      if (fs.existsSync(skillPath)) {
        try {
          const skill = this.parser.parseFile(skillPath);
          this.loadedSkills.set(skill.metadata.name, skill);
          skills.push(skill);
          console.log(`Loaded skill: ${skill.metadata.name}`);
        } catch (error) {
          console.error(`Failed to load skill from ${skillPath}:`, error);
        }
      }
    }

    return skills;
  }

  /**
   * 获取已加载的 Skill
   */
  get(name: string): ParsedSkill | undefined {
    return this.loadedSkills.get(name);
  }

  /**
   * 获取所有已加载的 Skills
   */
  getAll(): Skill[] {
    return Array.from(this.loadedSkills.values());
  }

  /**
   * 按标签筛选
   */
  getByTag(tag: string): Skill[] {
    return this.getAll().filter((skill) =>
      skill.metadata.tags?.includes(tag)
    );
  }

  /**
   * 按分类筛选
   */
  getByCategory(category: string): Skill[] {
    return this.getAll().filter(
      (skill) => skill.metadata.category === category
    );
  }
}

// 使用
async function main() {
  const loader = new SkillLoader();
  await loader.loadFromDirectory("./skills");

  // 获取所有技能
  const all = loader.getAll();
  console.log(`Loaded ${all.length} skills`);

  // 按标签查找
  const weatherSkills = loader.getByTag("weather");
  console.log(`Weather skills: ${weatherSkills.map((s) => s.metadata.name).join(", ")}`);

  // 获取单个技能
  const weather = loader.get("weather_assistant");
  if (weather) {
    console.log(`Found: ${weather.metadata.description}`);
  }
}
```

---

## 5. 错误处理

### 5.1 常见解析错误

```typescript
// common-errors.ts

class SkillParseError extends Error {
  constructor(
    message: string,
    public filePath?: string,
    public line?: number
  ) {
    super(message);
    this.name = "SkillParseError";
  }
}

// 错误类型
const ERROR_TYPES = {
  MISSING_FRONTMATTER: "Missing YAML frontmatter",
  INVALID_YAML: "Invalid YAML syntax",
  MISSING_NAME: "Missing required field: name",
  MISSING_DESCRIPTION: "Missing required field: description",
  INVALID_NAME_FORMAT: "Invalid name format (must be snake_case)",
  INVALID_VERSION: "Invalid version format (must be semver)",
  MISSING_TOOLS: "No tools declared",
  INVALID_TOOL_FORMAT: "Invalid tool format (should be namespace.name)",
  EMPTY_CONTENT: "Markdown content is empty",
} as const;

// 解析错误处理
function handleParseError(error: unknown, filePath: string): void {
  if (error instanceof SkillParseError) {
    console.error(`[${filePath}] ${error.message}`);
    if (error.line) {
      console.error(`  at line ${error.line}`);
    }
    return;
  }

  if (error instanceof yaml.YAMLException) {
    console.error(`[${filePath}] YAML syntax error: ${error.message}`);
    return;
  }

  console.error(`[${filePath}] Unexpected error:`, error);
}
```

### 5.2 校验错误处理

```typescript
// validation-errors.ts

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  field: string;
  message: string;
  severity: "error";
}

interface ValidationWarning {
  field: string;
  message: string;
  severity: "warning";
}

class DetailedValidator {
  validate(skill: Skill): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 必填字段
    if (!skill.metadata.name) {
      errors.push({
        field: "name",
        message: "Name is required",
        severity: "error",
      });
    }

    // 建议字段
    if (!skill.metadata.version) {
      warnings.push({
        field: "version",
        message: "Version not specified, recommend using semver",
        severity: "warning",
      });
    }

    if (!skill.metadata.author) {
      warnings.push({
        field: "author",
        message: "Author not specified",
        severity: "warning",
      });
    }

    // 章节建议
    if (!skill.sections.has("工作流程")) {
      warnings.push({
        field: "sections.工作流程",
        message: "Missing '工作流程' section",
        severity: "warning",
      });
    }

    if (!skill.sections.has("输出格式")) {
      warnings.push({
        field: "sections.输出格式",
        message: "Missing '输出格式' section",
        severity: "warning",
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
```

---

## 6. 本章小结

```
Skill 解析器核心要点

解析流程
├── 1. 读取文件
├── 2. 分离 Frontmatter 和 Content
├── 3. 解析 YAML 元数据
├── 4. 解析 Markdown 章节
├── 5. 构建 Skill 对象
└── 6. 校验

解析器组件
├── YamlParser: YAML → 元数据对象
├── MarkdownParser: Markdown → 章节结构
└── Validator: Skill → 错误列表

最佳实践
├── 分离关注点（解析 vs 校验 vs 构建）
├── 详细的错误信息（包含文件路径、行号）
├── 支持批量加载（按目录扫描）
└── 校验结果分级（error vs warning）
```

---

## 下一步

继续阅读：
- [03-skill-gate.md](03-skill-gate.md) — Gate 机制实现
