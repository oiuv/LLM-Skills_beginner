import { randomUUID } from "node:crypto";

export interface Thread {
  id: string;
  userId: string;
  currentGoal?: string;
  memoryRefs: string[];
  artifactRefs: string[];
  version: number;
  updatedAt: string;
}

export class InMemoryThreadStore {
  private readonly threads = new Map<string, Thread>();

  create(userId: string, currentGoal?: string): Thread {
    const thread: Thread = {
      id: randomUUID(),
      userId,
      currentGoal,
      memoryRefs: [],
      artifactRefs: [],
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    this.threads.set(thread.id, thread);
    return cloneThread(thread);
  }

  get(id: string): Thread | undefined {
    const thread = this.threads.get(id);
    return thread ? cloneThread(thread) : undefined;
  }

  save(next: Thread, expectedVersion: number): Thread {
    const current = this.threads.get(next.id);
    if (!current) throw new Error("Thread not found");
    if (current.version !== expectedVersion) {
      throw new Error("THREAD_VERSION_CONFLICT");
    }
    const stored: Thread = {
      ...next,
      memoryRefs: [...next.memoryRefs],
      artifactRefs: [...next.artifactRefs],
      version: expectedVersion + 1,
      updatedAt: new Date().toISOString(),
    };
    this.threads.set(stored.id, stored);
    return cloneThread(stored);
  }
}

export interface MemoryRecord {
  id: string;
  userId: string;
  kind: "working" | "episodic" | "semantic" | "preference";
  content: string;
  sourceRef: string;
  confidence: number;
  createdAt: string;
  expiresAt?: string;
}

export class InMemoryMemoryStore {
  private readonly records = new Map<string, MemoryRecord>();

  put(input: Omit<MemoryRecord, "id" | "createdAt">): MemoryRecord {
    if (input.confidence < 0 || input.confidence > 1) {
      throw new Error("Memory confidence must be between 0 and 1");
    }
    const record: MemoryRecord = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.records.set(record.id, record);
    return { ...record };
  }

  search(userId: string, query: string): MemoryRecord[] {
    const normalized = query.toLowerCase();
    const now = Date.now();
    return [...this.records.values()]
      .filter((record) => record.userId === userId)
      .filter(
        (record) =>
          !record.expiresAt || new Date(record.expiresAt).getTime() > now,
      )
      .filter((record) => record.content.toLowerCase().includes(normalized))
      .map((record) => ({ ...record }));
  }

  delete(userId: string, id: string): boolean {
    const record = this.records.get(id);
    if (!record || record.userId !== userId) return false;
    return this.records.delete(id);
  }
}

export interface Artifact {
  id: string;
  threadId: string;
  runId: string;
  kind: "note" | "plan" | "quiz" | "report" | "file";
  name: string;
  content: string;
  version: number;
  createdAt: string;
}

export class InMemoryArtifactStore {
  private readonly artifacts = new Map<string, Artifact>();

  create(input: Omit<Artifact, "id" | "version" | "createdAt">): Artifact {
    const artifact: Artifact = {
      ...input,
      id: randomUUID(),
      version: 1,
      createdAt: new Date().toISOString(),
    };
    this.artifacts.set(artifact.id, artifact);
    return { ...artifact };
  }

  get(id: string): Artifact | undefined {
    const artifact = this.artifacts.get(id);
    return artifact ? { ...artifact } : undefined;
  }
}

function cloneThread(thread: Thread): Thread {
  return {
    ...thread,
    memoryRefs: [...thread.memoryRefs],
    artifactRefs: [...thread.artifactRefs],
  };
}

