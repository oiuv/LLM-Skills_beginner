# 旧教程迁移映射

现有 PART1～PART7 不立即删除。它们作为专题资料继续保留，但不再承担零基础主线导航。

| 旧目录 | 新位置 | 处理方式 |
|---|---|---|
| PART1-MCP-Protocol | 05-tools-mcp-connectors | 保留为 MCP 深入阅读，版本内容持续校对 |
| PART2-MCP-Server | 05-tools-mcp-connectors | 复用 Server、Tool、Resource 示例 |
| PART3-MCP-Client | 05-tools-mcp-connectors | 复用 Client、连接和错误处理示例 |
| PART4-Skills-System | 06-skills | 复用规范、发现、评估，补真实 Skill Runner |
| PART5-Agent/01 | 02-tool-calling | 复用 Function Calling 原理 |
| PART5-Agent/02-04 | 03-agent-kernel | 拆分上下文、循环和工具编排 |
| PART5-Agent/05 | 07-memory-thread | 补 Thread、持久化、一致性和遗忘机制 |
| PART5-Agent/06 | 11-multi-agent | 后移到完整单 Agent 之后 |
| PART5-Agent/07-08 | 04-planning-workflow | 复用规划、重规划和反思 |
| PART5-Agent/09 | 各章节延伸阅读 | 框架对比不再作为核心能力章节 |
| PART5-Agent/10-12 | 13-safety-evaluation | 复用护栏、Prompt 和评测 |
| PART6-Demo-Project | 15-capstone | 旧 Demo 保留，新建真实 Agent Runtime |
| PART7-Production | 14-production | 保留部署内容，补 Durable Runtime 和运营治理 |

## 必须新增的内容

- 供应商无关的 ModelProvider；
- Thread、Run、Turn、Goal、Plan、Task、Checkpoint、Artifact；
- 多模态解析和统一 Observation；
- Connector、账号绑定、令牌刷新和权限撤销；
- Skill Runner，而不只是 Skill 文档解析；
- Durable Task、Scheduler、Event Bus、Queue 和 Worker；
- 跨设备 Thread 同步和冲突处理；
- Artifact Store、取消、幂等和恢复；
- 学习者模型、教学策略、评测和间隔复习；
- 真实端到端 Agent Loop 与离线可重复测试。

## 使用原则

1. 新章节先给稳定概念和最小接口；
2. 旧章节作为深入材料链接，不复制整篇；
3. 框架或协议版本变化不能改变课程核心对象；
4. 所有“完整项目”都必须有可运行代码和自动化测试；
5. 只有规则匹配和固定分支的程序称为工作流或工具助手，不称为自主 Agent。

旧 PART 工程没有加入根 npm workspace。部分旧 MCP 示例使用了已经失效的包名或版本，继续作为阅读材料保留；迁移到当前 SDK 后再作为可运行示例接回主线。
