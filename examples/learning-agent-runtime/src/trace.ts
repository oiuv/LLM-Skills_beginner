import { randomUUID } from "node:crypto";
import type { TraceEvent } from "./types.js";

export class InMemoryTraceStore {
  private readonly events: TraceEvent[] = [];

  append(
    event: Omit<TraceEvent, "id" | "at"> &
      Partial<Pick<TraceEvent, "id" | "at">>,
  ): TraceEvent {
    const stored: TraceEvent = {
      ...event,
      id: event.id ?? randomUUID(),
      at: event.at ?? new Date().toISOString(),
    };
    this.events.push(stored);
    return stored;
  }

  list(traceId?: string): TraceEvent[] {
    return this.events
      .filter((event) => !traceId || event.traceId === traceId)
      .map((event) => ({ ...event, attributes: { ...event.attributes } }));
  }
}

