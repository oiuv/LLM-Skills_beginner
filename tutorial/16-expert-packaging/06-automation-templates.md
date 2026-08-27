# 06：Automation Template 与主动专家

## 声明“想做什么”，Runtime 决定“怎样调度”

QClaw/OpenClaw 风格的 HEARTBEAT 文件适合表达主动检查意图，但生产系统需要 Trigger、Job、Queue、Worker 和 Checkpoint。

专家包中保存 Automation Template，用户绑定后才实例化：

~~~
Package Automation Template
  ↓ 用户配置、时区和授权
Bound Automation
  ↓ Scheduler 编译
Trigger
  ↓ 到期或事件发生
Job → Worker → Agent Run
~~~

## automations.yaml

~~~yaml
schemaVersion: expert.automations/v1

templates:
  - id: daily-study-reminder
    type: cron
    disabledByDefault: true
    schedule:
      localTime: "20:00"
      daysOfWeek: [1, 2, 3, 4, 5]
      timezoneSource: user-profile
    task:
      skill: guided-practice
      objective: 根据当前复习队列生成今日任务
    delivery:
      channel: user-preference
    limits:
      maxRunsPerDay: 1
      maxCostPerRun: 0.05

  - id: quiz-completed-review
    type: event
    eventType: learning.quiz.completed
    task:
      skill: weekly-review
      objective: 更新知识状态并重新安排复习
    deduplication:
      key: event.id
~~~

## Template 不能直接启用

安装专家时：

1. 展示 Automation 的作用；
2. 展示触发频率、可能使用的 Tools 和预计成本；
3. 让用户选择是否启用；
4. 收集时区、通知渠道和时间；
5. 校验 Connector 权限；
6. 生成 Bound Automation；
7. Scheduler 创建 Trigger。

高风险或高频 Automation 默认关闭。

## Bound Automation

~~~ts
interface BoundAutomation {
  id: string;
  expertId: string;
  expertVersion: string;
  templateId: string;
  userId: string;
  threadId: string;
  enabled: boolean;
  schedule: ResolvedSchedule;
  connectionIds: string[];
  policyVersion: string;
}
~~~

Bound Automation 属于用户 Runtime State，不回写 Expert Package。

## Heartbeat、Cron 和 Event 的区别

| 类型 | 适合 | 不适合 |
|---|---|---|
| Heartbeat/Monitor | 定期检查是否有值得提醒的事情 | 精确业务任务记录 |
| Cron Trigger | 明确时间执行 | 依赖业务事件的即时任务 |
| Event Trigger | 测验完成、文件更新等 | 无事件来源的周期巡检 |
| One-shot | 三天后复习一次 | 无限重复计划 |

Heartbeat 运行的是完整 Agent Turn，频率过高会增加成本和被动风险。能使用确定性事件的场景，不要靠模型轮询。

## 版本升级

Automation 绑定到创建时的模板版本。升级策略：

- 文案修正且语义不变：可自动迁移；
- 调整频率：需要用户确认；
- 增加新 Tool 或 Connector：重新授权；
- 提高预算：重新确认；
- 删除模板：取消未来 Trigger，但保留历史 Job；
- 专家撤销：停止新 Job，处理运行中 Job。

## 安全和成本

每个模板声明：

- 默认启用状态；
- 最大频率；
- 最大并发；
- Tool Allowlist；
- 单次和每日成本；
- 外部副作用；
- 是否发送通知；
- 无结果时是否静默；
- 失败重试和死信策略。

后台 Agent 处理外部文档、邮件和网页时，要防止 Prompt Injection 污染 Memory 或触发外部动作。

## 恢复

Worker 崩溃后：

1. 租约到期；
2. 新 Worker 加载 Job；
3. 读取最新 Checkpoint；
4. 检查已完成 Tool Call 和幂等键；
5. 只执行未完成步骤；
6. 记录恢复来源。

Automation Template 不保存 Checkpoint，Checkpoint 属于具体 Job/Run。

## 常见错误

1. 安装专家后默认开启所有定时任务。
2. 使用 setTimeout 保存长期任务。
3. 专家升级静默改变用户日程。
4. Event Trigger 不按 event.id 去重。
5. Heartbeat 能使用所有写工具。

## 练习与验收

为“三天后复习”设计 One-shot Automation，并测试：

- 用户修改时区；
- 用户撤销通知 Connector；
- Worker 在创建日历后崩溃；
- Expert 发布新版本。

验收：不重复创建日历，失效 Connector 不造成虚假完成，版本升级不静默改变现有 Trigger。
