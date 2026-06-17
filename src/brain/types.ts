import type { CmcMarketContext } from "../adapters/cmc/client.js";
import type { FourMemeDiscoverySnapshot } from "../adapters/fourmeme/client.js";
import type { FourMemeTokenInfoSnapshot } from "../types/token-info.js";
import type {
  StrategyBrainAgentReview,
  StrategyBrainMode,
  StrategyBrainProvider,
  StrategyBrainRole,
} from "../types/strategy-brain.js";
import type { StrategySpec } from "../types/strategy-spec.js";

export type BrainMode = StrategyBrainMode;
export type BrainProvider = Exclude<StrategyBrainProvider, "deterministic-generator">;
export type BrainRole = StrategyBrainRole;

export interface GlobalLearningLesson {
  id: string;
  scope: "global" | "fourmeme" | "bstocks";
  direction: "avoid" | "block" | "favor" | "neutral";
  roleHints: BrainRole[];
  summary: string;
  triggers: string[];
  effect: string;
}

export interface GlobalLearningPolicy {
  version: string;
  source: string;
  generatedAt: string;
  summary: string;
  lessons: GlobalLearningLesson[];
}

export interface SmartWalletSetupMode {
  id: string;
  summary: string;
  marketCapUsdPreferredMin: number;
  marketCapUsdPreferredMax: number;
  marketCapUsdValidMax: number;
  requiredEvidence: string[];
}

export interface SmartWalletConfirmationLevel {
  level: "weak" | "medium" | "strong" | "very-strong";
  summary: string;
  minimumQualityWallets: number;
  windowMinutes: number;
  strategyUse: string;
}

export interface SmartWalletChecklistItem {
  id: string;
  summary: string;
  metric: string;
  operator: string;
  value: string | number | string[];
  dataStatus: "available" | "available-proxy" | "future-evidence";
}

export interface SmartWalletAvoidRule {
  id: string;
  summary: string;
}

export interface SmartWalletDoctrine {
  version: string;
  source: string;
  generatedAt: string;
  summary: string;
  researchBasis: string;
  setupModes: SmartWalletSetupMode[];
  confirmationLevels: SmartWalletConfirmationLevel[];
  entryChecklist: SmartWalletChecklistItem[];
  avoidRules: SmartWalletAvoidRule[];
  integrationNotes: string[];
}

export interface BrainRuntimeOptions {
  mode: BrainMode;
  provider: BrainProvider;
}

export interface BrainReviewInput {
  fourMemeTokenInfo?: FourMemeTokenInfoSnapshot;
  marketContext: CmcMarketContext;
  fourMemeSnapshot: FourMemeDiscoverySnapshot;
  learningPolicy: GlobalLearningPolicy;
  smartWalletDoctrine: SmartWalletDoctrine;
  options: BrainRuntimeOptions;
  strategySpec: StrategySpec;
}

export interface AgentReviewInput extends BrainReviewInput {
  previousReviews?: StrategyBrainAgentReview[];
  role: BrainRole;
}
