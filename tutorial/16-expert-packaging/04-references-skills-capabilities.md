# 04：References、Skills 与 Capabilities

## 判断力、流程和动作

三个层次分别解决：

| 层次 | 问题 | 示例 |
|---|---|---|
| references | 判断时依据什么标准 | 教学策略、评分 Rubric |
| Skill | 一类任务怎样完成 | 错题诊断、分级练习 |
| Capability | 一个原子动作怎样执行 | 查知识点、保存笔记 |

~~~
Reference：怎样判断错误属于概念误解还是计算失误
Skill：收集证据 → 分类 → 核对 → 输出诊断
Tool：lookup_concept / analyze_answer / save_report
~~~

## References

Reference 适合保存：

- 行业标准；
- 判断 Rubric；
- 模板；
- 示例与反例；
- 跨 Skill 的方法论；
- 术语表；
- 合规或教学指南。

每份 Reference 建议带机器可索引元数据：

~~~yaml
id: teaching-policy
version: 1.0.0
title: 教学策略选择规范
topics:
  - tutoring
  - scaffolding
  - assessment
appliesTo:
  - diagnose-mistakes
  - guided-practice
sensitivity: public
~~~

Reference 是知识来源，不自动具有系统指令优先级。来自外部网页或用户上传内容的 Reference 必须标注为不可信数据。

## Reference 加载

推荐流程：

1. 安装时生成 Reference Card；
2. 按标题、主题、适用 Skill 和版本建立索引；
3. Run 中先根据任务检索候选；
4. 重排并检查权限、来源和有效期；
5. 只加载相关片段；
6. Trace 保存 referenceId、version 和片段引用。

不要在每次 Run 注入整个 references 目录。

## Skills

专家 Manifest 只声明 Skill 依赖：

~~~yaml
skills:
  - name: diagnose-mistakes
    version: ^1.0.0
    required: true
  - name: weekly-review
    version: ^2.1.0
    required: false
~~~

安装器解析得到具体版本与 Digest。Skill 自身仍需要：

- 描述和触发条件；
- requiredTools；
- 输入和输出；
- 工作步骤；
-安全边界；
- 测试。

专家包不能通过内嵌同名 Skill 静默覆盖组织级安全 Skill。加载优先级必须显式并可审计。

## Capabilities

Capability Requirement 描述专家需要什么，不描述谁授权：

~~~yaml
capabilities:
  - name: lookup_concept
    kind: tool
    version: ^1.0.0
    required: true
    sideEffect: read

  - name: learning-calendar
    kind: connector
    version: ^2.0.0
    required: false
    scopes:
      - calendar.read
      - calendar.events.write
~~~

安装阶段校验能力是否存在；绑定阶段校验用户是否连接账号；Run 阶段根据当前权限和策略过滤。

## 三阶段解析

### 安装时

- Skill 和 Capability 是否存在；
- 版本是否兼容；
- Package 声明与实际 Skill 依赖是否一致；
- 是否包含被组织禁止的依赖；
- 是否通过供应链扫描。

### 用户绑定时

- 用户是否有权使用该专家；
- 必需 Connector 是否授权；
- scope 是否足够；
- 用户是否接受 Memory 和 Automation Policy；
- 可选能力缺失时是否允许降级。

### 每次 Run

- 当前连接是否仍有效；
- Tool 是否健康；
- 当前 Task 是否允许该能力；
- 参数和资源是否需要审批；
- 是否超过预算和配额。

## 能力缺失与降级

专家需要声明：

~~~yaml
fallbacks:
  learning-calendar:
    whenUnavailable: ask-user
    alternative: create-plan-artifact
~~~

可选日历 Connector 不可用时，可以生成计划 Artifact 让用户手动添加。必需的 lookup_concept 不可用时，应明确失败或选择经过验证的替代 Provider。

不能因为缺少 Connector 就让模型假装已经写入外部系统。

## Tool 描述与 TOOLS 文档

TOOLS 类文档可以说明：

- 推荐使用顺序；
- 工具之间的差异；
- 常见错误；
- 成本和时延；
- 特定领域注意事项。

真实 Schema、版本、sideEffect 和执行器仍来自 Tool Registry。说明文档与 Registry 冲突时，以 Runtime 注册信息为准并报告 Package 校验错误。

## 组合规则

- Skill 可以调用 Tool；
- Skill 可以引用 Reference；
- Skill 可以嵌套 Skill，但必须限制深度；
- Expert 可以组合多个 Skill；
- Expert 不直接拥有凭证；
- Connector 可以暴露 Tool，但账号绑定属于 Runtime；
- Reference 不可以自行执行动作。

## 常见错误

1. 把所有领域知识都写进 Skill。
2. Reference 没有版本和来源。
3. 专家声明 Tool 后自动获得权限。
4. 可选 Connector 缺失时仍报告任务完成。
5. 安装时不锁定实际依赖版本。

## 练习与验收

为 diagnose-mistakes Skill 绘制依赖图，并模拟：

- 必需 Tool 缺失；
- 可选 Connector 失效；
- Reference 被更新；
- Skill Major 版本不兼容。

验收：四种情况产生不同、可处理的错误或降级路径。
