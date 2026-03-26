# Skill 评估与优化

> 本章目标：掌握 Skill 的测试方法、评估指标和迭代优化技巧，确保 Skill 在实际使用中表现稳定。

---

## 1. 为什么需要评估？

### 1.1 创建 ≠ 可用

```
编写 SKILL.md
      ↓
  完成初版
      ↓
  直接使用？❌
      ↓
  可能的问题：
  - 触发不稳定（有时触发，有时不触发）
  - 输出质量不稳定
  - 处理不了边界情况
  - 与预期不符
```

### 1.2 评估的价值

| 评估类型 | 目的 | 方法 |
|----------|------|------|
| **触发评估** | 确保正确触发 | 测试各种输入，统计触发率 |
| **质量评估** | 确保输出质量 | 对比有无 Skill 的差异 |
| **边界评估** | 确保鲁棒性 | 测试异常输入 |
| **效率评估** | 确保性能 | 测量时间、token 消耗 |

---

## 2. 测试用例设计

### 2.1 测试用例分类

```
┌─────────────────────────────────────────────────────────────┐
│                    测试用例金字塔                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                    ┌─────────────┐                          │
│                    │   边界情况   │  10%                    │
│                    │  (异常输入)  │                          │
│                    └──────┬──────┘                          │
│                           │                                  │
│              ┌────────────┴────────────┐                    │
│              │       边缘情况          │  30%                │
│              │  (模糊、歧义输入)        │                      │
│              └────────────┬────────────┘                    │
│                           │                                  │
│     ┌─────────────────────┴─────────────────────┐          │
│     │                正常情况                   │  60%      │
│     │          (标准、典型输入)                  │            │
│     └───────────────────────────────────────────┘          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 测试用例设计原则

#### 原则 1：覆盖触发场景

```json
{
  "evals": [
    {
      "name": "explicit-trigger",
      "prompt": "帮我生成绘画提示词",
      "should_trigger": true
    },
    {
      "name": "implicit-trigger", 
      "prompt": "我想画一只猫",
      "should_trigger": true
    },
    {
      "name": "no-trigger",
      "prompt": "帮我写代码",
      "should_trigger": false
    }
  ]
}
```

#### 原则 2：覆盖输入变体

```json
{
  "evals": [
    {
      "name": "simple-input",
      "prompt": "一只猫",
      "expected": "即使是简单输入也能生成详细提示词"
    },
    {
      "name": "complex-input",
      "prompt": "一只在雨中的黑猫，赛博朋克风格，霓虹灯反射",
      "expected": "在已有细节基础上补充完善"
    },
    {
      "name": "vague-input",
      "prompt": "画点什么好看的",
      "expected": "引导用户或提供创意建议"
    }
  ]
}
```

#### 原则 3：包含负面测试

```json
{
  "evals": [
    {
      "name": "wrong-domain",
      "prompt": "帮我修图",
      "expected": "不触发，因为 Skill 只生成文本提示词"
    },
    {
      "name": "ambiguous",
      "prompt": "提示词",
      "expected": "可能触发，但质量可能不稳定"
    }
  ]
}
```

### 2.3 测试用例模板

```json
{
  "skill_name": "skill-name",
  "evals": [
    {
      "id": 1,
      "name": "test-case-name",
      "category": "normal|edge|boundary",
      "prompt": "用户输入",
      "expected_output": "期望输出描述",
      "assertions": [
        {
          "type": "contains|equals|regex",
          "target": "output|tool_calls",
          "value": "期望包含的内容"
        }
      ]
    }
  ]
}
```

---

## 3. 评估方法

### 3.1 对比评估法（A/B 测试）

```
┌─────────────────────────────────────────────────────────────┐
│                    对比评估流程                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  同一组测试用例                                              │
│       ↓                                                      │
│  ┌──────────────┐    ┌──────────────┐                      │
│  │  有 Skill    │ vs │  无 Skill    │                      │
│  │  (实验组)    │    │  (对照组)    │                      │
│  └──────┬───────┘    └──────┬───────┘                      │
│         ↓                   ↓                                │
│    输出结果 A          输出结果 B                            │
│         ↓                   ↓                                │
│         └─────────┬─────────┘                                │
│                   ↓                                          │
│              对比分析                                        │
│         - 质量差异                                           │
│         - 一致性差异                                         │
│         - 效率差异                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 定量评估指标

#### 指标 1：触发准确率

```
触发准确率 = 正确触发的次数 / 总测试次数

示例：
- 应该触发且触发了：45 次
- 应该触发但没触发：5 次  (漏触发)
- 不应该触发但触发了：3 次 (误触发)
- 不应该触发也没触发：47 次

准确率 = (45 + 47) / 100 = 92%
```

#### 指标 2：输出质量评分

```
质量评分维度：
1. 完整性 (0-10): 是否包含所有必要部分
2. 准确性 (0-10): 内容是否正确
3. 一致性 (0-10): 格式是否统一
4. 可用性 (0-10): 是否可直接使用

总分 = (完整性 + 准确性 + 一致性 + 可用性) / 4
```

#### 指标 3：效率指标

```
- 平均响应时间
- Token 消耗量
- 工具调用次数
```

### 3.3 定性评估方法

#### 人工评审

```markdown
## 评审维度

### 1. 触发合理性
- 这个输入应该触发 Skill 吗？
- 触发时机是否恰当？

### 2. 输出质量
- 输出是否符合预期？
- 是否有遗漏或错误？
- 格式是否规范？

### 3. 用户体验
- 输出是否易于理解？
- 是否提供了额外价值？
- 是否有不必要的冗余？

### 4. 改进建议
- 哪些方面可以改进？
- 是否有边界情况未处理？
```

---

## 4. 迭代优化

### 4.1 优化流程

```
┌─────────────────────────────────────────────────────────────┐
│                    迭代优化循环                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────────────────────────────────────────────┐  │
│   │                                                     │  │
│   ↓                                                     │  │
│ 运行测试 ──→ 收集反馈 ──→ 分析问题 ──→ 改进 Skill ──→  │  │
│   ↑                                                     │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                              │
│  每次迭代：                                                 │
│  1. 选择 3-5 个测试用例运行                                 │
│  2. 记录问题和改进点                                        │
│  3. 修改 SKILL.md                                          │
│  4. 重新测试验证                                            │
│  5. 重复直到满意                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 常见问题与优化方案

#### 问题 1：触发不稳定

**现象**：同样的输入，有时触发有时不触发

**原因**：
- 触发描述不够明确
- 与其他 Skill 冲突

**优化方案**：
```yaml
# 优化前
description: "生成绘画提示词"

# 优化后
description: |
  AI绘画提示词生成专家。当用户明确提到"绘画"、
  "提示词"、"prompt"、"Midjourney"、"Stable Diffusion"
  等关键词时触发。即使简单输入如"一只猫"也要触发。
```

#### 问题 2：输出质量不稳定

**现象**：有时输出很好，有时很敷衍

**原因**：
- 工作流步骤不清晰
- 缺少具体约束

**优化方案**：
```markdown
## 优化前
生成详细的提示词

## 优化后
### 必须包含的部分
1. 主题分析（50-100字）
2. 详细提示词（英文，100-200词）
3. Midjourney 完整命令
4. Stable Diffusion 正/负面提示词
5. 中文描述
6. 2-3个变体建议

### 质量标准
- 使用具体描述而非抽象形容词
- 包含专业术语（摄影、艺术、渲染）
- 提供可直接复制使用的格式
```

#### 问题 3：处理不了边界情况

**现象**：异常输入时报错或输出奇怪结果

**优化方案**：
```markdown
## 异常处理

### 输入为空或太简单
**处理**: 提供创意建议或引导用户
**示例**: 
用户: "画点什么"
回应: "我可以帮您生成各种主题的绘画提示词，比如：
- 自然风光（山川、森林、海洋）
- 城市景观（未来都市、古镇街道）
- 人物角色（战士、法师、机器人）
请告诉我您感兴趣的方向！"

### 输入与绘画无关
**处理**: 礼貌说明 Skill 能力范围
**示例**:
用户: "帮我写代码"
回应: "我是绘画提示词生成专家，专注于将您的创意转化为AI绘画描述。如果您需要编程帮助，建议询问其他相关问题。"
```

### 4.3 版本管理

```
skill-name/
├── SKILL.md              # 当前版本
├── versions/
│   ├── SKILL-v1.md      # 初版
│   ├── SKILL-v2.md      # 优化触发描述
│   └── SKILL-v3.md      # 添加异常处理
└── evals/
    ├── evals-v1.json    # v1 测试结果
    ├── evals-v2.json    # v2 测试结果
    └── evals-v3.json    # v3 测试结果
```

---

## 5. 自动化评估工具

### 5.1 评估脚本示例

```python
# eval_skill.py
import json
import subprocess
import time

def run_test(skill_path, prompt):
    """运行单个测试用例"""
    start_time = time.time()
    
    # 调用 Claude 运行测试
    result = subprocess.run(
        ["claude", "-p", f"--skill={skill_path}", prompt],
        capture_output=True,
        text=True
    )
    
    duration = time.time() - start_time
    
    return {
        "output": result.stdout,
        "error": result.stderr,
        "duration": duration,
        "tokens": estimate_tokens(result.stdout)
    }

def evaluate_skill(skill_path, evals_path):
    """评估 Skill"""
    with open(evals_path) as f:
        evals = json.load(f)
    
    results = []
    for eval_case in evals["evals"]:
        result = run_test(skill_path, eval_case["prompt"])
        results.append({
            "name": eval_case["name"],
            "prompt": eval_case["prompt"],
            "expected": eval_case["expected_output"],
            "actual": result["output"],
            "duration": result["duration"],
            "tokens": result["tokens"]
        })
    
    # 生成报告
    generate_report(results)

def generate_report(results):
    """生成评估报告"""
    total = len(results)
    avg_duration = sum(r["duration"] for r in results) / total
    avg_tokens = sum(r["tokens"] for r in results) / total
    
    print(f"评估结果:")
    print(f"- 测试用例数: {total}")
    print(f"- 平均响应时间: {avg_duration:.2f}s")
    print(f"- 平均 Token 消耗: {avg_tokens:.0f}")
    print(f"\n详细结果:")
    for r in results:
        print(f"\n{r['name']}:")
        print(f"  输入: {r['prompt'][:50]}...")
        print(f"  时间: {r['duration']:.2f}s")
        print(f"  Token: {r['tokens']}")
```

### 5.2 持续集成

```yaml
# .github/workflows/skill-eval.yml
name: Skill Evaluation

on:
  push:
    paths:
      - 'skills/**/SKILL.md'

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Run Skill Evaluation
        run: |
          for skill in skills/*/; do
            echo "Evaluating $skill..."
            python eval_skill.py "$skill" "${skill}evals/evals.json"
          done
      
      - name: Upload Results
        uses: actions/upload-artifact@v2
        with:
          name: eval-results
          path: eval-reports/
```

---

## 6. 最佳实践总结

### 6.1 评估检查清单

#### 触发评估
- [ ] 测试 10+ 个应该触发的输入
- [ ] 测试 10+ 个不应该触发的输入
- [ ] 测试模糊/歧义输入
- [ ] 触发准确率 > 90%

#### 质量评估
- [ ] 测试简单输入
- [ ] 测试复杂输入
- [ ] 测试边界输入
- [ ] 输出质量评分 > 8/10

#### 一致性评估
- [ ] 同一输入多次运行，结果一致
- [ ] 输出格式统一
- [ ] 无随机性内容（除非必要）

#### 效率评估
- [ ] 响应时间 < 10s
- [ ] Token 消耗合理
- [ ] 无冗余工具调用

### 6.2 优化优先级

```
P0 (必须修复):
- 触发完全失效
- 输出包含错误信息
- 导致系统错误

P1 (高优先级):
- 触发准确率 < 80%
- 输出质量不稳定
- 无法处理常见边界情况

P2 (中优先级):
- 输出格式不统一
- 响应时间过长
- Token 消耗过高

P3 (低优先级):
- 输出可以更美观点
- 可以添加更多示例
- 可以支持更多变体
```

---

## 7. 练习：评估 prompt-craft Skill

**任务**：为 prompt-craft Skill 设计评估方案

**要求**：
1. 设计 10 个测试用例（正常、边缘、边界各 3-4 个）
2. 定义评估指标（触发准确率、输出质量）
3. 运行评估并记录结果
4. 根据结果提出优化建议

**参考答案**：

```json
{
  "skill_name": "prompt-craft",
  "evals": [
    {
      "id": 1,
      "name": "simple-cat",
      "category": "normal",
      "prompt": "一只猫",
      "expected": "生成包含主体、场景、风格、技术参数的完整提示词"
    },
    {
      "id": 2,
      "name": "complex-cyberpunk",
      "category": "normal",
      "prompt": "赛博朋克风格的女战士，穿着发光机甲，手持能量剑，站在雨中的未来都市",
      "expected": "在用户提供细节基础上补充完善，生成多平台版本"
    },
    {
      "id": 3,
      "name": "vague-request",
      "category": "edge",
      "prompt": "画点什么好看的",
      "expected": "提供创意建议或引导用户明确需求"
    },
    {
      "id": 4,
      "name": "wrong-domain",
      "category": "boundary",
      "prompt": "帮我修图",
      "expected": "不触发或礼貌说明能力范围"
    }
  ]
}
```

---

完成本章学习后，你应该能够：
- ✅ 设计全面的测试用例
- ✅ 运行对比评估（有/无 Skill）
- ✅ 分析评估结果并定位问题
- ✅ 迭代优化 Skill 质量
