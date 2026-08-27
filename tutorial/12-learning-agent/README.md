# 阶段 12：指导学习 Agent

> 前置知识：阶段 0～10  
> 里程碑：通用 Agent 拥有学习者模型、教学策略、评测和复习闭环

## 学习 Agent 与聊天老师的区别

聊天老师优化当前回复；学习 Agent 优化一段时间内的学习结果。它需要持续维护目标、知识状态、误区、练习证据和复习计划。

~~~
多模态学习输入
  ↓
诊断知识状态
  ↓
选择教学策略
  ↓
讲解 / 提问 / 提示 / 练习
  ↓
评估学习证据
  ↓
更新 Learner Model
  ↓
安排下一任务和间隔复习
~~~

## 领域对象

~~~ts
interface LearnerProfile {
  userId: string;
  goals: LearningGoal[];
  preferences: {
    language: string;
    explanationStyle?: string;
    accessibility: string[];
  };
  constraints: {
    minutesPerDay?: number;
    deadline?: string;
  };
}

interface KnowledgeState {
  userId: string;
  conceptId: string;
  mastery: number;
  confidence: number;
  misconceptions: string[];
  evidenceRefs: string[];
  lastAssessedAt?: string;
}

interface LearningEvidence {
  id: string;
  conceptId: string;
  type: "answer" | "explanation" | "exercise" | "project" | "assessment";
  result: unknown;
  rubricVersion: string;
  occurredAt: string;
}
~~~

mastery 是基于证据的估计，不是模型随意生成的永久标签。

## 知识图谱

知识图谱至少表示：

- 概念；
- 前置关系；
- 课程或教材映射；
- 难度；
- 示例与练习资源；
- 评测标准。

规划器根据前置关系避免让学生练习尚未具备基础的内容。知识图谱是课程领域数据，不等于模型参数。

## 教学策略

Teaching Policy 根据目标、掌握度、错误类型和情境选择：

- 直接讲解；
- 苏格拉底式提问；
- worked example；
- 分级提示；
- 对比示例；
- 检索练习；
- 间隔复习；
- 迁移任务；
- 测验。

~~~ts
interface TeachingDecision {
  strategy: "explain" | "socratic" | "worked_example" | "hint" | "practice" | "assess";
  targetConcepts: string[];
  rationaleSummary: string;
  successCriteria: string[];
}
~~~

策略可以由模型建议，但受年龄、课程目标、无障碍需求和产品政策约束。

## Hint Ladder

对解题任务逐级提供帮助：

1. 提醒目标或相关概念；
2. 指出下一步方向；
3. 提供局部结构；
4. 展示相似例题；
5. 在用户明确需要时给出完整解法。

每一级记录学生是否仍能独立完成。系统不能为了快速获得好评而立即泄露答案。

## 诊断与评测

诊断需要：

- 明确测量哪些知识点；
- 多道或多种证据，避免单题误判；
- 区分粗心、概念误解和表达问题；
- 使用版本化 Rubric；
- 给出置信度；
- 允许用户和教师修正。

模型评审可以辅助评分，但关键评测应使用确定性答案、执行结果或人工 Rubric。

## 学习计划

计划由以下输入生成：

- 学习目标与截止时间；
- 当前 KnowledgeState；
- 前置知识图谱；
- 每日时间和设备；
- 学习资源；
- 最近负荷和完成率；
- 复习队列。

每日任务应可在 Scheduler 中执行和调整，而不是只生成一篇计划文本。

## 间隔复习

每次学习证据更新复习优先级：

- 掌握度低且重要：尽快复习；
- 刚掌握：逐步拉长间隔；
- 多次稳定掌握：降低频率；
- 出现新错误：缩短间隔并重新诊断。

算法可以从简单 Leitner 或可解释规则开始，再逐步引入统计模型。

## Skills 和 Tools

建议 Skills：

- diagnose-mistakes；
- explain-concept；
- generate-practice；
- conduct-assessment；
- create-study-plan；
- weekly-learning-review。

建议 Tools：

- lookup_concept；
- retrieve_learning_resource；
- run_code；
- render_formula；
- read_artifact；
- save_note；
- schedule_review；
- update_knowledge_state。

update_knowledge_state 属于高影响写操作，应校验证据并保留历史版本。

## 教育安全

- 明确 Agent 不是教师、医生或心理咨询师的替代者；
- 年龄适配和监护要求；
- 避免羞辱、标签化和过度依赖；
- 不根据敏感属性降低学习期望；
- 保护未成年人数据；
- 支持教师或家长监督但遵守用户权限；
- 学术诚信场景优先指导过程而不是代做；
- 高风险心理或健康信号升级给合适的人类支持。

## 学习效果指标

不能只测回复满意度。还应测：

- 前测到后测的提升；
- 延迟保持率；
- 独立完成率；
- 提示依赖；
- 计划完成率；
- 迁移到新题的表现；
- 误区修正率；
- 学习时间和认知负荷。

## 常见错误

1. 把聊天历史当作 Learner Model。
2. 单次回答错误就永久降低 mastery。
3. 为显得有帮助而直接给答案。
4. 学习计划只是一段 Markdown，不能调度。
5. 只评估回答风格，不评估学习结果。

## 练习与验收

实现“错题图片 → 诊断 → 分级提示 → 新题评测 → 更新知识状态 → 三天后复习”闭环。

验收标准：

- KnowledgeState 的变化有 evidenceRefs；
- 教学策略随掌握度和错误类型变化；
- 学生可查看并修正关键学习状态；
- 计划产生可调度 Task；
- 评测至少包含一个延迟学习效果指标。

