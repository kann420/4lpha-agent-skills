import type {
  StrategyBrainAgentReview,
  StrategyBrainMode,
  StrategyBrainProvider,
  StrategyBrainReview,
  StrategyBrainRole,
  StrategyBrainVerdict,
} from "./strategy-brain.js";

export type RuleValue = string | number | boolean | Array<string | number | boolean>;

export interface Rule {
  id: string;
  description: string;
  metric: string;
  operator: ">" | ">=" | "<" | "<=" | "=" | "crosses_above" | "crosses_below" | "in" | "not_in";
  value: RuleValue;
  notes?: string;
}

export interface RiskControl {
  id: string;
  description: string;
  type:
    | "position-sizing"
    | "stop-loss"
    | "time-stop"
    | "cooldown"
    | "daily-loss-limit"
    | "exposure-cap"
    | "liquidity-filter";
  value?: string | number | boolean;
}

export interface Condition {
  description: string;
  metric?: string;
  operator?: string;
  value?: string | number | boolean;
}

export interface Assumption {
  id: string;
  description: string;
  impact?: string;
}

export interface EvidenceRecord {
  source: string;
  observedAt: string;
  summary: string;
  url?: string;
}

export type {
  StrategyBrainAgentReview,
  StrategyBrainMode,
  StrategyBrainProvider,
  StrategyBrainReview,
  StrategyBrainRole,
  StrategyBrainVerdict,
};

export interface StrategySpec {
  version: string;
  strategyId: string;
  generatedAt: string;
  domain: "bnb-fourmeme";
  status: "proposed" | "rejected";
  inputWindow: {
    asOf: string;
    barInterval: string;
    lookback: string;
  };
  universe: {
    chain: "bnb-chain";
    venue: "fourmeme";
    selectionMethod: string;
    quoteAsset: string;
    candidateCount: number;
    bucketCounts?: {
      safe2ape: number;
      mediumRisk: number;
      gemHunt: number;
    };
    sampleCandidates?: Array<{
      tokenAddress: string;
      symbol: string;
      name: string;
      venueUrl: string;
      marketCapUsd?: number;
      volume24hUsd?: number;
      volume4hUsd?: number;
      holders?: number;
      bondingProgress?: number;
      discoveryFeeds?: string[];
      selectionBucket?: "safe2ape" | "mediumRisk" | "gemHunt";
      createdAt?: string;
      graduated?: boolean;
      launchStage?: "new" | "migrated";
      categoryScore?: number;
    }>;
  };
  regime: {
    label: string;
    summary: string;
    confidence?: number;
  };
  entryRules: Rule[];
  exitRules: Rule[];
  riskControls: RiskControl[];
  invalidation: Condition[];
  assumptions: Assumption[];
  evidence: EvidenceRecord[];
  strategyThesis: string;
  brainReview: StrategyBrainReview;
  rationale: string;
  rejectionReasons?: Condition[];
}
