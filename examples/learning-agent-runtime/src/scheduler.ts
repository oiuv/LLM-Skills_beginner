import { randomUUID } from "node:crypto";

export interface Trigger {
  id: string;
  threadId: string;
  type: "once" | "event";
  expression: string;
  taskName: string;
  enabled: boolean;
}

export interface Job {
  id: string;
  threadId: string;
  taskName: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  attempt: number;
  availableAt: string;
  idempotencyKey: string;
  leaseOwner?: string;
  leaseUntil?: string;
}

export class InMemoryScheduler {
  private readonly triggers = new Map<string, Trigger>();
  private readonly jobs = new Map<string, Job>();
  private readonly idempotencyKeys = new Set<string>();

  scheduleOnce(
    threadId: string,
    taskName: string,
    at: Date,
  ): Trigger {
    const trigger: Trigger = {
      id: randomUUID(),
      threadId,
      type: "once",
      expression: at.toISOString(),
      taskName,
      enabled: true,
    };
    this.triggers.set(trigger.id, trigger);
    return { ...trigger };
  }

  registerEvent(
    threadId: string,
    taskName: string,
    eventType: string,
  ): Trigger {
    const trigger: Trigger = {
      id: randomUUID(),
      threadId,
      type: "event",
      expression: eventType,
      taskName,
      enabled: true,
    };
    this.triggers.set(trigger.id, trigger);
    return { ...trigger };
  }

  tick(now: Date): Job[] {
    const created: Job[] = [];
    for (const trigger of this.triggers.values()) {
      if (
        !trigger.enabled ||
        trigger.type !== "once" ||
        new Date(trigger.expression).getTime() > now.getTime()
      ) {
        continue;
      }
      const key = "trigger:" + trigger.id;
      const job = this.enqueue(
        trigger.threadId,
        trigger.taskName,
        now,
        key,
      );
      trigger.enabled = false;
      if (job) created.push(job);
    }
    return created;
  }

  emitEvent(eventId: string, eventType: string, now: Date): Job[] {
    const created: Job[] = [];
    for (const trigger of this.triggers.values()) {
      if (
        trigger.enabled &&
        trigger.type === "event" &&
        trigger.expression === eventType
      ) {
        const job = this.enqueue(
          trigger.threadId,
          trigger.taskName,
          now,
          "event:" + eventId + ":" + trigger.id,
        );
        if (job) created.push(job);
      }
    }
    return created;
  }

  claim(workerId: string, now: Date, leaseMs: number): Job | undefined {
    const candidates = [...this.jobs.values()]
      .filter(
        (job) =>
          (job.status === "queued" &&
            new Date(job.availableAt).getTime() <= now.getTime()) ||
          (job.status === "running" &&
            job.leaseUntil !== undefined &&
            new Date(job.leaseUntil).getTime() <= now.getTime()),
      )
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt));

    const job = candidates[0];
    if (!job) return undefined;
    job.status = "running";
    job.attempt += 1;
    job.leaseOwner = workerId;
    job.leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
    return { ...job };
  }

  complete(jobId: string, workerId: string): Job {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("Job not found");
    if (job.status !== "running" || job.leaseOwner !== workerId) {
      throw new Error("JOB_LEASE_CONFLICT");
    }
    job.status = "completed";
    delete job.leaseOwner;
    delete job.leaseUntil;
    return { ...job };
  }

  listJobs(): Job[] {
    return [...this.jobs.values()].map((job) => ({ ...job }));
  }

  private enqueue(
    threadId: string,
    taskName: string,
    availableAt: Date,
    idempotencyKey: string,
  ): Job | undefined {
    if (this.idempotencyKeys.has(idempotencyKey)) return undefined;
    this.idempotencyKeys.add(idempotencyKey);
    const job: Job = {
      id: randomUUID(),
      threadId,
      taskName,
      status: "queued",
      attempt: 0,
      availableAt: availableAt.toISOString(),
      idempotencyKey,
    };
    this.jobs.set(job.id, job);
    return { ...job };
  }
}

