import type { FourMemeOnchainSkillId } from "./fourmeme-onchain-enrichment.js";
import type { SkillExecutionMode, SkillExecutionStatus } from "./skill-execution.js";

export type CmcSkillProofMode = Extract<SkillExecutionMode, "live-execution" | "recorded" | "recorded-remote">;
export type CmcRemoteSkillProofMode = Extract<CmcSkillProofMode, "live-execution" | "recorded-remote">;

export interface CmcSkillRedactionReport {
  checkedAt: string;
  containsSecretLikeValue: boolean;
  rulesApplied: string[];
}

export interface CmcSkillRouteProof {
  mode: CmcRemoteSkillProofMode;
  observedAt: string;
  query: string;
  redactedRequestExcerpt: string;
  redactedResponseExcerpt: string;
  redaction: CmcSkillRedactionReport;
  routeType: "find_skill";
  selectedSkillIds: FourMemeOnchainSkillId[];
  sha256: string;
  sourceHost: string;
  sourceUrl?: string;
  status: SkillExecutionStatus;
}

export interface CmcSkillExecutionProof {
  mappedRemoteSkill?: boolean;
  mappingNote?: string;
  mode: CmcRemoteSkillProofMode;
  normalizedOutput: {
    aggregateRisk?: "critical" | "high" | "low" | "medium" | "unknown";
    eligibleForEntry?: boolean;
    metrics: Record<string, number | string | boolean>;
    positionSizeMultiplier?: number;
    status: "failed" | "passed" | "unavailable" | "warning";
    summary: string;
  };
  observedAt: string;
  redactedRequestExcerpt: string;
  redactedResponseExcerpt: string;
  redaction: CmcSkillRedactionReport;
  remoteSkillId?: string;
  requestSha256: string;
  responseSha256: string;
  sha256: string;
  skillId: FourMemeOnchainSkillId;
  sourceHost: string;
  sourceUrl?: string;
  status: SkillExecutionStatus;
  tokenAddress: string;
}

export interface CmcSkillProofBundle {
  executionProofs: CmcSkillExecutionProof[];
  generatedAt: string;
  routeProof: CmcSkillRouteProof;
  source: "cmc-skills-marketplace";
  summary: string;
  version: "1.0.0";
}
