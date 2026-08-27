# 阶段 14：生产化 Agent

> 前置知识：阶段 0～13  
> 里程碑：设计可扩缩、可恢复、可审计和可运营的生产系统

## 生产架构

~~~
Web / Mobile / Voice Client
           ↓
API Gateway / Auth
           ↓
Thread Service ─── Memory Service
           ↓
Agent API → Queue → Agent Workers
                        ├─ Model Gateway
                        ├─ Tool Runtime
                        ├─ MCP / Connectors
                        └─ Artifact Store

Scheduler / Event Bus → Queue
Trace / Metrics / Logs ← 全部组件
~~~

在线请求和长任务分离：短交互可以同步流式返回；长任务创建 Job，客户端订阅进度。

## 服务边界

早期可以模块化单体，接口仍保持清晰：

- API 与认证；
- Thread/Memory；
- Agent Kernel；
- Tool Runtime；
- Scheduler/Worker；
- Model Gateway；
- Artifact；
- Evaluation/Observability。

不要为了“生产级”立即拆成十几个微服务。先根据独立扩缩容、故障隔离和团队边界拆分。

## 数据存储

| 数据 | 典型存储要求 |
|---|---|
| Thread、Task、Run | 事务、一致性、索引 |
| Event、Trace | 追加写、检索、保留策略 |
| Artifact、媒体 | 对象存储、校验和、权限 |
| Semantic Memory | 元数据数据库 + 检索索引 |
| Queue | 可靠交付、租约、延迟任务 |
| Secret | 专用密钥保管系统 |

向量数据库不应成为 Thread 和 Task 的事实来源。

## Model Gateway

统一处理：

- 模型选择和能力标签；
- 认证与配额；
- 超时、重试和降级；
- 请求日志脱敏；
- token 与成本；
- 模型版本；
- 区域和数据合规；
- 熔断与健康检查。

路由策略可以按任务质量、上下文长度、模态、延迟和成本选择模型。失败降级不能静默换成不满足安全要求的模型。

## 扩缩容

- API 层尽量无状态；
- Worker 按队列深度和任务类型扩容；
- 高成本或高风险 Tool 使用独立队列；
- 每用户、租户和 Connector 设置并发限制；
- 防止单个长 Thread 占满 Worker；
- 资源密集多模态任务单独隔离。

## 可用性与恢复

设计以下演练：

- 模型供应商不可用；
- MCP Server 断开；
- Connector token 过期；
- Worker 执行中崩溃；
- Scheduler 重复投递；
- 数据库短暂失败；
- Artifact 上传一半；
- Trace 服务不可用。

核心业务应在 Trace 降级时继续安全运行，但审计要求严格的高风险动作可选择停止。

## 配置和密钥

- 配置分环境、可验证、有默认值说明；
- 密钥不进 Git、Prompt、Memory、Trace；
- 支持轮换；
- 不同 Connector 和租户隔离；
- 启动时验证必要配置；
- 开发、测试、生产使用不同账号。

## 发布

1. 类型检查与单元测试；
2. 轨迹、安全和学习效果回归；
3. 数据迁移检查；
4. 小流量或影子发布；
5. 监控质量、延迟、成本和策略拒绝；
6. 自动或人工回滚；
7. 记录 Prompt、Skill、Tool 和模型版本。

## 运营

需要面向运营和支持的能力：

- 搜索 Thread、Run、Job 和 Trace；
- 查看等待审批和死信任务；
- 安全重试或取消；
- 禁用有问题的 Tool、Skill 或 Connector；
- 查看成本和配额；
- 删除用户数据；
- 导出审计记录；
- 标注失败进入评测集。

## 常见错误

1. 把进程内 Memory 当生产存储。
2. API 请求一直等待数分钟 Agent 任务。
3. 所有任务共用一个无优先级队列。
4. 直接记录完整 Prompt 和用户数据。
5. 只监控服务器 CPU，不监控任务质量。

## 练习与验收

为毕业项目完成架构图、容量假设、故障演练表和发布清单。

验收标准：

- Worker 崩溃后 Job 可恢复；
- 每个 Artifact 和动作有权限校验；
- 模型与 Tool 版本可追踪；
- 有质量、延迟、成本和安全告警；
- 用户删除流程覆盖派生数据。

## 延伸阅读

- [现有部署指南](../../PART7-Production/01-deployment-guide.md)

