import { loadRepoEnv } from "../adapters/cmc/client.js";
import {
  loadFourMemeGlobalLearningPolicy,
  loadFourMemeSmartWalletDoctrine,
  selectAppliedLessonIds,
  summarizeAppliedLessons,
} from "./global-learning.js";
import { runOpenAiCompatibleAgentReview } from "./llm-client.js";
import {
  resolveBrainRuntimeOptionsFromEnv,
  resolveFinalAgentReview,
  runProviderBackedAgentReview,
  runSequentialAgentReviews,
} from "./shared.js";
import type {
  AgentReviewInput,
  BrainMode,
  BrainProvider,
  BrainReviewInput,
  BrainRuntimeOptions,
} from "./types.js";
import type { FourMemeTokenInfoSnapshot } from "../types/token-info.js";
import type {
  Condition,
  StrategyBrainAgentReview,
  StrategyBrainReview,
  StrategyBrainVerdict,
  StrategySpec,
} from "../types/strategy-spec.js";

export async function applyStrategyBrainReview(input: {
  fourMemeTokenInfo?: FourMemeTokenInfoSnapshot;
  marketContext: BrainReviewInput["marketContext"];
  fourMemeSnapshot: BrainReviewInput["fourMemeSnapshot"];
  options?: Partial<BrainRuntimeOptions>;
  strategySpec: StrategySpec;
}): Promise<StrategySpec> {
  const options = resolveBrainRuntimeOptions(input.options);
  const [learningPolicy, smartWalletDoctrine] = await Promise.all([
    loadFourMemeGlobalLearningPolicy(),
    loadFourMemeSmartWalletDoctrine(),
  ]);

  if (options.mode === "off") {
    return {
      ...input.strategySpec,
      brainReview: {
        mode: "off",
        provider: "local-rules",
        status: "advisory-only",
        finalVerdict: input.strategySpec.status === "proposed" ? "approve" : "wait",
        strategyThesis: input.strategySpec.strategyThesis,
        learning: {
          policyVersion: `${learningPolicy.version}+smart-wallet-${smartWalletDoctrine.version}`,
          source: `${learningPolicy.source}; ${smartWalletDoctrine.source}`,
          appliedLessonIds: [],
          summary: "Brain review disabled for this run.",
        },
        agents: [],
      },
    };
  }

  const reviewInput: BrainReviewInput = {
    fourMemeTokenInfo: input.fourMemeTokenInfo,
    marketContext: input.marketContext,
    fourMemeSnapshot: input.fourMemeSnapshot,
    learningPolicy,
    smartWalletDoctrine,
    options,
    strategySpec: input.strategySpec,
  };
  const agentReviews = options.mode === "single-agent"
    ? [await runAgentReview({ ...reviewInput, role: "strategy" })]
    : await runMultiAgentReview(reviewInput);
  const finalAgentReview = resolveFinalAgentReview(agentReviews);
  const appliedLessonIds = [...new Set(agentReviews.flatMap((review) => review.appliedLessonIds))];
  const strategyThesis = buildReviewedStrategyThesis({
    finalAgentReview,
    input: reviewInput,
  });
  const brainReview: StrategyBrainReview = {
    mode: options.mode,
    provider: options.provider,
    status: finalAgentReview.verdict === "approve" ? "approved" : "blocked",
    finalVerdict: finalAgentReview.verdict,
    strategyThesis,
    learning: {
      policyVersion: `${learningPolicy.version}+smart-wallet-${smartWalletDoctrine.version}`,
      source: `${learningPolicy.source}; ${smartWalletDoctrine.source}`,
      appliedLessonIds,
      summary: summarizeBrainLearning({
        appliedLessonIds,
        globalSummary: summarizeAppliedLessons(learningPolicy, appliedLessonIds),
      }),
    },
    agents: agentReviews,
  };

  return applyReviewToSpec({
    brainReview,
    finalAgentReview,
    learningObservedAt: learningPolicy.generatedAt,
    smartWalletObservedAt: smartWalletDoctrine.generatedAt,
    strategySpec: input.strategySpec,
    strategyThesis,
  });
}

export function resolveBrainRuntimeOptions(
  options: Partial<BrainRuntimeOptions> = {},
): BrainRuntimeOptions {
  return resolveBrainRuntimeOptionsFromEnv({
    modeEnv: "FOURMEME_BRAIN_MODE",
    options,
    providerEnv: "FOURMEME_BRAIN_PROVIDER",
  });
}

async function runMultiAgentReview(
  input: BrainReviewInput,
): Promise<StrategyBrainAgentReview[]> {
  return runSequentialAgentReviews({
    roles: ["safety", "social", "gatekeeper"],
    runRole: (role, previousReviews) =>
      runAgentReview({
        ...input,
        previousReviews,
        role,
      }),
  });
}

async function runAgentReview(
  input: AgentReviewInput,
): Promise<StrategyBrainAgentReview> {
  return runProviderBackedAgentReview({
    provider: input.options.provider,
    reviewInput: input,
    runLocalReview: runLocalAgentReview,
    runOpenAiReview: runOpenAiCompatibleAgentReview,
  });
}

function runLocalAgentReview(input: AgentReviewInput): StrategyBrainAgentReview {
  const appliedLessonIds = selectAppliedLessonIds({
    policy: input.learningPolicy,
    role: input.role,
    strategySpec: input.strategySpec,
  }).concat(selectSmartWalletDoctrineIds(input));
  const base = {
    appliedLessonIds: [...new Set(appliedLessonIds)],
    model: `local-${input.role}-rules@${input.learningPolicy.version}`,
    role: input.role,
  };

  if (input.role === "safety") {
    return {
      ...base,
      ...reviewSafety(input),
    };
  }

  if (input.role === "social") {
    return {
      ...base,
      ...reviewSocial(input),
    };
  }

  if (input.role === "gatekeeper") {
    return {
      ...base,
      ...reviewGatekeeper(input),
    };
  }

  return {
    ...base,
    ...reviewStrategy(input),
  };
}

function reviewSafety(input: AgentReviewInput): LocalVerdict {
  const missingIdentity = (input.strategySpec.universe.sampleCandidates ?? []).some(
    (candidate) => !/^0x[a-fA-F0-9]{40}$/.test(candidate.tokenAddress),
  );

  if (missingIdentity) {
    return {
      verdict: "reject",
      confidence: 0.92,
      summary: "Safety rejected the spec because at least one candidate lacks contract-level identity.",
      reasons: [
        "Contract address identity is mandatory for Four.Meme strategies.",
        "The global learning policy blocks symbol-only evaluation.",
      ],
    };
  }

  if (input.strategySpec.universe.candidateCount === 0) {
    return {
      verdict: "wait",
      confidence: 0.86,
      summary: "Safety found no current venue candidates to evaluate.",
      reasons: [
        "The Four.Meme scan returned zero featured candidates.",
        "The strategy should remain inactive until a real candidate appears.",
      ],
    };
  }

  if (input.fourMemeTokenInfo) {
    if (input.fourMemeTokenInfo.raw.totalHolders <= 0) {
      return {
        verdict: "wait",
        confidence: 0.84,
        summary: "Safety kept the strategy inactive because the target token has no usable CMC holder count.",
        reasons: [
          `Target token is ${input.fourMemeTokenInfo.display.nameSymbol}.`,
          "CMC holder count is required when a specific token contract is supplied.",
        ],
      };
    }

    if (input.fourMemeTokenInfo.raw.liquidityUsd <= 0) {
      return {
        verdict: "wait",
        confidence: 0.82,
        summary: "Safety kept the strategy inactive because the target token has no CMC DEX liquidity evidence.",
        reasons: [
          `Target token is ${input.fourMemeTokenInfo.display.nameSymbol}.`,
          "Liquidity evidence is required before a contract-specific strategy can be reviewed.",
        ],
      };
    }
  }

  if (input.marketContext.fearGreed.value < 20) {
    return {
      verdict: "wait",
      confidence: 0.8,
      summary: "Safety kept the strategy inactive because market fear is too elevated.",
      reasons: [
        `CMC Fear and Greed is ${input.marketContext.fearGreed.value}.`,
        "Extreme defensive regimes should not be rescued by venue-only signals.",
      ],
    };
  }

  return {
    verdict: "approve",
    confidence: 0.78,
    summary: "Safety approved the spec for downstream review with strict size, invalidation controls, and smart-wallet doctrine evidence boundaries.",
    reasons: [
      "Contract-level identity is present for sampled candidates.",
      "The strategy includes explicit stop, exposure, cooldown, and invalidation controls.",
      "The CMC regime gate remains visible before venue selection.",
      "Smart-wallet doctrine is advisory only and cannot bypass hard safety gates.",
    ],
  };
}

function reviewSocial(input: AgentReviewInput): LocalVerdict {
  const selected = input.fourMemeSnapshot.selectedCandidates;
  const venueAttentionCount = selected.filter((candidate) =>
    candidate.discoveryFeeds.some((feed) => feed === "hot" || feed === "volumeLeaders" || feed === "dexMigrated"),
  ).length;

  if (selected.length === 0) {
    return {
      verdict: "wait",
      confidence: 0.74,
      summary: "Social review found no venue attention proxy because no candidates were selected.",
      reasons: [
        "No selected candidates means no social or venue-attention proxy should be inferred.",
        "Missing social data is neutral, but missing candidates keeps the setup inactive.",
      ],
    };
  }

  if (input.fourMemeTokenInfo?.raw.latestNews.length === 0) {
    return {
      verdict: "approve",
      confidence: 0.66,
      summary: "Social review approved while explicitly treating missing CMC news as neutral, not as a catalyst.",
      reasons: [
        `${venueAttentionCount} selected candidate(s) appeared in hot, volume, or DEX-migrated feeds.`,
        `Target token ${input.fourMemeTokenInfo.display.nameSymbol} has no CMC latest-news items, so no catalyst should be claimed.`,
        "Socials and venue feed presence remain weak evidence only.",
      ],
    };
  }

  return {
    verdict: "approve",
    confidence: venueAttentionCount > 0 ? 0.7 : 0.6,
    summary: "Social review approved using Four.Meme feed presence as a weak venue-attention proxy while preserving smart-wallet cluster requirements as future evidence.",
    reasons: [
      `${venueAttentionCount} selected candidate(s) appeared in hot, volume, or DEX-migrated feeds.`,
      "No external KOL or wallet-social feed is claimed in this repo slice.",
      "Missing social data is treated as neutral according to the global learning policy.",
      "Smart-wallet cluster confirmation is required as future evidence before converting watchlist names into active entries.",
    ],
  };
}

function reviewGatekeeper(input: AgentReviewInput): LocalVerdict {
  const safety = input.previousReviews?.find((review) => review.role === "safety");
  const social = input.previousReviews?.find((review) => review.role === "social");

  if (safety && safety.verdict !== "approve") {
    return {
      verdict: safety.verdict,
      confidence: safety.confidence,
      summary: `Gatekeeper stopped because Safety returned ${safety.verdict}.`,
      reasons: safety.reasons.slice(0, 3),
    };
  }

  if (social && social.verdict !== "approve") {
    return {
      verdict: social.verdict,
      confidence: social.confidence,
      summary: `Gatekeeper stopped because Social returned ${social.verdict}.`,
      reasons: social.reasons.slice(0, 3),
    };
  }

  const activeApprovedCandidates = countCandidatesInAllowedBuckets(input.strategySpec);
  if (input.strategySpec.status !== "proposed") {
    return {
      verdict: "wait",
      confidence: 0.84,
      summary: "Gatekeeper kept the strategy inactive because the deterministic regime gate rejected it.",
      reasons: [
        `Deterministic strategy status is ${input.strategySpec.status}.`,
        "The backtestable spec is still emitted, but live activation should wait.",
      ],
    };
  }

  if (input.fourMemeTokenInfo) {
    const targetInSample = (input.strategySpec.universe.sampleCandidates ?? []).some(
      (candidate) => candidate.tokenAddress.toLowerCase() === input.fourMemeTokenInfo?.contract.toLowerCase(),
    );

    if (!targetInSample) {
      return {
        verdict: "wait",
        confidence: 0.8,
        summary: "Gatekeeper kept the contract-specific Four.Meme strategy inactive because the target token is not in the current selected venue candidates.",
        reasons: [
          `Target token is ${input.fourMemeTokenInfo.display.nameSymbol}.`,
          "Contract-specific review requires the token to align with the current Four.Meme discovery evidence.",
          "The token info snapshot remains useful evidence, but it should not override the live lane selection gate.",
        ],
      };
    }
  }

  if (activeApprovedCandidates === 0) {
    const matchedModes = summarizeDoctrineModeCoverage(input);
    return {
      verdict: "wait",
      confidence: 0.82,
      summary: "Gatekeeper kept the strategy inactive until a candidate matches the approved entry bucket and the smart-wallet doctrine evidence threshold.",
      reasons: [
        "The current venue scan has candidates, but none in the currently approved entry bucket.",
        "Medium Risk remains watchlist-only under the distilled 4alpha policy.",
        matchedModes,
      ],
    };
  }

  return {
    verdict: "approve",
    confidence: 0.78,
    summary: "Gatekeeper approved the strategy spec for backtesting and paper evaluation.",
    reasons: [
      `${activeApprovedCandidates} sampled candidate(s) match the currently approved entry bucket.`,
      "Safety and Social reviews both approved downstream review.",
      "The smart-wallet doctrine is represented as evidence requirements, not as execution permission.",
      "The strategy remains a spec output, not an execution command.",
    ],
  };
}

function reviewStrategy(input: AgentReviewInput): LocalVerdict {
  const activeApprovedCandidates = countCandidatesInAllowedBuckets(input.strategySpec);

  if (input.strategySpec.status !== "proposed") {
    return {
      verdict: "wait",
      confidence: 0.82,
      summary: "Single-agent review kept the strategy inactive because the regime gate rejected deployment.",
      reasons: [
        `Regime is ${input.strategySpec.regime.label}.`,
        "The spec remains useful for backtesting a rejection or wait state.",
      ],
    };
  }

  if (input.fourMemeTokenInfo) {
    const targetInSample = (input.strategySpec.universe.sampleCandidates ?? []).some(
      (candidate) => candidate.tokenAddress.toLowerCase() === input.fourMemeTokenInfo?.contract.toLowerCase(),
    );

    if (!targetInSample) {
      return {
        verdict: "wait",
        confidence: 0.77,
        summary: "Single-agent review kept the contract-specific strategy inactive because the target token is not in the current selected Four.Meme candidates.",
        reasons: [
          `Target token is ${input.fourMemeTokenInfo.display.nameSymbol}.`,
          "The token info snapshot cannot bypass the live discovery gate.",
        ],
      };
    }
  }

  if (activeApprovedCandidates === 0) {
    return {
      verdict: "wait",
      confidence: 0.78,
      summary: "Single-agent review kept the strategy inactive until an approved-bucket candidate appears.",
      reasons: [
        "Venue candidates exist, but none match the approved entry bucket for this regime.",
        "Medium Risk candidates are watchlist-only without stronger confirmation.",
      ],
    };
  }

  return {
    verdict: "approve",
    confidence: 0.76,
    summary: "Single-agent review approved the strategy spec with the global learning policy applied.",
    reasons: [
      "CMC regime, venue scan, entry rules, exits, and risk controls are all explicit.",
      `${activeApprovedCandidates} sampled candidate(s) match the approved bucket gate.`,
    ],
  };
}

function applyReviewToSpec(input: {
  brainReview: StrategyBrainReview;
  finalAgentReview: StrategyBrainAgentReview;
  learningObservedAt: string;
  smartWalletObservedAt: string;
  strategySpec: StrategySpec;
  strategyThesis: string;
}): StrategySpec {
  const reviewedStatus = input.brainReview.finalVerdict === "approve" && input.strategySpec.status === "proposed"
    ? "proposed"
    : "rejected";
  const rejectionReasons = reviewedStatus === "rejected"
    ? appendCondition(input.strategySpec.rejectionReasons ?? [], {
        description: `Brain review returned ${input.brainReview.finalVerdict}: ${input.finalAgentReview.summary}`,
        metric: "brainReview.finalVerdict",
        operator: "=",
        value: input.brainReview.finalVerdict,
      })
    : input.strategySpec.rejectionReasons;

  return {
    ...input.strategySpec,
    status: reviewedStatus,
    strategyThesis: input.strategyThesis,
    brainReview: input.brainReview,
    assumptions: appendAssumption(input.strategySpec.assumptions, {
      id: "4alpha-global-learning-policy",
      description: "The strategy spec is reviewed by a distilled 4alpha global learning policy before validation.",
      impact: "Backtests should treat the brain review verdict as an activation gate, not as an execution instruction.",
    }).concat([
      {
        id: "4alpha-smart-wallet-doctrine",
        description: "The Four.Meme skill applies a smart-wallet entry doctrine distilled from 4alpha custom skill research as an advisory review policy.",
        impact: "Backtests may use currently available market-cap, volume, holder, bonding, bucket, and attached on-chain enrichment fields immediately; deeper smart-wallet cluster or short-window buy/sell flow should remain explicit future evidence when no adapter snapshot is attached.",
      },
    ].filter((next) => !input.strategySpec.assumptions.some((assumption) => assumption.id === next.id))),
    evidence: appendEvidence(
      appendEvidence(input.strategySpec.evidence, {
        source: "4Alpha Global Learning Policy",
        observedAt: input.learningObservedAt,
        summary: `Applied ${input.brainReview.learning.appliedLessonIds.length} learned lesson(s) through ${input.brainReview.mode} review.`,
      }),
      {
        source: "4Alpha Four.Meme Smart-Wallet Doctrine",
        observedAt: input.smartWalletObservedAt,
        summary: "Applied advisory setup modes, smart-wallet confirmation requirements, 5-of-8 entry checklist, and avoid rules as strategy-spec review policy.",
      },
    ),
    rationale: `${input.strategySpec.rationale} Brain review: ${input.finalAgentReview.summary}`,
    rejectionReasons,
  };
}

export function appendFourMemeTokenInfoEvidence(
  strategySpec: StrategySpec,
  tokenInfo: FourMemeTokenInfoSnapshot,
): StrategySpec {
  return {
    ...strategySpec,
    assumptions: appendAssumption(strategySpec.assumptions, {
      id: "fourmeme-token-info-snapshot",
      description: "A contract-specific Four.Meme token info snapshot was fetched before brain review.",
      impact: "Backtests may use the token-info artifact as focused evidence, but it does not override the lane discovery gates.",
    }),
    evidence: appendEvidence(strategySpec.evidence, {
      source: "Four.Meme Token Info Snapshot",
      observedAt: tokenInfo.fetchedAt,
      summary: `${tokenInfo.display.nameSymbol}: price ${tokenInfo.display.priceUsd}, 24h volume ${tokenInfo.display.volume24hUsd}, holders ${tokenInfo.display.totalHolders}, liquidity ${tokenInfo.display.liquidity}, CMC rank ${tokenInfo.display.cmcRank ?? "n/a"}.`,
      url: tokenInfo.display.cmcLink ?? undefined,
    }),
    rationale: `${strategySpec.rationale} Target token info snapshot: ${tokenInfo.display.nameSymbol} has ${tokenInfo.display.volume24hUsd} 24h volume, ${tokenInfo.display.liquidity} liquidity, and CMC news status ${tokenInfo.display.latestNews.length > 0 ? "available" : "empty"}.`,
  };
}

function buildReviewedStrategyThesis(input: {
  finalAgentReview: StrategyBrainAgentReview;
  input: BrainReviewInput;
}): string {
  const base = input.input.strategySpec.strategyThesis;
  const activeApprovedCandidates = countCandidatesInAllowedBuckets(input.input.strategySpec);

  if (input.finalAgentReview.verdict === "approve") {
    return `${base} The ${input.input.options.mode} brain approved activation because ${activeApprovedCandidates} sampled candidate(s) match the approved bucket gate, the final review preserved explicit risk controls, and the smart-wallet doctrine is represented as evidence requirements rather than execution permission.`;
  }

  return `${base} The ${input.input.options.mode} brain keeps this strategy inactive for now: ${input.finalAgentReview.summary} Smart-wallet doctrine requirements remain explicit so the setup can be backtested or rejected without inventing missing wallet-flow data.`;
}

function countCandidatesInAllowedBuckets(strategySpec: StrategySpec): number {
  const bucketRule = strategySpec.entryRules.find(
    (rule) => rule.id === "fourmeme-discovery-bucket-gate",
  );
  const allowedBuckets = Array.isArray(bucketRule?.value)
    ? new Set(bucketRule.value.map(String))
    : new Set<string>();

  return (strategySpec.universe.sampleCandidates ?? []).filter(
    (candidate) => candidate.selectionBucket && allowedBuckets.has(candidate.selectionBucket),
  ).length;
}

function appendCondition(existing: Condition[], next: Condition): Condition[] {
  if (existing.some((condition) => condition.description === next.description)) {
    return existing;
  }

  return [...existing, next];
}

function appendAssumption(
  existing: StrategySpec["assumptions"],
  next: StrategySpec["assumptions"][number],
): StrategySpec["assumptions"] {
  if (existing.some((assumption) => assumption.id === next.id)) {
    return existing;
  }

  return [...existing, next];
}

function appendEvidence(
  existing: StrategySpec["evidence"],
  next: StrategySpec["evidence"][number],
): StrategySpec["evidence"] {
  if (existing.some((evidence) => evidence.source === next.source)) {
    return existing;
  }

  return [...existing, next];
}

function summarizeBrainLearning(input: {
  appliedLessonIds: string[];
  globalSummary: string;
}): string {
  const smartWalletIds = input.appliedLessonIds.filter((lessonId) =>
    lessonId.startsWith("smart-wallet:"),
  );
  if (smartWalletIds.length === 0) {
    return input.globalSummary;
  }

  return [
    input.globalSummary,
    `Smart-wallet doctrine applied ${smartWalletIds.length} advisory rule(s): ${smartWalletIds.join(", ")}.`,
  ].join(" ");
}

function selectSmartWalletDoctrineIds(input: AgentReviewInput): string[] {
  const ids = new Set<string>();

  if (input.role === "safety" || input.role === "strategy") {
    ids.add("smart-wallet:contract-address-grouping");
    ids.add("smart-wallet:hard-gates-override-doctrine");
    ids.add("smart-wallet:avoid-dead-liquidity");
  }

  if (input.role === "social" || input.role === "gatekeeper" || input.role === "strategy") {
    ids.add("smart-wallet:confirmation-levels");
    ids.add("smart-wallet:missing-wallet-flow-is-future-evidence");
  }

  if (input.role === "gatekeeper" || input.role === "strategy") {
    for (const mode of resolveMatchedSetupModes(input)) {
      ids.add(`smart-wallet:setup-mode:${mode.id}`);
    }
    ids.add("smart-wallet:entry-checklist-5-of-8");
  }

  return [...ids];
}

function resolveMatchedSetupModes(input: AgentReviewInput): Array<{ id: string; summary: string }> {
  const sampleCandidates = input.strategySpec.universe.sampleCandidates ?? [];
  const matchedModeIds = new Set<string>();

  for (const candidate of sampleCandidates) {
    const marketCapUsd = candidate.marketCapUsd ?? 0;
    for (const mode of input.smartWalletDoctrine.setupModes) {
      if (marketCapUsd > 0 && marketCapUsd <= mode.marketCapUsdValidMax) {
        matchedModeIds.add(mode.id);
      }
    }
  }

  return input.smartWalletDoctrine.setupModes
    .filter((mode) => matchedModeIds.has(mode.id))
    .map((mode) => ({ id: mode.id, summary: mode.summary }));
}

function summarizeDoctrineModeCoverage(input: AgentReviewInput): string {
  const matchedModes = resolveMatchedSetupModes(input);
  if (matchedModes.length === 0) {
    return "No sampled candidate currently fits a smart-wallet doctrine market-cap mode with available data.";
  }

  return `Available data maps sampled candidates to doctrine mode(s): ${matchedModes.map((mode) => mode.id).join(", ")}; wallet-flow confirmation remains future evidence.`;
}

interface LocalVerdict {
  verdict: StrategyBrainVerdict;
  confidence: number;
  summary: string;
  reasons: string[];
}
