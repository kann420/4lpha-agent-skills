import type { BstocksUniverseSnapshot } from "../adapters/bstocks/client.js";
import type { CmcMarketContext } from "../adapters/cmc/client.js";
import {
  loadBstocksGlobalLearningPolicy,
  selectLessonsForRole,
  summarizeAppliedLessons,
} from "./global-learning.js";
import type { GlobalLearningPolicy } from "./types.js";
import type { BrainRuntimeOptions } from "./types.js";
import { BrainChatMessage, runOpenAiCompatibleAgentReviewGeneric } from "./llm-client.js";
import {
  resolveBrainRuntimeOptionsFromEnv,
  resolveFinalAgentReview,
  runProviderBackedAgentReview,
  runSequentialAgentReviews,
} from "./shared.js";
import type {
  StrategyBrainAgentReview,
  StrategyBrainReview,
  StrategyBrainRole,
  StrategyBrainVerdict,
} from "../types/strategy-brain.js";
import type {
  BstocksDraftStrategySpec,
  BstocksReviewedStrategySpec,
} from "../types/bstocks-strategy-spec.js";
import type { Condition, EvidenceRecord } from "../types/strategy-spec.js";
import type { BstocksTokenInfoSnapshot } from "../types/token-info.js";

interface BstocksBrainReviewInput {
  bstocksTokenInfo?: BstocksTokenInfoSnapshot;
  marketContext: CmcMarketContext;
  bstocksSnapshot: BstocksUniverseSnapshot;
  learningPolicy: GlobalLearningPolicy;
  options: BrainRuntimeOptions;
  strategySpec: BstocksDraftStrategySpec;
}

interface BstocksAgentReviewInput extends BstocksBrainReviewInput {
  previousReviews?: StrategyBrainAgentReview[];
  role: Extract<StrategyBrainRole, "strategy" | "safety" | "market-analysis" | "gatekeeper">;
}

export async function applyBstocksStrategyBrainReview(input: {
  bstocksSnapshot: BstocksUniverseSnapshot;
  bstocksTokenInfo?: BstocksTokenInfoSnapshot;
  draftStrategySpec: BstocksDraftStrategySpec;
  marketContext: CmcMarketContext;
  options?: Partial<BrainRuntimeOptions>;
}): Promise<BstocksReviewedStrategySpec> {
  const options = resolveBstocksBrainRuntimeOptions(input.options);
  const learningPolicy = await loadBstocksGlobalLearningPolicy();
  const strategyThesis = buildBstocksStrategyThesis(
    input.marketContext,
    input.bstocksSnapshot,
    input.draftStrategySpec,
  );

  if (options.mode === "off") {
    return {
      ...input.draftStrategySpec,
      strategyThesis,
      brainReview: {
        mode: "off",
        provider: "local-rules",
        status: "advisory-only",
        finalVerdict: input.draftStrategySpec.status === "proposed" ? "approve" : "wait",
        strategyThesis,
        learning: {
          policyVersion: learningPolicy.version,
          source: learningPolicy.source,
          appliedLessonIds: [],
          summary: "Brain review disabled for this run.",
        },
        agents: [],
      },
    };
  }

  const reviewInput: BstocksBrainReviewInput = {
    marketContext: input.marketContext,
    bstocksSnapshot: input.bstocksSnapshot,
    bstocksTokenInfo: input.bstocksTokenInfo,
    learningPolicy,
    options,
    strategySpec: input.draftStrategySpec,
  };
  const agentReviews = options.mode === "single-agent"
    ? [await runAgentReview({ ...reviewInput, role: "strategy" })]
    : await runMultiAgentReview(reviewInput);
  const finalAgentReview = resolveFinalAgentReview(agentReviews);
  const appliedLessonIds = [...new Set(agentReviews.flatMap((review) => review.appliedLessonIds))];
  const reviewedThesis = buildReviewedStrategyThesis({
    baseThesis: strategyThesis,
    bstocksSnapshot: input.bstocksSnapshot,
    finalAgentReview,
    mode: options.mode,
  });
  const brainReview: StrategyBrainReview = {
    mode: options.mode,
    provider: options.provider,
    status: finalAgentReview.verdict === "approve" ? "approved" : "blocked",
    finalVerdict: finalAgentReview.verdict,
    strategyThesis: reviewedThesis,
    learning: {
      policyVersion: learningPolicy.version,
      source: learningPolicy.source,
      appliedLessonIds,
      summary: summarizeAppliedLessons(learningPolicy, appliedLessonIds),
    },
    agents: agentReviews,
  };

  return applyReviewToSpec({
    brainReview,
    finalAgentReview,
    learningObservedAt: learningPolicy.generatedAt,
    strategySpec: input.draftStrategySpec,
    strategyThesis: reviewedThesis,
  });
}

export function resolveBstocksBrainRuntimeOptions(
  options: Partial<BrainRuntimeOptions> = {},
): BrainRuntimeOptions {
  return resolveBrainRuntimeOptionsFromEnv({
    modeEnv: "BSTOCKS_BRAIN_MODE",
    options,
    providerEnv: "BSTOCKS_BRAIN_PROVIDER",
  });
}

async function runMultiAgentReview(
  input: BstocksBrainReviewInput,
): Promise<StrategyBrainAgentReview[]> {
  return runSequentialAgentReviews({
    roles: ["safety", "market-analysis", "gatekeeper"],
    runRole: (role, previousReviews) =>
      runAgentReview({
        ...input,
        previousReviews,
        role: role as BstocksAgentReviewInput["role"],
      }),
  });
}

async function runAgentReview(
  input: BstocksAgentReviewInput,
): Promise<StrategyBrainAgentReview> {
  return runProviderBackedAgentReview({
    provider: input.options.provider,
    reviewInput: input,
    runLocalReview: runLocalAgentReview,
    runOpenAiReview: runOpenAiCompatibleBstocksAgentReview,
  });
}

function runLocalAgentReview(input: BstocksAgentReviewInput): StrategyBrainAgentReview {
  const appliedLessonIds = selectAppliedBstocksLessonIds(input);
  const base = {
    appliedLessonIds,
    model: `local-${input.role}-rules@${input.learningPolicy.version}`,
    role: input.role,
  };

  if (input.role === "safety") {
    return {
      ...base,
      ...reviewSafety(input),
    };
  }

  if (input.role === "market-analysis") {
    return {
      ...base,
      ...reviewMarketAnalysis(input),
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

async function runOpenAiCompatibleBstocksAgentReview(
  input: BstocksAgentReviewInput,
): Promise<StrategyBrainAgentReview> {
  return runOpenAiCompatibleAgentReviewGeneric({
    buildMessages: buildAgentMessages,
    envPrefix: "BSTOCKS_LLM",
    label: "bStocks brain",
    reviewInput: input,
  });
}

function reviewSafety(input: BstocksAgentReviewInput): LocalVerdict {
  const minimumUniverseCoverage = resolveNumericEntryThreshold(
    input.strategySpec,
    "bstocks-universe-coverage",
    3,
  );
  const fearGreedActivationFloor = resolveNumericEntryThreshold(
    input.strategySpec,
    "fear-greed-risk-gate",
    45,
  );
  const hasBrokenIdentity = (input.strategySpec.universe.sampleCandidates ?? []).some((candidate) =>
    candidate.cmcId <= 0 ||
    candidate.issuer !== "bStocks" ||
    !input.strategySpec.universe.allowedSymbols.includes(candidate.symbol)
  );
  const targetSymbol = input.bstocksTokenInfo?.raw.symbol;
  const targetNotAllowed = targetSymbol
    ? !input.strategySpec.universe.allowedSymbols.includes(targetSymbol)
    : false;

  if (
    hasBrokenIdentity ||
    targetNotAllowed ||
    input.strategySpec.universe.issuer !== "bStocks" ||
    input.strategySpec.universe.venue !== "pancakeswap-stocks"
  ) {
    return {
      verdict: "reject",
      confidence: 0.94,
      summary: "Safety rejected the spec because at least one tracked instrument failed the bStocks issuer, venue, or CMC identity rules.",
      reasons: [
        "bStocks strategies require issuer, venue, symbol, and CMC identity alignment.",
        "The global learning policy blocks symbol-only or mismatched-venue evaluation.",
      ],
    };
  }

  if (input.bstocksSnapshot.candidateCount < minimumUniverseCoverage) {
    return {
      verdict: "wait",
      confidence: 0.88,
      summary: "Safety kept the strategy inactive because the quoteable bStocks universe is too small to rank reliably.",
      reasons: [
        `Only ${input.bstocksSnapshot.candidateCount} tracked symbols currently have live quotes, below the minimum coverage threshold of ${minimumUniverseCoverage}.`,
        "The bStocks rotation lane needs minimum universe coverage before activation.",
      ],
    };
  }

  if (input.marketContext.fearGreed.value < fearGreedActivationFloor) {
    return {
      verdict: "wait",
      confidence: 0.83,
      summary: "Safety kept the strategy inactive because the broader market regime remains below the bStocks activation floor.",
      reasons: [
        `CMC Fear and Greed is ${input.marketContext.fearGreed.value}, below the activation threshold of ${fearGreedActivationFloor}.`,
        "Weak regime conditions should not be overridden by single-name strength in the bStocks lane.",
      ],
    };
  }

  if (input.strategySpec.riskControls.length < 4) {
    return {
      verdict: "reject",
      confidence: 0.9,
      summary: "Safety rejected the spec because explicit bStocks risk controls are incomplete.",
      reasons: [
        "The reviewed strategy must preserve sizing, exposure, cooldown, and loss-control boundaries.",
      ],
    };
  }

  return {
    verdict: "approve",
    confidence: 0.79,
    summary: "Safety approved the spec for downstream review because identity, regime gates, and explicit risk controls are present.",
    reasons: [
      "Issuer, venue, symbol, and CMC identity are explicit for sampled instruments.",
      "Risk controls and invalidation rules are present before activation review.",
      "CMC regime gates remain visible ahead of instrument ranking.",
    ],
  };
}

function reviewMarketAnalysis(input: BstocksAgentReviewInput): LocalVerdict {
  const selected = input.bstocksSnapshot.candidates.slice(0, 3);

  if (selected.length === 0) {
    return {
      verdict: "wait",
      confidence: 0.76,
      summary: "Market Analysis found no quoteable bStocks names to rank.",
      reasons: [
        "No quoteable names means the lane has no breadth to analyze.",
      ],
    };
  }

  const positiveBreadth = selected.filter((candidate) => candidate.percentChange24h >= 0).length;
  const activeBreadth = selected.filter((candidate) => candidate.volume24hUsd > 0).length;
  const leader = selected[0];
  const target = input.bstocksTokenInfo
    ? input.bstocksSnapshot.candidates.find((candidate) => candidate.cmcId === input.bstocksTokenInfo?.raw.cmcId)
    : undefined;

  if (leader.percentChange24h < 0) {
    return {
      verdict: "wait",
      confidence: 0.78,
      summary: "Market Analysis kept the lane inactive because even the strongest tracked bStocks name is down on the day.",
      reasons: [
        "Relative-strength rotation should not activate when leadership is still negative.",
      ],
    };
  }

  if (positiveBreadth < 2 || activeBreadth < 2) {
    return {
      verdict: "wait",
      confidence: 0.72,
      summary: "Market Analysis kept the lane selective because breadth is too narrow across the tracked bStocks universe.",
      reasons: [
        `${positiveBreadth} of the top ${selected.length} tracked names have non-negative 24h momentum.`,
        `${activeBreadth} of the top ${selected.length} tracked names show non-zero 24h quoted volume.`,
      ],
    };
  }

  if (input.bstocksTokenInfo && !target) {
    return {
      verdict: "wait",
      confidence: 0.78,
      summary: "Market Analysis kept the bStocks target inactive because the supplied contract is allowlisted but not quoteable in the current CMC universe snapshot.",
      reasons: [
        `Target token is ${input.bstocksTokenInfo.display.nameSymbol}.`,
        "The bStocks lane needs the target to appear in the current CMC-backed universe before ranking.",
      ],
    };
  }

  return {
    verdict: "approve",
    confidence: 0.71,
    summary: "Market Analysis approved the lane because the tracked bStocks leaders show usable breadth, positive momentum, and active quoted volume.",
    reasons: [
      `${leader.symbol} leads the tracked universe at ${leader.percentChange24h.toFixed(2)}% over 24h.`,
      `${positiveBreadth} of the top ${selected.length} tracked names are positive over 24h.`,
      "The draft spec already constrains the lane to explicit allowlist and volume-aware entry rules.",
    ],
  };
}

function reviewGatekeeper(input: BstocksAgentReviewInput): LocalVerdict {
  const safety = input.previousReviews?.find((review) => review.role === "safety");
  const marketAnalysis = input.previousReviews?.find((review) => review.role === "market-analysis");

  if (safety && safety.verdict !== "approve") {
    return {
      verdict: safety.verdict,
      confidence: safety.confidence,
      summary: `Gatekeeper stopped because Safety returned ${safety.verdict}.`,
      reasons: safety.reasons.slice(0, 3),
    };
  }

  if (marketAnalysis && marketAnalysis.verdict !== "approve") {
    return {
      verdict: marketAnalysis.verdict,
      confidence: marketAnalysis.confidence,
      summary: `Gatekeeper stopped because Market Analysis returned ${marketAnalysis.verdict}.`,
      reasons: marketAnalysis.reasons.slice(0, 3),
    };
  }

  if (input.strategySpec.status !== "proposed") {
    return {
      verdict: "wait",
      confidence: 0.84,
      summary: "Gatekeeper kept the strategy inactive because the deterministic draft spec is not currently deployable.",
      reasons: [
        `Deterministic draft status is ${input.strategySpec.status}.`,
        "The reviewed output remains useful as a backtestable wait state.",
      ],
    };
  }

  if (input.bstocksTokenInfo) {
    const target = (input.strategySpec.universe.sampleCandidates ?? []).find(
      (candidate) => candidate.cmcId === input.bstocksTokenInfo?.raw.cmcId,
    );

    if (!target) {
      return {
        verdict: "wait",
        confidence: 0.8,
        summary: "Gatekeeper kept the contract-specific bStocks strategy inactive because the target is not in the current sampled ranked universe.",
        reasons: [
          `Target token is ${input.bstocksTokenInfo.display.nameSymbol}.`,
          "The target info snapshot cannot override the current bStocks ranking and coverage gates.",
        ],
      };
    }

    if (target.percentChange24h < 0) {
      return {
        verdict: "wait",
        confidence: 0.78,
        summary: "Gatekeeper kept the bStocks target inactive because the supplied contract is negative over 24h.",
        reasons: [
          `${target.symbol} 24h change is ${target.percentChange24h.toFixed(2)}%.`,
          "The bStocks lane is a relative-strength continuation strategy.",
        ],
      };
    }
  }

  const approvedCandidates = (input.strategySpec.universe.sampleCandidates ?? []).filter(
    (candidate) => candidate.percentChange24h >= 0,
  ).length;

  if (approvedCandidates === 0) {
    return {
      verdict: "wait",
      confidence: 0.8,
      summary: "Gatekeeper kept the strategy inactive because no sampled bStocks name currently survives the positive-momentum gate.",
      reasons: [
        "The lane should stay inactive until at least one sampled instrument still satisfies the continuation setup.",
      ],
    };
  }

  return {
    verdict: "approve",
    confidence: 0.79,
    summary: "Gatekeeper approved the bStocks strategy spec for backtesting and paper evaluation.",
    reasons: [
      `${approvedCandidates} sampled instrument(s) still satisfy the active momentum gate.`,
      "Safety and Market Analysis both approved downstream review.",
      "The reviewed output remains a strategy specification, not an execution command.",
    ],
  };
}

function reviewStrategy(input: BstocksAgentReviewInput): LocalVerdict {
  const safety = reviewSafety(input);

  if (safety.verdict !== "approve") {
    return {
      verdict: safety.verdict,
      confidence: safety.confidence,
      summary: `Single-agent review stopped on the safety gate: ${safety.summary}`,
      reasons: safety.reasons.slice(0, 3),
    };
  }

  const marketAnalysis = reviewMarketAnalysis(input);

  if (marketAnalysis.verdict !== "approve") {
    return {
      verdict: marketAnalysis.verdict,
      confidence: marketAnalysis.confidence,
      summary: `Single-agent review stopped on market analysis: ${marketAnalysis.summary}`,
      reasons: marketAnalysis.reasons.slice(0, 3),
    };
  }

  const approvedCandidates = (input.strategySpec.universe.sampleCandidates ?? []).filter(
    (candidate) => candidate.percentChange24h >= 0,
  ).length;

  if (input.strategySpec.status !== "proposed") {
    return {
      verdict: "wait",
      confidence: 0.82,
      summary: "Single-agent review kept the bStocks strategy inactive because the deterministic draft gate rejected deployment.",
      reasons: [
        `Draft regime is ${input.strategySpec.regime.label}.`,
        "The reviewed artifact remains useful for backtesting a wait state.",
      ],
    };
  }

  if (input.bstocksTokenInfo) {
    const target = (input.strategySpec.universe.sampleCandidates ?? []).find(
      (candidate) => candidate.cmcId === input.bstocksTokenInfo?.raw.cmcId,
    );

    if (!target) {
      return {
        verdict: "wait",
        confidence: 0.76,
        summary: "Single-agent review kept the bStocks target inactive because it is not in the current sampled ranked universe.",
        reasons: [
          `Target token is ${input.bstocksTokenInfo.display.nameSymbol}.`,
          "The target info snapshot cannot bypass bStocks ranking and coverage rules.",
        ],
      };
    }
  }

  if (approvedCandidates === 0) {
    return {
      verdict: "wait",
      confidence: 0.76,
      summary: "Single-agent review kept the bStocks strategy inactive until at least one sampled instrument remains in positive momentum territory.",
      reasons: [
        "The draft lane exists, but no sampled name currently survives the final continuation screen.",
      ],
    };
  }

  return {
    verdict: "approve",
    confidence: 0.74,
    summary: "Single-agent review approved the bStocks strategy with the lane-specific learning policy applied.",
    reasons: [
      "CMC regime, bStocks allowlist, ranking rules, exits, and risk controls are explicit.",
      `${approvedCandidates} sampled instrument(s) remain eligible after final review.`,
    ],
  };
}

function buildAgentMessages(input: BstocksAgentReviewInput): BrainChatMessage[] {
  return [
    {
      role: "system",
      content: [
        `You are the ${input.role} agent inside bStocks Strategy Skill.`,
        "You review strategy specs only. You never execute trades, sign transactions, or output wallet instructions.",
        "Return strict JSON only with keys: verdict, confidence, summary, reasons.",
        "verdict must be one of approve, wait, reject. confidence must be a number from 0 to 1.",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          role: input.role,
          marketContext: input.marketContext,
          bstocksUniverse: {
            asOf: input.bstocksSnapshot.asOf,
            issuer: input.bstocksSnapshot.issuer,
            venue: input.bstocksSnapshot.venue,
            candidateCount: input.bstocksSnapshot.candidateCount,
            candidates: input.bstocksSnapshot.candidates.slice(0, 6),
          },
          bstocksTokenInfo: input.bstocksTokenInfo ?? null,
          globalLearning: input.learningPolicy,
          previousReviews: input.previousReviews ?? [],
          draftStrategySpec: input.strategySpec,
        },
        null,
        2,
      ),
    },
  ];
}

export function appendBstocksTokenInfoEvidence(
  strategySpec: BstocksDraftStrategySpec,
  tokenInfo: BstocksTokenInfoSnapshot,
): BstocksDraftStrategySpec {
  return {
    ...strategySpec,
    assumptions: appendAssumption(strategySpec.assumptions, {
      id: "bstocks-token-info-snapshot",
      description: "A contract-specific bStocks token info snapshot was fetched before brain review.",
      impact: "Backtests may use the token-info artifact as focused evidence, but it does not override the bStocks allowlist or ranking gates.",
    }),
    evidence: appendEvidence(strategySpec.evidence, {
      source: "bStocks Token Info Snapshot",
      observedAt: tokenInfo.fetchedAt,
      summary: `${tokenInfo.display.nameSymbol}: price ${tokenInfo.display.price}, 24h change ${tokenInfo.display.percentChange24h}, 24h volume ${tokenInfo.display.volume24h}, CMC rank ${tokenInfo.display.cmcRank ?? "n/a"}.`,
      url: tokenInfo.display.cmcLink ?? undefined,
    }),
    rationale: `${strategySpec.rationale} Target token info snapshot: ${tokenInfo.display.nameSymbol} has ${tokenInfo.display.percentChange24h} 24h change, ${tokenInfo.display.volume24h} 24h volume, and CMC news status ${tokenInfo.display.latestNews.length > 0 ? "available" : "empty"}.`,
  };
}

function selectAppliedBstocksLessonIds(input: BstocksAgentReviewInput): string[] {
  const ids = new Set<string>();

  for (const lesson of selectLessonsForRole(input.learningPolicy, input.role)) {
    if (lesson.direction === "block" || lesson.direction === "neutral") {
      ids.add(lesson.id);
      continue;
    }

    if (
      lesson.id === "mixed-regime-size-down" &&
      input.strategySpec.regime.label === "selective-bstocks-rotation"
    ) {
      ids.add(lesson.id);
      continue;
    }

    if (
      lesson.id === "thin-volume-is-caution" &&
      input.bstocksSnapshot.candidates.some((candidate) => candidate.volume24hUsd <= 0)
    ) {
      ids.add(lesson.id);
    }
  }

  return [...ids];
}

function applyReviewToSpec(input: {
  brainReview: StrategyBrainReview;
  finalAgentReview: StrategyBrainAgentReview;
  learningObservedAt: string;
  strategySpec: BstocksDraftStrategySpec;
  strategyThesis: string;
}): BstocksReviewedStrategySpec {
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
      id: "bstocks-global-learning-policy",
      description: "The bStocks strategy spec is reviewed by a lane-specific global learning policy before validation.",
      impact: "Backtests should treat the brain review verdict as an activation gate, not as an execution instruction.",
    }),
    evidence: appendEvidence(input.strategySpec.evidence, {
      source: "bStocks Global Learning Policy",
      observedAt: input.learningObservedAt,
      summary: `Applied ${input.brainReview.learning.appliedLessonIds.length} learned lesson(s) through ${input.brainReview.mode} review.`,
    }),
    rationale: `${input.strategySpec.rationale} Brain review: ${input.finalAgentReview.summary}`,
    rejectionReasons,
  };
}

function buildBstocksStrategyThesis(
  marketContext: CmcMarketContext,
  bstocksSnapshot: BstocksUniverseSnapshot,
  strategySpec: BstocksDraftStrategySpec,
): string {
  const leaders = bstocksSnapshot.candidates
    .slice(0, 3)
    .map((candidate) => `${candidate.symbol} (${candidate.percentChange24h.toFixed(2)}%)`)
    .join(", ");

  return [
    `Use CMC market regime as the first gate, then rank the committed bStocks allowlist by 24h relative strength and active quoted volume.`,
    `Current Fear and Greed is ${marketContext.fearGreed.value}, BNB 24h is ${marketContext.bnb.percentChange24h.toFixed(2)}%, and the tracked universe has ${bstocksSnapshot.candidateCount} quoteable symbols.`,
    `Current leaders are ${leaders || "none"}.`,
    `The deterministic draft status is ${strategySpec.status} under regime ${strategySpec.regime.label}.`,
  ].join(" ");
}

function buildReviewedStrategyThesis(input: {
  baseThesis: string;
  bstocksSnapshot: BstocksUniverseSnapshot;
  finalAgentReview: StrategyBrainAgentReview;
  mode: BrainRuntimeOptions["mode"];
}): string {
  const approvedCandidates = input.bstocksSnapshot.candidates
    .slice(0, 3)
    .filter((candidate) => candidate.percentChange24h >= 0)
    .length;

  if (input.finalAgentReview.verdict === "approve") {
    return `${input.baseThesis} The ${input.mode} brain approved activation because ${approvedCandidates} leading tracked name(s) still satisfy the momentum filter, breadth remains usable, and explicit risk controls were preserved.`;
  }

  return `${input.baseThesis} The ${input.mode} brain keeps this strategy inactive for now: ${input.finalAgentReview.summary}`;
}

function appendCondition(existing: Condition[], next: Condition): Condition[] {
  if (existing.some((condition) => condition.description === next.description)) {
    return existing;
  }

  return [...existing, next];
}

function appendAssumption(
  existing: BstocksDraftStrategySpec["assumptions"],
  next: BstocksDraftStrategySpec["assumptions"][number],
): BstocksDraftStrategySpec["assumptions"] {
  if (existing.some((assumption) => assumption.id === next.id)) {
    return existing;
  }

  return [...existing, next];
}

function appendEvidence(
  existing: EvidenceRecord[],
  next: EvidenceRecord,
): EvidenceRecord[] {
  if (existing.some((evidence) => evidence.source === next.source)) {
    return existing;
  }

  return [...existing, next];
}

function resolveNumericEntryThreshold(
  strategySpec: BstocksDraftStrategySpec,
  ruleId: string,
  fallback: number,
): number {
  const rule = strategySpec.entryRules.find((entryRule) => entryRule.id === ruleId);

  return typeof rule?.value === "number" ? rule.value : fallback;
}

interface LocalVerdict {
  verdict: StrategyBrainVerdict;
  confidence: number;
  summary: string;
  reasons: string[];
}
