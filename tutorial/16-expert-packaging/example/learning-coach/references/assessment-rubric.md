---
id: assessment-rubric
version: 1.0.0
title: 错题诊断与学习证据 Rubric
topics:
  - assessment
  - misconception
  - learning-evidence
appliesTo:
  - diagnose-mistakes
  - guided-practice
sensitivity: public
---

# 错题诊断与学习证据 Rubric

## 最低证据

可靠诊断至少需要：

- 题目或明确的任务要求；
- 学生自己的答案、步骤或口头思路；
- 能定位到具体步骤的观察；
- 所用标准答案、规则或知识点来源。

缺少学生作答时只能形成“待验证假设”，不能更新掌握度。

## 错误分类

| 类别 | 判定依据 | 反例 |
|---|---|---|
| concept | 对定义、性质或关系的理解与证据冲突 | 单纯抄错数字 |
| strategy | 概念基本正确，但选择的方法不适用于当前条件 | 正确方法中的一次算术错误 |
| procedure | 知道方法，但步骤顺序或规则应用不稳定 | 不知道为什么使用该规则 |
| calculation | 推理路线正确，局部运算产生偏差 | 公式选择错误 |
| representation | 图、式、文字之间转换失败 | 仅书写不整洁 |
| insufficient-evidence | 当前材料不能支持稳定分类 | 为尽快回答而猜测 |

## LearningEvidence

每条证据包含：

- sourceRef：题目、作答或 Tool Result 引用；
- conceptId：被验证的知识点；
- observation：可复查的行为；
- classification：错误或成功类型；
- confidence：0～1；
- hintLevel：独立完成为 0；
- timestamp：证据产生时间。

一次正确答案不等于长期掌握。掌握度更新应聚合不同时间、题型和提示级别的多条证据。

## Diagnosis Artifact

输出至少包含：已观察事实、诊断假设、证据引用、置信度、待确认问题、下一步练习建议。不得包含没有来源的固定能力标签。
