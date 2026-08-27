# 09：学习导师 Expert Package 完整走读

示例目录：[example/learning-coach](example/learning-coach/expert.yaml)

## 场景

专家服务需要根据真实学习证据诊断错题、提供分级提示、生成复习任务的学生。它不是万能问答助手，也不代写考试。

## 文件映射

| 文件 | 作用 |
|---|---|
| expert.yaml | 版本、入口、Skill 和 Capability 依赖 |
| IDENTITY.md | 专家发现、受众和边界 |
| SOUL.md | 教学价值观和沟通方式 |
| AGENTS.md | 路由、证据、执行和停止纪律 |
| tool-policy.yaml | 能力声明和 Runtime Policy 提示 |
| memory-policy.yaml | 允许保存的学习信息 |
| automations.yaml | 默认关闭的复习 Automation |
| user-profile.schema.json | 用户画像输入 Schema |
| references/teaching-policy.md | 教学策略判断 |
| references/assessment-rubric.md | 诊断证据 Rubric |
| skills/diagnose-mistakes/SKILL.md | 错题诊断流程 |
| skills/guided-practice/SKILL.md | 分级练习流程 |
| evals/cases.json | 发布前最低评测 |

## 安装阶段

### 1. Manifest

解析器验证：

- expert.package/v1；
- id 与语义化版本；
- 所有 entrypoint 位于 Package Root；
- Skill 和 Capability 名称合法；
- Runtime 兼容范围；
- Evaluation Suite 存在。

### 2. 依赖

必需：

- diagnose-mistakes Skill；
- guided-practice Skill；
- lookup_concept Tool；
- read_artifact Tool。

可选：

- save_note；
- schedule_review；
- notification Connector。

可选能力缺失时，专家仍可在对话内完成诊断，但不会声称已经创建提醒。

### 3. 安全

扫描器确认：

- Package 无 Secret；
- 所有路径未越界；
- 没有安装时脚本；
- Automation 默认关闭；
- 更新 KnowledgeState 必须依赖 LearningEvidence；
- 日历和通知写操作需要 Runtime Policy。

### 4. 评测

运行：

- 正确触发错题诊断；
- 普通概念解释不误触发完整诊断；
- 缺少学生答案时追问；
- 不代做考试；
- Tool 失败时不伪造完成；
- 无证据时不更新 mastery。

## 用户绑定

用户首次使用：

1. 选择语言、年级和每日时间；
2. 查看 Memory Policy；
3. 决定是否保存学习偏好；
4. 可选连接日历和通知；
5. 可选启用每日复习 Automation；
6. 创建 ExpertBinding。

Package 不会生成带真实数据的 USER.md。

## Run A：错题诊断

~~~
用户上传题目图片
  ↓
多模态层生成 OCR 与原图引用
  ↓
Expert Router 选择 learning-coach
  ↓
激活 diagnose-mistakes
  ↓
发现缺少学生答案 → waiting_user
  ↓
学生补充答案
  ↓
read_artifact + lookup_concept
  ↓
按 assessment-rubric 生成 Diagnosis Artifact
  ↓
生成 LearningEvidence
  ↓
LearnerModelService 更新 KnowledgeState
~~~

SOUL 决定表达尊重、先引导理解；AGENTS 要求证据；Skill 规定具体步骤；Policy 控制工具；LearnerModelService 保存真实状态。

## Run B：分级练习

~~~
读取 KnowledgeState
  ↓
选择 guided-practice
  ↓
生成一道新题
  ↓
用户作答错误
  ↓
提供第一级提示
  ↓
再次作答
  ↓
根据 Rubric 评测
  ↓
记录提示级别与证据
~~~

专家不能为了快速结束直接给完整答案，除非满足教学策略中的升级条件。

## Run C：安排复习

当用户启用 Automation：

1. Automation Template 绑定用户时区；
2. Runtime 创建 Trigger；
3. 测验完成事件生成 Job；
4. Worker 恢复 Thread；
5. 生成复习 Artifact；
6. schedule_review 请求审批；
7. 执行后保存幂等记录；
8. 通知失败只重试通知。

HEARTBEAT 或 Automation 文件不保存 Job 状态。

## 升级到 1.1

假设新增英语口语练习：

- 如果只是新增可选 Skill：Minor；
- 新 Skill 不默认暴露给现有绑定；
- 新增麦克风权限需要用户确认；
- 新增音频 Memory 字段需要 Policy 和数据迁移；
- 原数学错题 Run 保持 1.0；
- 评测新增多模态、隐私和取消场景。

## 关键边界检查

| 问题 | 正确答案 |
|---|---|
| 专家声明 schedule_review，是否自动有权限 | 否 |
| USER Schema 是否保存用户真实资料 | 否 |
| Memory Policy 是否就是 Memory | 否 |
| Automation Template 是否就是 Job | 否 |
| SOUL 是否能覆盖平台安全策略 | 否 |
| Skill 是否可以绕过 ToolExecutor | 否 |
| Expert 更新是否改变运行中 Run | 否 |

## 完成练习

复制示例包，创建“Python 项目学习教练”，至少修改：

- audience 和 scenarios；
- 两个 Skills；
- Tool/Connector 依赖；
- Memory Policy；
- 一个 Event Automation；
- 10 个 Eval Cases。

验收：新专家不依赖修改 AgentKernel，也没有复制任何真实用户状态。
