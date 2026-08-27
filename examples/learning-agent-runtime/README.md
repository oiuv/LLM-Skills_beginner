# Learning Agent Runtime 示例

这个包为新版教程提供一组最小但真实的 Agent Runtime 接口。它默认不访问远程模型，因此可以免费、稳定地运行测试。

## 运行

~~~bash
npm install
npm run tutorial
npm run test:runtime
~~~

也可以进入本目录运行：

~~~bash
npm run demo
npm test
~~~

## 代码地图

| 文件 | 职责 |
|---|---|
| types.ts | 供应商无关的核心类型 |
| model.ts | ModelProvider 与 ScriptedModel |
| tools.ts | Tool Registry、Policy 和执行器 |
| agent.ts | 可停止、可追踪的 Agent Kernel |
| stores.ts | Thread、Memory 与 Artifact 存储接口 |
| skills.ts | Skill 索引与渐进加载 |
| scheduler.ts | Trigger、Job 和去重调度 |
| learning.ts | 基于证据的学习者知识状态 |
| index.ts | 无 API Key 演示 |
| runtime.test.ts | 正常、失败、调度和学习状态测试 |

ScriptedModel 不是规则路由 Agent。它是 ModelProvider 的确定性测试替身，用于验证“模型建议动作 → Runtime 校验执行 → Observation 回传 → 模型结束”的真实循环。生产接入只需实现相同 ModelProvider 接口。

