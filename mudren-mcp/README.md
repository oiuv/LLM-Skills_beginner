# Forum MCP Server

MCP 服务器，用于访问 [mud.ren](https://mud.ren) 论坛 API。

## 功能

- **浏览帖子** (`forum_list_threads`) - 分页浏览论坛帖子，支持多种筛选条件
- **查看详情** (`forum_get_thread`) - 获取单个帖子的完整内容

## API 映射

| 工具 | MCP | 论坛 API |
|------|-----|----------|
| 列表帖子 | `forum_list_threads` | `GET /threads?include=node&tab={tab}&page={page}&per_page={limit}` |
| 帖子详情 | `forum_get_thread` | `GET /threads/{id}?include={include}` |

## 工具详情

### forum_list_threads

浏览论坛帖子列表。

**参数：**
- `tab` (string) - 分类筛选：
  - `default` - 默认列表
  - `featured` - 精选/置顶
  - `zeroComment` - 零回复
  - `recent` - 最新
- `page` (number) - 页码，默认 1
- `limit` (number) - 每页数量，默认 20，最大 50
- `response_format` - 输出格式：`markdown` 或 `json`

### forum_get_thread

获取帖子详情。

**参数：**
- `id` (number) - 帖子 ID
- `include` (string) - 关联数据：`user`、`likers` 或 `user,likers`
- `response_format` - 输出格式：`markdown` 或 `json`

## 使用方法

```bash
npm install
npm run build
npm start
```

## Claude Desktop 配置

```json
{
  "mcpServers": {
    "forum": {
      "command": "node",
      "args": ["/path/to/forum-mcp/dist/index.js"]
    }
  }
}
```

## 项目结构

```
forum-mcp/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts    # 入口
    ├── types.ts    # 类型定义
    ├── schemas.ts  # Zod 验证模式
    ├── client.ts   # API 客户端
    └── tools.ts    # 工具实现
```
