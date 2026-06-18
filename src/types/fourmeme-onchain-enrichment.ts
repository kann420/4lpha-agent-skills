import type { DataQuality } from "./artifact-metadata.js";
import type { CmcRemoteSkillProofMode } from "./cmc-skill-proof.js";
import type { SkillExecution } from "./skill-execution.js";

export type FourMemeOnchainSkillId =
  | "review_dex_wallet_activity_profile"
  | "review_dex_wallet_pnl"
  | "score_holder_concentration_risk";

export type FourMemeOnchainRiskLevel = "low" | "medium" | "high" | "critical" | "unknown";
export type FourMemeOnchainReviewStatus = "passed" | "warning" | "failed" | "unavailable";

export interface FourMemeOnchainSkillReview {
  metrics: Record<string, number | string | boolean>;
  observedAt: string;
  role: "hard-risk-gate" | "entry-quality-gate" | "advisory-confidence";
  skillId: FourMemeOnchainSkillId;
  status: FourMemeOnchainReviewStatus;
  summary: string;
}

export interface FourMemeOnchainCandidateReview {
  addressProvenance?: "deterministic-fixture-address" | "live-fourmeme-contract" | "recorded-fourmeme-contract";
  aggregateRisk: FourMemeOnchainRiskLevel;
  eligibleForEntry: boolean;
  positionSizeMultiplier: number;
  reviews: FourMemeOnchainSkillReview[];
  symbol: string;
  tokenAddress: string;
}

export interface FourMemeOnchainProofRef {
  bundlePath: string;
  mode: CmcRemoteSkillProofMode;
  proofSha256: string;
  skillId: FourMemeOnchainSkillId;
  tokenAddress: string;
}

export interface FourMemeOnchainEnrichmentSnapshot {
  asOf: string;
  candidates: FourMemeOnchainCandidateReview[];
  dataQuality: DataQuality;
  proofRefs?: FourMemeOnchainProofRef[];
  skillExecution: SkillExecution;
  skills: FourMemeOnchainSkillId[];
  source:
    | "cmc-skills-marketplace-fixture"
    | "cmc-skills-marketplace-live"
    | "cmc-skills-marketplace-recorded-remote"
    | "unavailable";
  summary: string;
}
