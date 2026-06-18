import { combineDataQuality } from "../output/data-quality.js";
import type { FourMemeOnchainEnrichmentSnapshot } from "../types/fourmeme-onchain-enrichment.js";
import type { Condition, EvidenceRecord, RiskControl, Rule, StrategySpec } from "../types/strategy-spec.js";

export function applyFourMemeOnchainEnrichment(
  strategySpec: StrategySpec,
  onchainEnrichment: FourMemeOnchainEnrichmentSnapshot,
): StrategySpec {
  const failedCandidates = onchainEnrichment.candidates.filter((candidate) => !candidate.eligibleForEntry);
  const hasEligibleCandidate = onchainEnrichment.candidates.some((candidate) => candidate.eligibleForEntry);
  const rejectionReasons = hasEligibleCandidate
    ? []
    : buildOnchainRejectionReasons(failedCandidates);

  return {
    ...strategySpec,
    status: hasEligibleCandidate || onchainEnrichment.candidates.length === 0
      ? strategySpec.status
      : "rejected",
    dataQuality: strategySpec.dataQuality
      ? combineDataQuality({
          partialSummary: "Strategy spec generated with partial source-data quality or on-chain enrichment gaps; inspect providerErrors and input artifactRefs before backtesting.",
          sources: [strategySpec.dataQuality, onchainEnrichment.dataQuality],
          successSummary: "Strategy spec generated from complete CMC market context, Four.Meme discovery, and curated CMC on-chain skill enrichment inputs.",
        })
      : onchainEnrichment.dataQuality,
    entryRules: [
      ...strategySpec.entryRules,
      ...buildOnchainEntryRules(onchainEnrichment),
    ],
    riskControls: [
      ...strategySpec.riskControls,
      ...buildOnchainRiskControls(onchainEnrichment),
    ],
    invalidation: [
      ...strategySpec.invalidation,
      ...buildOnchainInvalidationRules(onchainEnrichment),
    ],
    assumptions: [
      ...strategySpec.assumptions.filter((assumption) => assumption.id !== "fourmeme-native-slice"),
      {
        id: "cmc-skill-marketplace-onchain-enrichment",
        description: "Curated CMC Skills Marketplace on-chain enrichments are applied only after Four.Meme has produced a contract-level shortlist.",
        impact: "Backtests should treat holder concentration and DEX wallet activity as timestamped candidate filters, while wallet PnL remains advisory and never proves profitability.",
      },
    ],
    evidence: [
      ...strategySpec.evidence,
      ...buildOnchainEvidence(onchainEnrichment),
    ],
    onchainEnrichment,
    rationale: `${strategySpec.rationale} CMC Skills Marketplace on-chain enrichment reviewed shortlisted contracts with holder concentration, DEX wallet activity, and wallet PnL signals; PnL is treated as advisory only.`,
    rejectionReasons: [
      ...(strategySpec.rejectionReasons ?? []),
      ...rejectionReasons,
    ].length > 0
      ? [
          ...(strategySpec.rejectionReasons ?? []),
          ...rejectionReasons,
        ]
      : undefined,
  };
}

function buildOnchainEntryRules(
  onchainEnrichment: FourMemeOnchainEnrichmentSnapshot,
): Rule[] {
  if (onchainEnrichment.candidates.length === 0) {
    return [];
  }

  return [
    {
      id: "cmc-skill-holder-concentration-gate",
      description: "Reject Four.Meme candidates whose CMC on-chain holder-concentration skill reports high or critical concentration risk.",
      metric: "cmc.skills.score_holder_concentration_risk.aggregate_risk",
      operator: "not_in",
      value: ["high", "critical"],
    },
    {
      id: "cmc-skill-dex-wallet-activity-gate",
      description: "Require shortlisted contracts to show organic or improving DEX wallet activity before entry.",
      metric: "cmc.skills.review_dex_wallet_activity_profile.status",
      operator: "in",
      value: ["passed", "warning"],
      notes: "A warning keeps the candidate eligible only with reduced position sizing if the holder-concentration gate still passes.",
    },
  ];
}

function buildOnchainRiskControls(
  onchainEnrichment: FourMemeOnchainEnrichmentSnapshot,
): RiskControl[] {
  if (onchainEnrichment.candidates.length === 0) {
    return [];
  }

  const eligibleCandidates = onchainEnrichment.candidates.filter(
    (candidate) => candidate.eligibleForEntry,
  );
  const weakestMultiplier = Math.min(
    ...eligibleCandidates.map((candidate) => candidate.positionSizeMultiplier),
  );

  return [
    {
      id: "cmc-skill-onchain-position-adjuster",
      description: "Scale Four.Meme position size down using the weakest on-chain multiplier among candidates that remain eligible after hard gates.",
      type: "position-sizing",
      value: eligibleCandidates.length > 0 ? Number(weakestMultiplier.toFixed(2)) : 0,
    },
    {
      id: "cmc-skill-wallet-pnl-advisory-only",
      description: "Treat DEX wallet PnL review as confidence context only; never use wallet PnL alone as a buy trigger.",
      type: "position-sizing",
      value: "advisory-only",
    },
  ];
}

function buildOnchainInvalidationRules(
  onchainEnrichment: FourMemeOnchainEnrichmentSnapshot,
): Condition[] {
  if (onchainEnrichment.candidates.length === 0) {
    return [];
  }

  return [
    {
      description: "Invalidate a shortlisted Four.Meme candidate if later CMC on-chain skill replay marks holder concentration as high or critical.",
      metric: "cmc.skills.score_holder_concentration_risk.aggregate_risk",
      operator: "in",
      value: "high,critical",
    },
  ];
}

function buildOnchainEvidence(
  onchainEnrichment: FourMemeOnchainEnrichmentSnapshot,
): EvidenceRecord[] {
  const candidateSummary = onchainEnrichment.candidates.map((candidate) => {
    const statuses = candidate.reviews
      .map((review) => `${review.skillId}:${review.status}`)
      .join("/");

    return `${candidate.symbol} ${candidate.tokenAddress} risk=${candidate.aggregateRisk} eligible=${candidate.eligibleForEntry} size=${candidate.positionSizeMultiplier} reviews=${statuses}`;
  });

  return [
    {
      source: "CMC Skills Marketplace on-chain enrichment",
      observedAt: onchainEnrichment.asOf,
      summary: `${onchainEnrichment.summary} Candidates: ${candidateSummary.join("; ") || "none"}.`,
      url: "https://coinmarketcap.com/api/skills-marketplace/",
    },
  ];
}

function buildOnchainRejectionReasons(
  failedCandidates: Array<{
    aggregateRisk: string;
    symbol: string;
    tokenAddress: string;
  }>,
): Condition[] {
  return failedCandidates.map((candidate) => ({
    description: `CMC on-chain skill enrichment marked ${candidate.symbol} (${candidate.tokenAddress}) ineligible with aggregate risk ${candidate.aggregateRisk}.`,
    metric: "cmc.skills.onchain_enrichment.eligible_for_entry",
    operator: "=",
    value: false,
  }));
}
