# 阶段 13：安全、可观察性与评测

> 前置知识：阶段 3～12  
> 里程碑：能用 Trace 解释行为，用评测证明质量，用策略限制风险

## 四层治理

1. 输入层：内容安全、Prompt Injection、文件和媒体校验。
2. 决策层：Tool 可见性、预算、模型输出 Schema。
3. 执行层：权限、审批、沙箱、幂等和审计。
4. 输出层：事实、引用、隐私、教学和格式约束。

安全不是一个 Prompt，也不是最后一步文本过滤。

## Identity 与权限

需要区分：

- 最终用户；
- 当前设备；
- 组织或租户；
- Agent 身份；
- Connector 连接身份；
- 审批者；
- 子 Agent。

每次 Tool Call 都以明确 principal 执行，不能默认继承服务器管理员权限。

## Prompt Injection

外部网页、文档、邮件、OCR 和 Tool Result 都是不可信数据。处理原则：

- 标记来源；
- 不允许外部内容修改系统策略；
- 敏感 Tool 默认不可见；
- 高风险动作需要确定性校验或审批；
- 不把密钥和隐藏策略交给模型；
- 对跨数据源操作应用最小权限。

## Trace Schema

~~~ts
interface TraceEvent {
  id: string;
  traceId: string;
  parentId?: string;
  type: "run" | "model" | "tool" | "policy" | "memory" | "task" | "artifact";
  name: string;
  startedAt: string;
  endedAt?: string;
  status: "ok" | "error" | "cancelled";
  attributes: Record<string, string | number | boolean>;
}
~~~

敏感内容应脱敏或只保存引用。Trace 需要 retention 和访问权限。

## 评测分层

| 层级 | 测什么 | 示例 |
|---|---|---|
| Unit | 确定性组件 | Schema、状态机、权限 |
| Component | 单个模型能力 | Tool 选择、Skill 触发 |
| Trajectory | 执行路径 | 步数、错误恢复、重复调用 |
| Task | 最终任务成功 | 是否生成正确学习计划 |
| Safety | 风险行为 | 是否越权、泄密或执行注入 |
| Learning Outcome | 教学效果 | 延迟保持和独立完成率 |

## 评测用例

~~~ts
interface EvalCase {
  id: string;
  input: unknown;
  initialState: unknown;
  expected: {
    requiredTools?: string[];
    forbiddenTools?: string[];
    outcome?: unknown;
    maxSteps?: number;
  };
  tags: string[];
}
~~~

用例应覆盖正常、边界、对抗、错误恢复、权限和成本场景。

## 评测方法

- 确定性断言优先；
- 结构化 Rubric 适合人工和模型评审；
- LLM-as-Judge 需要校准、盲测和人工抽检；
- 同一评测集比较版本；
- 保留失败轨迹，不只保存总分；
- 线上指标不能替代离线安全回归。

## 关键指标

- Task Success Rate；
- Tool Selection Precision/Recall；
- Invalid Tool Call Rate；
- Recovery Rate；
- Human Intervention Rate；
- P50/P95 延迟；
- token、模型和外部 API 成本；
- Policy Violation Rate；
- 学习效果指标。

## 回归与发布门槛

每次修改 Prompt、Skill、Tool Schema、模型、Memory 或 Planner 都可能改变行为。发布前：

1. 跑确定性测试；
2. 跑固定轨迹评测；
3. 跑安全对抗集；
4. 比较质量、延迟和成本；
5. 人工审查高风险失败；
6. 小流量发布；
7. 监控并可回滚。

## 常见错误

1. 只看最终回答，不看执行轨迹。
2. 用同一个模型生成和评判所有用例。
3. Trace 记录完整密钥或学生敏感数据。
4. 线上发现失败后无法回放。
5. 学习产品只测用户满意度。

## 练习与验收

为毕业项目建立至少 20 个用例，覆盖工具、记忆、调度、注入、取消和学习效果。

验收标准：

- 每个 Run 有统一 traceId；
- 高风险动作能定位到策略决策和审批人；
- 版本对比包含质量、延迟和成本；
- 安全失败能阻止发布；
- 学习效果与文本质量分别评估。

## 延伸阅读

- [Guardrails](../../PART5-Agent/10-guardrails-safety.md)
- [Prompt 工程](../../PART5-Agent/11-prompt-engineering.md)
- [Agent 评测](../../PART5-Agent/12-evaluation-testing.md)

