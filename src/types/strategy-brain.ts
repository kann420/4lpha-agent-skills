export type StrategyBrainMode = "off" | "single-agent" | "multi-agent";
export type StrategyBrainProvider = "deterministic-generator" | "local-rules" | "openai-compatible";
export type StrategyBrainRole = "strategy" | "safety" | "social" | "market-analysis" | "gatekeeper";
export type StrategyBrainVerdict = "approve" | "wait" | "reject";

export interface StrategyBrainAgentReview {
  role: StrategyBrainRole;
  model: string;
  verdict: StrategyBrainVerdict;
  confidence: number;
  summary: string;
  reasons: string[];
  appliedLessonIds: string[];
}

export interface StrategyBrainReview {
  mode: StrategyBrainMode;
  provider: StrategyBrainProvider;
  status: "approved" | "blocked" | "advisory-only";
  finalVerdict: StrategyBrainVerdict;
  strategyThesis: string;
  learning: {
    policyVersion: string;
    source: string;
    appliedLessonIds: string[];
    summary: string;
  };
  agents: StrategyBrainAgentReview[];
}
