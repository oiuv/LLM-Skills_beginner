# 02：Expert Package 规范

## 推荐目录

~~~
learning-coach/
├── expert.yaml
├── IDENTITY.md
├── SOUL.md
├── AGENTS.md
├── tool-policy.yaml
├── memory-policy.yaml
├── automations.yaml
├── user-profile.schema.json
├── references/
├── skills/
├── evals/
└── assets/
~~~

这不是必须照搬的物理格式，而是一套清晰的职责约定。机器需要验证的内容使用 YAML/JSON，人需要编辑和评审的方法使用 Markdown。

## expert.yaml

~~~yaml
schemaVersion: expert.package/v1
id: learning-coach
version: 1.0.0
name: 学习规划与错题诊断导师
description: 基于学习证据诊断知识缺口并安排复习

audience:
  - middle-school-student
scenarios:
  - diagnose-mistakes
  - guided-practice
  - weekly-review

entrypoints:
  identity: IDENTITY.md
  persona: SOUL.md
  operations: AGENTS.md
  toolPolicy: tool-policy.yaml
  memoryPolicy: memory-policy.yaml
  automations: automations.yaml
  userSchema: user-profile.schema.json

skills:
  - name: diagnose-mistakes
    version: ^1.0.0
  - name: guided-practice
    version: ^1.0.0

capabilities:
  - name: lookup_concept
    version: ^1.0.0
    required: true
  - name: schedule_review
    version: ^1.0.0
    required: false

evaluation:
  suite: evals/cases.json
  minimumScore: 0.85

compatibility:
  runtime: ^1.0.0
~~~

## Manifest 必填字段

| 字段 | 目的 |
|---|---|
| schemaVersion | 解析 Package 格式 |
| id + version | 唯一、可复现地标识专家 |
| entrypoints | 找到各类配置 |
| skills | 声明可复用任务方法依赖 |
| capabilities | 声明 Tool/MCP/Connector 需求 |
| evaluation | 绑定发布门槛 |
| compatibility | 防止安装到不兼容 Runtime |

展示图标、分类和商店文案可以位于 listing 区域或独立 listing 文件，不能影响 Runtime 行为。

## 加载与编译

~~~
Package 文件
  ↓ 路径规范化，禁止越界引用
Manifest Schema 校验
  ↓
文件存在性和大小预算
  ↓
Skill / Capability 依赖解析
  ↓
安全扫描与签名验证
  ↓
Prompt / Context 预算检查
  ↓
Evaluation Suite
  ↓
ResolvedExpertDefinition
~~~

编译结果示意：

~~~ts
interface ResolvedExpertDefinition {
  id: string;
  version: string;
  digest: string;
  alwaysLoadedContext: ContextFragment[];
  indexedReferences: ReferenceCard[];
  resolvedSkills: ResolvedSkill[];
  capabilityRequirements: CapabilityRequirement[];
  memoryPolicy: CompiledMemoryPolicy;
  automationTemplates: CompiledAutomationTemplate[];
  evaluationMetadata: EvaluationMetadata;
}
~~~

Runtime 使用编译结果，不在每轮重新扫描整个目录。

## 路径安全

- 所有相对路径解析后必须位于 Package Root；
- 默认拒绝符号链接和硬链接越界；
- 禁止引用环境凭证目录；
- 限制单文件和总包大小；
- 媒体文件校验 MIME 与真实内容；
- scripts 需要独立安装与执行策略；
- 不允许 Markdown 自动下载或执行远程内容。

## 版本规则

建议语义化版本：

- Patch：文案、示例或不改变行为的修正；
- Minor：新增向后兼容 Skill、Reference 或可选能力；
- Major：改变行为边界、输入输出、Memory Policy 或权限需求。

任何修改都会产生新 packageDigest。相同 id/version 不能对应不同内容。

## 依赖锁定

发布 Manifest 可以声明兼容范围；安装结果需要生成 Lock：

~~~yaml
expert:
  id: learning-coach
  version: 1.0.0
  digest: sha256:...
skills:
  diagnose-mistakes:
    version: 1.1.2
    digest: sha256:...
capabilities:
  lookup_concept:
    provider: local-tool-registry
    version: 1.0.3
~~~

Trace 保存 Expert 和依赖的解析版本，保证问题可重放。

## 常见错误

1. Manifest 只存展示信息，没有 Runtime 依赖。
2. 相同版本允许覆盖上传。
3. Markdown 路径可以读取 Package 外文件。
4. 安装时解析到 latest，运行时无法复现。
5. Package 内直接包含凭证或用户 Memory。

## 练习与验收

为一个专家 Manifest 设计五个失败用例：

- 路径越界；
- Skill 版本不兼容；
- 必需 Tool 不存在；
- Runtime 版本不兼容；
- Evaluation 低于门槛。

验收：每个失败具有稳定错误码，并发生在 Package 激活之前。
