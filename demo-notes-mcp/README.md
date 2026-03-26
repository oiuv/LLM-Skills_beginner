# Demo Notes MCP Server

一个演示用的 MCP (Model Context Protocol) 服务器，用于便签管理。

## 功能特性

- **创建便签** (`notes_create`) - 创建新的便签
- **获取便签** (`notes_get`) - 通过 ID 获取便签详情
- **更新便签** (`notes_update`) - 更新便签的标题、内容或标签
- **删除便签** (`notes_delete`) - 删除指定便签
- **列出便签** (`notes_list`) - 分页列出所有便签
- **搜索便签** (`notes_search`) - 通过关键词搜索便签

## 工具设计特点

本演示服务器展示了 MCP 服务器开发的最佳实践：

### 1. 输入验证
使用 Zod schema 进行严格的输入验证：
- 类型约束（string, number, array）
- 长度限制（min/max）
- 格式验证（email, pattern）
- 必填/可选字段

### 2. 响应格式
支持两种响应格式：
- **Markdown** - 人类可读，适合直接展示
- **JSON** - 机器可读，适合程序处理

### 3. 分页支持
所有列表工具都支持分页：
- `limit` - 每页数量
- `offset` - 跳过数量
- 返回 `hasMore` 和 `nextOffset` 指示是否还有更多

### 4. 工具注解
每个工具都标注了行为特征：
- `readOnlyHint` - 是否只读操作
- `destructiveHint` - 是否有破坏性
- `idempotentHint` - 是否幂等
- `openWorldHint` - 是否与外部世界交互

### 5. 错误处理
清晰的错误消息，包含建议的解决方案

## 项目结构

```
demo-notes-mcp/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts      # 主入口
    ├── types.ts      # 类型定义
    ├── schemas.ts    # Zod 验证模式
    ├── storage.ts    # 内存存储
    └── tools.ts      # 工具实现
```

## 使用方法

### 安装依赖
```bash
npm install
```

### 开发模式（热重载）
```bash
npm run dev
```

### 构建
```bash
npm run build
```

### 运行
```bash
npm start
```

## 与 MCP Client 集成

### Claude Desktop 配置

在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "notes": {
      "command": "node",
      "args": ["/path/to/demo-notes-mcp/dist/index.js"]
    }
  }
}
```

### 使用 MCP Inspector 测试

```bash
npx @modelcontextprotocol/inspector
```

然后选择 stdio 传输，输入命令 `node /path/to/demo-notes-mcp/dist/index.js`

## API 工具详情

### notes_create
创建新便签。

**参数：**
- `title` (string, 必填) - 便签标题
- `content` (string) - 便签内容
- `tags` (string[]) - 标签数组
- `response_format` (markdown|json)

### notes_list
列出所有便签。

**参数：**
- `limit` (number, 默认 20) - 每页数量
- `offset` (number, 默认 0) - 偏移量
- `response_format` (markdown|json)

### notes_search
搜索便签。

**参数：**
- `query` (string, 必填) - 搜索关键词
- `limit` (number, 默认 20)
- `offset` (number, 默认 0)
- `response_format` (markdown|json)

### notes_get
获取单个便签。

**参数：**
- `id` (string, 必填) - 便签 ID
- `response_format` (markdown|json)

### notes_update
更新便签。

**参数：**
- `id` (string, 必填) - 便签 ID
- `title` (string, 可选) - 新标题
- `content` (string, 可选) - 新内容
- `tags` (string[], 可选) - 新标签
- `response_format` (markdown|json)

### notes_delete
删除便签。

**参数：**
- `id` (string, 必填) - 便签 ID
- `response_format` (markdown|json)
