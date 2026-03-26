# Skills 快速入门

> 5 分钟创建你的第一个 Skill

---

## 目标

创建一个简单的 Skill，让 AI 能够掷骰子生成随机数。

## 步骤

### 1. 创建目录和文件

在你的项目目录下创建：

```
.agents/skills/roll-dice/SKILL.md
```

### 2. 编写 SKILL.md

```markdown
---
name: roll-dice
description: 掷骰子生成随机数。当用户要求掷骰子、roll dice、生成随机数时使用。
---

# 掷骰子

使用以下命令生成 1 到 N 的随机数：

```bash
echo $((RANDOM % <面数> + 1))
```

将 `<面数>` 替换为骰子的面数（如 6 表示普通骰子，20 表示 D20）。
```

### 3. 测试

1. 打开 AI 助手（如 Claude Code）
2. 输入：`掷一个 D20`
3. AI 应该返回 1-20 的随机数

---

## 发生了什么？

```
用户: "掷一个 D20"
      ↓
AI 读取所有 Skill 的 name 和 description
      ↓
匹配到 "roll-dice"（描述中提到 "掷骰子"）
      ↓
加载完整 SKILL.md 内容
      ↓
执行命令：echo $((RANDOM % 20 + 1))
      ↓
返回结果：15
```

这就是 **渐进式披露**：
- 启动时只加载 name + description（~50 tokens）
- 匹配时才加载完整内容（<5000 tokens）

---

## 关键要点

1. **name**: 简短标识符，必须匹配目录名
2. **description**: 决定何时触发，最关键的部分
3. **body**: 实际的执行指令

---

## 下一步

- 学习 [SKILL.md 格式规范](./01-skills-specification.md)
- 了解 [如何写好触发描述](./03-skill-creation-guide.md)
