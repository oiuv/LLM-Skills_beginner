# 阶段 7：Memory、Thread 与上下文

> 前置知识：阶段 3、4、6  
> 里程碑：任务可以跨会话和设备续接，并只读取相关记忆

## 先区分四种东西

| 类型 | 作用 | 生命周期 |
|---|---|---|
| Conversation History | 最近对话原文 | 当前 Thread |
| Working Memory | 当前任务中间状态 | 当前 Run 或 Task |
| Long-term Memory | 稳定事实、偏好和经历 | 跨 Thread |
| Knowledge Base | 外部课程、教材和文档 | 独立内容生命周期 |

RAG 从知识库检索内容；Memory 保存与用户和历史任务相关的状态。二者可以使用相似检索技术，但语义不同。

## Thread 是续接单位

~~~ts
interface AgentThread {
  id: string;
  userId: string;
  title: string;
  currentGoal?: string;
  activePlanId?: string;
  latestCheckpointId?: string;
  memoryRefs: string[];
  artifactRefs: string[];
  version: number;
  updatedAt: string;
}
~~~

Thread 不是网络连接。关闭浏览器、切换手机或 MCP 重连后，仍应通过 threadId 恢复。

## Memory 数据模型

~~~ts
interface MemoryRecord {
  id: string;
  userId: string;
  kind: "working" | "episodic" | "semantic" | "preference";
  content: unknown;
  source: { threadId: string; runId: string; eventId: string };
  confidence: number;
  createdAt: string;
  expiresAt?: string;
  sensitivity: "normal" | "sensitive";
}
~~~

每条长期记忆需要来源、置信度和生命周期。没有来源的“用户事实”难以修正，没有过期时间的临时偏好会永久污染行为。

## 写入策略

不要把每句话都写入长期记忆。候选信息经过：

1. 是否与未来任务有关；
2. 是否已存在或冲突；
3. 是否需要用户确认；
4. 是否敏感；
5. 置信度是否足够；
6. 保存多久；
7. 用户是否允许记忆。

学习 Agent 适合记住学习目标、稳定偏好、已验证的掌握度和常见误区；不应把模型猜测直接写成事实。

## 读取策略

上下文构建器根据当前目标检索少量相关记忆，并保留来源：

~~~
当前 Observation + Goal
        ↓
查询过滤：userId / kind / 时间 / 权限
        ↓
语义与关键词召回
        ↓
重排、去重和冲突检测
        ↓
加入 Context
~~~

近期不等于相关，向量相似也不等于真实。

## 摘要和压缩

Thread 变长后：

- 原始消息不可随意删除；
- 生成可版本化摘要；
- 摘要保留目标、决定、未解决事项和来源引用；
- 最近 Turn 保留原文；
- Tool Result 大对象存 Artifact，只在消息中保存引用。

摘要是派生数据，可以重建；原始审计事件是事实来源。

## 跨端同步

客户端提交更新时携带 thread version：

1. 版本相同，提交并 version + 1；
2. 版本冲突，读取最新状态；
3. 消息和事件通常追加合并；
4. 当前计划、审批和用户编辑需要冲突解决；
5. UI 告知用户发生了另一设备更新。

不能使用“最后写入覆盖一切”处理正在执行的 Task。

## 遗忘和隐私

必须支持：

- 查看系统记住了什么；
- 删除单条记忆；
- 关闭某类记忆；
- 设置保留时间；
- 删除用户后级联清理；
- 从索引、缓存、备份和派生摘要中清除；
- 敏感记忆加密和访问审计。

## 常见错误

1. messages 数组承担所有状态。
2. 自动把模型总结写成永久用户事实。
3. 检索结果没有来源和权限过滤。
4. Thread 与登录 Session 或 MCP Session 混为一谈。
5. 删除数据库记录却不删除向量索引。

## 练习与验收

实现内存版 ThreadStore 和 MemoryStore，模拟关闭进程前保存、换设备加载、版本冲突和删除记忆。

验收标准：

- 通过 threadId 恢复目标、计划和 Artifact 引用；
- 长期记忆有来源、置信度和保留策略；
- Context 只读取相关且允许的记忆；
- 冲突不会静默覆盖；
- 用户能删除并验证记忆不再被检索。

## 延伸阅读

- [现有记忆系统](../../PART5-Agent/05-memory-system.md)
- [上下文构建](../../PART5-Agent/02-agent-architecture.md)

