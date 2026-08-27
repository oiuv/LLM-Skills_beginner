# 阶段 9：调度、事件与持久任务

> 前置知识：阶段 3、4、7、8  
> 里程碑：Agent 可以被时间和事件唤醒，任务可重试、暂停和恢复

## Scheduler 不属于 Tool Calling

Tool Calling 发生在一次 Agent Run 内。Scheduler 决定何时创建或恢复 Run。

~~~
时间 / Webhook / 业务事件
          ↓
 Trigger Registry
          ↓
 Scheduler 创建 Job
          ↓
 Queue → Worker
          ↓
 加载 Thread / Task / Checkpoint
          ↓
 Agent Kernel
          ↓
 Tool / Skill / MCP
~~~

即使模型服务暂时不可用，Scheduler 仍应记录到期 Job 并按策略重试。

## 核心对象

~~~ts
interface Trigger {
  id: string;
  type: "once" | "cron" | "event" | "webhook";
  expression: string;
  threadId: string;
  taskTemplate: unknown;
  enabled: boolean;
}

interface Job {
  id: string;
  triggerId?: string;
  threadId: string;
  status: "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
  attempt: number;
  availableAt: string;
  idempotencyKey: string;
  checkpointId?: string;
}
~~~

Trigger 描述“什么时候”；Job 描述“这一次要执行”；Task 描述“做什么”；Run 描述“Agent 实际怎样执行”。

## 时间触发

需要处理：

- 用户时区和夏令时；
- 错过触发时间后的补跑策略；
- 重复触发；
- 用户修改计划；
- 设备离线；
- 全局停机窗口。

“每天 20:00”必须绑定用户时区，不能只保存服务器本地时间。

## 事件触发

事件使用稳定 Envelope：

~~~ts
interface DomainEvent<T> {
  id: string;
  type: string;
  source: string;
  subject: string;
  occurredAt: string;
  schemaVersion: number;
  data: T;
}
~~~

消费者根据 event.id 去重。Webhook 还需验证签名、防重放、限制大小，并在快速持久化后异步处理。

## Queue 与 Worker

Queue 提供：

- 可靠入队；
- 延迟执行；
- 可见性超时或租约；
- 重试和死信队列；
- 优先级；
- 并发限制；
- Worker 心跳。

Worker 获取 Job 后先申请租约。进程崩溃后租约过期，其他 Worker 才能恢复。

## Checkpoint

Checkpoint 保存：

- 当前 Plan 与 Step；
- 工作记忆；
- 已完成的副作用和幂等键；
- 等待的用户输入或审批；
- 剩余预算；
- 相关 Artifact；
- 状态版本。

恢复时不能盲目重放所有动作，要先确认哪些 Tool Call 已成功提交。

## Retry、Dead Letter 与补偿

重试策略基于错误码。达到最大次数后进入 dead-letter，等待人工检查或补偿。

例如创建复习日历成功、发送通知失败：重试通知即可，不能再次创建日历。Plan Step 需要分别保存每个副作用结果。

## 长任务进度

长任务定期写：

- 当前 Step；
- 完成百分比或完成项；
- 最近心跳；
- 可取消标志；
- 预计下一次更新；
- 用户可见摘要。

不要伪造无法估计的精确百分比，可以使用阶段状态。

## 多端与通知

Job 完成后产生领域事件，通知服务根据用户偏好选择站内、邮件或设备推送。通知本身也是受权限和幂等控制的外部副作用。

## 常见错误

1. 使用进程内 setTimeout 承担长期任务。
2. Cron 直接调用模型且不创建 Job。
3. 重试整个流程导致重复副作用。
4. Checkpoint 只有消息历史。
5. Webhook 在返回响应前完成全部 Agent 任务。

## 练习与验收

实现“测验完成事件 → 更新学习状态 → 安排三天后复习”的流程，并模拟 Worker 在安排后崩溃。

验收标准：

- 同一事件只创建一次 Job；
- Worker 崩溃后可以恢复；
- 已成功副作用不会重复；
- 用户可取消未来 Trigger 和运行中 Job；
- 时区转换有测试。

