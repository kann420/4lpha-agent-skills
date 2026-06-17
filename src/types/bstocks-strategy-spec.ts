import type {
  Assumption,
  Condition,
  EvidenceRecord,
  RiskControl,
  Rule,
} from "./strategy-spec.js";
import type { StrategyBrainReview } from "./strategy-brain.js";

export interface BstocksStrategyBase {
  version: string;
  strategyId: string;
  generatedAt: string;
  domain: "bnb-bstocks";
  status: "proposed" | "rejected";
  inputWindow: {
    asOf: string;
    barInterval: string;
    lookback: string;
  };
  universe: {
    chain: "bnb-chain";
    venue: "pancakeswap-stocks";
    issuer: "bStocks";
    selectionMethod: string;
    quoteAsset: "USD";
    candidateCount: number;
    allowedSymbols: string[];
    sampleCandidates?: Array<{
      cmcId: number;
      symbol: string;
      name: string;
      issuer: "bStocks";
      venueUrl: string;
      priceUsd: number;
      volume24hUsd: number;
      marketCapUsd: number;
      percentChange24h: number;
      percentChange7d: number;
      observedAt: string;
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
}

export interface BstocksDraftStrategySpec extends BstocksStrategyBase {
  rationale: string;
  rejectionReasons?: Condition[];
}

export interface BstocksReviewedStrategySpec extends BstocksStrategyBase {
  strategyThesis: string;
  brainReview: StrategyBrainReview;
  rationale: string;
  rejectionReasons?: Condition[];
}

export type BstocksStrategySpec = BstocksReviewedStrategySpec;
