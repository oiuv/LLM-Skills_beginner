# Skills、MCP 与 RAG 的选择指南

> 什么时候用 Skills，什么时候用 MCP，什么时候用 RAG？

---

## 三者的核心区别

| 技术 | 核心能力 | 数据流向 | 最佳场景 |
|------|----------|----------|----------|
| **Skills** | 工作流程 | 提示增强（预定义流程） | 特定任务的 SOP、固定 UI 项目 |
| **MCP** | 工具调用 | 主动交互（AI决定→执行） | 需要操作外部系统、精确查询 |
| **RAG** | 语义检索 | 被动查询（AI问→系统答） | 大量文档、模糊匹配 |

---

## 决策树

```
你需要解决什么问题？
    │
    ├── 需要定义一个标准工作流程（SOP）？
    │       └── 用 Skills ✅
    │
    ├── 需要操作外部系统（数据库、API、文件）？
    │       └── 用 MCP ✅
    │
    ├── 需要从大量文档中检索信息？
    │       └── 用 RAG ✅
    │
    ├── 既有工作流程，又需要操作外部系统？
    │       └── 用 Skills + MCP ✅
    │
    ├── 既有工作流程，又需要检索文档？
    │       └── 用 Skills + RAG ✅
    │
    └── 需要三者都有？
            └── 用 Skills + MCP + RAG ✅
```

---

## Skills 的最佳场景

### 1. 固定 UI 项目 ✅

```
场景：网站有很多文本工具（生成提示词、生成剧本等）
特点：用户通过表单输入，不是对话式

为什么用 Skills：
- Skill 作为提示词模板管理
- 每个工具对应一个 Skill
- 参数定义在 metadata 中
- 后端根据 UI 选择加载对应 Skill
```

**架构**：
```
前端（固定UI表单）
    ↓ 提交参数
后端 API
    ↓ 根据工具类型选择
Skill（提示词模板）
    ↓ 构建提示词
LLM
    ↓ 返回结果
后端 API → 前端展示
```

**示例**：
```markdown
---
name: prompt-craft
description: 生成AI绘画提示词
metadata:
  parameters:
    theme:
      type: string
      description: 主题描述
      required: true
    style:
      type: enum
      options: ["赛博朋克", "油画", "动漫"]
---

# AI绘画提示词生成器

根据用户提供的参数生成专业提示词。

## 输入
- 主题：{theme}
- 风格：{style}

## 输出格式
```
[主题], [风格], 高质量, 细节丰富...
```
```

### 2. 标准化工作流程 ✅

```
场景：代码审查、数据分析报告、客服回复
特点：有固定的步骤和检查清单

为什么用 Skills：
- 封装标准操作流程
- 确保输出一致性
- 新成员快速上手
```

**示例：代码审查 Skill**
```markdown
---
name: code-reviewer
description: 代码审查专家...
---

## 审查流程

### Step 1: 代码分析
- 识别编程语言
- 理解代码功能

### Step 2: 问题检查
- [ ] 正确性：逻辑错误、边界条件
- [ ] 可读性：命名、注释、格式
- [ ] 性能：算法复杂度
- [ ] 安全性：注入风险、敏感信息

### Step 3: 生成报告
使用模板输出...
```

### 3. 领域知识封装 ✅

```
场景：法律文档审查、医学诊断辅助、金融分析
特点：需要专业知识，有特定术语和规范

为什么用 Skills：
- 封装领域知识
- 定义专业术语解释
- 规范输出格式
```

---

## Skills vs MCP 对比

| 场景 | 用 Skills | 用 MCP | 原因 |
|------|-----------|--------|------|
| 生成绘画提示词 | ✅ | ❌ | 是文本生成任务，不需要外部工具 |
| 查询数据库 | ❌ | ✅ | 需要执行 SQL 查询 |
| 代码审查流程 | ✅ | ❌ | 是标准化流程，用 Skill 定义步骤 |
| 文件格式转换 | ❌ | ✅ | 需要调用转换工具 |
| 数据分析报告 | ✅ | ✅ | Skill 定义流程，MCP 执行查询 |
| API 集成 | ❌ | ✅ | 需要调用外部 API |

---

## 实际案例分析

### 案例 1：AI 绘画提示词生成器

**需求**：
- 文生图：根据主题生成提示词
- 图生文：根据图片反推提示词
- 短剧剧本生成

**选型**：**Skills** ✅

**原因**：
1. 固定 UI 项目，用户通过表单输入
2. 是文本生成任务，不需要外部工具
3. 需要定义输出格式和风格

**架构**：
```
frontend/                    # 固定UI
├── components/
│   ├── PromptForm.tsx       # 表单（含参数定义）
└── api/
    └── skills.ts            # 调用后端

backend/
├── skills/                  # Skills 目录
│   ├── prompt-craft/
│   │   └── SKILL.md         # 提示词模板
│   └── script-generator/
│       └── SKILL.md
├── routes/
│   └── skills.py            # API路由
└── services/
    └── skill_runner.py      # Skill执行器
```

**为什么不只用 MCP？**
- 不需要调用外部工具
- 核心是提示词工程，不是工具调用

**为什么不用 RAG？**
- 不是文档检索任务
- 是生成任务，不是查询任务

---

### 案例 2：编程语言助手

**需求**：
- 查询函数文档
- 获取代码示例
- 实时语法检查

**选型**：**MCP + RAG** ✅

**原因**：
1. 需要查询函数文档（精确查询 → MCP）
2. 文档量大，需要语义搜索（RAG）
3. 需要实时执行代码检查（MCP）

**架构**：
```python
@mcp.tool()
def get_function_doc(name: str) -> str:
    """精确查询函数文档"""
    return func_db[name]

@mcp.tool()
def search_functions(keyword: str) -> list:
    """语义搜索函数"""
    return vector_db.search(keyword)

@mcp.tool()
def check_syntax(code: str) -> dict:
    """实时语法检查"""
    return compiler.check(code)
```

**为什么不只用 Skills？**
- Skills 是提示词模板，不能执行查询
- 需要主动查询数据库，不是预定义流程

---

### 案例 3：智能客服系统

**需求**：
- 回答用户问题
- 查询订单状态
- 检索帮助文档

**选型**：**Skills + MCP + RAG** ✅

**原因**：
1. 需要标准化回复流程（Skills）
2. 需要查询订单系统（MCP）
3. 需要检索帮助文档（RAG）

**架构**：
```markdown
---
name: customer-service
description: 智能客服助手...
---

## 工作流程

### Step 1: 理解用户意图
判断用户需要什么：
- 查询订单 → 使用 query_order 工具
- 产品咨询 → 搜索知识库
- 投诉建议 → 记录并转人工

### Step 2: 获取信息
根据意图选择：
- 订单查询：调用 MCP 工具
- 产品问题：RAG 检索文档

### Step 3: 生成回复
结合信息生成友好回复...
```

```python
# MCP 工具
@mcp.tool()
def query_order(order_id: str) -> dict:
    """查询订单状态"""
    return order_api.query(order_id)

# RAG 检索
def search_knowledge_base(query: str) -> str:
    """检索帮助文档"""
    return vector_db.search(query)
```

---

## 混合使用最佳实践

### 模式 1：Skill 调用 MCP

```markdown
---
name: data-analyzer
description: 数据分析助手...
---

## 工作流程

### Step 1: 读取数据
使用 MCP 工具读取文件：
```
read_file(path="data.csv")
```

### Step 2: 分析数据
使用 MCP 工具执行分析：
```
execute_python(code="...")
```

### Step 3: 生成报告
按照模板输出...
```
```

### 模式 2：Skill 使用 RAG

```markdown
---
name: legal-assistant
description: 法律文档助手...
---

## 工作流程

### Step 1: 检索相关法规
搜索知识库：
"检索与{topic}相关的法律条文"

### Step 2: 分析案例
查找类似案例：
"搜索{case_type}的相关判例"

### Step 3: 生成建议
结合检索结果生成法律建议...
```
```

### 模式 3：三者结合

```
用户问题
    ↓
Skill（定义工作流程）
    ↓
    ├── MCP（查询实时数据）
    ├── RAG（检索文档）
    └── LLM（生成回复）
    ↓
返回结果
```

---

## 快速选择指南

| 你的需求 | 推荐方案 |
|----------|----------|
| 固定 UI 的文本生成工具 | **Skills** |
| 查询数据库/API | **MCP** |
| 从大量文档检索 | **RAG** |
| 标准化工作流程 + 外部查询 | **Skills + MCP** |
| 标准化流程 + 文档检索 | **Skills + RAG** |
| 复杂系统（流程+查询+检索） | **Skills + MCP + RAG** |

---

## 总结

**Skills**：封装工作流程，定义"怎么做"
**MCP**：调用外部工具，实现"能做什么"
**RAG**：检索知识，提供"知道什么"

三者不是互斥的，而是互补的。复杂系统通常需要组合使用。
