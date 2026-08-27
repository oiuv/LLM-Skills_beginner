# 07：第三方专家包的安全与信任

## 专家包是供应链输入

专家包可以包含指令、References、Skills、脚本声明和 Capability 需求。即使它只是 Markdown，也可能：

- 诱导模型读取敏感文件；
- 请求过宽 Tool 权限；
- 把外部内容当系统指令；
- 通过 Skill 执行脚本；
- 污染 Memory；
- 创建高频 Automation；
- 将数据发送给第三方 Connector。

因此安装专家包与安装普通文档不同，需要信任和策略检查。

## Trust Envelope

~~~yaml
schemaVersion: expert.trust/v1
expertId: learning-coach
version: 1.0.0
packageDigest: sha256:...
publisher:
  id: example.education
  displayName: Example Education
signature:
  algorithm: ed25519
  keyId: publisher-key-2026
  value: base64:...
review:
  staticScan: passed
  evaluation: passed
  humanReview: required
provenance:
  source: registry
  builtFrom: git-commit
~~~

签名证明内容来自某个密钥，不证明内容安全。仍需扫描、评测和权限审查。

## 安装流水线

1. 下载到隔离暂存区；
2. 计算 Digest；
3. 验证来源、签名和版本；
4. 解包并检查路径越界；
5. 解析 Manifest；
6. 扫描 Markdown、脚本、二进制和媒体；
7. 分析 Skill 与 Capability 依赖；
8. 生成权限和数据访问摘要；
9. 运行离线评测；
10. 根据组织 Policy 决定允许、警告、审批或阻止；
11. 原子提交 Installation；
12. 保存 Trust Envelope 和 Lock。

任何一步失败都不能留下半安装状态。

## 权限摘要

安装前向用户或管理员展示：

~~~text
该专家需要：
- 读取知识库
- 保存学习笔记
- 可选：写入日历
- 可选：发送学习提醒

它可能保存：
- 学习目标
- 解释偏好
- 基于测验证据的知识状态

它不会获得：
- 任意文件系统访问
- 邮件发送
- 未声明的 Connector
~~~

摘要由 Manifest、Skill 依赖和 Runtime Registry 联合生成，不能只相信作者文案。

## Markdown 指令安全

- Package 文件不能提升自身指令优先级；
- 不允许声明“忽略平台策略”；
- 外部 Reference 始终按不可信数据处理；
- Prompt 中的 URL 不自动抓取；
- Tool Result 不能修改 ExpertDefinition；
- Package 不能要求输出系统 Prompt、Memory 或密钥；
- 重要安全限制映射到确定性 Policy。

静态扫描可以发现明显模式，但不能代替运行时防护。

## Scripts 和二进制

如果 Skill 含 scripts：

- 安装时显示语言、入口和依赖；
- 禁止安装脚本自动执行；
- 依赖使用锁文件和来源验证；
- Runtime 在 Sandbox 中执行；
- 设置文件、网络、进程和资源限制；
- 凭证按 Tool/Connector 能力注入，不作为环境全量暴露；
- 记录脚本 Digest；
- 输出限制大小并扫描 Artifact。

纯 Markdown Skill 风险较低，但仍可能通过 Tool 指令产生副作用。

## Secrets 与 Connections

专家包只能声明：

~~~yaml
requiredConnections:
  - provider: calendar
    scopes:
      - calendar.events.write
~~~

不能包含：

- OAuth Token；
- API Key；
- Cookie；
- 密码；
- 用户邮箱或手机号；
- secret 文件路径。

安装或绑定时由 Connection Service 创建 connectionId，专家和模型只看到必要能力，不看到 Secret。

## Memory Pollution

后台 Automation 读取外部内容时尤其危险。防护：

- 外部内容不能直接写长期 Memory；
- Memory 候选必须有 sourceRef；
- 使用 Expert Memory Policy；
- 敏感或高影响信息需要确认；
- 写入前进行冲突和来源检查；
- 支持按 Expert、来源和事件删除；
- Trace 记录 policyVersion。

## Revocation

发现严重风险时：

1. Registry 标记版本 revoked；
2. 停止新安装和新 Run；
3. 禁用相关 Automation；
4. 取消或隔离排队 Job；
5. 对运行中副作用按策略处理；
6. 通知管理员和受影响用户；
7. 提供安全版本或卸载方案；
8. 保留审计记录；
9. 清理派生缓存和索引。

撤销 Package 不应自动删除用户 Artifact；删除需要单独数据生命周期策略。

## 内容保护

加密和不下发明文可以提高复制门槛，但不能保证 Prompt 和方法永不泄漏。真正保护依赖：

- 最小化下发；
- 服务端执行高价值逻辑；
- 法律和许可；
- 版本与水印；
- 访问审计；
- 不在模型上下文放不必要秘密。

不能用“加密专家包”作为放松 Runtime 安全的理由。

## 常见错误

1. 签名通过就认为安全。
2. 安装时运行 Package 自带脚本。
3. 只扫描 Manifest，不扫描间接 Skill。
4. 专家能读取 Connection Secret。
5. 撤销后旧 Automation 继续运行。

## 练习与验收

为一个请求日历写权限、包含脚本并启用每日 Automation 的专家生成权限摘要和审核决策。

验收：

- 用户能理解具体副作用；
- 脚本不在安装时运行；
- 默认不启用 Automation；
- Secret 不进入 Package 或 Prompt；
- 撤销能阻止后续 Job。
