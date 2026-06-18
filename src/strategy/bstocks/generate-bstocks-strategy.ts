import type { BstocksUniverseSnapshot } from "../../adapters/bstocks/client.js";
import type { CmcMarketContext } from "../../adapters/cmc/client.js";
import { combineDataQuality } from "../../output/data-quality.js";
import type { Condition, EvidenceRecord } from "../../types/strategy-spec.js";
import type { BstocksDraftStrategySpec } from "../../types/bstocks-strategy-spec.js";

const ENTRY_THRESHOLDS = {
  bnbChange24hMin: 0,
  candidateCountMin: 3,
  fearGreedMin: 45,
  marketCapChange24hMin: 0,
  maxHoldHours: 72,
  stopLossPct: -4,
  takeProfitPct: 8,
  topRankMax: 2,
} as const;

const STRATEGY_VERSION = "0.1.0";

interface RegimeAssessment {
  confidence: number;
  failedConditions: Condition[];
  label: string;
  rationalePrefix: string;
  status: BstocksDraftStrategySpec["status"];
  summary: string;
}

export function generateBstocksDraftStrategySpec(
  marketContext: CmcMarketContext,
  bstocksSnapshot: BstocksUniverseSnapshot,
): BstocksDraftStrategySpec {
  const regime = assessRegime(marketContext, bstocksSnapshot);
  const medianVolume24hUsd = computeMedian(bstocksSnapshot.candidates.map((candidate) => candidate.volume24hUsd));
  const asOfDate = marketContext.asOf.replace(/[:.]/g, "-");
  const sampleCandidates = bstocksSnapshot.candidates.slice(0, 5);

  const rationale = buildRationale(marketContext, bstocksSnapshot, regime);

  return {
    version: STRATEGY_VERSION,
    dataQuality: combineDataQuality({
      partialSummary: "bStocks draft generated with partial source-data quality; inspect providerErrors and input artifactRefs before backtesting.",
      sources: [marketContext.dataQuality, bstocksSnapshot.dataQuality],
      successSummary: "bStocks draft generated from complete CMC market context and complete bStocks quote inputs.",
    }),
    strategyId: `cmc-bnb-bstocks-${asOfDate}`,
    generatedAt: new Date().toISOString(),
    domain: "bnb-bstocks",
    status: regime.status,
    inputWindow: {
      asOf: marketContext.asOf,
      barInterval: "1h",
      lookback: "7d",
    },
    universe: {
      chain: "bnb-chain",
      venue: "pancakeswap-stocks",
      issuer: "bStocks",
      selectionMethod:
        "Apply a CMC market-regime gate, then rank the maintained bStocks allowlist by 24h relative strength and keep only the more active names.",
      quoteAsset: "USD",
      candidateCount: bstocksSnapshot.candidateCount,
      allowedSymbols: bstocksSnapshot.symbols,
      sampleCandidates: sampleCandidates.map((candidate) => ({
        cmcId: candidate.cmcId,
        symbol: candidate.symbol,
        name: candidate.name,
        issuer: candidate.issuer,
        venueUrl: candidate.venueUrl,
        priceUsd: candidate.priceUsd,
        volume24hUsd: candidate.volume24hUsd,
        marketCapUsd: candidate.marketCapUsd,
        percentChange24h: candidate.percentChange24h,
        percentChange7d: candidate.percentChange7d,
        observedAt: candidate.observedAt,
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
        description: "Only activate the bStocks rotation lane when total crypto market cap is flat-to-up versus the prior 24h snapshot.",
        metric: "cmc.global.total_market_cap_change_24h_pct",
        operator: ">=",
        value: ENTRY_THRESHOLDS.marketCapChange24hMin,
      },
      {
        id: "fear-greed-risk-gate",
        description: "Require CoinMarketCap Fear and Greed to stay above the defensive floor before allocating to bStocks rotation.",
        metric: "cmc.fear_and_greed.value",
        operator: ">=",
        value: ENTRY_THRESHOLDS.fearGreedMin,
      },
      {
        id: "bnb-support-gate",
        description: "Keep the bStocks lane inactive when BNB is losing 24h momentum, because the venue and routing still sit on BNB Chain.",
        metric: "cmc.bnb.percent_change_24h",
        operator: ">=",
        value: ENTRY_THRESHOLDS.bnbChange24hMin,
      },
      {
        id: "bstocks-universe-coverage",
        description: "Only propose live entries when at least three tracked bStocks symbols have current CMC quotes.",
        metric: "bstocks.candidate_count",
        operator: ">=",
        value: ENTRY_THRESHOLDS.candidateCountMin,
      },
      {
        id: "bstocks-relative-strength-rank",
        description: "Only enter symbols that rank inside the top two 24h performers of the tracked bStocks universe.",
        metric: "bstocks.relative_strength_rank_24h",
        operator: "<=",
        value: ENTRY_THRESHOLDS.topRankMax,
      },
      {
        id: "bstocks-positive-24h-momentum",
        description: "Require the selected symbol to keep a non-negative 24h return so the lane behaves as a continuation strategy, not a mean-reversion catch.",
        metric: "bstocks.percent_change_24h",
        operator: ">=",
        value: 0,
      },
      {
        id: "bstocks-active-volume-gate",
        description: "Require 24h quoted volume to remain at or above the current bStocks universe median so the strategy stays in the more active names.",
        metric: "bstocks.volume_24h_usd",
        operator: ">=",
        value: Number(medianVolume24hUsd.toFixed(2)),
      },
      {
        id: "bstocks-allowlist-gate",
        description: "Restrict the lane to the repo-maintained bStocks allowlist so the submission story stays explicit and reproducible.",
        metric: "bstocks.symbol",
        operator: "in",
        value: bstocksSnapshot.symbols,
      },
    ],
    exitRules: [
      {
        id: "hard-stop-loss",
        description: "Exit when drawdown from entry reaches the hard stop threshold.",
        metric: "trade.drawdown_pct_from_entry",
        operator: "<=",
        value: ENTRY_THRESHOLDS.stopLossPct,
      },
      {
        id: "take-profit",
        description: "Harvest gains when the rotation move reaches the take-profit threshold.",
        metric: "trade.unrealized_return_pct",
        operator: ">=",
        value: ENTRY_THRESHOLDS.takeProfitPct,
      },
      {
        id: "time-stop",
        description: "Exit after three days if the relative-strength move has not resolved.",
        metric: "trade.holding_period_hours",
        operator: ">=",
        value: ENTRY_THRESHOLDS.maxHoldHours,
      },
      {
        id: "relative-strength-fade-exit",
        description: "Exit if the position falls out of the top three 24h performers on the next hourly rebalance.",
        metric: "bstocks.relative_strength_rank_24h",
        operator: ">",
        value: 3,
      },
      {
        id: "regime-break-exit",
        description: "Flatten exposure if the regime flips defensive after entry.",
        metric: "cmc.fear_and_greed.value",
        operator: "<",
        value: ENTRY_THRESHOLDS.fearGreedMin,
      },
    ],
    riskControls: [
      {
        id: "position-size-cap",
        description: "Cap each bStocks position at 1.0% of strategy equity.",
        type: "position-sizing",
        value: 1.0,
      },
      {
        id: "portfolio-exposure-cap",
        description: "Cap concurrent bStocks exposure at 2.0% of strategy equity.",
        type: "exposure-cap",
        value: 2.0,
      },
      {
        id: "daily-loss-cap",
        description: "Pause new entries after 2.0% daily strategy drawdown.",
        type: "daily-loss-limit",
        value: 2.0,
      },
      {
        id: "allowlist-filter",
        description: "Reject symbols that fall outside the committed bStocks universe file even if CMC can quote them.",
        type: "liquidity-filter",
        value: "allowlist-required",
      },
      {
        id: "stopout-cooldown",
        description: "Wait twelve hours after a stop-out before re-entering the same bStocks symbol.",
        type: "cooldown",
        value: "12h",
      },
    ],
    invalidation: [
      {
        description: "Invalidate the lane if fewer than three tracked bStocks symbols are currently quoteable from CoinMarketCap.",
        metric: "bstocks.candidate_count",
        operator: "<",
        value: ENTRY_THRESHOLDS.candidateCountMin,
      },
      {
        description: "Invalidate the lane if Fear and Greed drops below the activation floor.",
        metric: "cmc.fear_and_greed.value",
        operator: "<",
        value: ENTRY_THRESHOLDS.fearGreedMin,
      },
      {
        description: "Invalidate the lane if total crypto market cap turns negative again on a 24h basis.",
        metric: "cmc.global.total_market_cap_change_24h_pct",
        operator: "<",
        value: ENTRY_THRESHOLDS.marketCapChange24hMin,
      },
    ],
    assumptions: [
      {
        id: "cmc-pricing-authority",
        description: "CoinMarketCap quote snapshots are treated as the authoritative hourly pricing reference for this repo lane.",
        impact: "Backtests should sample CMC-aligned hourly snapshots rather than assume continuous fills.",
      },
      {
        id: "bstocks-allowlist-maintenance",
        description: "The bStocks trade universe is an explicit repo-maintained allowlist rather than an open-ended crawler.",
        impact: "Backtests should use the same committed universe file for reproducibility.",
      },
      {
        id: "separate-domain-lane",
        description: "The bStocks lane is intentionally separate from Four.Meme discovery logic and does not inherit meme-token heuristics.",
        impact: "Do not blend Four.Meme bucket logic into bStocks results when evaluating this strategy family.",
      },
      {
        id: "limited-history-window",
        description: "bStocks is a newly launched venue lane, so historical inference should stay conservative and data-source timestamps must be preserved.",
        impact: "Backtests may need a shorter lookback window and should state any proxy assumptions explicitly.",
      },
    ],
    evidence: buildEvidence(marketContext, bstocksSnapshot),
    rationale,
    rejectionReasons: regime.failedConditions.length > 0 ? regime.failedConditions : undefined,
  };
}

function assessRegime(
  marketContext: CmcMarketContext,
  bstocksSnapshot: BstocksUniverseSnapshot,
): RegimeAssessment {
  const failedConditions: Condition[] = [];
  let passedSignals = 0;

  if (marketContext.global.totalMarketCapChange24hPct >= ENTRY_THRESHOLDS.marketCapChange24hMin) {
    passedSignals += 1;
  } else {
    failedConditions.push({
      description: `Total crypto market cap is ${marketContext.global.totalMarketCapChange24hPct.toFixed(2)}% over 24h, below the flat-to-up gate.`,
      metric: "cmc.global.total_market_cap_change_24h_pct",
      operator: "<",
      value: ENTRY_THRESHOLDS.marketCapChange24hMin,
    });
  }

  if (marketContext.fearGreed.value >= ENTRY_THRESHOLDS.fearGreedMin) {
    passedSignals += 1;
  } else {
    failedConditions.push({
      description: `CMC Fear and Greed is ${marketContext.fearGreed.value}, below the bStocks activation threshold of ${ENTRY_THRESHOLDS.fearGreedMin}.`,
      metric: "cmc.fear_and_greed.value",
      operator: "<",
      value: ENTRY_THRESHOLDS.fearGreedMin,
    });
  }

  if (marketContext.bnb.percentChange24h >= ENTRY_THRESHOLDS.bnbChange24hMin) {
    passedSignals += 1;
  } else {
    failedConditions.push({
      description: `BNB 24h performance is ${marketContext.bnb.percentChange24h.toFixed(2)}%, below the non-negative venue-support gate.`,
      metric: "cmc.bnb.percent_change_24h",
      operator: "<",
      value: ENTRY_THRESHOLDS.bnbChange24hMin,
    });
  }

  if (bstocksSnapshot.candidateCount >= ENTRY_THRESHOLDS.candidateCountMin) {
    passedSignals += 1;
  } else {
    failedConditions.push({
      description: `Only ${bstocksSnapshot.candidateCount} bStocks symbols currently have live quotes, below the minimum coverage threshold of ${ENTRY_THRESHOLDS.candidateCountMin}.`,
      metric: "bstocks.candidate_count",
      operator: "<",
      value: ENTRY_THRESHOLDS.candidateCountMin,
    });
  }

  if (passedSignals >= 4 && marketContext.fearGreed.value >= 55) {
    return {
      confidence: 0.8,
      failedConditions,
      label: "risk-on-bnb-bstocks-rotation",
      rationalePrefix: "CMC conditions support activating the bStocks relative-strength lane.",
      status: "proposed",
      summary: "Broad market conditions are supportive and the tracked bStocks universe has enough live coverage to rank a small rotation basket.",
    };
  }

  if (
    passedSignals >= 3 &&
    bstocksSnapshot.candidateCount >= ENTRY_THRESHOLDS.candidateCountMin
  ) {
    return {
      confidence: 0.64,
      failedConditions,
      label: "selective-bstocks-rotation",
      rationalePrefix: "CMC conditions are mixed, so the bStocks lane should remain selective and size-constrained.",
      status: "proposed",
      summary: "The environment is usable but not fully risk-on, so the lane should stay narrow and only target the strongest quoted symbols.",
    };
  }

  return {
    confidence: 0.78,
    failedConditions,
    label: "risk-off-wait-for-coverage",
    rationalePrefix: "CMC conditions do not justify activating fresh bStocks rotation exposure yet.",
    status: "rejected",
    summary: "The regime gate or universe coverage is too weak, so the skill should return a valid but inactive strategy specification.",
  };
}

function buildEvidence(
  marketContext: CmcMarketContext,
  bstocksSnapshot: BstocksUniverseSnapshot,
): EvidenceRecord[] {
  const topCandidates = bstocksSnapshot.candidates
    .slice(0, 3)
    .map((candidate) => {
      const price = `$${candidate.priceUsd.toFixed(2)}`;
      const volume = candidate.volume24hUsd > 0 ? `$${abbreviateUsd(candidate.volume24hUsd)}` : "n/a";

      return `${candidate.symbol} (${candidate.cmcId}) 24h ${candidate.percentChange24h.toFixed(2)}%, 7d ${candidate.percentChange7d.toFixed(2)}%, price ${price}, volume ${volume}`;
    })
    .join("; ");

  return [
    {
      source: "CoinMarketCap Global Metrics API",
      observedAt: marketContext.global.observedAt,
      summary: `Total crypto market cap is ${marketContext.global.totalMarketCapUsd.toFixed(0)} USD with a 24h change of ${marketContext.global.totalMarketCapChange24hPct.toFixed(2)}%.`,
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
      summary: `BNB trades at ${marketContext.bnb.priceUsd.toFixed(2)} USD with ${marketContext.bnb.percentChange24h.toFixed(2)}% 24h change.`,
      url: "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=BNB",
    },
    {
      source: "CoinMarketCap bStocks quote snapshot",
      observedAt: bstocksSnapshot.asOf,
      summary: `Tracked ${bstocksSnapshot.candidateCount} bStocks symbols from the committed allowlist. Leading names: ${topCandidates || "no quoteable symbols"}.`,
      url: bstocksSnapshot.sourceBaseUrl,
    },
  ];
}

function buildRationale(
  marketContext: CmcMarketContext,
  bstocksSnapshot: BstocksUniverseSnapshot,
  regime: RegimeAssessment,
): string {
  const topSymbols = bstocksSnapshot.candidates
    .slice(0, 3)
    .map((candidate) => `${candidate.symbol} (${candidate.percentChange24h.toFixed(2)}%)`)
    .join(", ");

  return [
    regime.rationalePrefix,
    `The current CMC snapshot shows Fear and Greed at ${marketContext.fearGreed.value}, total market cap change at ${marketContext.global.totalMarketCapChange24hPct.toFixed(2)}% over 24h, and BNB at ${marketContext.bnb.percentChange24h.toFixed(2)}% over 24h.`,
    `The bStocks lane currently tracks ${bstocksSnapshot.candidateCount} quoteable symbols from the committed allowlist, with ${topSymbols || "no active symbols"} leading the 24h relative-strength table.`,
    "This lane is intentionally shallow for the current milestone: it proves repo structure, CMC-backed pricing, and explicit backtestable rules without mixing in Four.Meme heuristics.",
  ].join(" ");
}

function computeMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
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
