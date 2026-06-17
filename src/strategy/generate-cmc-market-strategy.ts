import type { CmcMarketContext } from "../adapters/cmc/client.js";
import type {
  FourMemeDiscoverySnapshot,
  FourMemeSelectionBucket,
} from "../adapters/fourmeme/client.js";
import type { Condition, EvidenceRecord, StrategySpec } from "../types/strategy-spec.js";

const ENTRY_THRESHOLDS = {
  bnbChange24hMin: 0,
  bnbChange7dMin: 2,
  btcDominanceChange24hMax: 0.25,
  candidateLiquidityUsdMin: 25000,
  candidateVolume24hUsdMin: 50000,
  fearGreedMin: 35,
  launchAgeMinutesMax: 1440,
  launchAgeMinutesMin: 15,
  marketCapChange24hMin: 0,
  maxHoldHours: 24,
  maxLossPct: -12,
  takeProfitPct: 25,
} as const;

const STRATEGY_VERSION = "0.1.0";

interface RegimeAssessment {
  confidence: number;
  failedConditions: Condition[];
  label: string;
  rationalePrefix: string;
  status: StrategySpec["status"];
  summary: string;
}

export function generateCmcMarketStrategySpec(
  marketContext: CmcMarketContext,
  fourMemeSnapshot: FourMemeDiscoverySnapshot,
): StrategySpec {
  const regime = assessRegime(marketContext);
  const allowedBuckets = resolveAllowedBuckets(regime.label);
  const evidence = buildEvidence(marketContext, fourMemeSnapshot);
  const asOfDate = marketContext.asOf.replace(/[:.]/g, "-");
  const strategyThesis = buildStrategyThesis(marketContext, fourMemeSnapshot, regime);

  return {
    version: STRATEGY_VERSION,
    strategyId: `cmc-bnb-fourmeme-${asOfDate}`,
    generatedAt: new Date().toISOString(),
    domain: "bnb-fourmeme",
    status: regime.status,
    inputWindow: {
      asOf: marketContext.asOf,
      barInterval: "1h",
      lookback: "7d",
    },
    universe: {
      chain: "bnb-chain",
      venue: "fourmeme",
      selectionMethod: "Apply a CMC regime gate first, then scan live Four.Meme meme-api feeds and reuse the distilled 4alpha discovery buckets (Safe 2 Ape, Medium Risk, Gem Hunt) to shortlist contract-level candidates.",
      quoteAsset: "BNB",
      candidateCount: fourMemeSnapshot.selectedCandidates.length,
      bucketCounts: {
        safe2ape: fourMemeSnapshot.safe2apeCandidates.length,
        mediumRisk: fourMemeSnapshot.mediumRiskCandidates.length,
        gemHunt: fourMemeSnapshot.gemHuntCandidates.length,
      },
      sampleCandidates: fourMemeSnapshot.selectedCandidates.slice(0, 5).map((candidate) => ({
        tokenAddress: candidate.tokenAddress,
        symbol: candidate.symbol,
        name: candidate.name,
        venueUrl: candidate.venueUrl,
        marketCapUsd: candidate.marketCapUsd,
        volume24hUsd: candidate.volume24hUsd,
        volume4hUsd: candidate.volume4hUsd,
        holders: candidate.holders,
        bondingProgress: candidate.bondingProgress,
        discoveryFeeds: candidate.discoveryFeeds,
        selectionBucket: candidate.selectionBucket,
        createdAt: candidate.createdAt,
        graduated: candidate.graduated,
        launchStage: candidate.launchStage,
        categoryScore: candidate.categoryScore,
      })),
    },
    regime: {
      label: regime.label,
      summary: regime.summary,
      confidence: regime.confidence,
    },
    entryRules: [
      {
        id: "market-cap-risk-gate",
        description: "Only scan Four.Meme candidates when total crypto market cap is flat-to-up versus the prior 24h snapshot.",
        metric: "cmc.global.total_market_cap_change_24h_pct",
        operator: ">=",
        value: ENTRY_THRESHOLDS.marketCapChange24hMin,
      },
      {
        id: "fear-greed-risk-gate",
        description: "Only activate the strategy when CMC Fear and Greed is above the defensive floor.",
        metric: "cmc.fear_and_greed.value",
        operator: ">=",
        value: ENTRY_THRESHOLDS.fearGreedMin,
      },
      {
        id: "bnb-trend-24h-gate",
        description: "Require BNB to hold non-negative 24h momentum before taking Four.Meme continuation setups.",
        metric: "cmc.bnb.percent_change_24h",
        operator: ">=",
        value: ENTRY_THRESHOLDS.bnbChange24hMin,
      },
      {
        id: "bnb-trend-7d-gate",
        description: "Require BNB to maintain at least modest 7d strength to justify BNB-native meme rotation exposure.",
        metric: "cmc.bnb.percent_change_7d",
        operator: ">=",
        value: ENTRY_THRESHOLDS.bnbChange7dMin,
      },
      {
        id: "btc-dominance-rotation-gate",
        description: "Avoid fresh meme exposure when BTC dominance is accelerating too hard against alt rotation.",
        metric: "cmc.global.btc_dominance_change_24h_pct",
        operator: "<=",
        value: ENTRY_THRESHOLDS.btcDominanceChange24hMax,
      },
      {
        id: "fourmeme-discovery-bucket-gate",
        description: "Only allow candidates that land in the approved Four.Meme discovery buckets for the current market regime.",
        metric: "fourmeme.discovery_bucket",
        operator: "in",
        value: allowedBuckets,
        notes: allowedBuckets.includes("gemHunt")
          ? "Safe 2 Ape handles launch-phase continuation; Gem Hunt handles post-migration continuation. Medium Risk stays watchlist-only in this slice."
          : "Selective mode keeps Medium Risk and Gem Hunt as watchlist-only until the broader market improves.",
      },
      {
        id: "fourmeme-launch-stage-gate",
        description: "Match the allowed launch stage to the selected discovery buckets.",
        metric: "fourmeme.launch_stage",
        operator: "in",
        value: allowedBuckets.includes("gemHunt") ? ["new", "migrated"] : ["new"],
      },
      {
        id: "fourmeme-launch-age-min",
        description: "Ignore listings that are too new for spread and identity noise to settle.",
        metric: "fourmeme.launch_age_minutes",
        operator: ">=",
        value: ENTRY_THRESHOLDS.launchAgeMinutesMin,
      },
      {
        id: "fourmeme-launch-age-max",
        description: "Focus on the first day of activity so the setup remains a launch-phase strategy rather than a general momentum chase.",
        metric: "fourmeme.launch_age_minutes",
        operator: "<=",
        value: ENTRY_THRESHOLDS.launchAgeMinutesMax,
      },
      {
        id: "fourmeme-volume-floor",
        description: "Require non-trivial venue activity from the Four.Meme discovery scan before entry.",
        metric: "fourmeme.volume_24h_usd",
        operator: ">=",
        value: ENTRY_THRESHOLDS.candidateVolume24hUsdMin,
      },
      {
        id: "fourmeme-bonding-progress-floor",
        description: "Require launch-phase candidates to show meaningful bonding progress before entry so the setup is not just the first few minutes of noise.",
        metric: "fourmeme.bonding_progress_pct",
        operator: ">=",
        value: 50,
      },
    ],
    exitRules: [
      {
        id: "hard-stop-loss",
        description: "Exit the position when drawdown from entry reaches the hard stop threshold.",
        metric: "trade.drawdown_pct_from_entry",
        operator: "<=",
        value: ENTRY_THRESHOLDS.maxLossPct,
      },
      {
        id: "take-profit",
        description: "Lock in strength once the continuation move reaches the defined take-profit target.",
        metric: "trade.unrealized_return_pct",
        operator: ">=",
        value: ENTRY_THRESHOLDS.takeProfitPct,
      },
      {
        id: "time-stop",
        description: "Exit if the trade has not resolved within one day of launch-phase momentum.",
        metric: "trade.holding_period_hours",
        operator: ">=",
        value: ENTRY_THRESHOLDS.maxHoldHours,
      },
      {
        id: "regime-break-exit",
        description: "Flatten open exposure if the market regime gate flips risk-off after entry.",
        metric: "cmc.fear_and_greed.value",
        operator: "<",
        value: ENTRY_THRESHOLDS.fearGreedMin,
      },
    ],
    riskControls: [
      {
        id: "position-size-cap",
        description: "Cap each position at 0.5% of strategy equity.",
        type: "position-sizing",
        value: 0.5,
      },
      {
        id: "portfolio-exposure-cap",
        description: "Cap concurrent Four.Meme exposure at 1.5% of strategy equity.",
        type: "exposure-cap",
        value: 1.5,
      },
      {
        id: "daily-loss-cap",
        description: "Stop taking fresh entries after 1.0% daily strategy drawdown.",
        type: "daily-loss-limit",
        value: 1.0,
      },
      {
        id: "liquidity-filter",
        description: "Skip candidates that do not survive the live Four.Meme discovery bucket scan, even if the broader market regime is supportive.",
        type: "liquidity-filter",
        value: "discovery-bucket-required",
      },
      {
        id: "stopout-cooldown",
        description: "Wait two hours after a stop-out before re-entering any Four.Meme candidate.",
        type: "cooldown",
        value: "2h",
      },
    ],
    invalidation: [
      {
        description: "Invalidate the setup if Fear and Greed drops back below the strategy floor.",
        metric: "cmc.fear_and_greed.value",
        operator: "<",
        value: ENTRY_THRESHOLDS.fearGreedMin,
      },
      {
        description: "Invalidate the setup if total crypto market cap turns negative again on a 24h basis.",
        metric: "cmc.global.total_market_cap_change_24h_pct",
        operator: "<",
        value: ENTRY_THRESHOLDS.marketCapChange24hMin,
      },
      {
        description: "Invalidate the setup if BNB loses its 7d strength bias.",
        metric: "cmc.bnb.percent_change_7d",
        operator: "<",
        value: ENTRY_THRESHOLDS.bnbChange7dMin,
      },
    ],
    assumptions: [
      {
        id: "cmc-snapshot-lag",
        description: "CMC market metrics are treated as the authoritative snapshot for regime gating at hourly granularity.",
        impact: "Backtests should sample the same hourly snapshot cadence rather than tick-level data.",
      },
      {
        id: "contract-level-identity",
        description: "Four.Meme candidates are evaluated by chain and contract address, not by symbol alone.",
        impact: "Backtests must join venue data on contract identity to avoid ticker collisions.",
      },
      {
        id: "execution-friction",
        description: "The liquidity floor is intended to keep slippage assumptions within a small-cap but still testable range.",
        impact: "Backtests should model slippage and fees explicitly instead of assuming perfect fills.",
      },
      {
        id: "fourmeme-native-slice",
        description: "The repo now uses live Four.Meme meme-api discovery feeds and a compact subset of the 4alpha bucket logic, but it does not yet port GMGN or OnchainOS enrichments.",
        impact: "Current outputs reflect real venue candidates and bucketed heuristics, while deeper holder-concentration and smart-money filters remain a later slice.",
      },
    ],
    evidence,
    strategyThesis,
    brainReview: {
      mode: "off",
      provider: "deterministic-generator",
      status: "advisory-only",
      finalVerdict: regime.status === "proposed" ? "approve" : "wait",
      strategyThesis,
      learning: {
        policyVersion: "not-applied",
        source: "deterministic-generator",
        appliedLessonIds: [],
        summary: "No external brain review has been applied yet.",
      },
      agents: [],
    },
    rationale: buildRationale(marketContext, fourMemeSnapshot, regime),
    rejectionReasons: regime.failedConditions.length > 0 ? regime.failedConditions : undefined,
  };
}

function assessRegime(marketContext: CmcMarketContext): RegimeAssessment {
  const failedConditions: Condition[] = [];
  let passedSignals = 0;

  if (marketContext.global.totalMarketCapChange24hPct >= ENTRY_THRESHOLDS.marketCapChange24hMin) {
    passedSignals += 1;
  } else {
    failedConditions.push({
      description: `Total crypto market cap is ${marketContext.global.totalMarketCapChange24hPct.toFixed(2)}% over 24h, below the flat-to-up entry gate.`,
      metric: "cmc.global.total_market_cap_change_24h_pct",
      operator: "<",
      value: ENTRY_THRESHOLDS.marketCapChange24hMin,
    });
  }

  if (marketContext.fearGreed.value >= ENTRY_THRESHOLDS.fearGreedMin) {
    passedSignals += 1;
  } else {
    failedConditions.push({
      description: `CMC Fear and Greed is ${marketContext.fearGreed.value}, below the minimum activation threshold of ${ENTRY_THRESHOLDS.fearGreedMin}.`,
      metric: "cmc.fear_and_greed.value",
      operator: "<",
      value: ENTRY_THRESHOLDS.fearGreedMin,
    });
  }

  if (marketContext.bnb.percentChange24h >= ENTRY_THRESHOLDS.bnbChange24hMin) {
    passedSignals += 1;
  } else {
    failedConditions.push({
      description: `BNB 24h performance is ${marketContext.bnb.percentChange24h.toFixed(2)}%, below the non-negative momentum gate.`,
      metric: "cmc.bnb.percent_change_24h",
      operator: "<",
      value: ENTRY_THRESHOLDS.bnbChange24hMin,
    });
  }

  if (marketContext.bnb.percentChange7d >= ENTRY_THRESHOLDS.bnbChange7dMin) {
    passedSignals += 1;
  } else {
    failedConditions.push({
      description: `BNB 7d performance is ${marketContext.bnb.percentChange7d.toFixed(2)}%, below the strategy's strength floor.`,
      metric: "cmc.bnb.percent_change_7d",
      operator: "<",
      value: ENTRY_THRESHOLDS.bnbChange7dMin,
    });
  }

  if (marketContext.global.btcDominanceChange24hPct <= ENTRY_THRESHOLDS.btcDominanceChange24hMax) {
    passedSignals += 1;
  } else {
    failedConditions.push({
      description: `BTC dominance change is ${marketContext.global.btcDominanceChange24hPct.toFixed(2)}%, above the alt-rotation ceiling.`,
      metric: "cmc.global.btc_dominance_change_24h_pct",
      operator: ">",
      value: ENTRY_THRESHOLDS.btcDominanceChange24hMax,
    });
  }

  if (passedSignals >= 5 && marketContext.fearGreed.value >= 55) {
    return {
      confidence: 0.83,
      failedConditions,
      label: "risk-on-bnb-meme-rotation",
      rationalePrefix: "CMC conditions support deploying the Four.Meme launch-phase strategy.",
      status: "proposed",
      summary: "Broad market conditions are supportive, BNB is showing strength, and BTC dominance is not crowding out alt rotation.",
    };
  }

  if (passedSignals >= 4) {
    return {
      confidence: 0.67,
      failedConditions,
      label: "selective-bnb-strength",
      rationalePrefix: "CMC conditions are mixed but still allow selective deployment with tight risk controls.",
      status: "proposed",
      summary: "BNB remains constructive, but one market gate is soft enough that the strategy should be size-constrained and selective.",
    };
  }

  return {
    confidence: 0.78,
    failedConditions,
    label: "risk-off-wait-for-confirmation",
    rationalePrefix: "CMC conditions do not justify activating fresh Four.Meme launch-phase exposure yet.",
    status: "rejected",
    summary: "The regime gate is defensive, so the strategy specification is valid but should remain inactive until market conditions improve.",
  };
}

function buildEvidence(
  marketContext: CmcMarketContext,
  fourMemeSnapshot: FourMemeDiscoverySnapshot,
): EvidenceRecord[] {
  const topCandidates = fourMemeSnapshot.selectedCandidates
    .slice(0, 3)
    .map((candidate) => {
      const marketCap = candidate.marketCapUsd ? `$${abbreviateUsd(candidate.marketCapUsd)}` : "n/a";
      const volume = candidate.volume24hUsd ? `$${abbreviateUsd(candidate.volume24hUsd)}` : "n/a";

      return `${candidate.symbol} (${candidate.tokenAddress}) bucket ${candidate.selectionBucket}, feeds ${candidate.discoveryFeeds.join("+")}, MC ${marketCap}, Vol ${volume}`;
    })
    .join("; ");

  return [
    {
      source: "CoinMarketCap Global Metrics API",
      observedAt: marketContext.global.observedAt,
      summary: `Total crypto market cap is ${marketContext.global.totalMarketCapUsd.toFixed(0)} USD with a 24h change of ${marketContext.global.totalMarketCapChange24hPct.toFixed(2)}%. BTC dominance is ${marketContext.global.btcDominancePct.toFixed(2)}% with a 24h change of ${marketContext.global.btcDominanceChange24hPct.toFixed(2)}%.`,
      url: "https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest",
    },
    {
      source: "CoinMarketCap Fear and Greed API",
      observedAt: marketContext.fearGreed.observedAt,
      summary: `Fear and Greed is ${marketContext.fearGreed.value} and classified as ${marketContext.fearGreed.classification}.`,
      url: "https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest",
    },
    {
      source: "CoinMarketCap BNB Quote API",
      observedAt: marketContext.bnb.observedAt,
      summary: `BNB trades at ${marketContext.bnb.priceUsd.toFixed(2)} USD with ${marketContext.bnb.percentChange24h.toFixed(2)}% 24h change and ${marketContext.bnb.percentChange7d.toFixed(2)}% 7d change.`,
      url: "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=BNB",
    },
    {
      source: "Four.Meme Meme API discovery feeds",
      observedAt: fourMemeSnapshot.asOf,
      summary: `Scanned Four.Meme feeds via meme-api with counts new=${fourMemeSnapshot.feedCounts.newLaunches}, volume=${fourMemeSnapshot.feedCounts.volumeLeaders}, hot=${fourMemeSnapshot.feedCounts.hot}, dex=${fourMemeSnapshot.feedCounts.dexMigrated}. Bucket counts are safe2ape=${fourMemeSnapshot.safe2apeCandidates.length}, mediumRisk=${fourMemeSnapshot.mediumRiskCandidates.length}, gemHunt=${fourMemeSnapshot.gemHuntCandidates.length}. Leading names: ${topCandidates}.`,
      url: fourMemeSnapshot.sourceBaseUrl,
    },
  ];
}

function buildRationale(
  marketContext: CmcMarketContext,
  fourMemeSnapshot: FourMemeDiscoverySnapshot,
  regime: RegimeAssessment,
): string {
  const topSymbols = fourMemeSnapshot.selectedCandidates
    .slice(0, 3)
    .map((candidate) => `${candidate.symbol} (${candidate.selectionBucket})`)
    .join(", ");

  return [
    regime.rationalePrefix,
    `The current CMC snapshot shows Fear and Greed at ${marketContext.fearGreed.value}, total market cap change at ${marketContext.global.totalMarketCapChange24hPct.toFixed(2)}% over 24h, and BNB at ${marketContext.bnb.percentChange7d.toFixed(2)}% over 7d.`,
    `The venue scan is no longer hypothetical: the current Four.Meme discovery snapshot produced ${fourMemeSnapshot.selectedCandidates.length} featured candidates across Safe 2 Ape (${fourMemeSnapshot.safe2apeCandidates.length}), Medium Risk (${fourMemeSnapshot.mediumRiskCandidates.length}), and Gem Hunt (${fourMemeSnapshot.gemHuntCandidates.length}), with ${topSymbols || "no qualifying symbols"} as the leading names.`,
  ].join(" ");
}

function buildStrategyThesis(
  marketContext: CmcMarketContext,
  fourMemeSnapshot: FourMemeDiscoverySnapshot,
  regime: RegimeAssessment,
): string {
  const activeBucketSummary = [
    `safe2ape=${fourMemeSnapshot.safe2apeCandidates.length}`,
    `mediumRisk=${fourMemeSnapshot.mediumRiskCandidates.length}`,
    `gemHunt=${fourMemeSnapshot.gemHuntCandidates.length}`,
  ].join(", ");

  if (regime.status === "rejected") {
    return `Do not activate fresh Four.Meme exposure until the CMC regime gate improves. BNB 7d strength is ${marketContext.bnb.percentChange7d.toFixed(2)}%, Fear and Greed is ${marketContext.fearGreed.value}, and the latest venue buckets are ${activeBucketSummary}.`;
  }

  return `Use CMC market regime as the first gate, then only promote contract-level Four.Meme candidates that survive the approved discovery bucket rules. Current BNB 7d strength is ${marketContext.bnb.percentChange7d.toFixed(2)}%, Fear and Greed is ${marketContext.fearGreed.value}, and the venue scan produced ${activeBucketSummary}.`;
}

function resolveAllowedBuckets(regimeLabel: string): FourMemeSelectionBucket[] {
  if (regimeLabel === "risk-on-bnb-meme-rotation") {
    return ["safe2ape", "gemHunt"];
  }

  return ["safe2ape"];
}

function abbreviateUsd(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }

  return value.toFixed(2);
}
