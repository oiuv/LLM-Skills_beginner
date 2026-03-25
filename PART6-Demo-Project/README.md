# Demo Project: 天气 + GitHub 助手

完整演示项目，整合 MCP Server、MCP Client、Agent 的所有知识点。

## 快速开始

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 运行 CLI
npm run start -- weather 北京
npm run start -- github search react
npm run start -- agent "帮我查一下北京的天气"
```

## 项目结构

```
demo-project/
├── src/
│   ├── cli.ts              # CLI 入口
│   ├── mcp/
│   │   └── client.ts       # MCP Client 管理器
│   └── agent/
│       └── index.ts        # Agent 实现
├── package.json
└── tsconfig.json
```

## 功能

- ✅ 天气查询（当前天气、预报、空气质量）
- ✅ GitHub 查询（搜索仓库、获取信息、查看提交）
- ✅ Agent 模式（智能理解意图，自动调用工具）
