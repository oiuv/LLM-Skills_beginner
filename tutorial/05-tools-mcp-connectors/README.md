# 阶段 5：Tools、MCP 与 Connectors

> 前置知识：阶段 2～4  
> 里程碑：Agent 能通过统一注册表使用本地 Tool、MCP Tool 和外部 Connector

## 三者的职责

| 组件 | 重点 | 示例 |
|---|---|---|
| Tool | 原子动作的 Schema 与执行 | 查询知识点、保存笔记 |
| MCP | 能力发现和调用的标准协议 | 从 MCP Server 列出并调用工具 |
| Connector | 具体产品、账号和权限集成 | 日历账号、云盘、学校 LMS |

Connector 可以暴露为 MCP Server，也可以直接注册为本地 Tool。MCP 不是所有 Tool 的强制包装。

## 先做本地 Tool

学习顺序应是：

1. 实现 Tool 接口；
2. 注册到 Tool Registry；
3. 跑通 Agent Tool Loop；
4. 再把远程能力接成 MCP。

否则初学者会把连接协议问题误认为 Agent 决策问题。

## MCP 组件

~~~
Agent Host
  └─ MCP Client
       ├─ 连接与能力协商
       ├─ tools/list 与 tools/call
       ├─ resources/list 与 resources/read
       └─ prompts/list 与 prompts/get
             ↓
          MCP Server
             ↓
        外部系统或本地能力
~~~

MCP Client 返回的 ToolDescriptor 应导入统一 Tool Registry。Agent Kernel 不应为 MCP 写一条独立决策循环。

~~~ts
interface CapabilitySource {
  id: string;
  listTools(): Promise<ToolDescriptor[]>;
  callTool(name: string, args: unknown, context: ToolContext): Promise<ToolResult>;
  close(): Promise<void>;
}
~~~

本地、MCP 和 Connector 适配器都可以实现 CapabilitySource。

## MCP 生命周期

1. 根据配置创建 Client；
2. 建立传输连接；
3. 协商协议和能力；
4. 获取 Tools、Resources、Prompts；
5. 过滤当前用户可见能力；
6. 注册或更新 Tool Registry；
7. 调用时传递取消与超时；
8. 处理断线和能力变化；
9. 关闭连接和清理资源。

协议连接状态不等于用户 Thread。MCP 重连后，Agent Thread 仍从自己的持久化存储恢复。

## Resources 与 Prompts

- Tool：主动执行动作或查询。
- Resource：按 URI 读取上下文数据。
- Prompt：Server 提供的可复用提示模板。

不要把只读文档查询设计成有副作用的 Tool，也不要把 Agent 的全部系统策略交给远端 Prompt。

## Connector 额外解决的问题

MCP 解决协议，不自动解决产品级账号连接：

- 用户授权和 OAuth 回调；
- token 加密存储与刷新；
- scope 与最小权限；
- 多账号选择；
- 连接健康状态；
- 权限撤销；
- 外部对象 ID 映射；
- Webhook 注册和签名验证；
- 每租户配额与审计。

~~~ts
interface Connection {
  id: string;
  userId: string;
  provider: string;
  scopes: string[];
  status: "active" | "expired" | "revoked" | "error";
  secretRef: string;
}
~~~

secretRef 指向密钥保管系统，不能把访问令牌放入 Prompt、Memory 或 Trace。

## 能力发现与暴露

不能把数百个工具全部发送给模型。先根据以下条件筛选：

- 当前 Skill；
- 用户权限；
- 任务类型；
- 设备和环境；
- 风险等级；
- 工具健康状态；
- 成本预算。

当工具很多时，可以先检索候选工具，再把少量完整 Schema 加入上下文。

## 版本与兼容

- Tool name 尽量稳定；
- Schema 破坏性变化使用新版本；
- MCP 协议版本变化隔离在适配器；
- Connector API 变化不应修改 Agent Kernel；
- Trace 保存当时的工具版本。

## 常见错误

1. 所有函数都包装成独立 MCP Server。
2. MCP Tool 绕过统一 Policy Engine。
3. 把 OAuth token 交给模型。
4. 连接断开后丢失整个 Agent Thread。
5. 把所有远端工具无差别暴露给模型。

## 练习与验收

将本地 get_topic Tool 和一个 MCP Tool 同时导入 Tool Registry，确保 Kernel 看不到能力来源差异。

验收标准：

- 本地和 MCP Tool 使用同一执行结果结构；
- MCP 断线只影响相关能力；
- Connector token 不进入模型上下文；
- 用户撤销连接后工具立即不可见；
- 工具版本可以从 Trace 中定位。

## 延伸阅读

- [MCP 协议概览](../../PART1-MCP-Protocol/01-protocol-overview.md)
- [MCP Server 架构](../../PART2-MCP-Server/01-server-architecture.md)
- [MCP Client 架构](../../PART3-MCP-Client/01-client-architecture.md)
