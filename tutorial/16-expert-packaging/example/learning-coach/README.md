# Learning Coach Expert Package 示例

这是阶段 16 的完整、供应商无关示例。它展示专家定义如何声明身份、方法论、Skills、能力依赖、记忆边界、自动化模板和发布评测。

它不是一个独立 Agent Runtime，也不会自行获得工具权限。安装器需要先校验并编译本目录，再由现有 Runtime 创建 ExpertInstallation 和用户级 ExpertBinding。

## 阅读顺序

1. 从 [expert.yaml](expert.yaml) 理解包入口与依赖；
2. 对照 IDENTITY.md、SOUL.md 和 AGENTS.md 区分身份、人格与操作纪律；
3. 对照 references/、skills/ 和能力策略理解判断、流程和动作；
4. 检查 Memory 与 Automation 只声明策略和模板；
5. 使用 evals/cases.json 作为安装和发布门槛。

## 运行时边界

- Package 内没有真实学生资料、Thread、Memory、Token 或 OAuth 凭证；
- tool-policy.yaml 是能力需求与策略提示，不是授权记录；
- automations.yaml 中的模板默认关闭，不是已经运行的 Job；
- evals/cases.json 是最低评测契约，生产发布还应运行 Runtime 自身的安全和回归测试。
