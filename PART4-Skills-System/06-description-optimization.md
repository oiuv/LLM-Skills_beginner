# 触发描述优化指南

> 让 Skill 在正确的时候被调用

---

## 为什么重要？

AI 只根据 `description` 决定是否加载 Skill。描述不好会导致：
- **漏触发**：该用时没用
- **误触发**：不该用时用了

---

## 好描述的三要素

### 1. 祈使语气

```yaml
# ❌ 不好
description: 这个技能用于处理 PDF

# ✅ 好
description: 处理 PDF 文件。当用户需要提取 PDF 文本、填写表单时使用。
```

### 2. 具体场景

```yaml
# ❌ 太笼统
description: 处理数据

# ✅ 具体明确
description: |
  分析 CSV 和表格数据。当用户需要：
  - 计算统计信息
  - 生成图表
  - 清洗数据
  时使用。支持 CSV、Excel 文件。
```

### 3. 主动推荐

```yaml
# ✅ 即使简单输入也要触发
description: |
  生成 AI 绘画提示词。当用户提到绘画、提示词、
  Midjourney 时使用。
  
  即使是很简单的描述如"一只猫"，也应该使用此技能。
```

---

## 测试方法

### 准备测试用例

创建 `evals/trigger-tests.json`：

```json
[
  {
    "query": "帮我分析这个 sales.csv",
    "should_trigger": true
  },
  {
    "query": "把 JSON 转成 YAML",
    "should_trigger": false
  },
  {
    "query": "看看我的数据文件",
    "should_trigger": true
  }
]
```

### 运行测试

1. 用每个 query 测试 AI
2. 观察是否触发了 Skill
3. 记录触发率

**通过标准**：
- 应该触发的，触发率 > 80%
- 不应该触发的，触发率 < 20%

---

## 常见问题

### 问题 1：描述太长

```yaml
# ❌ 超过 1024 字符
description: 这是一个非常长的描述...

# ✅ 精简到核心
description: 分析 CSV 数据，生成统计和图表。
```

### 问题 2：太宽泛

```yaml
# ❌ 什么都能触发
description: 帮助用户处理各种任务

# ✅ 明确边界
description: 分析 CSV 数据。不处理 Excel 公式或数据库查询。
```

### 问题 3：太狭窄

```yaml
# ❌ 只有特定关键词触发
description: 当用户说"分析 CSV"时使用

# ✅ 包含同义词和变体
description: |
  分析 CSV/表格数据。当用户提到：
  - 分析数据、csv、表格
  - 生成图表、统计
  - "看看这个数据文件"
```

---

## 优化前后对比

```yaml
# 优化前
description: 处理 CSV 文件

# 优化后
description: |
  分析 CSV 和表格数据文件 — 计算统计信息、
  添加派生列、生成图表、清洗脏数据。
  当用户有 CSV、TSV 或 Excel 文件并想要
  探索、转换或可视化数据时使用，
  即使他们没有明确提到"CSV"或"分析"。
```

---

## 快速检查清单

- [ ] 使用祈使语气（"当...时使用"）
- [ ] 列出具体触发场景
- [ ] 包含关键词和同义词
- [ ] 主动推荐（即使简单输入）
- [ ] 长度 < 1024 字符
- [ ] 测试了 5-10 个用例
