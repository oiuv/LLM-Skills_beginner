# 01：专家是一等产品，不是 Skill 的别名

## 四个容易混淆的对象

| 对象 | 负责什么 | 典型生命周期 |
|---|---|---|
| Expert Definition | 面向什么用户、怎样工作、需要哪些能力 | 创建、审核、发布、升级 |
| Agent Runtime | 如何进行模型循环、执行动作和保存状态 | 常驻服务 |
| Skill | 一类任务应该怎样完成 | 安装、加载、评测、升级 |
| Tool / Connector | 一个原子动作怎样执行 | 注册、授权、调用、撤销 |

一个专家可以组合多个 Skill，一个 Skill 也可以被多个专家复用。专家不拥有工具权限，只声明能力需求。

## 四层对象模型

~~~ts
interface ExpertDefinition {
  id: string;
  version: string;
  identity: ExpertIdentity;
  packageDigest: string;
  requiredSkills: SkillRequirement[];
  requiredCapabilities: CapabilityRequirement[];
  policies: ExpertPolicyRefs;
  evaluationSuite: string;
}

interface ExpertInstallation {
  id: string;
  expertId: string;
  expertVersion: string;
  tenantId: string;
  enabled: boolean;
  resolvedSkills: ResolvedSkill[];
  resolvedCapabilities: ResolvedCapability[];
}

interface ExpertBinding {
  installationId: string;
  userId: string;
  connectionIds: string[];
  userOverrides: Record<string, unknown>;
}

interface ExpertRunContext {
  expertId: string;
  expertVersion: string;
  installationId: string;
  bindingId: string;
  threadId: string;
  runId: string;
}
~~~

### ExpertDefinition

内容不可变，可签名、审核和复现。它不能包含用户真实记忆、OAuth Token 或正在执行的 Task。

### ExpertInstallation

表示某组织或环境安装了哪个版本，并记录依赖解析结果。相同专家可以在不同环境绑定不同模型、MCP Server 或 Connector。

### ExpertBinding

表示某个用户如何使用已安装专家，例如连接哪个日历账号、允许哪些通知方式。凭证只通过 connectionId 引用。

### ExpertRunContext

每次 Run 固定 expertVersion。即使管理员同时发布新版本，进行中的 Run 仍可重放。

## 专家面向用户交付场景

好的专家需要回答：

1. 谁会在什么场景找到它；
2. 它交付什么结果；
3. 为什么比通用聊天更稳定；
4. 需要哪些输入和授权；
5. 何时追问、拒绝或升级给人；
6. 如何衡量任务与领域效果。

“万能学习助手”不是清晰专家。“初中数学错题诊断与复习导师”有明确人群、输入、交付和评测。

## 生命周期

~~~
draft
  ↓ validate
validated
  ↓ evaluate
tested
  ↓ security review
approved
  ↓ publish
published
  ↓ install / bind
active
  ↓ deprecate
deprecated
  ↓ revoke
revoked
~~~

状态含义：

- validated：目录、Schema、引用和依赖合法；
- tested：通过包内最低评测门槛；
- approved：完成安全、内容和权限审查；
- published：版本可被发现和安装；
- deprecated：不建议新安装，但旧绑定可迁移；
- revoked：因严重风险停止新 Run，并执行应急策略。

## 一次运行的数据流

1. 用户选择专家或路由器匹配 expertId。
2. 加载当前 ExpertBinding。
3. 读取绑定的不可变 ExpertDefinition。
4. 根据用户权限重新解析当前可用能力。
5. Context Compiler 选择身份、规程、Skill 和 references。
6. AgentKernel 启动 Run，并写入 expertId/version。
7. ToolExecutor 按 Runtime Policy 执行动作。
8. Thread、Memory、Artifact 和 Trace 写入用户状态域。
9. 评测系统按专家版本统计质量。

## 专家路由

路由应组合：

- 用户明确选择；
- 场景和输入模态；
- 专家适用与不适用声明；
- 所需 Connector 是否可用；
- 组织策略；
- 历史成功率；
- 风险等级。

低置信度时展示候选或询问，不要让隐藏路由器任意切换人格和权限。

## 常见错误

1. expertId 只是 Prompt 文件名，没有版本。
2. 专家安装时自动获得声明的所有工具权限。
3. 专家升级后，旧 Run 无法重放。
4. ExpertDefinition 中包含用户数据。
5. 一个 Skill 为了上架被包装成没有额外价值的专家。

## 练习

分别为“英语口语陪练”和“错题诊断导师”定义：

- audience；
- scenario；
- deliverables；
- requiredSkills；
- requiredCapabilities；
- refusalConditions；
- outcomeMetrics。

验收：两者不能只靠名称区分，必须具有不同输入、任务链和评测标准。
