import type {
  ModelDecision,
  ModelProvider,
  ModelRequest,
} from "./types.js";

export class ScriptedModel implements ModelProvider {
  readonly requests: ModelRequest[] = [];

  constructor(private readonly decisions: ModelDecision[]) {}

  async decide(request: ModelRequest): Promise<ModelDecision> {
    if (request.signal?.aborted) {
      throw new Error("Model request cancelled");
    }

    this.requests.push({
      ...request,
      messages: [...request.messages],
      tools: [...request.tools],
    });

    const decision = this.decisions.shift();
    if (!decision) {
      throw new Error("ScriptedModel has no remaining decision");
    }
    return decision;
  }
}

