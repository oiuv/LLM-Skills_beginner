export interface LearningEvidence {
  id: string;
  userId: string;
  conceptId: string;
  score: number;
  occurredAt: string;
}

export interface KnowledgeState {
  userId: string;
  conceptId: string;
  mastery: number;
  confidence: number;
  evidenceRefs: string[];
  updatedAt: string;
}

export class LearnerModelService {
  private readonly states = new Map<string, KnowledgeState>();

  applyEvidence(evidence: LearningEvidence): KnowledgeState {
    if (evidence.score < 0 || evidence.score > 1) {
      throw new Error("Evidence score must be between 0 and 1");
    }

    const key = evidence.userId + ":" + evidence.conceptId;
    const previous = this.states.get(key);
    const sampleCount = previous?.evidenceRefs.length ?? 0;
    const previousMastery = previous?.mastery ?? 0.5;
    const nextMastery =
      (previousMastery * sampleCount + evidence.score) / (sampleCount + 1);
    const next: KnowledgeState = {
      userId: evidence.userId,
      conceptId: evidence.conceptId,
      mastery: nextMastery,
      confidence: Math.min(1, (sampleCount + 1) / 5),
      evidenceRefs: [...(previous?.evidenceRefs ?? []), evidence.id],
      updatedAt: new Date().toISOString(),
    };
    this.states.set(key, next);
    return cloneState(next);
  }

  get(userId: string, conceptId: string): KnowledgeState | undefined {
    const state = this.states.get(userId + ":" + conceptId);
    return state ? cloneState(state) : undefined;
  }
}

function cloneState(state: KnowledgeState): KnowledgeState {
  return { ...state, evidenceRefs: [...state.evidenceRefs] };
}

