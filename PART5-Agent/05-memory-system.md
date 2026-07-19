# Agent 记忆系统

> 本章目标：理解 Agent 记忆系统的设计原理，实现三层记忆架构（短期/长期/工作记忆），掌握记忆的存储、检索和遗忘机制。学完本章后，你应能实现一个完整的 Agent 记忆系统。

---

## 1. 为什么 Agent 需要记忆？

### 1.1 没有记忆的问题

```
没有记忆的 Agent：
User: "我叫张三"
Agent: "好的，张三先生。"

User: "我叫李四"  
Agent: "好的，李四先生。"  ← 忘记张三了

User: "我叫什么名字？"
Agent: "您叫李四。"  ← 只记得最后一个

User: "上次跟你说的名字是什么？"
Agent: "您没说过。"  ← 完全不记得
```

### 1.2 有记忆的好处

```
有记忆的 Agent：
User: "我叫张三"
Agent: "您好，张三先生，很高兴认识您。"
[记忆：张三]

User: "我是产品经理"
Agent: "明白了，您是产品经理。"
[记忆：张三，产品经理]

User: "我叫什么名字？"
Agent: "您叫张三，是产品经理。"
[从记忆中检索]

User: "上次提到的项目叫什么？"
Agent: "上次您提到的是 Alpha 项目，是吗？"
[从记忆中检索]
```

### 1.3 记忆 vs 上下文

| 概念 | 范围 | 生命周期 | 用途 |
|------|------|----------|------|
| **上下文（Context）** | 当前会话 | 会话结束 | 当前任务处理 |
| **记忆（Memory）** | 跨会话 | 长期 | 持续学习 |

---

## 2. 三层记忆架构

### 2.1 架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                      三层记忆架构                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                     Working Memory                         │   │
│  │                     (工作记忆)                              │   │
│  │                                                              │   │
│  │  特点：高性能，当前任务直接使用                              │   │
│  │  容量：有限（几 KB）                                       │   │
│  │  生命周期：当前任务内                                       │   │
│  │  内容：当前任务的中间结果、临时变量                          │   │
│  └───────────────────────────────────────────────────────────┘   │
│                              ↑                                    │
│                              │ 压缩/总结                           │
│                              │                                    │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                    Short-Term Memory                       │   │
│  │                    (短期记忆)                              │   │
│  │                                                              │   │
│  │  特点：会话级，存储最近对话                                 │   │
│  │  容量：中等（几十 KB）                                     │   │
│  │  生命周期：当前会话                                        │   │
│  │  内容：对话历史、用户偏好、当前任务                         │   │
│  └───────────────────────────────────────────────────────────┘   │
│                              ↑                                    │
│                              │ 定期固化                          │
│                              │                                    │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                    Long-Term Memory                         │   │
│  │                    (长期记忆)                              │   │
│  │                                                              │   │
│  │  特点：持久化，跨会话                                      │   │
│  │  容量：大（MB ~ GB）                                      │   │
│  │  生命周期：永久（或用户删除）                              │   │
│  │  内容：用户信息、领域知识、历史交互                         │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 各层职责

```
Working Memory (工作记忆)
├── 存储：当前任务的中间变量
├── 操作：直接读写，零延迟
└── 淘汰：任务结束即清空

Short-Term Memory (短期记忆)
├── 存储：当前会话的对话历史
├── 操作：快速读写，有容量限制
├── 淘汰：会话结束，重要内容固化到长期记忆
└── 总结：定期压缩旧对话

Long-Term Memory (长期记忆)
├── 存储：持久化的结构化知识
├── 操作：向量检索，语义搜索
├── 淘汰：几乎不淘汰，除非用户删除
└── 索引：向量化，支持语义查询
```

---

## 3. 记忆数据结构

### 3.1 记忆项定义

```typescript
// memory-types.ts

interface MemoryItem {
  id: string;
  type: MemoryType;
  content: string;
  embedding?: number[];       // 向量嵌入
  importance: number;          // 重要性 0-10
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  metadata: MemoryMetadata;
  tags: string[];
}

type MemoryType =
  | "conversation"    // 对话记录
  | "user_profile"    // 用户信息
  | "preference"      // 用户偏好
  | "knowledge"       // 领域知识
  | "task"           // 任务信息
  | "fact"           // 事实性信息
  | "preference"     // 用户偏好
  | "custom";         // 自定义

interface MemoryMetadata {
  userId?: string;
  sessionId?: string;
  source?: "user" | "agent" | "system";
  taskId?: string;
  [key: string]: unknown;
}
```

### 3.2 用户画像

```typescript
// user-profile.ts

interface UserProfile {
  id: string;
  name?: string;
  attributes: UserAttributes;
  preferences: UserPreferences;
  history: InteractionSummary;
  createdAt: Date;
  updatedAt: Date;
}

interface UserAttributes {
  occupation?: string;
  role?: string;
  expertise?: string[];
  language: string;
  timezone: string;
}

interface UserPreferences {
  communicationStyle: "formal" | "casual" | "friendly";
  responseLength: "short" | "medium" | "long";
  topics: {
    interested: string[];
    avoid: string[];
  };
  tools: {
    preferred?: string[];
    disabled?: string[];
  };
}

interface InteractionSummary {
  totalConversations: number;
  totalInteractions: number;
  firstInteraction?: Date;
  lastInteraction?: Date;
  commonTopics: string[];
  avgSatisfaction?: number;
}
```

---

## 4. 完整记忆系统实现

### 4.1 主类

```typescript
// memory-system.ts

class MemorySystem {
  private workingMemory: WorkingMemory;
  private shortTermMemory: ShortTermMemory;
  private longTermMemory: LongTermMemory;
  private embeddingModel: EmbeddingModel;
  private summarizer: Summarizer;

  constructor(config: MemoryConfig) {
    this.workingMemory = new WorkingMemory(config.workingMemory);
    this.shortTermMemory = new ShortTermMemory(config.shortTermMemory);
    this.longTermMemory = new LongTermMemory(config.longTermMemory);
    this.embeddingModel = config.embeddingModel;
    this.summarizer = new Summarizer(config.summarizer);
  }

  /**
   * 添加记忆
   */
  async add(item: Omit<MemoryItem, "id" | "createdAt" | "updatedAt">): Promise<MemoryItem> {
    const memoryItem: MemoryItem = {
      ...item,
      id: this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 生成嵌入向量
    if (this.embeddingModel && !memoryItem.embedding) {
      memoryItem.embedding = await this.embeddingModel.embed(memoryItem.content);
    }

    // 根据类型选择存储位置
    switch (memoryItem.type) {
      case "user_profile":
      case "knowledge":
      case "fact":
        // 重要信息直接存长期记忆
        await this.longTermMemory.add(memoryItem);
        break;

      case "conversation":
      case "task":
        // 对话和任务先存短期记忆
        await this.shortTermMemory.add(memoryItem);
        break;

      default:
        // 其他类型根据重要性决定
        if (memoryItem.importance >= 7) {
          await this.longTermMemory.add(memoryItem);
        } else {
          await this.shortTermMemory.add(memoryItem);
        }
    }

    return memoryItem;
  }

  /**
   * 检索记忆
   */
  async retrieve(query: string, options: RetrieveOptions = {}): Promise<MemoryItem[]> {
    const {
      limit = 10,
      types,
      minImportance = 0,
      timeRange,
      searchType = "hybrid" // semantic, keyword, hybrid
    } = options;

    // 1. 查询长期记忆（向量检索）
    const queryEmbedding = await this.embeddingModel.embed(query);
    const longTermResults = await this.longTermMemory.search(
      queryEmbedding,
      { limit, types, minImportance }
    );

    // 2. 查询短期记忆（关键词 + 语义混合）
    const shortTermResults = await this.shortTermMemory.search(query, {
      limit,
      types,
      minImportance,
      timeRange
    });

    // 3. 查询工作记忆（精确匹配）
    const workingResults = this.workingMemory.search(query, { limit });

    // 4. 合并结果，按相关性和重要性排序
    const merged = this.mergeResults(longTermResults, shortTermResults, workingResults);

    return merged.slice(0, limit);
  }

  /**
   * 构建上下文
   */
  async buildContext(
    query: string,
    maxTokens: number = 4000
  ): Promise<Context> {
    // 1. 检索相关记忆
    const relevantMemories = await this.retrieve(query, { limit: 20 });

    // 2. 获取当前会话历史
    const sessionHistory = await this.shortTermMemory.getRecent(10);

    // 3. 获取工作记忆
    const workingData = this.workingMemory.getAll();

    // 4. 构建上下文（考虑 token 限制）
    return this.formatContext(relevantMemories, sessionHistory, workingData, maxTokens);
  }

  /**
   * 固化短期记忆到长期记忆
   */
  async consolidate(): Promise<void> {
    // 1. 获取所有短期记忆
    const shortTermItems = await this.shortTermMemory.getAll();

    // 2. 对话历史总结
    const conversations = shortTermItems.filter((i) => i.type === "conversation");
    if (conversations.length > 50) {
      const summary = await this.summarizer.summarize(
        conversations.map((c) => c.content)
      );

      await this.longTermMemory.add({
        type: "knowledge",
        content: summary,
        importance: 5,
        metadata: { originalCount: conversations.length },
        tags: ["conversation_summary"]
      });
    }

    // 3. 提取用户信息
    const userFacts = shortTermItems.filter(
      (i) => i.type === "fact" && i.importance >= 5
    );
    for (const fact of userFacts) {
      await this.longTermMemory.add(fact);
    }

    // 4. 清理旧短期记忆
    await this.shortTermMemory.cleanup(keepRecent: 20);
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private mergeResults(...arrays: MemoryItem[][]): MemoryItem[] {
    const seen = new Set<string>();
    const result: MemoryItem[] = [];

    for (const arr of arrays) {
      for (const item of arr) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          result.push(item);
        }
      }
    }

    // 排序：相关性 × 重要性 + 新近度
    return result.sort((a, b) => {
      const scoreA = this.calculateRelevanceScore(a);
      const scoreB = this.calculateRelevanceScore(b);
      return scoreB - scoreA;
    });
  }

  private calculateRelevanceScore(item: MemoryItem): number {
    const importanceWeight = 0.3;
    const recencyWeight = 0.2;
    const accessWeight = 0.1;

    const importanceScore = item.importance / 10;
    const recencyScore = this.calculateRecencyScore(item.createdAt);
    const accessScore = item.lastAccessedAt
      ? this.calculateRecencyScore(item.lastAccessedAt)
      : 0;

    return (
      importanceWeight * importanceScore +
      recencyWeight * recencyScore +
      accessWeight * accessScore
    );
  }

  private calculateRecencyScore(date: Date): number {
    const hoursSince = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    return Math.exp(-hoursSince / 24); // 24小时衰减到 1/e
  }
}
```

### 4.2 短期记忆实现

```typescript
// short-term-memory.ts

class ShortTermMemory {
  private items: MemoryItem[] = [];
  private maxItems: number;
  private maxAge: number; // 小时

  constructor(config: { maxItems?: number; maxAge?: number } = {}) {
    this.maxItems = config.maxItems ?? 100;
    this.maxAge = config.maxAge ?? 24 * 7; // 默认 7 天
  }

  async add(item: MemoryItem): Promise<void> {
    // 检查容量
    if (this.items.length >= this.maxItems) {
      // 删除最旧的记忆
      this.items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      this.items.shift();
    }

    this.items.push(item);
  }

  async getRecent(count: number): Promise<MemoryItem[]> {
    return this.items
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, count);
  }

  async search(query: string, options: SearchOptions = {}): Promise<MemoryItem[]> {
    const { limit = 10, types, minImportance, timeRange } = options;

    let results = this.items;

    // 类型过滤
    if (types && types.length > 0) {
      results = results.filter((i) => types.includes(i.type));
    }

    // 重要性过滤
    if (minImportance !== undefined) {
      results = results.filter((i) => i.importance >= minImportance);
    }

    // 时间范围过滤
    if (timeRange) {
      const cutoff = Date.now() - timeRange * 60 * 60 * 1000;
      results = results.filter((i) => i.createdAt.getTime() > cutoff);
    }

    // 简单关键词匹配
    const lowerQuery = query.toLowerCase();
    results = results.filter((i) =>
      i.content.toLowerCase().includes(lowerQuery)
    );

    // 按时间排序
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return results.slice(0, limit);
  }

  async getAll(): Promise<MemoryItem[]> {
    return [...this.items];
  }

  async cleanup(keepRecent: number = 10): Promise<void> {
    // 保留最近 N 条
    this.items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    this.items = this.items.slice(0, keepRecent);
  }
}
```

### 4.3 长期记忆实现

```typescript
// long-term-memory.ts

interface VectorIndex {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

class LongTermMemory {
  private items: MemoryItem[] = [];
  private vectorIndex: VectorIndex[] = [];
  private vectorDB?: VectorDatabase; // 可选的专用向量数据库

  constructor(config: {
    vectorDB?: VectorDatabase;
    maxItems?: number;
  } = {}) {
    this.vectorDB = config.vectorDB;
    this.maxItems = config.maxItems ?? 10000;
  }

  async add(item: MemoryItem): Promise<void> {
    // 检查是否已存在
    const existing = this.items.find((i) => i.id === item.id);
    if (existing) {
      existing.content = item.content;
      existing.updatedAt = new Date();
      return;
    }

    // 检查容量
    if (this.items.length >= this.maxItems) {
      await this.evict();
    }

    this.items.push(item);

    // 更新向量索引
    if (item.embedding) {
      this.vectorIndex.push({
        id: item.id,
        vector: item.embedding,
        metadata: { type: item.type, importance: item.importance }
      });
    }
  }

  async search(
    queryEmbedding: number[],
    options: SearchOptions = {}
  ): Promise<MemoryItem[]> {
    const { limit = 10, types, minImportance } = options;

    // 如果有专用向量数据库，使用它
    if (this.vectorDB) {
      const results = await this.vectorDB.search(queryEmbedding, {
        limit,
        filter: {
          type: types ? { $in: types } : undefined,
          importance: { $gte: minImportance ?? 0 }
        }
      });

      return this.items.filter((item) =>
        results.some((r) => r.id === item.id)
      );
    }

    // 否则使用内存向量搜索
    const scores = this.vectorIndex.map((v) => ({
      id: v.id,
      score: this.cosineSimilarity(queryEmbedding, v.vector)
    }));

    // 过滤
    const filtered = scores
      .filter((s) => s.score > 0.5) // 相似度阈值
      .sort((a, b) => b.score - a.score)
      .slice(0, limit * 2); // 取更多以便后续过滤

    const results = this.items.filter((item) =>
      filtered.some((f) => f.id === item.id && f.score > 0.5)
    );

    // 类型和重要性过滤
    let finalResults = results;
    if (types) {
      finalResults = finalResults.filter((i) => types.includes(i.type));
    }
    if (minImportance !== undefined) {
      finalResults = finalResults.filter((i) => i.importance >= minImportance);
    }

    return finalResults.slice(0, limit);
  }

  async getAll(): Promise<MemoryItem[]> {
    return [...this.items];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private async evict(): Promise<void> {
    // 驱逐最低重要性的记忆
    this.items.sort((a, b) => a.importance - b.importance);
    const evicted = this.items.shift();

    if (evicted) {
      // 从向量索引中移除
      this.vectorIndex = this.vectorIndex.filter((v) => v.id !== evicted.id);
    }
  }
}
```

### 4.4 工作记忆实现

```typescript
// working-memory.ts

class WorkingMemory {
  private data = new Map<string, unknown>();
  private accessHistory: string[] = [];

  set(key: string, value: unknown): void {
    this.data.set(key, value);
    this.updateAccess(key);
  }

  get(key: string): unknown | undefined {
    const value = this.data.get(key);
    this.updateAccess(key);
    return value;
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  delete(key: string): void {
    this.data.delete(key);
    this.accessHistory = this.accessHistory.filter((k) => k !== key);
  }

  clear(): void {
    this.data.clear();
    this.accessHistory = [];
  }

  getAll(): Record<string, unknown> {
    return Object.fromEntries(this.data);
  }

  keys(): string[] {
    return Array.from(this.data.keys());
  }

  search(query: string, options: { limit?: number } = {}): MemoryItem[] {
    const { limit = 5 } = options;
    const lowerQuery = query.toLowerCase();

    const results: MemoryItem[] = [];

    for (const [key, value] of this.data) {
      const content = `${key}: ${JSON.stringify(value)}`;
      if (content.toLowerCase().includes(lowerQuery)) {
        results.push({
          id: key,
          type: "custom",
          content,
          importance: 10, // 工作记忆重要性最高
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {},
          tags: ["working_memory"]
        });
      }
    }

    return results.slice(0, limit);
  }

  private updateAccess(key: string): void {
    // 移除旧位置
    this.accessHistory = this.accessHistory.filter((k) => k !== key);
    // 添加到末尾（最新访问）
    this.accessHistory.push(key);
  }

  getLRUKey(): string | undefined {
    return this.accessHistory[0];
  }
}
```

---

## 5. 记忆压缩与总结

### 5.1 总结器实现

```typescript
// summarizer.ts

class Summarizer {
  constructor(private llm: LLMInterface) {}

  /**
   * 总结多条记忆
   */
  async summarize(items: string[]): Promise<string> {
    if (items.length === 0) return "";
    if (items.length === 1) return items[0];

    const prompt = `
请总结以下对话记录的要点，提取重要的用户信息、偏好、任务进展等：

---
${items.map((item, i) => `[${i + 1}] ${item}`).join("\n\n")}
---

请用简洁的语言总结，保留所有重要信息。格式：
## 对话总结
[总结内容]

## 提取的关键信息
- [信息1]
- [信息2]
`;

    const summary = await this.llm.complete(prompt);

    return this.extractSummary(summary);
  }

  /**
   * 压缩单个长记忆
   */
  async compress(item: MemoryItem, targetLength: number = 200): Promise<string> {
    const prompt = `
请将以下记忆压缩到 ${targetLength} 字以内，保留核心信息：

---
${item.content}
---

压缩后的版本：
`;

    const compressed = await this.llm.complete(prompt);

    return compressed.trim();
  }

  /**
   * 提取关键实体
   */
  async extractEntities(text: string): Promise<{
    names: string[];
    dates: string[];
    facts: string[];
  }> {
    const prompt = `
从以下文本中提取关键实体：

---
${text}
---

返回 JSON 格式：
{
  "names": ["人名列表"],
  "dates": ["日期列表"],
  "facts": ["关键事实列表"]
}
`;

    const response = await this.llm.complete(prompt);

    try {
      return JSON.parse(this.extractJSON(response));
    } catch {
      return { names: [], dates: [], facts: [] };
    }
  }

  private extractSummary(text: string): string {
    const match = text.match(/## 对话总结\n+([\s\S]*?)(?=\n## |$/);
    return match ? match[1].trim() : text;
  }

  private extractJSON(text: string): string {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : "{}";
  }
}
```

---

## 6. 上下文窗口管理

### 6.1 Token 计算

```typescript
// token-manager.ts

class TokenManager {
  private tokenCounts = new Map<string, number>();

  /**
   * 估算 token 数量（简单估算）
   */
  estimateTokens(text: string): number {
    // 简单估算：中文约 1.5 字/token，英文约 4 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 计算消息列表的总 token 数
   */
  calculateMessagesTokens(messages: Message[]): number {
    return messages.reduce((sum, msg) => {
      return sum + this.estimateTokens(msg.content);
    }, 0);
  }

  /**
   * 截断文本到指定 token 数
   */
  truncate(text: string, maxTokens: number): string {
    const tokens = this.estimateTokens(text);
    if (tokens <= maxTokens) return text;

    // 二分查找合适的截断长度
    let left = 0;
    let right = text.length;

    while (left < right) {
      const mid = Math.floor((left + right + 1) / 2);
      if (this.estimateTokens(text.slice(0, mid)) <= maxTokens) {
        left = mid;
      } else {
        right = mid - 1;
      }
    }

    return text.slice(0, left);
  }
}
```

### 6.2 上下文构建

```typescript
// context-builder.ts

class ContextBuilder {
  constructor(
    private memorySystem: MemorySystem,
    private tokenManager: TokenManager
  ) {}

  async build(
    query: string,
    options: {
      maxTokens?: number;
      includeHistory?: boolean;
      includeProfile?: boolean;
    } = {}
  ): Promise<Context> {
    const {
      maxTokens = 4000,
      includeHistory = true,
      includeProfile = true
    } = options;

    const parts: ContextPart[] = [];
    let usedTokens = 0;

    // 1. 用户画像（优先添加）
    if (includeProfile) {
      const profile = await this.memorySystem.getUserProfile();
      if (profile) {
        const profileText = this.formatProfile(profile);
        const profileTokens = this.tokenManager.estimateTokens(profileText);

        if (usedTokens + profileTokens <= maxTokens) {
          parts.push({ type: "profile", content: profileText, tokens: profileTokens });
          usedTokens += profileTokens;
        }
      }
    }

    // 2. 相关记忆
    const memories = await this.memorySystem.retrieve(query, { limit: 10 });
    for (const memory of memories) {
      const memoryText = `[${memory.type}] ${memory.content}`;
      const memoryTokens = this.tokenManager.estimateTokens(memoryText);

      if (usedTokens + memoryTokens <= maxTokens) {
        parts.push({ type: "memory", content: memoryText, tokens: memoryTokens });
        usedTokens += memoryTokens;
      } else {
        break;
      }
    }

    // 3. 当前会话历史
    if (includeHistory) {
      const history = await this.memorySystem.getRecentHistory(20);
      const historyTokens = this.tokenManager.calculateMessagesTokens(history);

      if (usedTokens + historyTokens <= maxTokens) {
        parts.push({ type: "history", content: history.join("\n"), tokens: historyTokens });
      } else {
        // 需要截断
        const truncatedHistory = this.truncateHistory(history, maxTokens - usedTokens);
        parts.push({ type: "history", content: truncatedHistory.join("\n") });
      }
    }

    return { parts, totalTokens: usedTokens };
  }

  private formatProfile(profile: UserProfile): string {
    return `用户信息：
- 姓名：${profile.name || "未知"}
- 语言：${profile.attributes.language}
- 时区：${profile.attributes.timezone}
- 偏好：${profile.preferences.communicationStyle} 风格
- 感兴趣的话题：${profile.preferences.topics.interested.join(", ")}
`;
  }

  private truncateHistory(history: Message[], maxTokens: number): Message[] {
    // 从最近的开始保留
    const truncated: Message[] = [];
    let usedTokens = 0;

    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      const tokens = this.tokenManager.estimateTokens(msg.content);

      if (usedTokens + tokens <= maxTokens) {
        truncated.unshift(msg);
        usedTokens += tokens;
      } else {
        break;
      }
    }

    return truncated;
  }
}
```

---

## 7. 完整使用示例

### 7.1 Agent 集成

```typescript
// agent-with-memory.ts

class AgentWithMemory {
  private memory: MemorySystem;
  private llm: LLMInterface;
  private contextBuilder: ContextBuilder;

  constructor(config: AgentConfig) {
    this.memory = new MemorySystem({
      embeddingModel: config.embeddingModel,
      summarizer: new Summarizer(config.llm)
    });

    this.contextBuilder = new ContextBuilder(this.memory, new TokenManager());
    this.llm = config.llm;
  }

  /**
   * 处理用户消息
   */
  async process(input: UserInput): Promise<AgentOutput> {
    // 1. 检索相关记忆
    const relevantMemories = await this.memory.retrieve(input.text);

    // 2. 构建上下文
    const context = await this.contextBuilder.build(input.text);

    // 3. 生成回复
    const response = await this.llm.complete(
      this.buildPrompt(input, context, relevantMemories)
    );

    // 4. 存储对话
    await this.memory.add({
      type: "conversation",
      content: `User: ${input.text}\nAgent: ${response}`,
      importance: 5,
      metadata: { userId: input.userId, sessionId: input.sessionId },
      tags: ["dialogue"]
    });

    // 5. 提取并存储重要信息
    await this.extractAndStore(input.text, response);

    return { response, memories: relevantMemories };
  }

  private async extractAndStore(userInput: string, agentResponse: string): Promise<void> {
    // 提取用户提到的名字
    const nameMatch = userInput.match(/我叫(.+)/);
    if (nameMatch) {
      await this.memory.add({
        type: "user_profile",
        content: `用户名字是 ${nameMatch[1]}`,
        importance: 8,
        metadata: { fact: "name", value: nameMatch[1] },
        tags: ["user_info"]
      });
    }

    // 提取偏好
    if (userInput.includes("更喜欢") || userInput.includes("prefer")) {
      // 提取偏好信息并存储
      await this.memory.add({
        type: "preference",
        content: `用户偏好：${userInput}`,
        importance: 6,
        metadata: { source: "conversation" },
        tags: ["preference"]
      });
    }
  }
}
```

---

## 8. 本章小结

```
记忆系统核心要点

三层记忆架构
├── Working Memory: 当前任务的中间变量，极快，极短期
├── Short-Term Memory: 当前会话的对话历史，中等速度，会话级
└── Long-Term Memory: 持久化的知识，向量检索，跨会话

记忆系统操作
├── add(): 添加记忆（自动选择存储层）
├── retrieve(): 检索记忆（语义 + 关键词）
├── buildContext(): 构建上下文（考虑 token 限制）
└── consolidate(): 固化（短期 → 长期）

向量检索
├── 生成嵌入向量
├── 余弦相似度计算
└── 过滤（类型、重要性、时间）

上下文管理
├── Token 估算
├── 优先级排序
└── 截断和压缩
```

---

## PART5 总结

```
PART5-Agent 完整内容
├── 01-function-calling      Function Calling 机制（地基）
├── 02-agent-architecture    Agent 架构、组件协作
├── 03-react-pattern         ReAct 推理模式
├── 04-tool-orchestration    工具编排（串行/并行/链式/条件）
├── 05-memory-system         三层记忆系统
├── 06-multi-agent           Multi-Agent 协作
├── 07-planning-mechanism    Planning 规划机制
├── 08-reflection-mechanism  Reflection 反思机制
├── 09-agent-frameworks      Agent 框架生态
└── 10-guardrails-safety     Guardrails 与 Agent 安全
```

---

## 下一步

继续阅读：
- [PART6-Demo-Project/01-project-overview.md](../PART6-Demo-Project/01-project-overview.md) — 完整演示项目
