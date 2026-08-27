# 05：专家定义、用户状态与记忆边界

## 最重要的隔离

~~~
Expert Package        可发布、可复制、不可包含用户真实数据
Installation State    某环境的依赖解析与组织配置
User State            某个用户的画像、连接和授权
Run State             某次任务的计划、Observation、审批和结果
~~~

把四类数据混在 Markdown 中，会导致隐私泄漏、版本覆盖和跨用户污染。

## 数据分类

| 数据 | 所属位置 | 示例 |
|---|---|---|
| 专家名称和使命 | Expert Package | 学习规划导师 |
| 教学价值观 | Expert Package | 优先引导理解 |
| Memory 写入规则 | Expert Package | 只保存经证据确认的掌握度 |
| 用户姓名和偏好 | User Store | 喜欢图示解释 |
| 学习目标 | LearnerProfile / Thread | 两周掌握分数 |
| 知识状态 | Learner Model Store | fractions mastery=0.7 |
| 当前计划 | Task / Plan Store | 今天完成诊断 |
| Tool Call 和审批 | Run Store | schedule_review 等待审批 |
| 专家领域经验 | references | Hint Ladder 规范 |
| 凭证 | Secret / Connection Store | 日历 OAuth Token |

## USER.md 应改成 Schema

可发布 Package 不存某个用户的 USER.md，而是声明需要哪些字段：

~~~json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "preferredLanguage": { "type": "string" },
    "gradeLevel": { "type": "string" },
    "minutesPerDay": {
      "type": "integer",
      "minimum": 5,
      "maximum": 240
    }
  },
  "additionalProperties": false
}
~~~

用户填写或 Runtime 推断的真实值进入 LearnerProfile，并遵守产品隐私政策。

## memory-policy.yaml

~~~yaml
schemaVersion: expert.memory-policy/v1

allowedKinds:
  - preference
  - semantic
  - episodic

fields:
  learningGoal:
    retentionDays: 365
    requiresConfirmation: true
  explanationPreference:
    retentionDays: 180
    requiresConfirmation: false
  knowledgeState:
    storage: learner-model
    requiresEvidence: true

forbidden:
  - password
  - access-token
  - payment-data
  - unrelated-private-conversation

recall:
  maxRecords: 8
  requireSource: true
  includeConfidence: true
~~~

Policy 说明可以记什么、多久、如何确认和检索；Memory Store 保存真实内容。

## Memory 写入流程

~~~
Run 产生候选事实
  ↓
Memory Policy 检查允许字段
  ↓
来源、置信度和证据校验
  ↓
必要时请求用户确认
  ↓
写入 MemoryStore / LearnerModelStore
  ↓
Trace 记录 expertId、policyVersion、sourceRef
~~~

模型不能直接编辑长期 Memory 文件。

## Memory 读取流程

1. 根据 userId 和当前 Goal 过滤；
2. 应用 Expert Memory Policy；
3. 检索相关记录；
4. 检查来源、有效期和冲突；
5. 限制条数和 token；
6. 在 Context 中标注“用户状态”与“专家规范”的区别。

专家切换时，用户通用偏好可以复用；敏感领域或专家专属 Memory 需要隔离 namespace。

## 专家升级

Memory 数据不能跟随 Package 版本被覆盖。升级时：

- 新 Policy 允许更多字段：先请求用户同意；
- 新 Policy 缩短保留时间：运行清理或标记过期；
- 删除字段：提供迁移与遗忘流程；
- 语义变化：不能复用旧值，必须迁移版本；
- 专家被卸载：询问保留、导出或删除专家专属数据。

## 多用户和多租户

每次检索至少绑定：

- tenantId；
- userId；
- expertId 或共享范围；
- sensitivity；
- permission scope。

向量相似度不能绕过这些确定性过滤。

## 群聊和共享 Thread

- 私人 LearnerProfile 默认不注入群聊；
- 共享 Thread 只读共享 Artifact 和明确公开状态；
- 不把一个成员的 Memory 用于回答另一个成员；
- 写入共享 Memory 前明确目标范围；
- 子 Agent 只获得任务必需的 Memory。

## 常见错误

1. 发布专家包时包含测试用户数据。
2. Package 更新覆盖用户的 MEMORY.md。
3. 用户卸载专家后数据永久残留。
4. 用户 A 的检索结果进入用户 B 的 Context。
5. 学习掌握度没有证据却被模型写入。

## 练习与验收

设计以下迁移：Expert 1.0 保存 explanationPreference，2.0 新增 accessibilityNeeds。

验收：

- 旧数据保留来源；
- 新敏感字段需要明确同意；
- 拒绝同意不阻塞其他专家能力；
- 卸载后可以选择删除专家专属 Memory。
